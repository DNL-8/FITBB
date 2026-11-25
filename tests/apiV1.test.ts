import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import { Hono } from 'hono';
import { getRequestListener } from '@hono/node-server';
import { createApiV1Router } from '../src/server/apiV1.ts';
import { createAppServer, handleVercelRequest } from '../src/server/index.ts';
import { ApiHttpError } from '../src/server/firebaseRest.ts';
import {
  type AppEnv,
  createAiRateLimiter,
  createGlobalRateLimiter,
  getAllowedCorsOrigins,
  getAppBaseUrl,
  readJsonBody,
  respondToApiError,
  toContentfulStatus,
} from '../src/server/shared.ts';

async function withApiServer(run: (baseUrl: string) => Promise<void>): Promise<void> {
  const app = new Hono();
  app.route('/api/v1', createApiV1Router({ getGeminiClient: () => null }));

  const server = http.createServer(getRequestListener(app.fetch));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') {
    server.close();
    throw new Error('Falha ao obter porta de teste.');
  }
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    await run(baseUrl);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve()))
    );
  }
}

test('API v1 expõe rotas públicas /health, /armory/catalog e /openapi.json', async () => {
  await withApiServer(async (baseUrl) => {
    const healthRes = await fetch(`${baseUrl}/api/v1/health`);
    assert.equal(healthRes.status, 200);
    const healthJson = (await healthRes.json()) as { ok: boolean; service: string };
    assert.equal(healthJson.ok, true);
    assert.equal(healthJson.service, 'fitness-rpg-api-v1');

    const catalogRes = await fetch(`${baseUrl}/api/v1/armory/catalog`);
    assert.equal(catalogRes.status, 200);
    const catalogJson = (await catalogRes.json()) as {
      ok: boolean;
      data: { items: unknown[] };
    };
    assert.equal(catalogJson.ok, true);
    assert.equal(catalogJson.data.items.length, 52);

    const openApiRes = await fetch(`${baseUrl}/api/v1/openapi.json`, {
      headers: { 'X-Forwarded-Host': 'untrusted.example.test', 'X-Forwarded-Proto': 'https' },
    });
    assert.equal(openApiRes.status, 200);
    const spec = (await openApiRes.json()) as {
      openapi: string;
      servers: { url: string }[];
      paths: Record<string, {
        parameters?: Array<{ in: string; name: string; required: boolean }>;
        get?: { responses: Record<string, unknown> };
        post?: { responses: Record<string, unknown> };
        patch?: { responses: Record<string, unknown> };
        put?: { responses: Record<string, unknown> };
        delete?: { responses: Record<string, unknown> };
      }>;
    };
    assert.equal(spec.openapi, '3.0.3');
    assert.deepEqual(spec.servers, [{ url: getAppBaseUrl() }]);
    assert.ok(spec.paths['/api/v1/armory/purchase'].post?.responses['415']);
    assert.ok('/api/health' in spec.paths);
    for (const [path, item] of Object.entries(spec.paths)) {
      for (const method of ['get', 'post', 'patch', 'put', 'delete'] as const) {
        const operation = item[method];
        if (operation) {
          assert.ok(operation.responses['200'] || operation.responses['201'], `${method} ${path}`);
        }
      }
      for (const [, name] of path.matchAll(/\{([^}]+)\}/g)) {
        assert.ok(item.parameters?.some((param) => param.in === 'path' && param.name === name && param.required),
          `${path} requires the ${name} parameter`);
      }
    }
  });
});

test('erros de dependências não incluem mensagens internas ou parâmetros da URL', async (t) => {
  const report = t.mock.method(console, 'error', () => undefined);
  const app = new Hono<AppEnv>();
  app.onError(respondToApiError);
  app.get('/private/:id', () => {
    throw new ApiHttpError(502, 'upstream-private-detail', 'upstream_error');
  });

  const response = await app.request('/private/private-id?token=private-token');
  assert.equal(response.status, 502);
  assert.deepEqual(await response.json(), {
    ok: false,
    error: 'Serviço temporariamente indisponível.',
    code: 'upstream_error',
  });
  const log = JSON.parse(String(report.mock.calls[0]?.arguments[0]));
  assert.equal(log.context, 'GET /private/:id');
  assert.equal(log.code, 'upstream_error');
  assert.equal(log.message, undefined);
});

