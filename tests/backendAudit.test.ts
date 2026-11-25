import assert from 'node:assert/strict';
import { test } from 'node:test';
import { generateKeyPairSync, sign } from 'node:crypto';
import { createAppServer } from '../src/server/index.ts';
import { assertValidDateKey } from '../src/server/apiV1/domain.ts';
import { FirestoreRestClient, getFirebaseAppletConfig, verifyFirebaseBearerToken } from '../src/server/firebaseRest.ts';
import { projectHealthConnect, type HealthConnectRecord } from '../src/utils/healthConnect.ts';

test('a API rejeita datas inexistentes e aceita dia bissexto', () => {
  assert.equal(assertValidDateKey('2028-02-29'), '2028-02-29');
  assert.throws(() => assertValidDateKey('2026-02-29'), /Formato de data inválido/);
  assert.throws(() => assertValidDateKey('2026-04-31'), /Formato de data inválido/);
});

test('relatórios combinam os totais e sessões do Health Connect sem somar passos de duas fontes', () => {
  const base: Omit<HealthConnectRecord, 'recordId' | 'type' | 'values'> = {
    userId: 'owner', startTime: '2026-11-21T12:00:00Z', endTime: '2026-11-21T12:30:00Z', updatedAt: 1,
  };
  const records: HealthConnectRecord[] = [
    { ...base, recordId: 'hc_daily_2026-11-21_steps', type: 'steps', values: { count: 2300 } },
    { ...base, recordId: 'hc_daily_2026-11-21_calories', type: 'calories', values: { kilocalories: 2000 } },
    { ...base, recordId: 'raw-steps', type: 'steps', values: { count: 700 } },
    { ...base, recordId: 'exercise-a', type: 'exercise', values: { exerciseType: 2, title: 'Caminhada' } },
    { ...base, recordId: 'exercise-b', type: 'exercise', values: { exerciseType: 2, title: 'Caminhada' } },
    { ...base, recordId: 'heart', type: 'heart_rate', updatedAt: 3,
      values: { samples: [{ time: '2026-11-21T12:01:00Z', beatsPerMinute: 100 }] } },
    { ...base, userId: 'other', recordId: 'unrelated', type: 'exercise', values: {}, updatedAt: 4 },
  ];
  const oldMetric = {
    id: '2026-11-21', userId: 'owner', dateKey: '2026-11-21',
    steps: 2000, activeCalories: 300, sleepHours: 7, restingHeartRate: null, hrvMs: null,
    trainingLoadScore: 30, recoveryScore: 70, sources: ['strava'], updatedAt: '',
  };
  const projected = projectHealthConnect(records, [], [oldMetric], 'owner', 'America/Sao_Paulo');
  assert.equal(projected.metrics[0].steps, 2300);
  assert.equal(projected.metrics[0].activeCalories, 300);
  assert.equal(projected.days[0].totalCalories, 2000);
  assert.equal(projected.activities.length, 1);
  assert.equal(projected.activities[0].source, 'health_connect');
  assert.equal(projected.activities[0].avgHeartRate, 100);
  assert.equal(projected.latestHeartRate?.beatsPerMinute, 100);
  assert.equal(projected.latestRecordUpdate, 3);
});

test('consultas novas começam pela data mais recente e avançam pelo último documento', async (t) => {
  const bodies: Record<string, any>[] = [];
  t.mock.method(globalThis, 'fetch', async (_url: string, init?: RequestInit) => {
    const { structuredQuery: query } = JSON.parse(String(init?.body));
    bodies.push(query);
    const start = bodies.length === 1 ? 0 : 250;
    const count = bodies.length === 1 ? 250 : 1;
    return Response.json(Array.from({ length: count }, (_, index) => ({
      document: {
        name: `projects/demo/databases/(default)/documents/users/owner/workoutLogs/log-${start + index}`,
        fields: { completedAt: { stringValue: '2026-11-21T12:00:00Z' } },
      },
    })));
  });
  const documents = await new FirestoreRestClient().queryByUser('test', 'owner', 'workoutLogs', 251);
  assert.equal(documents.length, 251);
  assert.equal(bodies[0].where.fieldFilter.value.stringValue, 'owner');
  assert.deepEqual(bodies[0].orderBy.map((order: any) => order.field.fieldPath), ['completedAt', '__name__']);
  assert.equal(bodies[1].startAt.before, false);
  assert.match(bodies[1].startAt.values[1].referenceValue, /\/log-249$/);
  assert.equal(bodies[1].offset, undefined);
});

