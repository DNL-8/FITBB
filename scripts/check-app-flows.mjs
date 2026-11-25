import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { build } from 'vite';

const dist = await mkdtemp(join(tmpdir(), 'fitness-rpg-browser-'));
const accountId = 'browser-fixture';
const productionHostname = 'app-fitness-rm9t.vercel.app';
const firebaseFixtures = {
  'firebase/app': 'export const getApps = () => []; export const initializeApp = (config) => { window.fixtureAuthDomain = config.authDomain; return {}; };',
  'firebase/auth': `
    const user = {
      uid: '${accountId}', displayName: 'Atleta', email: null,
      emailVerified: !new URLSearchParams(location.search).has('verify-email'),
      async reload() { this.emailVerified = true; },
      async getIdToken(force) { return force ? 'fixture.jwt.refreshed' : 'fixture.jwt.cached'; },
    };
    const auth = { currentUser: new URLSearchParams(location.search).has('google-login') ? null : user };
    const authListeners = new Set();
    window.fixtureOAuthRequests = JSON.parse(sessionStorage.getItem('fixtureOAuthRequests') ?? '[]');
    function recordOAuthRequest(method, provider) {
      window.fixtureOAuthRequests.push({ method, scopes: provider.scopes });
    }
    export const getAuth = () => auth;
    export async function getRedirectResult() {
      if (!new URLSearchParams(location.search).has('google-return')) return null;
      auth.currentUser = user;
      for (const listener of authListeners) listener(user);
      return { user };
    }
    export function onAuthStateChanged(_auth, callback) {
      authListeners.add(callback);
      queueMicrotask(() => callback(auth.currentUser));
      return () => authListeners.delete(callback);
    }
    function completeLogin(method, provider) {
      recordOAuthRequest(method, provider);
      auth.currentUser = user;
      for (const listener of authListeners) listener(user);
      return { user, accessToken: 'fixture.login.token' };
    }
    export const signInWithPopup = async (_auth, provider) => completeLogin('popup', provider);
    export async function signInWithRedirect(_auth, provider) {
      recordOAuthRequest('redirect', provider);
      sessionStorage.setItem('fixtureOAuthRequests', JSON.stringify(window.fixtureOAuthRequests));
      const returnUrl = new URL(location.href);
      returnUrl.searchParams.set('google-return', '1');
      location.replace(returnUrl);
    }
    export const signOut = async () => {}, linkWithPopup = async () => null, reauthenticateWithRedirect = async () => null;
    export async function reauthenticateWithPopup(account, provider) {
      recordOAuthRequest('drive', provider);
      return {
        user: window.fixtureDriveAccountMismatch ? { uid: 'other-account' } : account,
        accessToken: 'fixture.drive.token',
      };
    }
    export class GoogleAuthProvider {
      scopes = [];
      addScope(scope) { this.scopes.push(scope); }
      setCustomParameters() {}
      static credentialFromResult(result) { return result; }
    }
  `,
  'firebase/firestore': `
    const path = (...parts) => parts;
    const firestoreInstance = {};
    export const getFirestore = () => firestoreInstance;
    export const initializeFirestore = () => firestoreInstance;
    export const persistentLocalCache = () => ({});
    export const persistentMultipleTabManager = () => ({});
    export const getDocFromServer = async () => ({ exists: () => false });
    export const doc = path, collection = path, query = path, where = path;
    export const limit = path, orderBy = path, documentId = path, startAt = path, endAt = path;
    export const runTransaction = async () => {}, getDocs = async () => {}, setDoc = async () => {};
    export const deleteDoc = async () => {}, writeBatch = () => ({});
    export function onSnapshot(ref, options, next) {
      const send = typeof options === 'function' ? options : next;
      const path = JSON.stringify(ref);
      const time = new Date().toISOString();
      const empty = { exists: () => false, metadata: { fromCache: false }, docs: [], forEach: () => {} };
      const timer = setTimeout(() => {
        if (path.includes('heroProfiles')) {
          send({ ...empty, exists: () => true, data: () => ({
            userId: '${accountId}', name: 'Atleta', avatar: 'A', heroClass: 'Guerreiro', objective: 'Ambos',
            experience: 'Iniciante', restingHrBaseline: 60, maxHrEstimated: 190, createdAt: time, updatedAt: time,
          }) });
        } else if (path.includes('healthConnectRecords') && path.includes('heart_rate')) {
          send({ ...empty, docs: [{ data: () => ({
            userId: '${accountId}', recordId: 'fixture-heart-rate', type: 'heart_rate',
            startTime: time, endTime: time, updatedAt: Date.parse(time),
            values: { samples: [{ time, beatsPerMinute: 82 }] },
          }) }] });
        } else {
          send(empty);
        }
      }, 0);
      return () => clearTimeout(timer);
    }
  `,
};

