import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { test } from 'node:test';
import { Hono } from 'hono';
import { createApiV1Router } from '../src/server/apiV1.ts';
import { handleGetFullState, handleGetHealthSummary, handleLogHealthActivity } from '../src/server/apiV1/domain.ts';
import {
  ApiHttpError, FirestoreRestClient, firestoreRest, getFirebaseAppletConfig, type VerifiedFirebaseUser,
} from '../src/server/firebaseRest.ts';
import type { GameStats, HealthActivity, WorkoutLog } from '../src/types/fitness.ts';
import { createInitialGameStats, INITIAL_WORKOUTS } from '../src/utils/rpgLogic.ts';

const uid = 'owner';
const workout = INITIAL_WORKOUTS[0];
const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');

test('importações com IDs diferentes e a mesma origem externa recebem XP uma única vez', async (t) => {
  const user: VerifiedFirebaseUser = { uid, token: 'fixture', email: null, emailVerified: true, isAdmin: false };
  let stats = createInitialGameStats(uid);
  let version = 0;
  const activities = new Map<string, HealthActivity>();
  t.mock.method(firestoreRest, 'getDocWithMeta', async () => ({ data: stats, updateTime: String(version) }));
  t.mock.method(firestoreRest, 'getDoc', async (_token: string, path: string) =>
    path === `users/${uid}` ? { userId: uid } : activities.get(path) ?? null);
  t.mock.method(firestoreRest, 'queryByUser', async (
    _token: string, _uid: string, collection: string, _limit: number, filter: { activityIdentity: { source: string; externalId: string } }
  ) => {
    assert.equal(collection, 'healthActivities');
    const target = filter.activityIdentity;
    return [...activities.values()].filter((record) =>
      record.source === target.source && record.externalId === target.externalId);
  });
  t.mock.method(firestoreRest, 'commitWrites', async (
    _token: string, writes: Parameters<typeof firestoreRest.commitWrites>[1]
  ) => {
    const [activity, progress] = writes;
    assert.equal(activity.type, 'set');
    assert.equal(progress.type, 'set');
    if (progress.precondition?.updateTime !== String(version)) {
      throw new ApiHttpError(409, 'Concurrent write', 'concurrency_conflict');
    }
    activities.set(activity.path, activity.data as unknown as HealthActivity);
    stats = progress.data as unknown as GameStats;
    version++;
  });
  const payload = { source: 'csv', externalId: 'activity-in-source', title: 'Corrida', durationMinutes: 30 };
  const results = await Promise.all([
    handleLogHealthActivity(user, { ...payload, id: 'first-id' }),
    handleLogHealthActivity(user, { ...payload, id: 'second-id' }),
  ]);
  assert.equal(activities.size, 1);
  assert.deepEqual(results.map(({ duplicate }) => duplicate).sort(), [false, true]);
  assert.equal(stats.totalXp, results[0].activity.xpAwarded);
  assert.equal(results[0].activity.id, results[1].activity.id);
  assert.deepEqual(results[0].activity.zoneMinutes, [0, 0, 0, 0, 0]);
});