test('API v1 exige Bearer Token válido nas rotas protegidas', async () => {
  await withApiServer(async (baseUrl) => {
    const protectedEndpoints: Array<{ method: string; path: string; body?: unknown }> = [
      { method: 'GET', path: '/api/v1/state' },
      { method: 'POST', path: '/api/v1/stats/grant', body: { xpDelta: 100 } },
      { method: 'POST', path: '/api/v1/health-data/activities', body: { title: 'Run' } },
      { method: 'POST', path: '/api/v1/oracle/ask', body: { question: 'Oi' } },
    ];

    for (const ep of protectedEndpoints) {
      const res = await fetch(`${baseUrl}${ep.path}`, {
        method: ep.method,
        headers: { 'Content-Type': 'application/json' },
        body: ep.body ? JSON.stringify(ep.body) : undefined,
      });
      assert.equal(res.status, 401, `${ep.method} ${ep.path} deveria retornar 401`);
      const json = (await res.json()) as { ok: boolean; code: string };
      assert.equal(json.ok, false);
      assert.equal(json.code, 'missing_bearer_token');
    }

    const invalidJwtRes = await fetch(`${baseUrl}/api/v1/nonexistent`, {
      headers: { Authorization: 'Bearer invalid.jwt.token' },
    });
    assert.equal(invalidJwtRes.status, 401);
  });
});

test('Servidor Hono em src/server/index.ts, /api/health, bodyLimit e adaptador Vercel funcionam corretamente', async () => {
  const prevNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try {
    const app = await createAppServer(false);

    const rootHealthRes = await app.request('/api/health');
    assert.equal(rootHealthRes.status, 200);
    const rootHealthJson = (await rootHealthRes.json()) as {
      ok: boolean;
      service: string;
      version: string;
    };
    assert.equal(rootHealthJson.ok, true);
    assert.equal(rootHealthJson.service, 'fitness-rpg-api');
    assert.equal(rootHealthJson.version, 'v1');

    const stravaCfgRes = await app.request('/api/strava/config');
    assert.equal(stravaCfgRes.status, 200);
    assert.ok(stravaCfgRes.headers.get('x-request-id'));
    assert.equal(
      stravaCfgRes.headers.get('cross-origin-opener-policy'),
      'same-origin-allow-popups'
    );
    const stravaCfg = (await stravaCfgRes.json()) as { callbackUrl: string };
    assert.ok(stravaCfg.callbackUrl.endsWith('/auth/strava/callback'));

    const vercelHealthRes = await handleVercelRequest(
      new Request('http://localhost:3000/api/v1/health')
    );
    assert.equal(vercelHealthRes.status, 200);
    const vercelHealthJson = (await vercelHealthRes.json()) as { ok: boolean; service: string };
    assert.equal(vercelHealthJson.ok, true);
    assert.equal(vercelHealthJson.service, 'fitness-rpg-api-v1');

    const oversizedRes = await app.request('/api/strava/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'x'.repeat(2 * 1024 * 1024 + 64),
    });
    assert.equal(oversizedRes.status, 413);
    const oversizedJson = (await oversizedRes.json()) as { ok: boolean; code: string };
    assert.equal(oversizedJson.ok, false);
    assert.equal(oversizedJson.code, 'payload_too_large');

    const notFoundApiRes = await app.request('/api/rota-inexistente');
    assert.equal(notFoundApiRes.status, 404);
    const notFoundJson = (await notFoundApiRes.json()) as { ok: boolean; code: string };
    assert.equal(notFoundJson.ok, false);
    assert.equal(notFoundJson.code, 'api_route_not_found');

    const forbiddenCorsRes = await app.request('/api/v1/health', {
      headers: { Origin: 'https://malicious-origin.example.com' },
    });
    assert.equal(forbiddenCorsRes.status, 403);
    const corsJson = (await forbiddenCorsRes.json()) as { ok: boolean; code: string };
    assert.equal(corsJson.ok, false);
    assert.equal(corsJson.code, 'cors_forbidden');
  } finally {
    process.env.NODE_ENV = prevNodeEnv;
  }
});

