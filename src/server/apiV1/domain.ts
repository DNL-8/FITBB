import crypto from 'node:crypto';
import type { GoogleGenAI } from '@google/genai';
import {
  ApiHttpError,
  type FirestorePrecondition,
  type VerifiedFirebaseUser,
  firestoreRest,
} from '../firebaseRest.ts';
import { logServerEvent } from '../shared.ts';
import { generateGeminiText } from '../gemini.ts';
import { commitProgressChange } from './progressLedger.ts';
import { projectHealthConnect, type HealthConnectRecord } from '../../utils/healthConnect.ts';
import {
  ARSENAL_CONFIG,
  BASE_HUNTER_RANK,
  EQUIPMENT_CATALOG,
  EXAMPLE_LOADOUT_PRESETS,
  INITIAL_WORKOUTS,
  mergeWithInitialWorkouts,
  MAX_BOSSES_DEFEATED,
  MAX_CLAIMED_AUTO_QUEST_KEYS,
  MAX_GOLD_COINS,
  MAX_HR_SAMPLE_POINTS,
  MAX_HUNTER_HP,
  MAX_OWNED_EQUIPMENT_IDS,
  MAX_TOTAL_COINS_EARNED,
  MAX_TOTAL_XP,
  VALID_WORKOUT_RANKS,
  applyHabitPenalty,
  applyVowCompletion,
  buildZoneTotals,
  calculateActivityXp,
  calculateCoinsForWorkout,
  calculateDerivedAttributes,
  calculateGearBonusSummary,
  calculateLevel,
  calculateNextStreak,
  calculateProportionalXp,
  calculateSessionPrBonus,
  computeBmiSummary,
  computeRecoveryAssessment,
  createInitialGameStats,
  evaluateAchievements,
  evaluateDailyAutoQuests,
  evaluateExercisePrUpdate,
  evaluateWeeklyAutoQuests,
  getBossForWorkout,
  getDualProgressionStatus,
  getEffectiveCurrentStreak,
  getLevelProgress,
  getWeeklyRaidBossState,
  isEquipmentMilestoneUnlocked,
  isValidHunterRank,
  isVowResolvedToday,
  isWeeklyAutoQuestId,
  mapSportToWorkoutType,
  migrateEquippedGear,
  migrateEquipmentId,
  normalizeGameStats,
} from '../../utils/rpgLogic.ts';
import type {
  AchievementId,
  AnyAutoQuestId,
  AutoQuestId,
  ChatMessage,
  DailyHealthMetric,
  DailyVow,
  EquipmentSlot,
  EquippedGear,
  ExerciseItem,
  ExercisePrRecord,
  GameStats,
  GearLoadoutPreset,
  HealthActivity,
  HealthSource,
  HeroClass,
  HeroExperience,
  HeroObjective,
  HeroProfile,
  PerformedExerciseRecord,
  PerformedSetEntry,
  UserAchievement,
  UserRecord,
  WeightLog,
  WorkoutLog,
  WorkoutTemplate,
  WorkoutType,
} from '../../types/fitness.ts';

export interface ApiV1DomainDeps {
  getGeminiClient: () => GoogleGenAI | null;
}

const VALID_ID_REGEX = /^[a-zA-Z0-9_-]{1,128}$/;
const VALID_DATE_KEY_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const APP_TIME_ZONE = process.env.APP_TIME_ZONE?.trim() || 'America/Sao_Paulo';
const dateFormatter = new Intl.DateTimeFormat('sv-SE', { timeZone: APP_TIME_ZONE });

export function getServerDateKey(): string {
  return dateFormatter.format(new Date());
}
const VALID_WORKOUT_TYPES: ReadonlyArray<WorkoutType> = [
  'cardio',
  'forca',
  'hiit',
  'core',
  'mobilidade',
  'corpo_inteiro',
];
const VALID_DIFFICULTIES: ReadonlyArray<HeroExperience> = [
  'Iniciante',
  'Intermediário',
  'Avançado',
];
const VALID_HERO_CLASSES: ReadonlyArray<HeroClass> = ['Guerreiro', 'Arqueiro', 'Mago'];
const VALID_HERO_OBJECTIVES: ReadonlyArray<HeroObjective> = [
  'Emagrecer',
  'Condicionamento',
  'Ambos',
];
const VALID_HEALTH_SOURCES: ReadonlyArray<HealthSource> = [
  'strava',
  'apple_health',
  'samsung_health',
  'gpx',
  'csv',
];

export function assertValidId(value: unknown, fieldName: string = 'id'): string {
  if (typeof value !== 'string' || !VALID_ID_REGEX.test(value.trim())) {
    throw new ApiHttpError(
      400,
      `Campo "${fieldName}" inválido. Use apenas letras, números, "_" ou "-" (1 a 128 caracteres).`,
      'invalid_id'
    );
  }
  return value.trim();
}

export function assertValidDateKey(value: unknown, fallbackToday: boolean = true): string {
  if ((value === undefined || value === null || value === '') && fallbackToday) {
    return getServerDateKey();
  }
  const dateKey = typeof value === 'string' ? value.trim() : '';
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  if (!VALID_DATE_KEY_REGEX.test(dateKey) || !Number.isFinite(date.getTime()) ||
      date.toISOString().slice(0, 10) !== dateKey) {
    throw new ApiHttpError(
      400,
      'Formato de data inválido. Utilize YYYY-MM-DD (ex: 2026-11-18).',
      'invalid_date_key'
    );
  }
  return dateKey;
}

function sanitizeGameStatsForWrite(stats: GameStats, uid: string): GameStats {
  const normalized = normalizeGameStats({ ...stats, userId: uid });
  const cleanEquipped: EquippedGear = {
    elmo: normalized.equippedGear.elmo ?? null,
    armadura: normalized.equippedGear.armadura ?? null,
    capa: normalized.equippedGear.capa ?? null,
    arma: normalized.equippedGear.arma ?? null,
  };
  const cleanLoadouts: GearLoadoutPreset[] = normalized.gearLoadouts
    .slice(0, ARSENAL_CONFIG.maxPresets)
    .map((p, idx) => ({
      id: VALID_ID_REGEX.test(p.id) ? p.id : `preset_${idx + 1}`,
      name: String(p.name || `Loadout ${idx + 1}`).trim().slice(0, 28) || `Loadout ${idx + 1}`,
      gear: {
        elmo: p.gear.elmo ?? null,
        armadura: p.gear.armadura ?? null,
        capa: p.gear.capa ?? null,
        arma: p.gear.arma ?? null,
      },
    }));

  return {
    userId: uid,
    totalXp: Math.min(MAX_TOTAL_XP, Math.max(0, Math.round(normalized.totalXp))),
    level: Math.min(50, Math.max(1, calculateLevel(normalized.totalXp))),
    hunterHp: Math.min(MAX_HUNTER_HP, Math.max(0, Math.round(normalized.hunterHp ?? MAX_HUNTER_HP))),
    goldCoins: Math.min(MAX_GOLD_COINS, Math.max(0, Math.round(normalized.goldCoins))),
    totalCoinsEarned: Math.min(MAX_TOTAL_COINS_EARNED, Math.max(0, Math.round(normalized.totalCoinsEarned))),
    bossesDefeated: Math.min(MAX_BOSSES_DEFEATED, Math.max(0, Math.round(normalized.bossesDefeated))),
    ownedEquipmentIds: normalized.ownedEquipmentIds.slice(0, MAX_OWNED_EQUIPMENT_IDS),
    equippedGear: cleanEquipped,
    gearLoadouts: cleanLoadouts,
    claimedAutoQuestKeys: normalized.claimedAutoQuestKeys.slice(-MAX_CLAIMED_AUTO_QUEST_KEYS),
    currentStreak: Math.min(5000, Math.max(0, Math.round(normalized.currentStreak))),
    longestStreak: Math.min(5000, Math.max(0, Math.round(normalized.longestStreak))),
    lastWorkoutDate: normalized.lastWorkoutDate ?? null,
    totalWorkouts: Math.max(0, Math.round(normalized.totalWorkouts)),
    totalMinutes: Math.max(0, Math.round(normalized.totalMinutes)),
    cardioWorkouts: Math.max(0, Math.round(normalized.cardioWorkouts)),
    forcaWorkouts: Math.max(0, Math.round(normalized.forcaWorkouts)),
    hiitWorkouts: Math.max(0, Math.round(normalized.hiitWorkouts)),
    coreWorkouts: Math.max(0, Math.round(normalized.coreWorkouts)),
    mobilidadeWorkouts: Math.max(0, Math.round(normalized.mobilidadeWorkouts)),
    corpoInteiroWorkouts: Math.max(0, Math.round(normalized.corpoInteiroWorkouts)),
    updatedAt: (normalized.updatedAt || new Date().toISOString()).slice(0, 40),
  };
}

function sanitizeHeroProfileForWrite(hero: HeroProfile, uid: string): HeroProfile {
  const out: HeroProfile = {
    userId: uid,
    name: hero.name.trim().slice(0, 24),
    avatar: (hero.avatar || '⚔️').trim().slice(0, 16),
    heroClass: hero.heroClass,
    objective: hero.objective,
    experience: hero.experience,
    createdAt: hero.createdAt.slice(0, 40),
    updatedAt: hero.updatedAt.slice(0, 40),
  };
  if (hero.heightCm !== undefined) out.heightCm = hero.heightCm;
  if (hero.weightKg !== undefined) out.weightKg = hero.weightKg;
  if (hero.restingHrBaseline !== undefined) out.restingHrBaseline = hero.restingHrBaseline;
  if (hero.maxHrEstimated !== undefined) out.maxHrEstimated = hero.maxHrEstimated;
  return out;
}

