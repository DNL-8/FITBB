import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, doc, getDoc, getDocs, query, setDoc, updateDoc, where, writeBatch } from 'firebase/firestore';
import { createInitialGameStats, INITIAL_WORKOUTS } from '../src/utils/rpgLogic.ts';

const endpoint = process.env.FIRESTORE_EMULATOR_HOST?.match(/^(localhost|127\.0\.0\.1):(\d+)$/);
if (!endpoint) throw new Error('Execute esta suíte com um emulador local do Firestore.');

const rules = await readFile(new URL('../firestore.rules', import.meta.url), 'utf8');
const uid = 'test-owner';
const time = '2026-01-01T12:00:00.000Z';

test('as regras preservam os fluxos do usuário verificado e isolam contas e registros', async (t) => {
  const env = await initializeTestEnvironment({
    projectId: 'demo-app-fitness',
    firestore: { host: endpoint[1], port: Number(endpoint[2]), rules },
  });
  t.after(async () => {
    await env.clearFirestore();
    await env.cleanup();
  });
  await env.clearFirestore();
  const owner = env.authenticatedContext(uid, { email_verified: true }).firestore();
  const other = env.authenticatedContext('other-user', { email_verified: true }).firestore();
  const unverified = env.authenticatedContext(uid, { email_verified: false }).firestore();
  const guest = env.unauthenticatedContext().firestore();
  const profile = doc(owner, 'users', uid);
  const stats = doc(owner, 'users', uid, 'gameStats', 'main');

  await assertFails(setDoc(stats, createInitialGameStats(uid)));
  await assertSucceeds(setDoc(profile, { userId: uid, displayName: 'Atleta', createdAt: time, lastLoginAt: time }));
  for (const db of [other, unverified, guest]) {
    await assertFails(getDoc(doc(db, 'users', uid)));
    await assertFails(getDocs(query(collection(db, 'users', uid, 'workouts'), where('userId', '==', uid))));
  }
  await assertFails(setDoc(stats, {
    ...createInitialGameStats(uid), equippedGear: { arma: 'arma_espada_invisivel' },
  }));
  await assertSucceeds(setDoc(stats, createInitialGameStats(uid)));

  const workout = { ...INITIAL_WORKOUTS[0], userId: uid };
  const workoutRef = doc(owner, 'users', uid, 'workouts', workout.id);
  await assertFails(setDoc(doc(owner, 'users', uid, 'workouts', 'wrong-id'), workout));
  await assertSucceeds(setDoc(workoutRef, workout));
  const ownedWorkouts = query(collection(owner, 'users', uid, 'workouts'), where('userId', '==', uid));
  assert.equal((await assertSucceeds(getDocs(ownedWorkouts))).size, 1);

  const log = {
    id: 'first-session', userId: uid, workoutId: workout.id, workoutName: workout.name,
    workoutType: workout.type, difficulty: workout.difficulty, completedExercises: 1,
    totalExercises: workout.exercises.length, durationMinutes: 12, xpEarned: 75,
    bonusXpEarned: 5, dateKey: '2026-01-01', completedAt: time,
  };
  const logRef = doc(owner, 'users', uid, 'workoutLogs', log.id);
  await assertFails(setDoc(logRef, { ...log, completedExercises: 30 }));
  const session = writeBatch(owner);
  session.set(logRef, log);
  session.update(stats, { totalXp: 80, totalWorkouts: 1, totalMinutes: 12, updatedAt: time });
  session.set(doc(owner, 'users', uid, 'achievements', 'first_blood'), {
    id: 'first_blood', userId: uid, unlocked: true, unlockedAt: time,
  });
  const ledgerId = '20260101120000000_00000000-0000-0000-0000-000000000000';
  const ledgerRef = doc(owner, 'users', uid, 'progressLedger', ledgerId);
  const movement = {
    id: ledgerId, userId: uid, kind: 'workout', title: workout.name, createdAt: time,
    xpDelta: 80, coinDelta: 0, totalXp: 80, goldCoins: 50,
  };
  await assertFails(setDoc(ledgerRef, movement));
  session.set(ledgerRef, movement);
  await assertSucceeds(session.commit());
  await assertSucceeds(getDocs(query(collection(owner, 'users', uid, 'progressLedger'), where('userId', '==', uid))));
  await assertFails(getDoc(doc(other, 'users', uid, 'progressLedger', ledgerId)));
  await assertFails(updateDoc(ledgerRef, { xpDelta: 900 }));
  await assertFails(updateDoc(logRef, { xpEarned: 5000 }));
  await assertFails(updateDoc(stats, { totalXp: 900000 }));
  await assertFails(updateDoc(stats, { equippedGear: { elmo: 'arma_bastao_treino' } }));
  const equipped = { elmo: 'elmo_couro_novato', armadura: 'armadura_tunica_couro', capa: null, arma: 'arma_bastao_treino' };
  const purchase = writeBatch(owner);
  purchase.update(stats, {
    goldCoins: 25,
    equippedGear: equipped,
    ownedEquipmentIds: ['elmo_couro_novato', 'arma_bastao_treino', 'armadura_tunica_couro'],
    updatedAt: time,
  });
  const purchaseId = '20260101120000000_00000000-0000-0000-0000-000000000001';
  purchase.set(doc(owner, 'users', uid, 'progressLedger', purchaseId), {
    ...movement, id: purchaseId, kind: 'armory_purchase', title: 'Túnica de Couro', xpDelta: 0, coinDelta: -25, goldCoins: 25,
  });
  await assertSucceeds(purchase.commit());
  const presets = Array.from({ length: 4 }, (_, i) => ({ id: `preset-${i}`, name: `Treino ${i}`, gear: equipped }));
  for (let i = 1; i <= presets.length; i++) {
    await assertSucceeds(updateDoc(stats, { gearLoadouts: presets.slice(0, i), updatedAt: time }));
  }

  const sync = {
    recordId: 'hc_daily_2026-01-01_steps', userId: uid, type: 'steps',
    startTime: time, endTime: '2026-01-02T12:00:00.000Z', updatedAt: Date.parse(time),
    values: { count: 3500 },
  };
  const record = doc(owner, 'users', uid, 'healthConnectRecords', sync.recordId);
  await assertSucceeds(setDoc(record, sync));
  await assertSucceeds(setDoc(record, { ...sync, values: { count: 3600 }, updatedAt: sync.updatedAt + 1 }));
  await assertFails(updateDoc(record, { type: 'calories', values: { kilocalories: 250 } }));
  await assertFails(setDoc(doc(other, 'users', uid, 'healthConnectRecords', sync.recordId), sync));
});