test('Rate limiter de IA bloqueia após exceder limite e readJsonBody rejeita JSON inválido', async () => {
  const rateLimiter = createAiRateLimiter(2, 60_000);
  const testApp = new Hono<AppEnv>();
  testApp.onError((err, c) => {
    if (err instanceof ApiHttpError) {
      return c.json({ ok: false, error: err.message, code: err.code }, toContentfulStatus(err.statusCode, 500));
    }
    return c.json({ ok: false, error: 'internal' }, 500);
  });
  testApp.post('/test-ai', rateLimiter.middleware, async (c) => {
    const body = await readJsonBody(c);
    return c.json({ ok: true, body });
  });

  const r1 = await testApp.request('/test-ai', {
    method: 'POST',
    headers: { 'x-real-ip': '10.0.0.1', 'Content-Type': 'application/json' },
    body: JSON.stringify({ q: 1 }),
  });
  assert.equal(r1.status, 200);
  assert.equal(r1.headers.get('ratelimit-remaining'), '1');

  const r2 = await testApp.request('/test-ai', {
    method: 'POST',
    headers: { 'x-real-ip': '10.0.0.1', 'Content-Type': 'application/json' },
    body: JSON.stringify({ q: 2 }),
  });
  assert.equal(r2.status, 200);
  assert.equal(r2.headers.get('ratelimit-remaining'), '0');

  const r3 = await testApp.request('/test-ai', {
    method: 'POST',
    headers: { 'x-real-ip': '10.0.0.1', 'Content-Type': 'application/json' },
    body: JSON.stringify({ q: 3 }),
  });
  assert.equal(r3.status, 429);
  const r3Json = (await r3.json()) as { ok: boolean; code: string };
  assert.equal(r3Json.ok, false);
  assert.equal(r3Json.code, 'rate_limit_exceeded');

  const badJsonRes = await testApp.request('/test-ai', {
    method: 'POST',
    headers: { 'x-real-ip': '10.0.0.2', 'Content-Type': 'application/json' },
    body: '{invalid-json',
  });
  assert.equal(badJsonRes.status, 400);
  const badJsonBody = (await badJsonRes.json()) as { ok: boolean; code: string };
  assert.equal(badJsonBody.ok, false);
  assert.equal(badJsonBody.code, 'invalid_json');

  const invalidShapeRes = await testApp.request('/test-ai', {
    method: 'POST',
    headers: { 'x-real-ip': '10.0.0.3', 'Content-Type': 'application/json' },
    body: JSON.stringify([1, 2, 3]),
  });
  assert.equal(invalidShapeRes.status, 400);
  const invalidShapeBody = (await invalidShapeRes.json()) as { code: string };
  assert.equal(invalidShapeBody.code, 'invalid_json_body');

  const globalLimiter = createGlobalRateLimiter(2, 60_000);
  const globalApp = new Hono<AppEnv>();
  globalApp.use('/api/*', globalLimiter.middleware);
  globalApp.get('/api/health', (c) => c.json({ ok: true }));
  assert.equal((await globalApp.request('/api/health', { headers: { 'x-real-ip': '10.0.0.9' } })).status, 200);
  assert.equal((await globalApp.request('/api/health', { headers: { 'x-real-ip': '10.0.0.9' } })).status, 200);
  const globalLimited = await globalApp.request('/api/health', { headers: { 'x-real-ip': '10.0.0.9' } });
  assert.equal(globalLimited.status, 429);
  assert.ok(globalLimited.headers.get('retry-after'));
  assert.equal(((await globalLimited.json()) as { code: string }).code, 'rate_limit_exceeded');
});

test('getAppBaseUrl utiliza fallback VERCEL_URL quando APP_URL não está definida', () => {
  const prevAppUrl = process.env.APP_URL;
  const prevVercelUrl = process.env.VERCEL_URL;
  delete process.env.APP_URL;
  process.env.VERCEL_URL = 'fitness-rpg-preview.vercel.app';
  try {
    assert.equal(getAppBaseUrl(), 'https://fitness-rpg-preview.vercel.app');
  } finally {
    if (prevAppUrl !== undefined) process.env.APP_URL = prevAppUrl;
    else delete process.env.APP_URL;
    if (prevVercelUrl !== undefined) process.env.VERCEL_URL = prevVercelUrl;
    else delete process.env.VERCEL_URL;
  }
});

test('APP_URL e ALLOWED_ORIGINS aceitam apenas origens HTTP sem credenciais', () => {
  const previous = { APP_URL: process.env.APP_URL, ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS };
  try {
    process.env.APP_URL = 'https://app.example.test/path?ignored=true';
    process.env.ALLOWED_ORIGINS = 'https://preview.example.test, file:///tmp, https://user:pass@private.example.test';
    assert.equal(getAppBaseUrl(), 'https://app.example.test');
    const origins = getAllowedCorsOrigins();
    assert.equal(origins.has('https://preview.example.test'), true);
    assert.equal(origins.has('https://private.example.test'), false);
    assert.equal(origins.has('null'), false);
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