function sanitizeWorkoutTemplateForWrite(
  raw: Record<string, unknown>,
  uid: string,
  forcedId?: string
): WorkoutTemplate {
  const id = forcedId
    ? assertValidId(forcedId, 'id')
    : typeof raw.id === 'string' && raw.id.trim()
      ? assertValidId(raw.id, 'id')
      : `w-custom-${crypto.randomUUID()}`;

  const name = typeof raw.name === 'string' ? raw.name.trim().slice(0, 100) : '';
  if (name.length < 2) {
    throw new ApiHttpError(400, 'O nome do treino precisa ter pelo menos 2 caracteres.', 'invalid_name');
  }

  const description =
    typeof raw.description === 'string'
      ? raw.description.trim().slice(0, 500)
      : 'Treino personalizado criado via API.';

  const type = raw.type as WorkoutType;
  if (!VALID_WORKOUT_TYPES.includes(type)) {
    throw new ApiHttpError(
      400,
      `Tipo de treino inválido. Use um de: ${VALID_WORKOUT_TYPES.join(', ')}.`,
      'invalid_workout_type'
    );
  }

  const difficulty = (raw.difficulty ?? 'Intermediário') as HeroExperience;
  if (!VALID_DIFFICULTIES.includes(difficulty)) {
    throw new ApiHttpError(
      400,
      `Dificuldade inválida. Use uma de: ${VALID_DIFFICULTIES.join(', ')}.`,
      'invalid_difficulty'
    );
  }

  const rawRank = raw.rank ?? BASE_HUNTER_RANK;
  if (!isValidHunterRank(rawRank)) {
    throw new ApiHttpError(
      400,
      `Rank inválido. Use um de: ${VALID_WORKOUT_RANKS.join(', ')}.`,
      'invalid_rank'
    );
  }
  const rank = rawRank;

  const durationMinutes = Number(raw.durationMinutes ?? 30);
  if (!Number.isFinite(durationMinutes) || durationMinutes < 1 || durationMinutes > 300) {
    throw new ApiHttpError(400, 'durationMinutes deve estar entre 1 e 300.', 'invalid_duration');
  }

  const baseXp = Number(raw.baseXp ?? 150);
  if (!Number.isFinite(baseXp) || baseXp < 10 || baseXp > 2000) {
    throw new ApiHttpError(400, 'baseXp deve estar entre 10 e 2000.', 'invalid_base_xp');
  }

  if (!Array.isArray(raw.exercises) || raw.exercises.length < 1 || raw.exercises.length > 20) {
    throw new ApiHttpError(
      400,
      'O treino precisa conter entre 1 e 20 exercícios.',
      'invalid_exercises'
    );
  }

  const exercises: ExerciseItem[] = raw.exercises.map((item, idx) => {
    if (!item || typeof item !== 'object') {
      throw new ApiHttpError(400, `Exercício ${idx + 1} inválido.`, 'invalid_exercise_item');
    }
    const ex = item as Record<string, unknown>;
    const exId =
      typeof ex.id === 'string' && ex.id.trim()
        ? ex.id.trim().slice(0, 64)
        : `ex-${crypto.randomUUID().slice(0, 12)}-${idx + 1}`;
    const exName = typeof ex.name === 'string' ? ex.name.trim().slice(0, 120) : '';
    if (!exName) {
      throw new ApiHttpError(400, `Nome do exercício ${idx + 1} é obrigatório.`, 'invalid_exercise_name');
    }
    const prescription =
      typeof ex.prescription === 'string' && ex.prescription.trim()
        ? ex.prescription.trim().slice(0, 100)
        : '3 séries x 12 repetições';
    const restSeconds = Number.isFinite(Number(ex.restSeconds))
      ? Math.min(300, Math.max(10, Math.round(Number(ex.restSeconds))))
      : 45;
    const muscleGroups = Array.isArray(ex.muscleGroups)
      ? ex.muscleGroups
          .map((m) => String(m || '').trim())
          .filter(Boolean)
          .slice(0, 8)
      : ['Corpo Inteiro'];
    const executionTip =
      typeof ex.executionTip === 'string' && ex.executionTip.trim()
        ? ex.executionTip.trim().slice(0, 300)
        : 'Execute com controle técnico e respiração constante.';

    const cleanEx: ExerciseItem = {
      id: exId,
      name: exName,
      prescription,
      restSeconds,
      muscleGroups: muscleGroups.length > 0 ? muscleGroups : ['Corpo Inteiro'],
      executionTip,
    };
    if (typeof ex.equipment === 'string' && ex.equipment.trim()) {
      cleanEx.equipment = ex.equipment.trim().slice(0, 80);
    }
    if (typeof ex.loadKg === 'number' && Number.isFinite(ex.loadKg)) {
      cleanEx.loadKg = Math.min(400, Math.max(0, Math.round(ex.loadKg * 2) / 2));
    }
    if (typeof ex.loadNote === 'string' && ex.loadNote.trim()) {
      cleanEx.loadNote = ex.loadNote.trim().slice(0, 140);
    }
    if (typeof ex.unilateral === 'boolean') {
      cleanEx.unilateral = ex.unilateral;
    }
    return cleanEx;
  });

  return {
    id,
    userId: uid,
    name,
    description,
    type,
    difficulty,
    durationMinutes: Math.round(durationMinutes),
    baseXp: Math.round(baseXp),
    rank,
    exercises,
  };
}

async function ensureUserParentExists(user: VerifiedFirebaseUser): Promise<void> {
  const existing = await firestoreRest.getDoc<UserRecord>(user.token, `users/${user.uid}`);
  if (existing) return;
  const nowIso = new Date().toISOString();
  try {
    await firestoreRest.setDoc<UserRecord & Record<string, unknown>>(
      user.token,
      `users/${user.uid}`,
      {
        userId: user.uid,
        email: user.email,
        displayName: (user.email?.split('@')[0] || 'Caçador').slice(0, 80),
        createdAt: nowIso,
        lastLoginAt: nowIso,
      },
      { exists: false }
    );
  } catch (err) {
    if (err instanceof ApiHttpError && err.statusCode === 409) {
      return;
    }
    throw err;
  }
}

export async function loadGameStatsOrInit(user: VerifiedFirebaseUser): Promise<GameStats> {
  const raw = await firestoreRest.getDoc<GameStats>(user.token, `users/${user.uid}/gameStats/main`);
  return sanitizeGameStatsForWrite(raw ?? createInitialGameStats(user.uid), user.uid);
}

/**
 * Garante que users/{uid}/gameStats/main exista no Firestore (cumprindo
 * isInitialZeroedGameStats() das regras de segurança) e retorna { stats, updateTime }
 * para permitir controle otimista de concorrência em mutações subsequentes.
 */
async function ensureGameStatsWithMeta(
  user: VerifiedFirebaseUser
): Promise<{ stats: GameStats; updateTime: string; storedOwnedIds: readonly string[] }> {
  const path = `users/${user.uid}/gameStats/main`;
  const existing = await firestoreRest.getDocWithMeta<GameStats>(user.token, path);
  if (existing) {
    return {
      stats: sanitizeGameStatsForWrite(existing.data, user.uid),
      updateTime: existing.updateTime,
      storedOwnedIds: existing.data.ownedEquipmentIds ?? [],
    };
  }

  const initialStats = sanitizeGameStatsForWrite(createInitialGameStats(user.uid), user.uid);
  try {
    await firestoreRest.setDoc(
      user.token,
      path,
      initialStats as unknown as Record<string, unknown>,
      { exists: false }
    );
  } catch (err) {
    if (!(err instanceof ApiHttpError && err.statusCode === 409)) {
      throw err;
    }
  }

  const created = await firestoreRest.getDocWithMeta<GameStats>(user.token, path);
  if (created) {
    return {
      stats: sanitizeGameStatsForWrite(created.data, user.uid),
      updateTime: created.updateTime,
      storedOwnedIds: created.data.ownedEquipmentIds ?? [],
    };
  }
  throw new ApiHttpError(409, 'Não foi possível confirmar a versão do progresso.', 'concurrency_conflict');
}

export async function requireHeroProfile(user: VerifiedFirebaseUser): Promise<HeroProfile> {
  const hero = await firestoreRest.getDoc<HeroProfile>(
    user.token,
    `users/${user.uid}/heroProfiles/main`
  );
  if (!hero) {
    throw new ApiHttpError(
      404,
      'Perfil de herói ainda não encontrado. Conclua o onboarding no app primeiro.',
      'hero_not_found'
    );
  }
  return hero;
}

// ============================================================================
// HANDLERS DE DOMÍNIO COMPARTILHADOS (REST + POST /api/v1/command)
// ============================================================================

async function queryHealthConnect(user: VerifiedFirebaseUser) {
  const groups = await Promise.all([
    firestoreRest.queryByUser<HealthConnectRecord>(user.token, user.uid, 'healthConnectRecords', 90,
      { documentPrefix: 'hc_daily_' }),
    firestoreRest.queryByUser<HealthConnectRecord>(user.token, user.uid, 'healthConnectRecords', 120,
      { recordType: 'exercise' }),
    firestoreRest.queryByUser<HealthConnectRecord>(user.token, user.uid, 'healthConnectRecords', 150,
      { recordType: 'heart_rate' }),
  ].map((query) => query.catch((error: unknown) => {
    if (!(error instanceof ApiHttpError) || error.statusCode !== 403) throw error;
    return null;
  })));
  const readable = groups.filter((group) => group !== null);
  const status = readable.length === groups.length
    ? 'available'
    : readable.length === 0 ? 'unavailable' : 'partial';
  if (status !== 'available') {
    logServerEvent('warn', 'health_connect_rules_unavailable', { status });
  }
  return { records: readable.flat(), status };
}

export async function handleGetFullState(user: VerifiedFirebaseUser) {
  const [hero, rawStats, workouts, workoutLogs, dailyVows, weightLogs, storedMetrics, storedActivities, achievements, exercisePrs, healthConnect] =
    await Promise.all([
      firestoreRest.getDoc<HeroProfile>(user.token, `users/${user.uid}/heroProfiles/main`),
      loadGameStatsOrInit(user),
      firestoreRest.queryByUser<WorkoutTemplate>(user.token, user.uid, 'workouts'),
      firestoreRest.queryByUser<WorkoutLog>(user.token, user.uid, 'workoutLogs'),
      firestoreRest.queryByUser<DailyVow>(user.token, user.uid, 'dailyVows'),
      firestoreRest.queryByUser<WeightLog>(user.token, user.uid, 'weightLogs'),
      firestoreRest.queryByUser<DailyHealthMetric>(user.token, user.uid, 'dailyHealthMetrics'),
      firestoreRest.queryByUser<HealthActivity>(user.token, user.uid, 'healthActivities'),
      firestoreRest.queryByUser<UserAchievement>(user.token, user.uid, 'achievements'),
      firestoreRest.queryByUser<ExercisePrRecord>(user.token, user.uid, 'exercisePrs').catch(() => [] as ExercisePrRecord[]),
      queryHealthConnect(user),
    ]);
  const { metrics: dailyMetrics, activities: healthActivities } =
    projectHealthConnect(healthConnect.records, storedActivities, storedMetrics, user.uid, APP_TIME_ZONE);

  const todayKey = getServerDateKey();
  const normalizedStats = normalizeGameStats(rawStats);
  const gearBonuses = calculateGearBonusSummary(normalizedStats.equippedGear);
  const levelProgress = getLevelProgress(normalizedStats.totalXp);
  const todayMetric = dailyMetrics.find((m) => m.dateKey === todayKey) ?? null;
  const autoQuests = evaluateDailyAutoQuests(
    todayKey,
    todayMetric,
    workoutLogs,
    healthActivities,
    weightLogs,
    normalizedStats.claimedAutoQuestKeys
  );
  const weeklyAutoQuests = evaluateWeeklyAutoQuests(
    todayKey,
    workoutLogs,
    healthActivities,
    normalizedStats.claimedAutoQuestKeys
  );
  const weeklyRaidBoss = getWeeklyRaidBossState(
    todayKey,
    workoutLogs,
    healthActivities
  );
  const derivedAttributes = hero
    ? calculateDerivedAttributes(normalizedStats, hero.heroClass)
    : null;
  const recovery = computeRecoveryAssessment(
    workoutLogs,
    healthActivities,
    dailyMetrics,
    normalizedStats,
    hero?.restingHrBaseline ?? 60,
    getServerDateKey()
  );

  const mergedWorkouts = mergeWithInitialWorkouts(workouts, user.uid);
  dailyVows.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  weightLogs.sort((a, b) => a.dateKey.localeCompare(b.dateKey));
  workoutLogs.sort((a, b) => b.completedAt.localeCompare(a.completedAt));

  const dualProgression = getDualProgressionStatus(normalizedStats, todayKey);

  return {
    uid: user.uid,
    todayKey,
    hero,
    stats: normalizedStats,
    levelProgress,
    dualProgression,
    gearBonuses,
    derivedAttributes,
    recovery,
    autoQuests,
    weeklyAutoQuests,
    weeklyRaidBoss,
    workoutsCount: mergedWorkouts.length,
    workouts: mergedWorkouts,
    workoutLogs,
    exercisePrs,
    dailyVows,
    weightLogs,
    dailyMetrics,
    healthActivities,
    achievements,
    healthConnectStatus: healthConnect.status,
  };
}

