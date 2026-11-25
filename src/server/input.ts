import { z } from 'zod';
import type { Context } from 'hono';
import { ApiHttpError } from './firebaseRest.ts';
import { MAX_AI_CONTEXT_CHARS, readJsonBody, type AppEnv } from './shared.ts';

export const documentId = z.string().trim().regex(/^[A-Za-z0-9_-]{1,128}$/);
const dateKey = z.iso.date();
const optionalDate = z.union([dateKey, z.literal('')]).nullish();
const duration = z.number().positive();
const text = (max: number) => z.string().trim().min(1).max(max);
const count = z.number().int().nonnegative();
const workoutType = z.enum(['cardio', 'forca', 'hiit', 'core', 'mobilidade', 'corpo_inteiro']);
const difficulty = z.enum(['Iniciante', 'Intermediário', 'Avançado']);
const dateBody = z.object({ dateKey: optionalDate });
const slot = z.enum(['elmo', 'armadura', 'capa', 'arma']);
const gearItem = documentId.nullable().optional();
const gear = z.strictObject({
  elmo: gearItem, armadura: gearItem, capa: gearItem, arma: gearItem,
  helm: gearItem, armor: gearItem, cape: gearItem, weapon: gearItem,
});
const actions = z.enum([
  'get_state', 'update_hero', 'grant_stats', 'create_workout', 'update_workout',
  'delete_workout', 'complete_workout', 'purchase_gear', 'equip_gear', 'save_loadout',
  'apply_loadout', 'delete_loadout', 'create_vow', 'complete_vow', 'violate_vow',
  'delete_vow', 'claim_daily_quest', 'log_weight', 'log_health_metric',
  'log_health_activity', 'ask_oracle',
]);

const workout = z.object({
  id: documentId.optional(),
  name: z.string().trim().min(2).max(100),
  description: z.string().trim().max(500).optional(),
  type: workoutType,
  difficulty: difficulty.optional(),
  rank: z.enum(['F', 'E', 'D', 'C', 'B', 'A', 'S']).optional(),
  durationMinutes: duration.min(1).max(300).optional(),
  baseXp: z.number().min(10).max(2000).optional(),
  exercises: z.array(z.object({
    id: documentId.optional(),
    name: text(120),
    prescription: z.string().max(100).optional(),
    restSeconds: count.max(300).optional(),
    muscleGroups: z.array(text(80)).max(8).optional(),
    executionTip: z.string().max(300).optional(),
    equipment: z.string().max(80).optional(),
    loadKg: z.number().min(0).max(400).optional(),
    loadNote: z.string().max(140).optional(),
    unilateral: z.boolean().optional(),
  })).min(1).max(20),
});

const performedSet = z.object({
  setIndex: z.number().int().min(1).max(20),
  weightKg: z.number().min(0).max(500),
  reps: z.number().int().min(0).max(500),
  completed: z.boolean(),
  isPr: z.boolean().optional(),
});

const performedExercise = z.object({
  exerciseId: documentId,
  exerciseName: text(120).optional(),
  sets: z.array(performedSet).max(20),
  volumeKg: z.number().min(0).max(100000).optional(),
  hasPr: z.boolean().optional(),
});

