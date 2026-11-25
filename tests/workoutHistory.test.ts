import assert from 'node:assert/strict';
import test from 'node:test';
import type { WorkoutLog } from '../src/types/fitness.ts';
import { readRecentWorkoutLogs } from '../src/utils/workoutHistory.ts';

function workoutLog(id: string, completedAt: string): WorkoutLog {
  return {
    id,
    completedAt,
    userId: 'fixture',
    workoutId: 'workout',
    workoutName: 'Corrida',
    workoutType: 'cardio',
    difficulty: 'Iniciante',
    completedExercises: 1,
    totalExercises: 1,
    durationMinutes: 30,
    xpEarned: 10,
    bonusXpEarned: 0,
    dateKey: completedAt.slice(0, 10),
  };
}

test('histórico mantém a sessão mais recente quando o índice de data está indisponível', async () => {
  const old = Array.from({ length: 400 }, (_, index) =>
    workoutLog(`log-${index}`, '2026-01-01T00:00:00.000Z')
  );
  const latest = workoutLog('log_v2_recent', '2026-11-21T12:00:00.000Z');
  const cursors: Array<string | undefined> = [];

  const logs = await readRecentWorkoutLogs(async (limit, cursor) => {
    cursors.push(cursor);
    const start = cursor ? Number(cursor) : 0;
    const records = [...old, latest];
    return {
      logs: records.slice(start, start + limit),
      nextCursor: start + limit < records.length ? String(start + limit) : null,
      order: 'documentId',
    };
  });

  assert.deepEqual(cursors, [undefined, '200', '400']);
  assert.equal(logs.length, 300);
  assert.equal(logs[0].id, latest.id);
});

test('histórico cronológico encerra a leitura depois de encontrar os 300 mais recentes', async () => {
  let pages = 0;
  const logs = await readRecentWorkoutLogs(async (limit) => {
    pages += 1;
    assert.ok(pages <= 2);
    return {
      logs: Array.from({ length: limit }, (_, index) =>
        workoutLog(`log-${pages}-${index}`, `2026-11-2${3 - pages}T12:00:00.000Z`)),
      nextCursor: String(pages),
      order: 'completedAt',
    };
  });

  assert.equal(pages, 2);
  assert.equal(logs.length, 300);
});