const typeByExtension = {
  '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml',
};
let browser;
let server;
try {
  await build({
    root: fileURLToPath(new URL('../', import.meta.url)),
    logLevel: 'error',
    define: { 'import.meta.env.VITE_FIREBASE_AUTH_DOMAIN': JSON.stringify('') },
    build: { outDir: dist, emptyOutDir: true },
    plugins: [{
      name: 'firebase-fixtures',
      enforce: 'pre',
      resolveId: (id) => Object.hasOwn(firebaseFixtures, id) ? `\0fixture:${id}` : undefined,
      load: (id) => id.startsWith('\0fixture:') ? firebaseFixtures[id.slice('\0fixture:'.length)] : undefined,
    }],
  });
  server = createServer(async (request, response) => {
    const pathname = new URL(request.url, 'http://localhost').pathname;
    if (pathname === '/api/v1/workouts/logs') {
      const accepted = request.headers.authorization === 'Bearer fixture.jwt.refreshed';
      response.writeHead(accepted ? 200 : 401, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify(accepted
        ? { ok: true, data: { logs: [], nextCursor: null, order: 'completedAt' } }
        : { ok: false, code: 'token_expired' }));
      return;
    }
    if (pathname === '/api/strava/config') {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ configured: false }));
      return;
    }
    if (pathname === '/api/v1/stats/ledger') {
      const purchase = {
        id: '20261122120000000_00000000-0000-0000-0000-000000000001', userId: accountId,
        kind: 'armory_purchase', title: 'Túnica de Couro', createdAt: '2026-11-22T12:00:00.000Z',
        xpDelta: 0, coinDelta: -25, totalXp: 0, goldCoins: 25,
      };
      const older = {
        ...purchase, id: '20261121120000000_00000000-0000-0000-0000-000000000000',
        kind: 'workout', title: 'Treino de ontem', createdAt: '2026-11-21T12:00:00.000Z',
        xpDelta: 100, coinDelta: 0, totalXp: 100, goldCoins: 50,
      };
      const cursor = new URL(request.url, 'http://localhost').searchParams.get('cursor');
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({
        ok: true, data: { available: true, entries: cursor ? [older] : [purchase], nextCursor: cursor ? null : purchase.id },
      }));
      return;
    }
    if (pathname !== '/' && !/^\/assets\/[A-Za-z0-9_.-]+$/.test(pathname)) {
      response.writeHead(404).end();
      return;
    }
    const file = pathname === '/' ? 'index.html' : pathname.slice(1);
    try {
      const content = await readFile(join(dist, file));
      response.writeHead(200, { 'Content-Type': typeByExtension[extname(file)] ?? 'application/octet-stream' });
      response.end(content);
    } catch {
      response.writeHead(404).end();
    }
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch(process.env.CHROME_BIN
    ? { executablePath: process.env.CHROME_BIN }
    : { channel: 'chrome' });

  for (const platform of ['desktop', 'iphone', 'iphone-fallback']) {
    const page = await browser.newPage(platform === 'desktop' ? {} : { userAgent: 'AppleWebKit Mobile iPhone' });
    const loginOrigin = platform === 'iphone-fallback' ? origin : `https://${productionHostname}`;
    let driveRequests = 0;
    await page.route('**/*', async (route) => {
      const url = new URL(route.request().url());
      if (url.origin !== loginOrigin) return route.abort();
      if (loginOrigin === origin) return route.continue();
      // Serve the local fixtures on a simulated production origin without reaching the live site.
      const response = await route.fetch({ url: `${origin}${url.pathname}${url.search}` });
      await route.fulfill({ response });
    });
    await page.route('https://www.googleapis.com/drive/v3/files?*', async (route) => {
      assert.equal(route.request().headers().authorization, 'Bearer fixture.drive.token');
      driveRequests += 1;
      await route.fulfill({ json: { files: [] } });
    });
    await page.goto(`${loginOrigin}/?tab=progresso&google-login=1`);
    await page.getByRole('button', { name: 'Entrar com Google' }).click();
    const oauthRequests = () => page.evaluate(() => window.fixtureOAuthRequests);
    await page.getByRole('tab', { name: 'Sincronização' }).click();
    const configureDrive = page.getByRole('button', { name: 'Configurar Google Drive' });
    await configureDrive.waitFor();
    assert.deepEqual(await oauthRequests(), [{ method: platform === 'iphone' ? 'redirect' : 'popup', scopes: [] }]);
    if (platform === 'iphone') assert.match(page.url(), /google-return=1/);
    const authDomain = await page.evaluate(() => window.fixtureAuthDomain);
    if (platform === 'iphone-fallback') assert.match(authDomain, /\.firebaseapp\.com$/);
    else assert.equal(authDomain, productionHostname);
    assert.equal(driveRequests, 0);

    if (platform === 'desktop') {
      await page.evaluate(() => { window.fixtureDriveAccountMismatch = true; });
      await configureDrive.click();
      await page.getByText('Conecte o Google Drive com a mesma conta usada no Fitness RPG.').waitFor();
      assert.equal(driveRequests, 0);
      await page.evaluate(() => { window.fixtureDriveAccountMismatch = false; });
      const filesResponse = page.waitForResponse((response) => response.url().startsWith('https://www.googleapis.com/drive/v3/files?'));
      await configureDrive.click();
      await filesResponse;
      assert.deepEqual((await oauthRequests()).at(-1), {
        method: 'drive',
        scopes: ['https://www.googleapis.com/auth/drive.file', 'https://www.googleapis.com/auth/drive.readonly'],
      });
      await page.getByRole('button', { name: 'Desconectar', exact: true }).click();
      await configureDrive.waitFor();
    }
    await page.close();
  }

  for (const width of [320, 768, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 880 }, reducedMotion: 'reduce' });
    const errors = [];
    const chartRequests = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('request', (request) => {
      if (request.url().includes('/assets/XpEvolutionChart-')) chartRequests.push(request.url());
    });
    await page.route('**/*', (route) => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    const refreshed = page.waitForResponse((response) =>
      response.url().includes('/api/v1/workouts/logs?') && response.status() === 200);
    await page.goto(`${origin}/?tab=arsenal${width === 320 ? '&verify-email=1' : ''}`);
    if (width === 320) {
      await page.getByRole('heading', { name: 'Verifique o e-mail da conta Google' }).waitFor();
      await page.getByRole('button', { name: 'Verificar novamente' }).click();
    }
    const arsenal = page.getByRole('heading', { name: /Arsenal · Caçadores/ });
    await arsenal.waitFor();
    await refreshed;
    const equipment = page.getByRole('tabpanel', { name: 'Equipamentos', exact: true });
    const filters = equipment.getByRole('region', { name: 'Busca e filtros do arsenal' });
    const filterToggle = filters.getByRole('button', { name: /^Filtros/ });
    const rarity = filters.getByRole('group', { name: 'Raridade', exact: true });
    await filters.getByRole('status').getByText('13 peças encontradas').waitFor();
    if (width < 1024) {
      assert.equal(await rarity.isVisible(), false);
      await filterToggle.click();
      assert.equal(await filterToggle.getAttribute('aria-expanded'), 'true');
    }
    const order = filters.getByRole('combobox', { name: 'Ordenar por', exact: true });
    await order.selectOption('power');
    await equipment.getByRole('article').first().getByRole('heading', { name: 'Veste Imortal do Reino Profundo' }).waitFor();
    await order.selectOption('price');
    await equipment.getByRole('article').first().getByRole('heading', { name: 'Túnica de Couro' }).waitFor();
    await rarity.getByRole('button', { name: /^Raro/ }).click();
    assert.equal(await equipment.getByRole('heading', { name: 'Veste Imortal do Reino Profundo' }).count(), 0);
    if (width < 1024) {
      await filterToggle.click();
      assert.equal(await rarity.isVisible(), false);
      await filters.getByRole('button', { name: 'Remover filtro Raro' }).click();
      await filterToggle.click();
    } else {
      await filters.getByRole('button', { name: 'Limpar filtros' }).click();
    }
    const search = filters.getByRole('textbox', { name: 'Buscar equipamento' });
    await search.fill('tunica de couro');
    await filters.getByRole('status').getByText('1 peça encontrada').waitFor();
    await search.press('Escape');
    await filters.getByRole('status').getByText('13 peças encontradas').waitFor();
    await filters.getByRole('combobox', { name: 'Conjunto', exact: true }).selectOption('viajante');
    await filters.getByRole('status').getByText('4 peças encontradas').waitFor();
    await filters.getByRole('button', { name: 'Limpar filtros' }).click();
    await filters.getByRole('status').getByText('52 peças encontradas').waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width);
    await page.getByRole('button', { name: 'Ver conjuntos', exact: true }).click();
    await page.getByRole('heading', { name: 'Conjunto do Viajante', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Ver extrato', exact: true }).click();
    const ledger = page.getByRole('tabpanel', { name: 'Extrato', exact: true });
    await ledger.getByText('Túnica de Couro', { exact: true }).waitFor();
    await ledger.getByText('-25', { exact: true }).waitFor();
    await ledger.getByRole('button', { name: 'Carregar lançamentos anteriores' }).click();
    await ledger.getByText('Treino de ontem', { exact: true }).waitFor();
    await ledger.getByRole('button', { name: 'XP', exact: true }).click();
    assert.equal(await ledger.getByText('Túnica de Couro', { exact: true }).count(), 0);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width);
    const menu = page.getByRole('navigation', { name: width < 1024 ? 'Navegação principal mobile' : 'Menu principal' });
    await menu.getByRole('button', { name: 'Relatórios', exact: true }).click();
    await page.getByRole('heading', { name: 'Relatórios', exact: true }).waitFor();
    await page.getByRole('tabpanel', { name: 'Visão geral' }).getByText('82 bpm', { exact: true }).waitFor();
    assert.equal(chartRequests.length, 0, 'O gráfico deve ficar fora da visão geral.');
    await page.getByRole('tab', { name: 'Evolução' }).click();
    await page.locator('.recharts-surface').first().waitFor();
    assert.ok(chartRequests.length > 0, 'O gráfico deve carregar quando solicitado.');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width);
    await page.goBack();
    await arsenal.waitFor();
    await menu.getByRole('button', { name: 'Treinar', exact: true }).click();
    const workout = page.getByRole('article').filter({
      has: page.getByRole('heading', { name: 'Despertar do Guerreiro — Treino A', exact: true }),
    });
    await workout.getByRole('button', { name: /^Ver exercícios/ }).click();
    const guideButton = page.getByRole('button', { name: 'Ver guia técnico e foco muscular de Agachamento goblet' });
    const guide = page.getByRole('dialog', { name: 'Agachamento goblet' });

    await page.context().setOffline(true);
    await guideButton.click();
    await guide.getByRole('img', { name: /Demonstração anatômica/ }).waitFor();
    await guide.getByRole('heading', { name: 'Execução técnica' }).waitFor();
    await guide.getByRole('heading', { name: /^Foco muscular/ }).waitFor();
    await guide.getByRole('heading', { name: 'Impacto na sessão' }).waitFor();
    const phases = guide.getByRole('group', { name: 'Fases do ciclo' }).getByRole('button');
    assert.equal(await phases.count(), 3);
    await phases.nth(1).click();
    assert.equal(await phases.nth(1).getAttribute('aria-pressed'), 'true');
    const cycle = guide.getByRole('slider', { name: 'Progresso do ciclo do movimento' });
    await cycle.press('Home');
    await cycle.press('ArrowLeft');
    assert.equal(await cycle.getAttribute('aria-valuenow'), '0');
    await cycle.press('End');
    await cycle.press('ArrowRight');
    assert.equal(await cycle.getAttribute('aria-valuenow'), '100');
    assert.equal(await phases.nth(2).getAttribute('aria-pressed'), 'true');
    await guide.getByText('Mapa de calor', { exact: true }).waitFor();
    await guide.getByRole('group', { name: 'Selecionar músculo no mapa de calor' }).waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width);
    assert.equal(await guide.getByRole('searchbox').count(), 0);
    assert.equal(await guide.locator('video').count(), 0);
    await guide.getByRole('button', { name: 'Fechar guia técnico' }).click();
    await page.context().setOffline(false);

    await workout.getByRole('button', { name: /^Iniciar treino/ }).click();
    const settingsButton = page.getByRole('button', { name: /^Ajustar séries, carga e alertas de / });
    await settingsButton.waitFor();
    assert.ok((await settingsButton.boundingBox()).height >= 44);
    await settingsButton.click();
    const settingsDialog = page.getByRole('dialog');
    await settingsDialog.getByText(/^Séries reais \(/).waitFor();
    await settingsDialog.getByText('Carga padrão do treino (kg)', { exact: true }).waitFor();
    await settingsDialog.getByRole('button', { name: 'Série extra', exact: true }).waitFor();
    await settingsDialog.getByRole('button', { name: /som do descanso/i }).waitFor();
    await settingsDialog.getByRole('button', { name: /vibração do descanso/i }).waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width);
    await settingsDialog.getByRole('button', { name: 'Concluir ajustes', exact: true }).click();
    await settingsDialog.waitFor({ state: 'hidden' });
    const sessionFooterBox = await page.locator('footer').last().boundingBox();
    assert.ok(sessionFooterBox && sessionFooterBox.height <= page.viewportSize().height * 0.15,
      `Footer da sessão deve ocupar <= 15% da viewport (atual: ${sessionFooterBox?.height}px)`);
    await guideButton.first().click();
    await guide.getByRole('img', { name: /Demonstração anatômica/ }).waitFor();
    const complete = guide.getByRole('button', { name: 'Concluir exercício', exact: true });
    assert.ok((await complete.boundingBox()).height >= 44);
    await complete.click();
    await guide.waitFor({ state: 'hidden' });
    assert.deepEqual(errors, []);
    await page.close();
    console.log(`Navegação, relatórios e guia técnico validados em ${width}px.`);
  }
} finally {
  await browser?.close();
  if (server?.listening) {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
  await rm(dist, { recursive: true, force: true });
}
