import assert from 'node:assert/strict';

process.env.NODE_ENV = 'production';
const { default: handler } = await import('../api/index.ts');
const routes = new Map([
  ['/api/health', 200],
  ['/api/v1/health', 200],
  ['/api/v1/openapi.json', 200],
  ['/api/strava/config', 200],
  ['/api/strava/status', 401],
  ['/api/v1/state', 401],
]);
for (const [path, expected] of routes) {
  const response = await handler(new Request(new URL(path, 'http://localhost:3000')));
  assert.equal(response.status, expected, path);
  assert.match(response.headers.get('content-type') ?? '', /application\/json/);
}