export async function handlePatchHero(user: VerifiedFirebaseUser, body: Record<string, unknown>) {
  await ensureUserParentExists(user);
  const path = `users/${user.uid}/heroProfiles/main`;
  const existingMeta = await firestoreRest.getDocWithMeta<HeroProfile>(user.token, path);
  if (!existingMeta) {
    throw new ApiHttpError(404, 'Perfil de herói ainda não encontrado. Conclua o onboarding no app primeiro.', 'hero_not_found');
  }
  const existing = existingMeta.data;
  const nowIso = new Date().toISOString();

  const nextName =
    typeof body.name === 'string' ? body.name.trim() : existing.name;
  if (nextName.length < 2 || nextName.length > 24) {
    throw new ApiHttpError(400, 'O nome do herói deve ter entre 2 e 24 caracteres.', 'invalid_hero_name');
  }

  const nextAvatar =
    typeof body.avatar === 'string' && body.avatar.trim()
      ? body.avatar.trim().slice(0, 16)
      : existing.avatar;

  const nextClass = (body.heroClass ?? existing.heroClass) as HeroClass;
  if (!VALID_HERO_CLASSES.includes(nextClass)) {
    throw new ApiHttpError(
      400,
      `Classe inválida. Escolha entre: ${VALID_HERO_CLASSES.join(', ')}.`,
      'invalid_hero_class'
    );
  }

  const nextObjective = (body.objective ?? existing.objective) as HeroObjective;
  if (!VALID_HERO_OBJECTIVES.includes(nextObjective)) {
    throw new ApiHttpError(
      400,
      `Objetivo inválido. Escolha entre: ${VALID_HERO_OBJECTIVES.join(', ')}.`,
      'invalid_hero_objective'
    );
  }

  const nextExperience = (body.experience ?? existing.experience) as HeroExperience;
  if (!VALID_DIFFICULTIES.includes(nextExperience)) {
    throw new ApiHttpError(
      400,
      `Experiência inválida. Escolha entre: ${VALID_DIFFICULTIES.join(', ')}.`,
      'invalid_hero_experience'
    );
  }

  let nextHeight = existing.heightCm;
  if (body.heightCm !== undefined) {
    if (body.heightCm === null) {
      nextHeight = null;
    } else {
      const h = Number(body.heightCm);
      if (!Number.isFinite(h) || h < 100 || h > 250) {
        throw new ApiHttpError(400, 'heightCm deve estar entre 100 e 250 cm.', 'invalid_height');
      }
      nextHeight = Math.round(h);
    }
  }

  let nextWeight = existing.weightKg;
  if (body.weightKg !== undefined) {
    if (body.weightKg === null) {
      nextWeight = null;
    } else {
      const w = Number(body.weightKg);
      if (!Number.isFinite(w) || w < 25 || w > 350) {
        throw new ApiHttpError(400, 'weightKg deve estar entre 25 e 350 kg.', 'invalid_weight');
      }
      nextWeight = Math.round(w * 10) / 10;
    }
  }

  let nextRestingHr = existing.restingHrBaseline;
  if (body.restingHrBaseline !== undefined) {
    const r = Number(body.restingHrBaseline);
    if (!Number.isFinite(r) || r < 30 || r > 120) {
      throw new ApiHttpError(400, 'restingHrBaseline deve estar entre 30 e 120 bpm.', 'invalid_rhr');
    }
    nextRestingHr = Math.round(r);
  }

  let nextMaxHr = existing.maxHrEstimated;
  if (body.maxHrEstimated !== undefined) {
    const m = Number(body.maxHrEstimated);
    if (!Number.isFinite(m) || m < 120 || m > 220) {
      throw new ApiHttpError(400, 'maxHrEstimated deve estar entre 120 e 220 bpm.', 'invalid_max_hr');
    }
    nextMaxHr = Math.round(m);
  }

  const updatedHero = sanitizeHeroProfileForWrite(
    {
      ...existing,
      name: nextName,
      avatar: nextAvatar,
      heroClass: nextClass,
      objective: nextObjective,
      experience: nextExperience,
      heightCm: nextHeight,
      weightKg: nextWeight,
      restingHrBaseline: nextRestingHr,
      maxHrEstimated: nextMaxHr,
      createdAt: existing.createdAt,
      updatedAt: nowIso,
    },
    user.uid
  );

  await firestoreRest.setDoc(
    user.token,
    path,
    updatedHero as unknown as Record<string, unknown>,
    { updateTime: existingMeta.updateTime }
  );

  return {
    hero: updatedHero,
    bmi: computeBmiSummary(updatedHero.heightCm, updatedHero.weightKg),
  };
}

export async function handleGrantStats(user: VerifiedFirebaseUser, body: Record<string, unknown>) {
  const debugGrantEnabled = process.env.ENABLE_DEBUG_GRANT === 'true';
  if (!debugGrantEnabled && !user.isAdmin) {
    throw new ApiHttpError(
      403,
      'Ajuste manual de atributos desabilitado. Requer permissão de administrador ou ENABLE_DEBUG_GRANT=true.',
      'forbidden_stats_grant'
    );
  }

  await ensureUserParentExists(user);
  const { stats: current, updateTime } = await ensureGameStatsWithMeta(user);

  const xpDelta = Number(body.xpDelta ?? 0);
  const coinsDelta = Number(body.coinsDelta ?? 0);
  const hpDelta = Number(body.hpDelta ?? 0);
  const bossesDelta = Number(body.bossesDelta ?? 0);

  if (![xpDelta, coinsDelta, hpDelta, bossesDelta].every((n) => Number.isFinite(n))) {
    throw new ApiHttpError(
      400,
      'xpDelta, coinsDelta, hpDelta e bossesDelta devem ser números válidos.',
      'invalid_stats_delta'
    );
  }
  if (xpDelta === 0 && coinsDelta === 0 && hpDelta === 0 && bossesDelta === 0) {
    throw new ApiHttpError(
      400,
      'Informe ao menos um ajuste (xpDelta, coinsDelta, hpDelta ou bossesDelta).',
      'empty_stats_delta'
    );
  }

  const previousLevel = current.level;
  const nextXp = Math.min(MAX_TOTAL_XP, Math.max(0, Math.round(current.totalXp + xpDelta)));
  const nextCoins = Math.min(
    MAX_GOLD_COINS,
    Math.max(0, Math.round((current.goldCoins ?? 0) + coinsDelta))
  );
  const nextTotalCoinsEarned =
    coinsDelta > 0
      ? Math.min(MAX_TOTAL_COINS_EARNED, (current.totalCoinsEarned ?? 0) + Math.round(coinsDelta))
      : current.totalCoinsEarned ?? 0;
  const nextHp = Math.min(
    MAX_HUNTER_HP,
    Math.max(0, Math.round((current.hunterHp ?? MAX_HUNTER_HP) + hpDelta))
  );
  const nextBosses = Math.min(
    MAX_BOSSES_DEFEATED,
    Math.max(0, Math.round((current.bossesDefeated ?? 0) + bossesDelta))
  );

  const updated = sanitizeGameStatsForWrite(
    {
      ...current,
      totalXp: nextXp,
      level: calculateLevel(nextXp),
      goldCoins: nextCoins,
      totalCoinsEarned: nextTotalCoinsEarned,
      hunterHp: nextHp,
      bossesDefeated: nextBosses,
      updatedAt: new Date().toISOString(),
    },
    user.uid
  );

  await commitProgressChange(user, current, updated, { kind: 'adjustment', title: 'Ajuste de XP e moedas' }, [{
    type: 'set',
    path: `users/${user.uid}/gameStats/main`,
    data: updated as unknown as Record<string, unknown>,
    precondition: { updateTime },
  }]);

  return {
    previousLevel,
    newLevel: updated.level,
    leveledUp: updated.level > previousLevel,
    stats: updated,
    levelProgress: getLevelProgress(updated.totalXp),
    dualProgression: getDualProgressionStatus(updated, getServerDateKey()),
  };
}

export async function handleCreateWorkout(user: VerifiedFirebaseUser, body: Record<string, unknown>) {
  await ensureUserParentExists(user);
  const workout = sanitizeWorkoutTemplateForWrite(body, user.uid);
  await firestoreRest.commitWrites(user.token, [
    {
      type: 'set',
      path: `users/${user.uid}/workouts/${workout.id}`,
      data: workout as unknown as Record<string, unknown>,
      precondition: { exists: false },
    },
  ]);
  return { workout };
}

export async function handleUpdateWorkout(
  user: VerifiedFirebaseUser,
  workoutId: string,
  body: Record<string, unknown>
) {
  await ensureUserParentExists(user);
  const cleanId = assertValidId(workoutId, 'workoutId');
  const path = `users/${user.uid}/workouts/${cleanId}`;
  const existingMeta = await firestoreRest.getDocWithMeta<WorkoutTemplate>(user.token, path);
  const existing = existingMeta?.data ?? INITIAL_WORKOUTS.find((workout) => workout.id === cleanId);

  if (!existing) {
    throw new ApiHttpError(404, `Treino "${cleanId}" não encontrado.`, 'workout_not_found');
  }

  let nextExercises = existing.exercises;
  if (body.exercises !== undefined) {
    nextExercises = body.exercises as ExerciseItem[];
  } else if (body.exerciseLoadUpdates && Array.isArray(body.exerciseLoadUpdates)) {
    const loadMap = new Map<string, number>();
    const exerciseIds = new Set(existing.exercises.map((exercise) => exercise.id));
    for (const upd of body.exerciseLoadUpdates as Array<{ exerciseId?: unknown; loadKg?: unknown }>) {
      if (typeof upd?.exerciseId === 'string' && Number.isFinite(Number(upd.loadKg))) {
        if (!exerciseIds.has(upd.exerciseId)) {
          throw new ApiHttpError(400, 'O ajuste referencia um exercício que não faz parte do treino.', 'exercise_not_in_workout');
        }
        loadMap.set(
          upd.exerciseId,
          Math.min(400, Math.max(0, Math.round(Number(upd.loadKg) * 2) / 2))
        );
      }
    }
    nextExercises = existing.exercises.map((ex) =>
      loadMap.has(ex.id) ? { ...ex, loadKg: loadMap.get(ex.id) } : ex
    );
  }

  const merged = sanitizeWorkoutTemplateForWrite(
    {
      ...existing,
      ...body,
      id: cleanId,
      exercises: nextExercises,
    },
    user.uid,
    cleanId
  );

  await firestoreRest.setDoc(
    user.token,
    path,
    merged as unknown as Record<string, unknown>,
    existingMeta ? { updateTime: existingMeta.updateTime } : { exists: false }
  );
  return { workout: merged };
}

export async function handleDeleteWorkout(user: VerifiedFirebaseUser, workoutId: string) {
  const cleanId = assertValidId(workoutId, 'workoutId');
  await firestoreRest.deleteDoc(user.token, `users/${user.uid}/workouts/${cleanId}`);
  return { deleted: true, workoutId: cleanId };
}

function shortHash(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex').slice(0, 32);
}

function optionalWorkoutNumber(value: unknown, field: string): number | undefined {
  if (value === undefined) return undefined;
  const number = typeof value === 'string' && value.trim() ? Number(value) : value;
  if (typeof number !== 'number' || !Number.isFinite(number)) {
    throw new ApiHttpError(400, `O campo "${field}" deve ser um número finito.`, 'invalid_workout_completion');
  }
  return number;
}

function normalizePerformedExerciseInputs(
  raw: unknown
): Array<{ exerciseId: string; exerciseName?: string; sets: PerformedSetEntry[] }> | undefined {
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw)) {
    throw new ApiHttpError(400, 'performedExercises deve ser uma lista.', 'invalid_workout_completion');
  }
  return raw
    .slice(0, 30)
    .map((item) => {
      if (!item || typeof item !== 'object') {
        throw new ApiHttpError(400, 'Item inválido em performedExercises.', 'invalid_workout_completion');
      }
      const entry = item as Record<string, unknown>;
      const exerciseId = assertValidId(entry.exerciseId, 'performedExercises.exerciseId');
      const rawSets = Array.isArray(entry.sets) ? entry.sets : [];
      const sets: PerformedSetEntry[] = rawSets.slice(0, 20).map((s, idx) => {
        const setObj = (s && typeof s === 'object' ? s : {}) as Record<string, unknown>;
        const weightKg = Number(setObj.weightKg ?? 0);
        const reps = Number(setObj.reps ?? 0);
        return {
          setIndex: Number.isFinite(Number(setObj.setIndex))
            ? Math.min(20, Math.max(1, Math.round(Number(setObj.setIndex))))
            : idx + 1,
          weightKg: Number.isFinite(weightKg) ? Number(Math.min(500, Math.max(0, weightKg)).toFixed(1)) : 0,
          reps: Number.isFinite(reps) ? Math.min(500, Math.max(0, Math.round(reps))) : 0,
          completed: Boolean(setObj.completed),
        };
      });
      return {
        exerciseId,
        exerciseName:
          typeof entry.exerciseName === 'string' && entry.exerciseName.trim()
            ? entry.exerciseName.trim().slice(0, 120)
            : undefined,
        sets,
      };
    })
    .sort((a, b) => a.exerciseId.localeCompare(b.exerciseId));
}

