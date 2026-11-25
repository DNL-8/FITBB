import assert from 'node:assert/strict';
import { setTimeout } from 'node:timers/promises';

const origin = process.env.PRODUCTION_APP_URL ?? 'https://app-fitness-rm9t.vercel.app';
const revision = process.env.GITHUB_SHA;
const healthUrl = new URL('/api/health', origin);
let health;
for (let attempt = 0; attempt < 24; attempt++) {
  try {
    const response = await fetch(healthUrl, { cache: 'no-store', signal: AbortSignal.timeout(5_000) });
    if (response.ok) health = await response.json();
    if (health?.ok && (!revision || health.revision === revision)) break;
  } catch {
    // A função pode estar sendo atualizada pela Vercel.
  }
  if (attempt < 23) await setTimeout(5_000);
}
assert.equal(health?.ok, true, 'A API publicada deve responder HTTP 200');
if (revision) assert.equal(health.revision, revision, 'A Vercel deve servir a revisão publicada');
for (const path of ['/api/v1/health', '/api/v1/openapi.json', '/api/strava/config']) {
  const response = await fetch(new URL(path, origin), { signal: AbortSignal.timeout(5_000) });
  assert.equal(response.status, 200, path);
  assert.match(response.headers.get('content-type') ?? '', /application\/json/);
}