test('conclusão pela API aplica recompensas uma vez e detecta reutilização da chave', async (t) => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const { projectId } = getFirebaseAppletConfig();
  const now = Math.floor(Date.now() / 1000);
  const jwt = `${encode({ alg: 'RS256', kid: 'reliability-test' })}.${encode({
    sub: uid, aud: projectId, iss: `https://securetoken.google.com/${projectId}`,
    iat: now, auth_time: now, exp: now + 600, email_verified: true,
  })}`;
  const authorization = `Bearer ${jwt}.${sign('RSA-SHA256', Buffer.from(jwt), privateKey).toString('base64url')}`;
  t.mock.method(globalThis, 'fetch', async (url: string) => {
    assert.match(url, /^https:\/\/www\.googleapis\.com\/robot\//);
    return Response.json({ 'reliability-test': publicKey.export({ type: 'spki', format: 'pem' }) });
  });

  let stats = createInitialGameStats(uid);
  let version = 1;
  const logs = new Map<string, WorkoutLog>();
  t.mock.method(firestoreRest, 'getDocWithMeta', async () => ({
    data: stats, updateTime: String(version),
  }));
  t.mock.method(firestoreRest, 'getDoc', async (_token: string, path: string) => {
    if (path === `users/${uid}`) return { userId: uid };
    if (path.endsWith('/gameStats/main')) return stats;
    return logs.get(path.split('/').at(-1)!) ?? null;
  });
  t.mock.method(firestoreRest, 'queryByUser', async (
    _token: string, owner: string, collection: string, _limit: number, selection?: { documentPrefix: string }
  ) => {
    assert.equal(owner, uid);
    if (collection === 'achievements') return [];
    assert.equal(collection, 'workoutLogs');
    assert.ok(selection?.documentPrefix);
    return [...logs.values()].filter((log) => log.id.startsWith(selection.documentPrefix));
  });
  t.mock.method(firestoreRest, 'commitWrites', async (
    _token: string, writes: Parameters<typeof firestoreRest.commitWrites>[1]
  ) => {
    const [statsWrite, logWrite] = writes;
    assert.equal(statsWrite.type, 'set');
    assert.equal(logWrite.type, 'set');
    assert.equal(logWrite.precondition?.exists, false);
    if (statsWrite.precondition?.updateTime !== String(version)) {
      throw new ApiHttpError(409, 'Concurrent write', 'concurrency_conflict');
    }
    stats = statsWrite.data as unknown as GameStats;
    const log = logWrite.data as unknown as WorkoutLog;
    logs.set(log.id, log);
    version += 1;
  });

  const app = new Hono().route('/api/v1', createApiV1Router({ getGeminiClient: () => null }));
  const defaultPath = `/api/v1/workouts/${workout.id}/complete`;
  const post = (body: object, key?: string, path = defaultPath) => app.request(path, {
    method: 'POST',
    headers: {
      authorization, 'Content-Type': 'application/json', ...(key ? { 'Idempotency-Key': key } : {}),
    },
    body: JSON.stringify(body),
  });
  const payload = { completedExercises: 2, durationMinutes: 24 };
  const missing = await post(payload);
  assert.equal(missing.status, 400);
  assert.equal((await missing.json()).code, 'missing_idempotency_key');
  const invalid = await post({ ...payload, idempotencyKey: 'other' }, 'one');
  assert.equal(invalid.status, 400);
  assert.equal((await invalid.json()).code, 'mismatched_idempotency_key');
  const retries = await Promise.all([
    post(payload, 'one'),
    post({ ...payload, idempotencyKey: 'one' }),
  ]);
  assert.deepEqual(retries.map(({ status }) => status), [200, 200]);
  const results = await Promise.all(retries.map(async (response) => (await response.json()).data));
  assert.equal(results[0].log.id, results[1].log.id);
  assert.deepEqual(results.map(({ duplicate }) => duplicate).sort(), [false, true]);
  assert.equal(stats.totalWorkouts, 1);

  const differentPayload = await post({ ...payload, durationMinutes: 45 }, 'one');
  assert.equal(differentPayload.status, 409);
  assert.equal((await differentPayload.json()).code, 'idempotency_conflict');
  const differentWorkout = await post(payload, 'one', `/api/v1/workouts/${INITIAL_WORKOUTS[1].id}/complete`);
  assert.equal(differentWorkout.status, 409);

  const legacyId = 'log-legacy';
  logs.set(legacyId, { ...results[0].log, id: legacyId });
  const legacyReplay = await post({
    action: 'complete_workout',
    payload: { ...payload, workoutId: workout.id, idempotencyKey: 'legacy' },
  }, undefined, '/api/v1/command');
  assert.equal(legacyReplay.status, 200);
  assert.equal((await legacyReplay.json()).data.result.log.id, legacyId);
  assert.equal(stats.totalWorkouts, 1);

  const competing = await Promise.all([
    post(payload, 'two'),
    post({ ...payload, durationMinutes: 45 }, 'two'),
  ]);
  assert.deepEqual(competing.map(({ status }) => status).sort(), [200, 409]);
  assert.equal(stats.totalWorkouts, 2);

  for (const limit of ['invalid', '1.5', '0', '201', '']) {
    const response = await app.request(`/api/v1/workouts/logs?limit=${limit}`, { headers: { authorization } });
    assert.equal(response.status, 400, limit);
    assert.equal((await response.json()).code, 'invalid_workout_log_limit');
  }

  const ambiguous = await app.request('/api/v1/workouts/logs?limit=2&limit=3', { headers: { authorization } });
  assert.equal(ambiguous.status, 400);
  assert.equal((await ambiguous.json()).code, 'duplicate_query_parameter');

  const invalidInputs = [
    ['PATCH', '/hero', { heightCm: [170] }],
    ['POST', '/command', { action: 'get_state', payload: [] }],
    ['POST', '/command', { action: 'purchase_gear', payload: { itemId: 'test', equip: 'false' } }],
    ['POST', '/workouts', { name: 'Treino', type: 'forca', exercises: [null] }],
    ['PUT', '/armory/equip', { gear: [] }],
    ['PUT', '/armory/equip', { slot: 'arma' }],
    ['POST', '/health-data/weight', { weightKg: '75' }],
    ['POST', '/health-data/metrics', { dateKey: '2026-02-29', steps: 1000 }],
    ['POST', '/health-data/activities', { title: 'Corrida', startedAt: 'invalid', hrSamplePoints: [90] }],
    ['POST', '/oracle/ask', { question: 'Teste', persist: 1 }],
  ] as const;
  for (const [method, path, body] of invalidInputs) {
    const malformed = await app.request(`/api/v1${path}`, {
      method,
      headers: { authorization, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    assert.equal(malformed.status, 400, path);
    assert.equal((await malformed.json()).code, 'invalid_request_body', path);
  }
  const improperType = await app.request('/api/v1/oracle/ask', {
    method: 'POST', headers: { authorization, 'Content-Type': 'text/plain' }, body: '{}',
  });
  assert.equal(improperType.status, 415);
});

test('paginação usa data e ID para desempate e mantém a ordem do cursor após a queda para ID', async (t) => {
  const client = new FirestoreRestClient();
  const completedAt = '2026-11-21T12:00:00.000Z';
  const resource = (id: string) =>
    `projects/demo/databases/(default)/documents/users/${uid}/workoutLogs/${id}`;
  const row = (id: string) => ({
    document: { name: resource(id), fields: { id: { stringValue: id }, completedAt: { stringValue: completedAt } } },
  });
  let indexMissing = false;
  const requests: Array<Record<string, any>> = [];
  t.mock.method(globalThis, 'fetch', async (_url: string, init?: RequestInit) => {
    const { structuredQuery } = JSON.parse(String(init?.body));
    requests.push(structuredQuery);
    if (indexMissing && structuredQuery.orderBy.length > 1) {
      return Response.json({
        error: { status: 'FAILED_PRECONDITION', message: 'The query requires an index.' },
      }, { status: 400 });
    }
    return Response.json(structuredQuery.startAt ? [row('b')] : [row('c'), row('b')]);
  });

  for (const order of ['completedAt', 'documentId']) {
    const first = await client.queryWorkoutLogsPage<WorkoutLog>('token', uid, 1);
    assert.equal(first.order, order);
    assert.deepEqual(first.logs.map((log) => log.id), ['c']);
    assert.ok(first.nextCursor);
    // Even if the index becomes available, the continuation keeps the same ordering.
    indexMissing = false;
    const second = await client.queryWorkoutLogsPage<WorkoutLog>('token', uid, 1, first.nextCursor);
    assert.equal(second.order, order);
    assert.deepEqual(second.logs.map((log) => log.id), ['b']);
    assert.equal(second.nextCursor, null);
    const query = requests.at(-1)!;
    assert.equal(query.where.fieldFilter.value.stringValue, uid);
    assert.equal(query.limit, 2);
    assert.equal(query.startAt.before, false);
    const values = query.startAt.values;
    assert.equal(values.length, order === 'completedAt' ? 2 : 1);
    if (order === 'completedAt') assert.equal(values[0].stringValue, completedAt);
    assert.match(values.at(-1).referenceValue, /\/workoutLogs\/c$/);
    await assert.rejects(client.queryWorkoutLogsPage('token', 'different-user', 1, first.nextCursor),
      { code: 'invalid_workout_log_cursor' });
    indexMissing = true;
  }
});

test('Health Connect indica indisponibilidade e preserva os grupos legíveis', async (t) => {
  const user = { uid, token: 'test' } as VerifiedFirebaseUser;
  const day = '2026-11-21';
  let deniedGroups = 1;
  t.mock.method(firestoreRest, 'getDoc', async () => null);
  t.mock.method(firestoreRest, 'queryByUser', async (
    _token: string, _owner: string, collection: string, _limit?: number,
    selection?: { recordType?: string; documentPrefix?: string }
  ) => {
    if (collection !== 'healthConnectRecords') return [];
    if (deniedGroups === 3 || (deniedGroups === 1 && selection?.recordType === 'heart_rate')) {
      throw new ApiHttpError(403, 'Denied', 'permission_denied');
    }
    if (!selection?.documentPrefix) return [];
    return [{
      userId: uid, recordId: `hc_daily_${day}_steps`, type: 'steps',
      startTime: `${day}T10:00:00Z`, endTime: `${day}T11:00:00Z`, values: { count: 2300 },
    }];
  });
  const partial = await handleGetHealthSummary(user);
  assert.equal(partial.healthConnect.status, 'partial');
  assert.deepEqual(partial.healthConnect.days, [{ dateKey: day, steps: 2300 }]);
  assert.equal((await handleGetFullState(user)).healthConnectStatus, 'partial');
  deniedGroups = 3;
  assert.equal((await handleGetHealthSummary(user)).healthConnect.status, 'unavailable');
  deniedGroups = 0;
  assert.equal((await handleGetHealthSummary(user)).healthConnect.status, 'available');
});

test('conclusão com séries reais calcula volume total, detecta PRs e persiste em exercisePrs', async (t) => {
  const { handleCompleteWorkout } = await import('../src/server/apiV1/domain.ts');
  const prUser: VerifiedFirebaseUser = {
    uid: 'pr-owner',
    token: 'fixture',
    email: null,
    emailVerified: true,
    isAdmin: false,
  };
  let stats = createInitialGameStats(prUser.uid);
  const committedWrites: Array<{ path: string; data: Record<string, unknown> }> = [];

  t.mock.method(firestoreRest, 'getDocWithMeta', async (_token: string, path: string) => {
    if (path.endsWith('/gameStats/main')) {
      return { data: stats, updateTime: 'v1' };
    }
    return null;
  });
  t.mock.method(firestoreRest, 'getDoc', async (_token: string, path: string) => {
    if (path === `users/${prUser.uid}`) return { userId: prUser.uid };
    return null;
  });
  t.mock.method(firestoreRest, 'queryByUser', async () => []);
  t.mock.method(firestoreRest, 'commitWrites', async (
    _token: string,
    writes: Parameters<typeof firestoreRest.commitWrites>[1]
  ) => {
    for (const w of writes) {
      if (w.type === 'set') {
        committedWrites.push({ path: w.path, data: w.data });
      }
    }
  });

  const targetWorkout = INITIAL_WORKOUTS[0];
  const firstEx = targetWorkout.exercises[0];
  const res = await handleCompleteWorkout(prUser, targetWorkout.id, {
    idempotencyKey: 'pr-session-1',
    completedExerciseIds: targetWorkout.exercises.map((e) => e.id),
    durationMinutes: 40,
    dateKey: '2026-11-18',
    performedExercises: [
      {
        exerciseId: firstEx.id,
        exerciseName: firstEx.name,
        sets: [
          { setIndex: 1, weightKg: 20, reps: 12, completed: true },
          { setIndex: 2, weightKg: 25, reps: 10, completed: true },
        ],
      },
    ],
  });

  assert.equal(res.log.totalVolumeKg, 20 * 12 + 25 * 10);
  assert.equal(res.log.prCount, 1);
  assert.equal(res.rewardSummary.prXpBonus, 20);
  assert.equal(res.rewardSummary.prCoinsBonus, 10);
  assert.ok(
    committedWrites.some((w) => w.path === `users/${prUser.uid}/exercisePrs/${firstEx.id}`)
  );
});