function workoutCompletionReplay(log: WorkoutLog, stats: GameStats) {
  return {
    log,
    stats,
    duplicate: true,
    rewardSummary: {
      workoutName: log.workoutName,
      xpFromWorkout: log.xpEarned,
      baseXpFromWorkout: log.xpEarned,
      gearXpBonus: 0,
      gearBonusPercentXp: 0,
      bonusXp: log.bonusXpEarned,
      totalXpGained: log.xpEarned + log.bonusXpEarned,
      coinsEarned: 0,
      baseCoinsEarned: 0,
      gearCoinsBonus: 0,
      gearBonusPercentCoins: 0,
      bossName: '',
      bossDefeated: false,
      totalVolumeKg: log.totalVolumeKg ?? 0,
      prCount: log.prCount ?? 0,
      prXpBonus: 0,
      prCoinsBonus: 0,
      prExerciseNames: [],
      previousLevel: stats.level,
      newLevel: stats.level,
      leveledUp: false,
      isNowMaster: stats.level >= 5,
      unlockedAchievements: [],
      completedExercises: log.completedExercises,
      totalExercises: log.totalExercises,
      durationMinutes: log.durationMinutes,
    },
  };
}

export async function handleCompleteWorkout(
  user: VerifiedFirebaseUser,
  workoutId: string,
  body: Record<string, unknown>,
  headerKey?: string
) {
  const cleanId = assertValidId(workoutId, 'workoutId');
  const bodyKey = body.idempotencyKey === undefined
    ? undefined
    : assertValidId(body.idempotencyKey, 'idempotencyKey');
  const key = headerKey === undefined ? bodyKey : assertValidId(headerKey, 'Idempotency-Key');
  if (!key) {
    throw new ApiHttpError(400, 'Informe Idempotency-Key ou idempotencyKey.', 'missing_idempotency_key');
  }
  if (bodyKey !== undefined && bodyKey !== key) {
    throw new ApiHttpError(400, 'As duas chaves de idempotência devem ser iguais.', 'mismatched_idempotency_key');
  }

  const exerciseIds = body.completedExerciseIds;
  if (exerciseIds !== undefined &&
      (!Array.isArray(exerciseIds) || !exerciseIds.every((id) => typeof id === 'string'))) {
    throw new ApiHttpError(400, 'Informe uma lista de IDs de exercícios.', 'invalid_workout_completion');
  }
  const requestedIds = exerciseIds === undefined ? undefined : [...new Set<string>(exerciseIds)].sort();
  const requestedCount = requestedIds === undefined
    ? optionalWorkoutNumber(body.completedExercises, 'completedExercises')
    : undefined;
  const explicitMinutes = optionalWorkoutNumber(body.durationMinutes, 'durationMinutes');
  const seconds = explicitMinutes === undefined
    ? optionalWorkoutNumber(body.elapsedSeconds, 'elapsedSeconds')
    : undefined;
  const minutes = explicitMinutes ?? (seconds === undefined ? undefined : seconds / 60);
  const requestedDuration = minutes === undefined ? undefined : Math.min(600, Math.max(1, Math.round(minutes)));
  if (body.bossDefeated !== undefined && typeof body.bossDefeated !== 'boolean') {
    throw new ApiHttpError(400, 'O campo "bossDefeated" deve ser booleano.', 'invalid_workout_completion');
  }
  const requestedBoss = body.bossDefeated;
  const requestedDate = body.dateKey === undefined || body.dateKey === null || body.dateKey === ''
    ? undefined
    : assertValidDateKey(body.dateKey, false);
  const normalizedPerformedInputs = normalizePerformedExerciseInputs(body.performedExercises);

  const fingerprint = shortHash(JSON.stringify([
    cleanId,
    requestedIds,
    requestedCount,
    requestedDuration,
    requestedBoss,
    requestedDate,
    normalizedPerformedInputs,
  ]));
  const prefix = `log_v2_${shortHash(key)}_`;
  const logId = `${prefix}${fingerprint}`;
  const legacyId = `log-${key.length <= 120 ? key : shortHash(key)}`;

  async function findReplay() {
    const [logs, legacyLog] = await Promise.all([
      firestoreRest.queryByUser<WorkoutLog>(user.token, user.uid, 'workoutLogs', 1, { documentPrefix: prefix }),
      firestoreRest.getDoc<WorkoutLog>(user.token, `users/${user.uid}/workoutLogs/${legacyId}`),
    ]);
    const existing = logs[0] ?? legacyLog;
    if (!existing) return null;
    const matches = existing.workoutId === cleanId && (
      logs.length > 0
        ? existing.id === logId
        : (requestedDate === undefined || existing.dateKey === requestedDate) &&
          (requestedDuration === undefined || existing.durationMinutes === requestedDuration) &&
          (requestedCount === undefined || existing.completedExercises ===
            Math.min(existing.totalExercises, Math.max(1, Math.round(requestedCount))))
    );
    if (!matches) {
      throw new ApiHttpError(409, 'Chave de idempotência já usada para outra conclusão de treino.', 'idempotency_conflict');
    }
    return existing;
  }

  await ensureUserParentExists(user);
  // Read the stats version before checking the key so a concurrent write invalidates this commit.
  const statsMeta = await ensureGameStatsWithMeta(user);
  const previousLog = await findReplay();
  if (previousLog) return workoutCompletionReplay(previousLog, await loadGameStatsOrInit(user));
  if (!statsMeta.updateTime) {
    throw new ApiHttpError(409, 'As estatísticas foram atualizadas. Repita a conclusão com a mesma chave.', 'concurrency_conflict');
  }

  const [workoutDoc, existingAchs, existingPrs, existingLogs, existingActivities] = await Promise.all([
    firestoreRest.getDoc<WorkoutTemplate>(user.token, `users/${user.uid}/workouts/${cleanId}`),
    firestoreRest.queryByUser<UserAchievement>(user.token, user.uid, 'achievements'),
    firestoreRest.queryByUser<ExercisePrRecord>(user.token, user.uid, 'exercisePrs').catch(() => [] as ExercisePrRecord[]),
    firestoreRest.queryByUser<WorkoutLog>(user.token, user.uid, 'workoutLogs').catch(() => [] as WorkoutLog[]),
    firestoreRest.queryByUser<HealthActivity>(user.token, user.uid, 'healthActivities').catch(() => [] as HealthActivity[]),
  ]);

  const currentStats = statsMeta.stats;
  const workout = workoutDoc ?? INITIAL_WORKOUTS.find((w) => w.id === cleanId) ?? null;
  if (!workout) {
    throw new ApiHttpError(404, `Treino "${cleanId}" não encontrado.`, 'workout_not_found');
  }

  const totalExercises = Math.max(1, workout.exercises.length);
  let completedCount = totalExercises;

  if (requestedIds) {
    const validIds = new Set(workout.exercises.map((e) => e.id));
    const matched = requestedIds.filter((id) => validIds.has(id));
    completedCount = matched.length > 0 ? matched.length : requestedIds.length;
  } else if (requestedCount !== undefined) {
    completedCount = Math.round(requestedCount);
  }

  if (completedCount < 1) {
    throw new ApiHttpError(
      400,
      'É necessário concluir pelo menos 1 exercício para registrar o treino.',
      'invalid_completed_count'
    );
  }
  completedCount = Math.min(totalExercises, completedCount);

  const durationMinutes = requestedDuration ?? workout.durationMinutes;
  const bossDefeated = requestedBoss ?? (completedCount >= totalExercises);
  const nowIso = new Date().toISOString();
  const todayKey = requestedDate ?? getServerDateKey();

  // Avalia séries executadas, volume total e novos Recordes Pessoais (PRs)
  const existingPrMap = new Map<string, ExercisePrRecord>();
  for (const pr of existingPrs) {
    existingPrMap.set(pr.exerciseId, pr);
  }

  const workoutExerciseById = new Map<string, ExerciseItem>();
  for (const ex of workout.exercises) {
    workoutExerciseById.set(ex.id, ex);
  }

  const performedRecords: PerformedExerciseRecord[] = [];
  const prUpsertCandidates: ExercisePrRecord[] = [];
  let totalVolumeKg = 0;
  let prCount = 0;
  const prExerciseNames: string[] = [];

  if (normalizedPerformedInputs && normalizedPerformedInputs.length > 0) {
    for (const item of normalizedPerformedInputs) {
      const exTemplate = workoutExerciseById.get(item.exerciseId);
      const exName = (item.exerciseName ?? exTemplate?.name ?? item.exerciseId).slice(0, 120);
      const prevPr = existingPrMap.get(item.exerciseId) ?? null;
      const evaluation = evaluateExercisePrUpdate(item.sets, prevPr);

      performedRecords.push({
        exerciseId: item.exerciseId,
        exerciseName: exName,
        sets: evaluation.annotatedSets,
        volumeKg: evaluation.volumeKg,
        hasPr: evaluation.hasPr,
        bestWeightKg: evaluation.bestWeightKg,
        bestSetVolumeKg: evaluation.bestSetVolumeKg,
        bestEstimated1RmKg: evaluation.bestEstimated1RmKg,
      });

      totalVolumeKg += evaluation.volumeKg;

      if (evaluation.hasPr && evaluation.bestReps >= 1) {
        prCount += 1;
        prExerciseNames.push(exName);
        const nextPrRecord: ExercisePrRecord = {
          id: item.exerciseId,
          userId: user.uid,
          exerciseId: item.exerciseId,
          exerciseName: exName,
          bestWeightKg: evaluation.nextBestWeightKg,
          bestReps: Math.max(1, evaluation.nextBestReps),
          bestVolumeKg: evaluation.nextBestVolumeKg,
          estimated1RmKg: evaluation.nextEstimated1RmKg,
          updatedAt: nowIso,
          workoutLogId: logId,
          dateKey: todayKey,
        };
        prUpsertCandidates.push(nextPrRecord);
        existingPrMap.set(item.exerciseId, nextPrRecord);
      }
    }
  }
  totalVolumeKg = Number(totalVolumeKg.toFixed(1));
  const { prXpBonus, prCoinsBonus } = calculateSessionPrBonus(prCount);

  const gearBonusSummary = calculateGearBonusSummary(currentStats.equippedGear);
  const baseXpFromWorkout = calculateProportionalXp(
    workout.baseXp,
    completedCount,
    totalExercises,
    0
  );
  const xpFromWorkout = calculateProportionalXp(
    workout.baseXp,
    completedCount,
    totalExercises,
    gearBonusSummary.xpBonusPercent
  );
  const gearXpBonus = Math.max(0, xpFromWorkout - baseXpFromWorkout);

  const baseCoinsEarned = calculateCoinsForWorkout(
    workout.baseXp,
    completedCount,
    totalExercises,
    bossDefeated,
    0
  );
  const workoutCoinsEarned = calculateCoinsForWorkout(
    workout.baseXp,
    completedCount,
    totalExercises,
    bossDefeated,
    gearBonusSummary.coinBonusPercent
  );
  const gearCoinsBonus = Math.max(0, workoutCoinsEarned - baseCoinsEarned);
  const coinsEarned = workoutCoinsEarned + prCoinsBonus;

  const boss = getBossForWorkout(workout);
  const nextStreakInfo = calculateNextStreak(
    currentStats.currentStreak,
    currentStats.longestStreak,
    currentStats.lastWorkoutDate,
    todayKey
  );

  const newLog: WorkoutLog = {
    id: logId,
    userId: user.uid,
    workoutId: workout.id,
    workoutName: workout.name.slice(0, 120),
    workoutType: workout.type,
    difficulty: workout.difficulty,
    completedExercises: completedCount,
    totalExercises,
    durationMinutes,
    xpEarned: xpFromWorkout,
    bonusXpEarned: prXpBonus,
    ...(performedRecords.length > 0 ? { performedExercises: performedRecords } : {}),
    totalVolumeKg,
    prCount,
    dateKey: todayKey,
    completedAt: nowIso,
  };

  const weeklyRaidAfterWorkout = getWeeklyRaidBossState(
    todayKey,
    [...existingLogs, newLog],
    existingActivities
  );

  const previousLevel = currentStats.level;
  const xpAfterWorkoutAndPr = currentStats.totalXp + xpFromWorkout + prXpBonus;

  const provisionalStats: GameStats = sanitizeGameStatsForWrite(
    {
      ...currentStats,
      totalXp: xpAfterWorkoutAndPr,
      level: calculateLevel(xpAfterWorkoutAndPr),
      goldCoins: (currentStats.goldCoins ?? 0) + coinsEarned,
      totalCoinsEarned: (currentStats.totalCoinsEarned ?? 0) + coinsEarned,
      bossesDefeated: (currentStats.bossesDefeated ?? 0) + (bossDefeated ? 1 : 0),
      currentStreak: nextStreakInfo.currentStreak,
      longestStreak: nextStreakInfo.longestStreak,
      lastWorkoutDate: todayKey,
      totalWorkouts: currentStats.totalWorkouts + 1,
      totalMinutes: currentStats.totalMinutes + durationMinutes,
      cardioWorkouts: currentStats.cardioWorkouts + (workout.type === 'cardio' ? 1 : 0),
      forcaWorkouts: currentStats.forcaWorkouts + (workout.type === 'forca' ? 1 : 0),
      hiitWorkouts: currentStats.hiitWorkouts + (workout.type === 'hiit' ? 1 : 0),
      coreWorkouts: currentStats.coreWorkouts + (workout.type === 'core' ? 1 : 0),
      mobilidadeWorkouts:
        currentStats.mobilidadeWorkouts + (workout.type === 'mobilidade' ? 1 : 0),
      corpoInteiroWorkouts:
        currentStats.corpoInteiroWorkouts + (workout.type === 'corpo_inteiro' ? 1 : 0),
      updatedAt: nowIso,
    },
    user.uid
  );

  const existingAchMap: Partial<Record<AchievementId, UserAchievement>> = {};
  for (const a of existingAchs) existingAchMap[a.id] = a;

  const achContext = {
    prCountTotal: existingPrMap.size,
    weeklyRaidDefeated: weeklyRaidAfterWorkout.isDefeated,
  };

  const firstAchPass = evaluateAchievements(provisionalStats, existingAchMap, nowIso, achContext);
  const statsAfterFirst = sanitizeGameStatsForWrite(
    {
      ...provisionalStats,
      totalXp: xpAfterWorkoutAndPr + firstAchPass.bonusXpTotal,
      level: calculateLevel(xpAfterWorkoutAndPr + firstAchPass.bonusXpTotal),
    },
    user.uid
  );
  const achMapAfterFirst: Partial<Record<AchievementId, UserAchievement>> = {};
  for (const ach of firstAchPass.updatedAchievements) achMapAfterFirst[ach.id] = ach;

  const finalAchPass = evaluateAchievements(statsAfterFirst, achMapAfterFirst, nowIso, achContext);
  const achBonusXp = firstAchPass.bonusXpTotal + finalAchPass.bonusXpTotal;
  const totalBonusXp = prXpBonus + achBonusXp;
  newLog.bonusXpEarned = totalBonusXp;

  const finalStats = sanitizeGameStatsForWrite(
    {
      ...statsAfterFirst,
      totalXp: xpAfterWorkoutAndPr + achBonusXp,
      level: calculateLevel(xpAfterWorkoutAndPr + achBonusXp),
      hunterHp: Math.min(100, (currentStats.hunterHp ?? 100) + 10),
    },
    user.uid
  );

  const unlockedChanges = finalAchPass.updatedAchievements.filter((achievement) => {
    const previous = existingAchMap[achievement.id];
    return achievement.unlocked && (!previous?.unlocked || previous.unlockedAt !== achievement.unlockedAt);
  });

  const prMetas = await Promise.all(
    prUpsertCandidates.map((pr) =>
      firestoreRest.getDocWithMeta<ExercisePrRecord>(user.token, `users/${user.uid}/exercisePrs/${pr.exerciseId}`)
    )
  );

  const writes: Array<{
    type: 'set';
    path: string;
    data: Record<string, unknown>;
    precondition?: FirestorePrecondition;
  }> = [
    {
      type: 'set',
      path: `users/${user.uid}/gameStats/main`,
      data: finalStats as unknown as Record<string, unknown>,
      precondition: { updateTime: statsMeta.updateTime },
    },
    {
      type: 'set',
      path: `users/${user.uid}/workoutLogs/${logId}`,
      data: newLog as unknown as Record<string, unknown>,
      precondition: { exists: false },
    },
    ...unlockedChanges.map((ach) => ({
      type: 'set' as const,
      path: `users/${user.uid}/achievements/${ach.id}`,
      data: ach as unknown as Record<string, unknown>,
    })),
    ...prUpsertCandidates.map((pr, idx) => ({
      type: 'set' as const,
      path: `users/${user.uid}/exercisePrs/${pr.exerciseId}`,
      data: pr as unknown as Record<string, unknown>,
      precondition: prMetas[idx]?.updateTime
        ? ({ updateTime: prMetas[idx]!.updateTime } satisfies FirestorePrecondition)
        : ({ exists: false } satisfies FirestorePrecondition),
    })),
  ];

  try {
    await commitProgressChange(user, currentStats, finalStats, { kind: 'workout', title: workout.name }, writes);
  } catch (err) {
    // Rules for an immutable log can reject a racing write before its precondition runs.
    if (err instanceof ApiHttpError && (err.statusCode === 409 || err.statusCode === 403)) {
      const racedLog = await findReplay();
      if (racedLog) return workoutCompletionReplay(racedLog, await loadGameStatsOrInit(user));
    }
    throw err;
  }

  return {
    log: newLog,
    stats: finalStats,
    duplicate: false,
    updatedExercisePrs: prUpsertCandidates,
    rewardSummary: {
      workoutName: workout.name,
      xpFromWorkout,
      baseXpFromWorkout,
      gearXpBonus,
      gearBonusPercentXp: gearBonusSummary.xpBonusPercent,
      bonusXp: totalBonusXp,
      totalXpGained: xpFromWorkout + totalBonusXp,
      coinsEarned,
      baseCoinsEarned,
      gearCoinsBonus,
      gearBonusPercentCoins: gearBonusSummary.coinBonusPercent,
      bossName: boss.name,
      bossDefeated,
      totalVolumeKg,
      prCount,
      prXpBonus,
      prCoinsBonus,
      prExerciseNames,
      previousLevel,
      newLevel: finalStats.level,
      leveledUp: finalStats.level > previousLevel,
      isNowMaster: finalStats.level >= 5,
      unlockedAchievements: [
        ...firstAchPass.newlyUnlocked,
        ...finalAchPass.newlyUnlocked,
      ],
      completedExercises: completedCount,
      totalExercises,
      durationMinutes,
    },
  };
}