export const input = {
  command: z.object({ action: actions, payload: z.record(z.string(), z.unknown()).optional() }),
  hero: z.object({
    name: z.string().trim().min(2).max(24).optional(),
    avatar: z.string().max(16).optional(),
    heroClass: z.enum(['Guerreiro', 'Arqueiro', 'Mago']).optional(),
    objective: z.enum(['Emagrecer', 'Condicionamento', 'Ambos']).optional(),
    experience: difficulty.optional(),
    heightCm: z.number().min(100).max(250).nullish(),
    weightKg: z.number().min(25).max(350).nullish(),
    restingHrBaseline: z.number().min(30).max(120).optional(),
    maxHrEstimated: z.number().min(120).max(220).optional(),
  }),
  statsGrant: z.object({
    xpDelta: z.number().optional(), coinsDelta: z.number().optional(),
    hpDelta: z.number().optional(), bossesDelta: z.number().optional(),
  }),
  workout,
  workoutPatch: workout.partial().extend({
    exerciseLoadUpdates: z.array(z.object({
      exerciseId: documentId,
      loadKg: z.number().min(0).max(400),
    })).min(1).max(20).optional(),
  }),
  workoutCompletion: dateBody.extend({
    idempotencyKey: documentId.optional(),
    completedExerciseIds: z.array(documentId).max(64).optional(),
    completedExercises: count.max(500).optional(),
    durationMinutes: duration.max(1440).optional(),
    elapsedSeconds: z.number().min(0).max(86400).optional(),
    bossDefeated: z.boolean().optional(),
    performedExercises: z.array(performedExercise).max(30).optional(),
  }),
  purchase: z.object({ itemId: documentId, equip: z.boolean().optional() }),
  equip: z.union([
    z.object({ slot, itemId: documentId.nullable() }),
    z.object({ gear }),
  ]),
  loadout: z.object({ name: z.string().trim().min(2).max(28), gear: gear.optional() }),
  vow: z.object({ title: text(80), xpReward: z.number().optional(), penaltyXp: z.number().optional() }),
  date: dateBody,
  weight: dateBody.extend({ weightKg: z.number().min(25).max(350), note: z.string().max(140).nullish() }),
  metrics: dateBody.extend({
    steps: z.number().min(0).max(200000).optional(),
    activeCalories: z.number().min(0).max(20000).optional(),
    sleepHours: z.number().min(0).max(24).optional(),
    restingHeartRate: z.number().min(30).max(140).nullish(),
    hrvMs: z.number().min(5).max(300).nullish(),
    trainingLoadScore: z.number().min(0).max(2000).optional(),
    recoveryScore: z.number().min(0).max(100).optional(),
    sources: z.array(text(60)).max(10).optional(),
  }),
  activity: dateBody.extend({
    id: documentId.optional(),
    externalId: text(128).optional(),
    title: text(140),
    source: z.enum(['strava', 'apple_health', 'samsung_health', 'gpx', 'csv']).optional(),
    sportType: text(60).optional(),
    startedAt: z.iso.datetime({ offset: true, local: true }).optional(),
    durationMinutes: duration.max(1440).optional(),
    distanceKm: z.number().min(0).max(1000).optional(),
    calories: z.number().min(0).max(20000).optional(),
    elevationGainM: z.number().min(0).max(20000).optional(),
    avgHeartRate: z.number().min(30).max(240).nullish(),
    maxHeartRate: z.number().min(30).max(250).nullish(),
    zoneMinutes: z.array(z.number().min(0).max(1440)).length(5).optional(),
    hrSamplePoints: z.array(z.number().min(30).max(250)).max(120).optional(),
  }),
  oracle: z.object({ question: text(400), persist: z.boolean().optional() }),
  oracleContext: z.object({ question: text(400), contextText: z.string().trim().max(MAX_AI_CONTEXT_CHARS).optional() }),
  insights: z.object({ summary: text(MAX_AI_CONTEXT_CHARS) }),
  loadAdjustments: z.object({
    recentLogs: z.array(z.object({
      dateKey,
      workoutId: documentId,
      workoutName: text(120),
      workoutType,
      completedExercises: count,
      totalExercises: count,
      durationMinutes: z.number().nonnegative(),
      xpEarned: z.number().nonnegative(),
    })).min(1).max(12),
    candidateWorkouts: z.array(z.object({
      workoutId: documentId,
      workoutName: text(120),
      recentCount: count,
      avgCompletionPercent: z.number().min(0).max(100),
      exercises: z.array(z.object({
        exerciseId: documentId,
        name: text(120),
        equipment: z.string().max(80).optional(),
        currentLoadKg: z.number().min(0).max(400),
        prescription: z.string().max(120),
        unilateral: z.boolean().optional(),
        loadNote: z.string().max(140).optional(),
      })).min(1).max(10),
    })).min(1).max(6),
    stagnation: z.object({
      signalKind: z.enum(['none', 'repeated_incomplete', 'frequency_drop', 'stalled_xp']),
      reason: z.string().max(300),
      avgCompletionPercent: z.number().min(0).max(100),
      daysSinceLastSession: count.nullable(),
    }).optional(),
  }),
  stravaSync: z.object({ days: z.number().min(7).max(90).optional(), maxHr: z.number().min(100).max(240).optional() }),
};

export function parseInput<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  const field = result.error.issues[0]?.path.join('.');
  throw new ApiHttpError(400, field ? `Campo "${field}" inválido.` : 'Dados da requisição inválidos.', 'invalid_request_body');
}

export async function readJsonInput<T>(c: Context<AppEnv>, schema: z.ZodType<T>): Promise<T> {
  return parseInput(schema, await readJsonBody(c));
}

export function singleQuery(c: Context<AppEnv>, name: string): string | undefined {
  const values = c.req.queries(name);
  if (values && values.length > 1) {
    throw new ApiHttpError(400, `Informe apenas um valor para "${name}".`, 'duplicate_query_parameter');
  }
  return values?.[0];
}
