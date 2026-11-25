import type { PerformedExerciseRecord } from '../types/fitness';

export interface OfflineQueuedWorkout {
  idempotencyKey: string;
  userId: string;
  workoutId: string;
  completedExercises: number;
  durationMinutes: number;
  performedExercises?: PerformedExerciseRecord[];
  dateKey: string;
  queuedAt: string;
  lastError?: string | null;
}

const STORAGE_KEY_PREFIX = 'hunterfit_offline_workout_queue_v1_';

function getStorageKey(userId: string): string {
  return `${STORAGE_KEY_PREFIX}${userId}`;
}

export function listOfflineWorkouts(userId: string): OfflineQueuedWorkout[] {
  if (typeof window === 'undefined' || !userId) return [];
  try {
    const raw = window.localStorage.getItem(getStorageKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is OfflineQueuedWorkout =>
        Boolean(item) &&
        typeof item.idempotencyKey === 'string' &&
        typeof item.workoutId === 'string' &&
        item.userId === userId
    );
  } catch {
    return [];
  }
}

function saveList(userId: string, items: OfflineQueuedWorkout[]): void {
  if (typeof window === 'undefined' || !userId) return;
  try {
    if (items.length === 0) {
      window.localStorage.removeItem(getStorageKey(userId));
    } else {
      window.localStorage.setItem(getStorageKey(userId), JSON.stringify(items));
    }
  } catch {
    // Ignore storage quota errors
  }
}

export function enqueueOfflineWorkout(item: OfflineQueuedWorkout): OfflineQueuedWorkout[] {
  const existing = listOfflineWorkouts(item.userId);
  const filtered = existing.filter((entry) => entry.idempotencyKey !== item.idempotencyKey);
  const next = [...filtered, item];
  saveList(item.userId, next);
  return next;
}

export function removeOfflineWorkout(userId: string, idempotencyKey: string): OfflineQueuedWorkout[] {
  const existing = listOfflineWorkouts(userId);
  const next = existing.filter((entry) => entry.idempotencyKey !== idempotencyKey);
  saveList(userId, next);
  return next;
}

export function updateOfflineWorkoutError(
  userId: string,
  idempotencyKey: string,
  lastError: string
): OfflineQueuedWorkout[] {
  const existing = listOfflineWorkouts(userId);
  const next = existing.map((entry) =>
    entry.idempotencyKey === idempotencyKey ? { ...entry, lastError } : entry
  );
  saveList(userId, next);
  return next;
}

export function clearOfflineWorkoutsForUser(userId: string): void {
  if (typeof window === 'undefined' || !userId) return;
  try {
    window.localStorage.removeItem(getStorageKey(userId));
  } catch {
    // Ignore storage failures
  }
}