export async function handleGetArmoryState(user: VerifiedFirebaseUser) {
  const stats = await loadGameStatsOrInit(user);
  const normalized = normalizeGameStats(stats);
  const gearBonuses = calculateGearBonusSummary(normalized.equippedGear);
  return {
    goldCoins: normalized.goldCoins,
    totalCoinsEarned: normalized.totalCoinsEarned,
    ownedEquipmentIds: normalized.ownedEquipmentIds,
    equippedGear: normalized.equippedGear,
    gearLoadouts: normalized.gearLoadouts,
    exampleLoadouts: EXAMPLE_LOADOUT_PRESETS,
    gearBonuses,
  };
}

export async function handlePurchaseGear(user: VerifiedFirebaseUser, body: Record<string, unknown>) {
  await ensureUserParentExists(user);
  const itemId = typeof body.itemId === 'string' ? body.itemId.trim() : '';
  const item = EQUIPMENT_CATALOG.find((e) => e.id === itemId);
  if (!item) {
    throw new ApiHttpError(404, `Equipamento "${itemId}" não existe no catálogo.`, 'equipment_not_found');
  }

  const equipAfterPurchase = body.equip !== false;
  for (let attempt = 0; ; attempt++) {
    const { stats: storedStats, updateTime, storedOwnedIds } = await ensureGameStatsWithMeta(user);
    const stats = normalizeGameStats(storedStats);
    if (!updateTime) {
      throw new ApiHttpError(409, 'Não foi possível confirmar o saldo. Tente novamente.', 'concurrency_conflict');
    }

    if (!isEquipmentMilestoneUnlocked(item, stats)) {
      throw new ApiHttpError(
        400,
        `Requisito pendente para "${item.name}": ${item.unlockRequirementLabel}.`,
        'milestone_locked'
      );
    }

    const alreadyOwned = stats.ownedEquipmentIds.includes(item.id);
    if (!alreadyOwned && stats.goldCoins < item.priceCoins) {
      throw new ApiHttpError(
        400,
        `Moedas insuficientes (${stats.goldCoins}/${item.priceCoins}).`,
        'insufficient_coins'
      );
    }
    if (!alreadyOwned && stats.ownedEquipmentIds.length >= MAX_OWNED_EQUIPMENT_IDS) {
      throw new ApiHttpError(409, 'O Arsenal atingiu o limite de itens.', 'inventory_full');
    }

    const goldCoins = alreadyOwned ? stats.goldCoins : stats.goldCoins - item.priceCoins;
    const equippedGear = equipAfterPurchase
      ? { ...stats.equippedGear, [item.slot]: item.id }
      : stats.equippedGear;
    const ownedEquipmentIds = alreadyOwned ? stats.ownedEquipmentIds : [...stats.ownedEquipmentIds, item.id];
    const updatedAt = new Date().toISOString();
    const changes: Record<string, unknown> = { updatedAt };

    if (!alreadyOwned) {
      // Equipamentos iniciais implícitos continuam disponíveis em contas antigas.
      const storedCatalogIds = new Set((Array.isArray(storedOwnedIds) ? storedOwnedIds : []).map(migrateEquipmentId));
      changes.ownedEquipmentIds = ownedEquipmentIds.filter((id) => storedCatalogIds.has(id) || id === item.id);
      changes.goldCoins = goldCoins;
    }
    if (equipAfterPurchase) changes.equippedGear = equippedGear;

    try {
      await commitProgressChange(user, stats, { ...stats, goldCoins, updatedAt }, { kind: 'armory_purchase', title: item.name }, [{
        type: 'patch',
        path: `users/${user.uid}/gameStats/main`,
        data: changes,
        precondition: { updateTime },
      }]);
    } catch (err) {
      if (err instanceof ApiHttpError && err.code === 'concurrency_conflict' && attempt < 2) continue;
      throw err;
    }

    return {
      purchasedItem: item,
      equipped: equipAfterPurchase,
      goldCoins,
      ownedEquipmentIds,
      equippedGear,
      updatedAt,
      gearBonuses: calculateGearBonusSummary(equippedGear),
    };
  }
}

const EQUIPMENT_SLOTS_WITH_ALIASES = [
  ['elmo', 'helm'], ['armadura', 'armor'], ['capa', 'cape'], ['arma', 'weapon'],
] as const;

function validateRequestedGear(value: object): EquippedGear {
  const raw = value as Record<string, unknown>;
  const gear = migrateEquippedGear(raw);
  for (const [slot, alias] of EQUIPMENT_SLOTS_WITH_ALIASES) {
    if ((raw[slot] ?? raw[alias]) != null && !gear[slot]) {
      throw new ApiHttpError(400, `O item informado não pertence ao slot "${slot}".`, 'slot_mismatch');
    }
  }
  return gear;
}

export async function handleEquipGear(user: VerifiedFirebaseUser, body: Record<string, unknown>) {
  await ensureUserParentExists(user);
  const { stats: currentStats, updateTime } = await ensureGameStatsWithMeta(user);
  const normalized = normalizeGameStats(currentStats);
  const ownedSet = new Set(normalized.ownedEquipmentIds);

  let nextGear: EquippedGear = { ...normalized.equippedGear };

  if (body.slot !== undefined) {
    const slot = body.slot as EquipmentSlot;
    if (!['elmo', 'armadura', 'capa', 'arma'].includes(slot)) {
      throw new ApiHttpError(400, 'Slot inválido. Use: elmo, armadura, capa ou arma.', 'invalid_slot');
    }
    const itemId = body.itemId === null ? null : String(body.itemId || '').trim();
    if (itemId) {
      const item = EQUIPMENT_CATALOG.find((e) => e.id === itemId);
      if (!item || item.slot !== slot) {
        throw new ApiHttpError(400, `Item "${itemId}" não pertence ao slot "${slot}".`, 'slot_mismatch');
      }
      if (!ownedSet.has(itemId)) {
        throw new ApiHttpError(403, `Você ainda não possui "${item.name}".`, 'item_not_owned');
      }
    }
    nextGear = { ...nextGear, [slot]: itemId || null };
  } else if (body.gear && typeof body.gear === 'object') {
    const candidate = validateRequestedGear(body.gear);
    for (const slot of ['elmo', 'armadura', 'capa', 'arma'] as EquipmentSlot[]) {
      const id = candidate[slot];
      if (id && !ownedSet.has(id)) {
        throw new ApiHttpError(403, `Você ainda não desbloqueou o item "${id}".`, 'item_not_owned');
      }
    }
    nextGear = candidate;
  } else {
    throw new ApiHttpError(
      400,
      'Envie { slot, itemId } ou { gear: { elmo, armadura, capa, arma } }.',
      'invalid_equip_payload'
    );
  }

  const updatedAt = new Date().toISOString();
  await firestoreRest.commitWrites(user.token, [{
    type: 'patch',
    path: `users/${user.uid}/gameStats/main`,
    data: { equippedGear: nextGear, updatedAt },
    precondition: { updateTime },
  }]);

  return {
    equippedGear: nextGear,
    updatedAt,
    gearBonuses: calculateGearBonusSummary(nextGear),
  };
}

