import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { createServer } from 'node:http';
import { chromium } from 'playwright-core';

const dist = new URL('../dist/', import.meta.url);
const assets = await readdir(new URL('assets/', dist));
const reports = assets.find((name) => /^ReportsAndHealthView-.*\.js$/.test(name));
assert.ok(reports, 'O build deve gerar o módulo de relatórios');
const firestoreSdkMarker = 'Firestore (${';
const scripts = await Promise.all(assets.filter((name) => name.endsWith('.js')).map(async (name) => {
  const source = await readFile(new URL(`assets/${name}`, dist), 'utf8');
  return [`/assets/${name}`, source];
}));
const firestoreScripts = new Set(scripts.filter(([, source]) => source.includes(firestoreSdkMarker)).map(([name]) => name));
assert.ok(firestoreScripts.size > 0, 'O build autenticado deve conter o SDK do Firestore.');

const server = createServer(async (request, response) => {
  const pathname = new URL(request.url, 'http://localhost').pathname;
  const filename = pathname.slice('/assets/'.length);
  if (pathname === '/') {
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    response.end(await readFile(new URL('index.html', dist)));
  } else if (pathname.startsWith('/assets/') && assets.includes(filename)) {
    const contentType = filename.endsWith('.css') ? 'text/css' : 'text/javascript';
    response.writeHead(200, { 'Content-Type': contentType });
    response.end(await readFile(new URL(`assets/${filename}`, dist)));
  } else {
    response.writeHead(404).end();
  }
});

await new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', resolve);
});

let browser;
try {
  browser = await chromium.launch(process.env.CHROME_BIN
    ? { executablePath: process.env.CHROME_BIN }
    : { channel: 'chrome' });
  const origin = `http://127.0.0.1:${server.address().port}`;
  const page = await browser.newPage();
  await page.route('**/*', (route) =>
    route.request().url().startsWith(`${origin}/`) ? route.continue() : route.abort()
  );
  await page.goto(origin);
  await page.getByRole('button', { name: /Entrar com Google/ }).waitFor({ timeout: 10_000 });
  const loginScripts = await page.evaluate(() => performance.getEntriesByType('resource')
    .map((entry) => new URL(entry.name).pathname)
    .filter((pathname) => pathname.startsWith('/assets/') && pathname.endsWith('.js')));
  assert.ok(loginScripts.length > 0, 'A página precisa carregar os scripts de login.');
  for (const script of loginScripts) {
    assert.ok(!firestoreScripts.has(script), `O login carregou o SDK do Firestore em ${script}.`);
  }
  const loaded = await page.evaluate(async (modulePath) => {
    const module = await import(modulePath);
    return typeof module.ReportsAndHealthView === 'function';
  }, `/assets/${reports}`);
  assert.ok(loaded, 'O componente de relatórios deve estar disponível no build');
  console.log('O módulo da aba Relatórios carregou no Chromium.');
} finally {
  await browser?.close();
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
}