test('a sessão OAuth do Strava responde apenas à conta Firebase que a conectou', async (t) => {
  const original = { ...process.env };
  process.env.SESSION_SECRET = 'test-strava-session-key';
  process.env.STRAVA_CLIENT_ID = 'test-id';
  process.env.STRAVA_CLIENT_SECRET = 'test-token';
  process.env.APP_URL = 'https://app.example.test';
  t.after(() => {
    for (const key of ['SESSION_SECRET', 'STRAVA_CLIENT_ID', 'STRAVA_CLIENT_SECRET', 'APP_URL']) {
      if (original[key] === undefined) delete process.env[key];
      else process.env[key] = original[key];
    }
  });
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const projectId = getFirebaseAppletConfig().projectId;
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const tokenFor = (uid: string, claims: Record<string, unknown> = {}): string => {
    const now = Math.floor(Date.now() / 1000);
    const data = `${encode({ alg: 'RS256', kid: 'fixture-key' })}.${encode({
      sub: uid, aud: projectId, iss: `https://securetoken.google.com/${projectId}`,
      iat: now, auth_time: now, exp: now + 600, email_verified: true, ...claims,
    })}`;
    return `Bearer ${data}.${sign('RSA-SHA256', Buffer.from(data), privateKey).toString('base64url')}`;
  };
  let tokenExchanges = 0;
  t.mock.method(globalThis, 'fetch', async (url: string, init?: RequestInit) => {
    if (url.startsWith('https://www.googleapis.com/robot/')) {
      return Response.json({ 'fixture-key': publicKey.export({ type: 'spki', format: 'pem' }) });
    }
    assert.equal(url, 'https://www.strava.com/oauth/token');
    assert.equal(init?.redirect, 'error');
    tokenExchanges += 1;
    return Response.json({
      access_token: 'provider-access', refresh_token: 'provider-refresh',
      expires_at: Math.floor(Date.now() / 1000) + 1200, athlete: { id: 1, firstname: 'Atleta' },
    });
  });

  function getCookie(response: Response, name: string): string {
    const cookie = response.headers.getSetCookie().find((entry) => entry.startsWith(`${name}=`));
    assert.ok(cookie, name);
    return cookie.split(';')[0];
  }

  const app = await createAppServer(true);
  const owner = tokenFor('owner');
  for (const [token, code] of [
    [tokenFor('owner', { auth_time: 'wrong-type' }), 'invalid_auth_time'],
    [tokenFor('owner', { exp: 1.5 }), 'token_expired'],
    [tokenFor('owner/other'), 'invalid_subject'],
    [tokenFor('owner', { email_verified: false }), 'email_not_verified'],
    [`${owner}=`, 'invalid_token_format'],
  ]) {
    await assert.rejects(verifyFirebaseBearerToken(token), { code });
  }
  const response = await app.request('/api/strava/auth-url', { headers: { Authorization: owner } });
  assert.equal(response.status, 200);
  const { url } = await response.json() as { url: string };
  const state = new URL(url).searchParams.get('state');
  assert.ok(state);
  assert.equal(new URL(url).searchParams.get('scope'), 'activity:read_all');
  const oauthState = getCookie(response, 'strava_oauth_state');
  const rejected = await app.request(`/auth/strava/callback?code=fixture&state=${state}&state=${state}`, {
    headers: { Cookie: oauthState },
  });
  assert.equal(rejected.status, 403);
  assert.equal(tokenExchanges, 0);
  const callback = await app.request(`/auth/strava/callback?code=fixture&state=${encodeURIComponent(state)}`, {
    headers: { Cookie: oauthState },
  });
  assert.equal(callback.status, 200);
  assert.equal(callback.headers.get('referrer-policy'), 'no-referrer');
  assert.match(callback.headers.get('content-security-policy') ?? '', /frame-ancestors 'none'/);
  assert.doesNotMatch(await callback.text(), /provider-access|provider-refresh|firstname/);
  const cookie = getCookie(callback, 'strava_oauth_session');

  for (const [authorization, connected] of [[owner, true], [tokenFor('other'), false]] as const) {
    const status = await app.request('/api/strava/status', {
      headers: { Authorization: authorization, Cookie: cookie },
    });
    assert.equal(status.status, 200);
    assert.equal((await status.json() as { connected: boolean }).connected, connected);
    assert.match(status.headers.get('cache-control') ?? '', /no-store/);
  }
});