export async function handleSaveLoadout(user: VerifiedFirebaseUser, body: Record<string, unknown>) {
  await ensureUserParentExists(user);
  const name = typeof body.name === 'string' ? body.name.trim().slice(0, 28) : '';
  if (name.length < 2) {
    throw new ApiHttpError(400, 'Nome do loadout deve ter entre 2 e 28 caracteres.', 'invalid_loadout_name');
  }

  const { stats: currentStats, updateTime } = await ensureGameStatsWithMeta(user);
  const normalized = normalizeGameStats(currentStats);
  if (normalized.gearLoadouts.length >= ARSENAL_CONFIG.maxPresets) {
    throw new ApiHttpError(
      400,
      `Limite máximo de ${ARSENAL_CONFIG.maxPresets} loadouts salvos atingido.`,
      'max_loadouts_reached'
    );
  }

  const gear = body.gear && typeof body.gear === 'object' ? validateRequestedGear(body.gear) : normalized.equippedGear;
  const preset: GearLoadoutPreset = {
    id: `preset-${crypto.randomUUID().slice(0, 16)}`,
    name,
    gear,
  };

  const updated = sanitizeGameStatsForWrite(
    {
      ...normalized,
      gearLoadouts: [...normalized.gearLoadouts, preset],
      updatedAt: new Date().toISOString(),
    },
    user.uid
  );

  await firestoreRest.setDoc(
    user.token,
    `users/${user.uid}/gameStats/main`,
    updated as unknown as Record<string, unknown>,
    { updateTime }
  );

  return { preset, gearLoadouts: updated.gearLoadouts };
}

export async function handleApplyLoadout(user: VerifiedFirebaseUser, loadoutId: string) {
  await ensureUserParentExists(user);
  const cleanId = assertValidId(loadoutId, 'loadoutId');
  const { stats: currentStats, updateTime } = await ensureGameStatsWithMeta(user);
  const normalized = normalizeGameStats(currentStats);

  const target =
    normalized.gearLoadouts.find((p) => p.id === cleanId) ??
    EXAMPLE_LOADOUT_PRESETS.find((p) => p.id === cleanId);

  if (!target) {
    throw new ApiHttpError(404, `Loadout "${cleanId}" não encontrado.`, 'loadout_not_found');
  }

  const owned = new Set(normalized.ownedEquipmentIds);
  const sanitizedGear: EquippedGear = {
    elmo: target.gear.elmo && owned.has(target.gear.elmo) ? target.gear.elmo : null,
    armadura:
      target.gear.armadura && owned.has(target.gear.armadura) ? target.gear.armadura : null,
    capa: target.gear.capa && owned.has(target.gear.capa) ? target.gear.capa : null,
    arma: target.gear.arma && owned.has(target.gear.arma) ? target.gear.arma : null,
  };

  const updated = sanitizeGameStatsForWrite(
    {
      ...normalized,
      equippedGear: sanitizedGear,
      updatedAt: new Date().toISOString(),
    },
    user.uid
  );

  await firestoreRest.setDoc(
    user.token,
    `users/${user.uid}/gameStats/main`,
    updated as unknown as Record<string, unknown>,
    { updateTime }
  );

  return {
    appliedLoadout: target.name,
    equippedGear: updated.equippedGear,
    gearBonuses: calculateGearBonusSummary(updated.equippedGear),
  };
}

export async function handleDeleteLoadout(user: VerifiedFirebaseUser, loadoutId: string) {
  await ensureUserParentExists(user);
  const cleanId = assertValidId(loadoutId, 'loadoutId');
  const { stats: currentStats, updateTime } = await ensureGameStatsWithMeta(user);
  const normalized = normalizeGameStats(currentStats);

  const updated = sanitizeGameStatsForWrite(
    {
      ...normalized,
      gearLoadouts: normalized.gearLoadouts.filter((p) => p.id !== cleanId),
      updatedAt: new Date().toISOString(),
    },
    user.uid
  );

  await firestoreRest.setDoc(
    user.token,
    `users/${user.uid}/gameStats/main`,
    updated as unknown as Record<string, unknown>,
    { updateTime }
  );

  return { deleted: true, loadoutId: cleanId, gearLoadouts: updated.gearLoadouts };
}

export async function handleCreateVow(user: VerifiedFirebaseUser, body: Record<string, unknown>) {
  await ensureUserParentExists(user);
  const title = typeof body.title === 'string' ? body.title.trim().slice(0, 80) : '';
  if (title.length < 3) {
    throw new ApiHttpError(400, 'O título do voto deve ter entre 3 e 80 caracteres.', 'invalid_vow_title');
  }
  const xpReward = body.xpReward !== undefined ? Math.min(500, Math.max(1, Math.round(Number(body.xpReward)))) : 15;
  const penaltyXp =
    body.penaltyXp !== undefined ? Math.min(500, Math.max(1, Math.round(Number(body.penaltyXp)))) : 15;

  const now = new Date();
  const vowId = `vow-${crypto.randomUUID()}`;
  const vow: DailyVow = {
    id: vowId,
    userId: user.uid,
    title,
    xpReward,
    penaltyXp,
    completedDateKey: null,
    violatedDateKey: null,
    createdAt: now.toISOString(),
  };

  await firestoreRest.commitWrites(user.token, [
    {
      type: 'set',
      path: `users/${user.uid}/dailyVows/${vowId}`,
      data: vow as unknown as Record<string, unknown>,
      precondition: { exists: false },
    },
  ]);
  return { vow };
}

export async function handleResolveVow(
  user: VerifiedFirebaseUser,
  vowId: string,
  mode: 'complete' | 'violate',
  dateKeyRaw?: unknown
) {
  await ensureUserParentExists(user);
  const cleanId = assertValidId(vowId, 'vowId');
  const todayKey = assertValidDateKey(dateKeyRaw, true);

  const [vowMeta, statsMeta] = await Promise.all([
    firestoreRest.getDocWithMeta<DailyVow>(user.token, `users/${user.uid}/dailyVows/${cleanId}`),
    ensureGameStatsWithMeta(user),
  ]);

  if (!vowMeta) {
    throw new ApiHttpError(404, `Voto "${cleanId}" não encontrado.`, 'vow_not_found');
  }
  const vow = vowMeta.data;
  const currentStats = statsMeta.stats;

  if (isVowResolvedToday(vow, todayKey)) {
    throw new ApiHttpError(409, 'Este voto diário já foi resolvido hoje.', 'vow_already_resolved');
  }

  const nowIso = new Date().toISOString();
  let updatedVow: DailyVow;
  let updatedStats: GameStats;

  if (mode === 'complete') {
    const res = applyVowCompletion(
      currentStats.totalXp,
      currentStats.hunterHp ?? 100,
      vow.xpReward,
      5
    );
    updatedVow = { ...vow, completedDateKey: todayKey, violatedDateKey: null };
    updatedStats = sanitizeGameStatsForWrite(
      {
        ...currentStats,
        totalXp: res.newXp,
        level: res.newLevel,
        hunterHp: res.newHp,
        goldCoins: (currentStats.goldCoins ?? 0) + 10,
        totalCoinsEarned: (currentStats.totalCoinsEarned ?? 0) + 10,
        updatedAt: nowIso,
      },
      user.uid
    );
  } else {
    const res = applyHabitPenalty(
      currentStats.totalXp,
      currentStats.hunterHp ?? 100,
      vow.penaltyXp,
      15
    );
    updatedVow = { ...vow, violatedDateKey: todayKey, completedDateKey: null };
    updatedStats = sanitizeGameStatsForWrite(
      {
        ...currentStats,
        totalXp: res.newXp,
        level: res.newLevel,
        hunterHp: res.newHp,
        updatedAt: nowIso,
      },
      user.uid
    );
  }

  await commitProgressChange(user, currentStats, updatedStats, {
    kind: mode === 'complete' ? 'vow_completed' : 'vow_broken',
    title: vow.title,
  }, [
    {
      type: 'set',
      path: `users/${user.uid}/dailyVows/${cleanId}`,
      data: updatedVow as unknown as Record<string, unknown>,
      precondition: { updateTime: vowMeta.updateTime },
    },
    {
      type: 'set',
      path: `users/${user.uid}/gameStats/main`,
      data: updatedStats as unknown as Record<string, unknown>,
      precondition: { updateTime: statsMeta.updateTime },
    },
  ]);

  return { vow: updatedVow, stats: updatedStats };
}

export async function handleDeleteVow(user: VerifiedFirebaseUser, vowId: string) {
  const cleanId = assertValidId(vowId, 'vowId');
  await firestoreRest.deleteDoc(user.token, `users/${user.uid}/dailyVows/${cleanId}`);
  return { deleted: true, vowId: cleanId };
}

export async function handleGetDailyQuests(user: VerifiedFirebaseUser, dateKeyRaw?: unknown) {
  const todayKey = assertValidDateKey(dateKeyRaw, true);
  const [stats, metrics, logs, activities, weightLogs] = await Promise.all([
    loadGameStatsOrInit(user),
    firestoreRest.queryByUser<DailyHealthMetric>(user.token, user.uid, 'dailyHealthMetrics'),
    firestoreRest.queryByUser<WorkoutLog>(user.token, user.uid, 'workoutLogs'),
    firestoreRest.queryByUser<HealthActivity>(user.token, user.uid, 'healthActivities'),
    firestoreRest.queryByUser<WeightLog>(user.token, user.uid, 'weightLogs'),
  ]);

  const normalizedStats = normalizeGameStats(stats);
  const todayMetric = metrics.find((m) => m.dateKey === todayKey) ?? null;
  const quests = evaluateDailyAutoQuests(
    todayKey,
    todayMetric,
    logs,
    activities,
    weightLogs,
    normalizedStats.claimedAutoQuestKeys
  );
  const weeklyQuests = evaluateWeeklyAutoQuests(
    todayKey,
    logs,
    activities,
    normalizedStats.claimedAutoQuestKeys
  );
  const weeklyRaidBoss = getWeeklyRaidBossState(todayKey, logs, activities);
  return { dateKey: todayKey, quests, weeklyQuests, weeklyRaidBoss };
}

