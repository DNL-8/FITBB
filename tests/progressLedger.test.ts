import assert from 'node:assert/strict';
import test from 'node:test';
import { commitProgressChange, readProgressLedger } from '../src/server/apiV1/progressLedger.ts';
import { ApiHttpError, firestoreRest, type VerifiedFirebaseUser } from '../src/server/firebaseRest.ts';
import type { ProgressLedgerEntry } from '../src/types/progressLedger.ts';

const user: VerifiedFirebaseUser = { uid: 'owner', token: 'test', email: null, emailVerified: true, isAdmin: false };
const denied = new ApiHttpError(403, 'Permission denied.');
const time = '2026-11-21T12:00:00.000Z';
const before = { totalXp: 40, goldCoins: 50, updatedAt: '2026-11-20T12:00:00.000Z' };
const after = { totalXp: 80, goldCoins: 60, updatedAt: time };
const updates = [{ type: 'set' as const, path: 'users/owner/gameStats/main', data: after, precondition: { updateTime: 'version' } }];

test('o commit atômico preserva a operação enquanto a coleção do extrato está indisponível', async (t) => {
  const commit = t.mock.method(firestoreRest, 'commitWrites', async (_token: string, writes: typeof updates) => {
    if (writes.length > 1) throw denied;
  });
  const availability = t.mock.method(firestoreRest, 'getDoc', async () => { throw denied; });
  await commitProgressChange(user, before, after, { kind: 'workout', title: 'Treino' }, updates);
  assert.equal(commit.mock.calls.length, 2);
  assert.equal(availability.mock.calls.length, 1);
  assert.deepEqual(commit.mock.calls[1].arguments[1], updates);
  t.mock.method(firestoreRest, 'queryByUser', async () => { throw denied; });
  assert.deepEqual(await readProgressLedger(user), { available: false, entries: [], nextCursor: null });
});

test('com o extrato ativo, uma falha na gravação preserva os saldos e propaga o erro', async (t) => {
  const commit = t.mock.method(firestoreRest, 'commitWrites', async () => { throw denied; });
  t.mock.method(firestoreRest, 'getDoc', async () => null);
  await assert.rejects(commitProgressChange(user, before, after, { kind: 'workout', title: 'Treino' }, updates), denied);
  assert.equal(commit.mock.calls.length, 1);
});

test('o extrato retorna páginas de 30 lançamentos e valida cursores', async (t) => {
  const entries = Array.from({ length: 31 }, (_, index): ProgressLedgerEntry => ({
    id: `20261121120000000_00000000-0000-0000-0000-${String(index).padStart(12, '0')}`,
    userId: user.uid, kind: 'workout', title: 'Treino', createdAt: time,
    xpDelta: 40, coinDelta: 10, totalXp: 80, goldCoins: 60,
  }));
  const read = t.mock.method(firestoreRest, 'queryByUser', async () => entries);
  await assert.rejects(readProgressLedger(user, 'invalid'), { code: 'invalid_progress_ledger_cursor' });
  const page = await readProgressLedger(user);
  assert.equal(read.mock.calls.length, 1);
  assert.equal(page.available, true);
  assert.equal(page.entries.length, 30);
  assert.equal(page.nextCursor, entries[29].id);
});