export async function handleClaimDailyQuest(
  user: VerifiedFirebaseUser,
  questIdRaw: string,
  dateKeyRaw?: unknown
) {
  await ensureUserParentExists(user);
  const questId = questIdRaw as AnyAutoQuestId;
  const isWeekly = isWeeklyAutoQuestId(questId);
  if (!isWeekly && !['steps_6000', 'workout_today', 'weight_today'].includes(questId)) {
    throw new ApiHttpError(
      400,
      'questId inválido. Use: steps_6000, workout_today, weight_today, weekly_workouts_3, weekly_volume_4000 ou weekly_pr_1.',
      'invalid_quest_id'
    );
  }

  const dateKey = assertValidDateKey(dateKeyRaw, true);
  const [{ stats: currentStats, updateTime }, metrics, logs, activities, weightLogs] =
    await Promise.all([
      ensureGameStatsWithMeta(user),
      firestoreRest.queryByUser<DailyHealthMetric>(user.token, user.uid, 'dailyHealthMetrics'),
      firestoreRest.queryByUser<WorkoutLog>(user.token, user.uid, 'workoutLogs'),
      firestoreRest.queryByUser<HealthActivity>(user.token, user.uid, 'healthActivities'),
      firestoreRest.queryByUser<WeightLog>(user.token, user.uid, 'weightLogs'),
    ]);

  const normalized = normalizeGameStats(currentStats);

  let targetTitle = '';
  let xpReward = 0;
  let coinsReward = 0;
  let progressText = '';
  let isFulfilled = false;
  let isClaimed = false;
  let claimKey = `${dateKey}:${questId}`;
  let claimedQuestPayload: Record<string, unknown>;

  if (isWeekly) {
    const weeklyQuests = evaluateWeeklyAutoQuests(
      dateKey,
      logs,
      activities,
      normalized.claimedAutoQuestKeys
    );
    const weeklyTarget = weeklyQuests.find((q) => q.id === questId);
    if (!weeklyTarget) {
      throw new ApiHttpError(404, 'Missão semanal não encontrada.', 'quest_not_found');
    }
    targetTitle = weeklyTarget.title;
    xpReward = weeklyTarget.xpReward;
    coinsReward = weeklyTarget.coinsReward;
    progressText = weeklyTarget.progressText;
    isFulfilled = weeklyTarget.isFulfilled;
    isClaimed = weeklyTarget.isClaimedThisWeek;
    claimKey = `${weeklyTarget.weekKey}:${questId}`;
    claimedQuestPayload = { ...weeklyTarget, isClaimedThisWeek: true };
  } else {
    const todayMetric = metrics.find((m) => m.dateKey === dateKey) ?? null;
    const quests = evaluateDailyAutoQuests(
      dateKey,
      todayMetric,
      logs,
      activities,
      weightLogs,
      normalized.claimedAutoQuestKeys
    );
    const dailyTarget = quests.find((q) => q.id === questId);
    if (!dailyTarget) {
      throw new ApiHttpError(404, 'Missão automática não encontrada.', 'quest_not_found');
    }
    targetTitle = dailyTarget.title;
    xpReward = dailyTarget.xpReward;
    coinsReward = dailyTarget.coinsReward;
    progressText = dailyTarget.progressText;
    isFulfilled = dailyTarget.isFulfilled;
    isClaimed = dailyTarget.isClaimedToday;
    claimKey = `${dateKey}:${questId}`;
    claimedQuestPayload = { ...dailyTarget, isClaimedToday: true };
  }

  if (!isFulfilled) {
    throw new ApiHttpError(
      400,
      `A meta "${targetTitle}" ainda não foi atingida (${progressText}).`,
      'quest_not_fulfilled'
    );
  }
  if (isClaimed) {
    throw new ApiHttpError(
      409,
      isWeekly
        ? 'Esta missão semanal já foi resgatada nesta semana.'
        : 'Esta missão automática já foi resgatada hoje.',
      'quest_already_claimed'
    );
  }

  const nextXp = Math.min(MAX_TOTAL_XP, normalized.totalXp + xpReward);
  const nextCoins = Math.min(MAX_GOLD_COINS, normalized.goldCoins + coinsReward);
  const nextClaimed = [...normalized.claimedAutoQuestKeys, claimKey].slice(
    -MAX_CLAIMED_AUTO_QUEST_KEYS
  );

  const updated = sanitizeGameStatsForWrite(
    {
      ...normalized,
      totalXp: nextXp,
      level: calculateLevel(nextXp),
      goldCoins: nextCoins,
      totalCoinsEarned: normalized.totalCoinsEarned + coinsReward,
      claimedAutoQuestKeys: nextClaimed,
      updatedAt: new Date().toISOString(),
    },
    user.uid
  );

  await commitProgressChange(user, currentStats, updated, { kind: 'daily_quest', title: targetTitle }, [{
    type: 'set',
    path: `users/${user.uid}/gameStats/main`,
    data: updated as unknown as Record<string, unknown>,
    precondition: { updateTime },
  }]);

  return {
    claimedQuest: claimedQuestPayload,
    stats: updated,
  };
}

export async function handleGetHealthSummary(user: VerifiedFirebaseUser) {
  const [hero, stats, storedActivities, storedMetrics, weightLogs, workoutLogs, healthConnect] = await Promise.all([
    firestoreRest.getDoc<HeroProfile>(user.token, `users/${user.uid}/heroProfiles/main`),
    loadGameStatsOrInit(user),
    firestoreRest.queryByUser<HealthActivity>(user.token, user.uid, 'healthActivities'),
    firestoreRest.queryByUser<DailyHealthMetric>(user.token, user.uid, 'dailyHealthMetrics'),
    firestoreRest.queryByUser<WeightLog>(user.token, user.uid, 'weightLogs'),
    firestoreRest.queryByUser<WorkoutLog>(user.token, user.uid, 'workoutLogs'),
    queryHealthConnect(user),
  ]);
  const { metrics: dailyMetrics, activities, days, latestHeartRate } =
    projectHealthConnect(healthConnect.records, storedActivities, storedMetrics, user.uid, APP_TIME_ZONE);

  weightLogs.sort((a, b) => a.dateKey.localeCompare(b.dateKey));
  dailyMetrics.sort((a, b) => b.dateKey.localeCompare(a.dateKey));
  activities.sort((a, b) => b.dateKey.localeCompare(a.dateKey));

  const latestWeight = weightLogs.length > 0 ? weightLogs[weightLogs.length - 1] : null;
  const maxHr = hero?.maxHrEstimated ?? 190;
  const hrZones = buildZoneTotals(activities, workoutLogs, maxHr);
  const recovery = computeRecoveryAssessment(
    workoutLogs,
    activities,
    dailyMetrics,
    stats,
    hero?.restingHrBaseline ?? 60,
    getServerDateKey()
  );
  const bmi = computeBmiSummary(hero?.heightCm, latestWeight?.weightKg ?? hero?.weightKg);

  return {
    latestWeight,
    bmi,
    recovery,
    hrZones,
    healthConnect: { status: healthConnect.status, days, latestHeartRate },
    weightLogs,
    dailyMetrics,
    activities,
  };
}

export async function handleLogWeight(user: VerifiedFirebaseUser, body: Record<string, unknown>) {
  await ensureUserParentExists(user);
  const weightKg = Number(body.weightKg);
  if (!Number.isFinite(weightKg) || weightKg < 25 || weightKg > 350) {
    throw new ApiHttpError(400, 'weightKg deve estar entre 25 e 350 kg.', 'invalid_weight');
  }
  const dateKey = assertValidDateKey(body.dateKey, true);
  const roundedWeight = Math.round(weightKg * 10) / 10;
  const note =
    typeof body.note === 'string' && body.note.trim() ? body.note.trim().slice(0, 140) : null;
  const nowIso = new Date().toISOString();

  const [existingWeight, hero] = await Promise.all([
    firestoreRest.getDocWithMeta<WeightLog>(user.token, `users/${user.uid}/weightLogs/${dateKey}`),
    firestoreRest.getDocWithMeta<HeroProfile>(user.token, `users/${user.uid}/heroProfiles/main`),
  ]);

  const weightRecord: WeightLog = {
    id: dateKey,
    userId: user.uid,
    weightKg: roundedWeight,
    dateKey,
    note,
    recordedAt: existingWeight?.data.recordedAt || nowIso,
    updatedAt: nowIso,
  };

  const writes: Array<{ type: 'set'; path: string; data: Record<string, unknown>; precondition?: FirestorePrecondition }> = [
    {
      type: 'set',
      path: `users/${user.uid}/weightLogs/${dateKey}`,
      data: weightRecord as unknown as Record<string, unknown>,
      precondition: existingWeight ? { updateTime: existingWeight.updateTime } : { exists: false },
    },
  ];

  if (hero) {
    const updatedHero = sanitizeHeroProfileForWrite(
      {
        ...hero.data,
        weightKg: roundedWeight,
        updatedAt: nowIso,
      },
      user.uid
    );
    writes.push({
      type: 'set',
      path: `users/${user.uid}/heroProfiles/main`,
      data: updatedHero as unknown as Record<string, unknown>,
      precondition: { updateTime: hero.updateTime },
    });
  }

  await firestoreRest.commitWrites(user.token, writes);

  return {
    weightLog: weightRecord,
    bmi: computeBmiSummary(hero?.data.heightCm, roundedWeight),
  };
}

export async function handleLogHealthMetrics(
  user: VerifiedFirebaseUser,
  body: Record<string, unknown>
) {
  await ensureUserParentExists(user);
  const dateKey = assertValidDateKey(body.dateKey, true);
  const path = `users/${user.uid}/dailyHealthMetrics/${dateKey}`;
  const existingMeta = await firestoreRest.getDocWithMeta<DailyHealthMetric>(user.token, path);
  const existing = existingMeta?.data;
  for (const field of ['steps', 'activeCalories', 'sleepHours', 'restingHeartRate', 'hrvMs', 'trainingLoadScore', 'recoveryScore']) {
    const value = body[field];
    if (value === undefined || (value === null && (field === 'restingHeartRate' || field === 'hrvMs'))) continue;
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new ApiHttpError(400, `O campo "${field}" deve ser um número finito.`, 'invalid_health_metric');
    }
  }

  const steps =
    body.steps !== undefined
      ? Math.min(200000, Math.max(0, Math.round(Number(body.steps))))
      : existing?.steps ?? 0;
  const activeCalories =
    body.activeCalories !== undefined
      ? Math.min(20000, Math.max(0, Math.round(Number(body.activeCalories))))
      : existing?.activeCalories ?? 0;
  const sleepHours =
    body.sleepHours !== undefined
      ? Math.min(24, Math.max(0, Number(Number(body.sleepHours).toFixed(1))))
      : existing?.sleepHours ?? 0;

  let restingHeartRate = existing?.restingHeartRate ?? null;
  if (body.restingHeartRate !== undefined) {
    restingHeartRate =
      body.restingHeartRate === null
        ? null
        : Math.min(140, Math.max(30, Math.round(Number(body.restingHeartRate))));
  }

  let hrvMs = existing?.hrvMs ?? null;
  if (body.hrvMs !== undefined) {
    hrvMs =
      body.hrvMs === null ? null : Math.min(300, Math.max(5, Math.round(Number(body.hrvMs))));
  }

  const trainingLoadScore =
    body.trainingLoadScore !== undefined
      ? Math.min(2000, Math.max(0, Math.round(Number(body.trainingLoadScore))))
      : existing?.trainingLoadScore ?? Math.round(steps / 120 + activeCalories / 15);

  const recoveryScore =
    body.recoveryScore !== undefined
      ? Math.min(100, Math.max(0, Math.round(Number(body.recoveryScore))))
      : existing?.recoveryScore ?? Math.min(100, Math.max(35, Math.round(60 + sleepHours * 4)));

  const incomingSources = Array.isArray(body.sources)
    ? body.sources.map((s) => String(s || '').trim()).filter(Boolean)
    : ['api'];
  const mergedSources = Array.from(
    new Set([...(existing?.sources ?? []), ...incomingSources])
  ).slice(0, 10);

  const record: DailyHealthMetric = {
    id: dateKey,
    userId: user.uid,
    dateKey,
    steps,
    activeCalories,
    sleepHours,
    restingHeartRate,
    hrvMs,
    trainingLoadScore,
    recoveryScore,
    sources: mergedSources.length > 0 ? mergedSources : ['api'],
    updatedAt: new Date().toISOString(),
  };

  await firestoreRest.setDoc(
    user.token,
    path,
    record as unknown as Record<string, unknown>,
    existingMeta ? { updateTime: existingMeta.updateTime } : { exists: false }
  );

  return { dailyMetric: record };
}

export async function handleLogHealthActivity(
  user: VerifiedFirebaseUser,
  body: Record<string, unknown>
) {
  await ensureUserParentExists(user);
  const title = typeof body.title === 'string' ? body.title.trim().slice(0, 140) : '';
  if (!title) {
    throw new ApiHttpError(400, 'title da atividade é obrigatório.', 'invalid_activity_title');
  }

  const source = (body.source ?? 'strava') as HealthSource;
  if (!VALID_HEALTH_SOURCES.includes(source)) {
    throw new ApiHttpError(
      400,
      `source inválido. Use um de: ${VALID_HEALTH_SOURCES.join(', ')}.`,
      'invalid_health_source'
    );
  }

  const dateKey = assertValidDateKey(body.dateKey, true);
  const durationMinutes = Math.min(1440, Math.max(1, Math.round(Number(body.durationMinutes ?? 30))));
  const distanceKm = Math.min(1000, Math.max(0, Number(Number(body.distanceKm ?? 0).toFixed(2))));
  const calories = Math.min(20000, Math.max(0, Math.round(Number(body.calories ?? durationMinutes * 8))));
  const elevationGainM = Math.min(20000, Math.max(0, Math.round(Number(body.elevationGainM ?? 0))));
  const sportType =
    typeof body.sportType === 'string' && body.sportType.trim()
      ? body.sportType.trim().slice(0, 60)
      : 'Run';

  const avgHeartRate =
    body.avgHeartRate !== undefined && body.avgHeartRate !== null
      ? Math.min(240, Math.max(30, Math.round(Number(body.avgHeartRate))))
      : null;
  const maxHeartRate =
    body.maxHeartRate !== undefined && body.maxHeartRate !== null
      ? Math.min(250, Math.max(30, Math.round(Number(body.maxHeartRate))))
      : null;

  let zoneMinutes: [number, number, number, number, number] = [0, 0, 0, 0, 0];
  if (Array.isArray(body.zoneMinutes) && body.zoneMinutes.length === 5) {
    zoneMinutes = [
      Math.max(0, Math.round(Number(body.zoneMinutes[0]) || 0)),
      Math.max(0, Math.round(Number(body.zoneMinutes[1]) || 0)),
      Math.max(0, Math.round(Number(body.zoneMinutes[2]) || 0)),
      Math.max(0, Math.round(Number(body.zoneMinutes[3]) || 0)),
      Math.max(0, Math.round(Number(body.zoneMinutes[4]) || 0)),
    ];
  }

  const hrSamplePoints = Array.isArray(body.hrSamplePoints)
    ? body.hrSamplePoints
        .map((n) => Math.round(Number(n)))
        .filter((n) => Number.isFinite(n) && n >= 30 && n <= 250)
        .slice(0, MAX_HR_SAMPLE_POINTS)
    : [];

  // SEC-04: Ignora xpAwarded do cliente e calcula sempre no servidor
  const xpAwarded = calculateActivityXp(durationMinutes, distanceKm, sportType);

  const nowIso = new Date().toISOString();
  const rawExternalId =
    typeof body.externalId === 'string' && body.externalId.trim()
      ? body.externalId.trim().slice(0, 128)
      : '';
  const rawId =
    typeof body.id === 'string' && VALID_ID_REGEX.test(body.id.trim()) ? body.id.trim() : '';

  const fallbackStableId = `${source}_${dateKey}_${durationMinutes}_${distanceKm.toFixed(
    2
  )}_${sportType
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '_')
    .slice(0, 40)}`.slice(0, 120);

  const sanitizedExternalId = rawExternalId
    ? rawExternalId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120)
    : '';
  const actId =
    rawId ||
    (sanitizedExternalId && VALID_ID_REGEX.test(sanitizedExternalId)
      ? sanitizedExternalId
      : fallbackStableId);
  const externalId = rawExternalId || actId;

  const activity: HealthActivity = {
    id: actId,
    userId: user.uid,
    externalId,
    source,
    title,
    sportType,
    dateKey,
    startedAt:
      typeof body.startedAt === 'string' && body.startedAt.trim()
        ? body.startedAt.trim().slice(0, 40)
        : `${dateKey}T12:00:00Z`,
    durationMinutes,
    distanceKm,
    calories,
    elevationGainM,
    avgHeartRate,
    maxHeartRate,
    zoneMinutes,
    hrSamplePoints,
    xpAwarded,
    createdAt: nowIso,
  };

  const activityPath = `users/${user.uid}/healthActivities/${actId}`;
  const isDuplicate = async () => {
    const sameId = await firestoreRest.getDoc<HealthActivity>(user.token, activityPath);
    if (sameId) {
      if (sameId.source !== source || sameId.externalId !== externalId) {
        throw new ApiHttpError(409, 'Identificador já associado a outra atividade.', 'activity_id_conflict');
      }
      return sameId;
    }
    const [sameExternalId] = await firestoreRest.queryByUser<HealthActivity>(
      user.token, user.uid, 'healthActivities', 1, { activityIdentity: { source, externalId } }
    );
    return sameExternalId;
  };

  // Ler a versão antes de pesquisar duplicatas faz o commit concorrente invalidar a precondição.
  for (let attempt = 0; ; attempt++) {
    const { stats: currentStats, updateTime } = await ensureGameStatsWithMeta(user);
    const duplicate = await isDuplicate();
    if (duplicate) return { activity: duplicate, stats: currentStats, coinsAdded: 0, duplicate: true };
    const nextXp = Math.min(MAX_TOTAL_XP, currentStats.totalXp + xpAwarded);
    const coinsAdded = Math.max(10, Math.round(xpAwarded * 0.25));
    const streakInfo = calculateNextStreak(
      currentStats.currentStreak,
      currentStats.longestStreak,
      currentStats.lastWorkoutDate,
      dateKey
    );
    const wt = mapSportToWorkoutType(sportType);

    const updatedStats = sanitizeGameStatsForWrite(
      {
        ...currentStats,
        totalXp: nextXp,
        level: calculateLevel(nextXp),
        goldCoins: Math.min(MAX_GOLD_COINS, (currentStats.goldCoins ?? 0) + coinsAdded),
        totalCoinsEarned: Math.min(
          MAX_TOTAL_COINS_EARNED,
          (currentStats.totalCoinsEarned ?? 0) + coinsAdded
        ),
        currentStreak: streakInfo.currentStreak,
        longestStreak: streakInfo.longestStreak,
        lastWorkoutDate:
          !currentStats.lastWorkoutDate || dateKey > currentStats.lastWorkoutDate
            ? dateKey
            : currentStats.lastWorkoutDate,
        totalMinutes: currentStats.totalMinutes + durationMinutes,
        cardioWorkouts: currentStats.cardioWorkouts + (wt === 'cardio' ? 1 : 0),
        forcaWorkouts: currentStats.forcaWorkouts + (wt === 'forca' ? 1 : 0),
        hiitWorkouts: currentStats.hiitWorkouts + (wt === 'hiit' ? 1 : 0),
        coreWorkouts: currentStats.coreWorkouts + (wt === 'core' ? 1 : 0),
        mobilidadeWorkouts: currentStats.mobilidadeWorkouts + (wt === 'mobilidade' ? 1 : 0),
        corpoInteiroWorkouts: currentStats.corpoInteiroWorkouts + (wt === 'corpo_inteiro' ? 1 : 0),
        updatedAt: new Date().toISOString(),
      },
      user.uid
    );

    try {
      await commitProgressChange(user, currentStats, updatedStats, { kind: 'health_activity', title }, [
        {
          type: 'set',
          path: activityPath,
          data: activity as unknown as Record<string, unknown>,
          precondition: { exists: false },
        },
        {
          type: 'set',
          path: `users/${user.uid}/gameStats/main`,
          data: updatedStats as unknown as Record<string, unknown>,
          precondition: { updateTime },
        },
      ]);
    } catch (err) {
      if (err instanceof ApiHttpError && err.code === 'concurrency_conflict' && attempt < 2) continue;
      throw err;
    }

    return { activity, stats: updatedStats, coinsAdded, duplicate: false };
  }
}

export async function handleAskOracle(
  user: VerifiedFirebaseUser,
  body: Record<string, unknown>,
  deps: ApiV1DomainDeps
) {
  const question = typeof body.question === 'string' ? body.question.trim() : '';
  if (!question || question.length > 400) {
    throw new ApiHttpError(
      400,
      'Pergunta inválida. Envie "question" entre 1 e 400 caracteres.',
      'invalid_question'
    );
  }

  const ai = deps.getGeminiClient();
  if (!ai) {
    throw new ApiHttpError(
      503,
      'A chave GEMINI_API_KEY não está configurada no servidor.',
      'gemini_not_configured'
    );
  }

  const [hero, stats, logs, activities, dailyMetrics] = await Promise.all([
    firestoreRest.getDoc<HeroProfile>(user.token, `users/${user.uid}/heroProfiles/main`),
    loadGameStatsOrInit(user),
    firestoreRest.queryByUser<WorkoutLog>(user.token, user.uid, 'workoutLogs'),
    firestoreRest.queryByUser<HealthActivity>(user.token, user.uid, 'healthActivities'),
    firestoreRest.queryByUser<DailyHealthMetric>(user.token, user.uid, 'dailyHealthMetrics'),
  ]);

  const recovery = computeRecoveryAssessment(
    logs,
    activities,
    dailyMetrics,
    stats,
    hero?.restingHrBaseline ?? 60,
    getServerDateKey()
  );
  const gearSummary = calculateGearBonusSummary(stats.equippedGear);
  const levelInfo = getLevelProgress(stats.totalXp);
  const dual = getDualProgressionStatus(stats, getServerDateKey());

  const contextText = [
    `Classe: ${hero?.heroClass || 'Guerreiro'} · Objetivo: ${hero?.objective || 'Condicionamento'}`,
    `Mundo Real: Nível ${stats.level} (${dual.hunter.current.label} · ${levelInfo.levelTitle}) · ${stats.totalXp} XP · HP ${stats.hunterHp ?? 100}/100 · Moedas ${stats.goldCoins ?? 0}`,
    `Murim: ${dual.murim.current.name} (${dual.murim.qiPoints} Qi · Técnica: ${dual.murim.current.qiTechnique})`,
    `Streak: ${getEffectiveCurrentStreak(stats.currentStreak, stats.lastWorkoutDate)} dias (recorde ${stats.longestStreak}) · Total treinos: ${stats.totalWorkouts}`,
    `Arsenal equipado: +${gearSummary.xpBonusPercent}% XP, +${gearSummary.coinBonusPercent}% Moedas, +${gearSummary.bossDamageBonusPercent}% Dano em Chefe`,
    `Recuperação atual: ${recovery.score}/100 (${recovery.statusLabel}) · ACWR ${recovery.acwrRatio} · Carga 7d: ${recovery.acuteLoad7d}`,
  ].join('\n');

  const systemInstruction = [
    'Você é o "Oráculo", mentor sábio de treinamento físico e saúde no aplicativo Fitness RPG.',
    'REGRAS INVIOLÁVEIS:',
    '1. Responda sempre em português brasileiro (pt-BR).',
    '2. Seja curto, claro, motivador e prático (máximo de 3 parágrafos curtos).',
    '3. Use EXCLUSIVAMENTE os dados reais fornecidos no contexto. NUNCA invente métricas.',
    '4. NUNCA forneça diagnóstico médico.',
    '5. Sempre finalize com uma recomendação prática acionável considerando a recuperação atual.',
  ].join('\n');

  const reply = await generateGeminiText(ai, JSON.stringify({ context: contextText, question }), {
    systemInstruction,
  });

  const persist = body.persist !== false;
  if (persist) {
    await ensureUserParentExists(user);
    const ts = Date.now();
    const userMsg: ChatMessage = {
      id: `msg-${crypto.randomUUID()}-user`,
      userId: user.uid,
      role: 'user',
      content: question.slice(0, 4000),
      createdAt: new Date(ts).toISOString(),
    };
    const oracleMsg: ChatMessage = {
      id: `msg-${crypto.randomUUID()}-oracle`,
      userId: user.uid,
      role: 'oracle',
      content: reply.slice(0, 4000),
      createdAt: new Date(ts + 1).toISOString(),
    };

    await firestoreRest.commitWrites(user.token, [
      {
        type: 'set',
        path: `users/${user.uid}/chatMessages/${userMsg.id}`,
        data: userMsg as unknown as Record<string, unknown>,
        precondition: { exists: false },
      },
      {
        type: 'set',
        path: `users/${user.uid}/chatMessages/${oracleMsg.id}`,
        data: oracleMsg as unknown as Record<string, unknown>,
        precondition: { exists: false },
      },
    ]);
  }

  return {
    question,
    reply,
    persisted: persist,
    recoveryScore: recovery.score,
  };
}
