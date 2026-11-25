import assert from 'node:assert/strict';
import test from 'node:test';
import { runGameLogicTests } from '../src/utils/rpgLogic.test.ts';
import { getExerciseMotionSpec } from '../src/utils/exerciseMotion.ts';
import {
  BASE_HUNTER_RANK,
  DAYS_PER_RANK_BASELINE,
  DEFAULT_EQUIPPED_GEAR,
  EQUIPMENT_CATALOG,
  HUNTER_RANK_HIERARCHY,
  HYBRID_CALISTHENICS_PROGRAM,
  INITIAL_WORKOUTS,
  MAX_CLAIMED_AUTO_QUEST_KEYS,
  MAX_IMPORT_ACTIVITIES_PER_ROUND,
  MURIM_REALM_TIERS,
  VALID_WORKOUT_RANKS,
  WARRIOR_AWAKENING_PROGRAM,
  buildWeeklyTrends,
  calculateActivityXp,
  calculateEstimated1RmKg,
  calculateGearBonusSummary,
  calculateHeroRankByXp,
  calculateLevel,
  calculateSessionPrBonus,
  calculateWorkoutBossState,
  createInitialGameStats,
  evaluateAchievements,
  evaluateExercisePrUpdate,
  evaluateWeeklyAutoQuests,
  getBossForWorkout,
  getHunterRankBadgeClass,
  getHunterRankDefinition,
  getHunterRankForLevel,
  getHunterRankOrder,
  getHunterRankStartXp,
  getIsoWeekDateRange,
  getIsoWeekKey,
  getLocalDateKey,
  getMurimRealmProgress,
  getRecommendedProgramForHero,
  getTodayScheduleEntry,
  getWeeklyRaidBossState,
  isRankAppropriateForHero,
  isValidHunterRank,
  normalizeGameStats,
  normalizeHunterRank,
  parseExercisePrescription,
} from '../src/utils/rpgLogic.ts';
import type { HeroProfile, WorkoutLog } from '../src/types/fitness.ts';

test('Suíte completa de regras RPG e zonas cardíacas passa 100%', () => {
  const results = runGameLogicTests();
  assert.ok(results.length >= 20);
  for (const item of results) {
    assert.equal(item.passed, true, `${item.name}: ${item.details}`);
  }
});

test('calculateActivityXp aplica limites mínimos e máximos do servidor', () => {
  assert.equal(calculateActivityXp(5, 0, 'Walking'), 15);
  assert.equal(calculateActivityXp(30, 5, 'Running'), 150);
  assert.equal(calculateActivityXp(600, 120, 'Running'), 500);
});

test('conjuntos Viajante e Guarda de Aço aplicam o bônus do maior nível equipado', () => {
  const initial = calculateGearBonusSummary(DEFAULT_EQUIPPED_GEAR).activeSets[0];
  assert.equal(initial.set.id, 'viajante');
  assert.equal(initial.equippedCount, 2);
  assert.equal(initial.twoPieceActive, true);
  assert.equal(initial.fourPieceActive, false);

  const travelerGear = {
    ...DEFAULT_EQUIPPED_GEAR,
    armadura: 'armadura_tunica_couro',
    capa: 'capa_pano_simples',
  };
  const traveler = calculateGearBonusSummary(travelerGear);
  assert.equal(traveler.activeSets[0].equippedCount, 4);
  assert.equal(traveler.activeSets[0].fourPieceActive, true);
  const travelerItemXp = EQUIPMENT_CATALOG
    .filter(({ id }) => Object.values(travelerGear).includes(id))
    .reduce((total, { xpBonusPercent }) => total + xpBonusPercent, 0);
  assert.equal(traveler.xpBonusPercent, travelerItemXp + 6);

  const guardGear = {
    ...travelerGear,
    elmo: 'elmo_bandana_novico',
    armadura: 'armadura_placa_aco',
  };
  const guard = calculateGearBonusSummary(guardGear).activeSets.find(({ set }) => set.id === 'guarda_aco');
  assert.equal(guard?.equippedCount, 2);
  assert.equal(guard?.twoPieceActive, true);
  assert.equal(guard?.fourPieceActive, false);
  assert.equal(guard?.set.fourPieceBonus, undefined);
  const partialGuard = calculateGearBonusSummary({ ...guardGear, armadura: null })
    .activeSets.find(({ set }) => set.id === 'guarda_aco');
  assert.equal(partialGuard?.twoPieceActive, false);
});

test('tendências semanais incluem todos os dias do período escolhido e excluem datas futuras', () => {
  const today = new Date(2026, 10, 21, 12);
  const logs = [-1, 0, 6, 7, 27, 28, 89, 90].map((daysAgo): WorkoutLog => {
    const date = new Date(2026, 10, 21 - daysAgo, 12);
    return {
      id: `log-${daysAgo}`, userId: 'owner', workoutId: 'test', workoutName: 'Caminhada',
      workoutType: 'cardio', difficulty: 'Iniciante', completedExercises: 1, totalExercises: 1,
      durationMinutes: 10, xpEarned: 10, bonusXpEarned: 0, dateKey: getLocalDateKey(date),
      completedAt: date.toISOString(),
    };
  });

  for (const [period, weeks, sessions] of [[7, 1, 2], [28, 4, 4], [90, 13, 6]] as const) {
    const trends = buildWeeklyTrends(logs, [], [], period, today);
    assert.equal(trends.length, weeks);
    assert.equal(trends[0].startDateKey, getLocalDateKey(new Date(2026, 10, 21 - (period - 1))));
    assert.equal(trends.reduce((sum, week) => sum + week.sessionsCount, 0), sessions);
  }
});

test('normalizeGameStats respeita limites compartilhados e catálogo válido', () => {
  const base = createInitialGameStats('user-1');
  const overflowKeys = Array.from({ length: 120 }, (_, idx) => `2026-11-01:k${idx}`);
  const normalized = normalizeGameStats({
    ...base,
    claimedAutoQuestKeys: overflowKeys,
    goldCoins: -20,
  });

  assert.equal(normalized.claimedAutoQuestKeys.length, MAX_CLAIMED_AUTO_QUEST_KEYS);
  assert.equal(normalized.goldCoins, 0);
  assert.equal(MAX_IMPORT_ACTIVITIES_PER_ROUND, 200);
});

test('Catálogo inclui treinos Despertar do Guerreiro A e B com Rank F nativo e cargas leves', () => {
  const treinoA = INITIAL_WORKOUTS.find((w) => w.id === 'w-despertar-guerreiro-a');
  const treinoB = INITIAL_WORKOUTS.find((w) => w.id === 'w-despertar-guerreiro-b');
  assert.ok(treinoA, 'Treino A deve existir em INITIAL_WORKOUTS');
  assert.ok(treinoB, 'Treino B deve existir em INITIAL_WORKOUTS');

  assert.equal(treinoA.rank, 'F');
  assert.equal(treinoB.rank, 'F');
  assert.equal(treinoA.difficulty, 'Iniciante');
  assert.equal(treinoB.difficulty, 'Iniciante');
  assert.equal(treinoA.durationMinutes, 40);
  assert.equal(treinoB.durationMinutes, 40);
  assert.equal(treinoA.exercises.length, 5);
  assert.equal(treinoB.exercises.length, 5);

  const bossA = getBossForWorkout(treinoA);
  const bossB = getBossForWorkout(treinoB);
  assert.equal(bossA.name, 'Vigia de Pedra Rank F');
  assert.equal(bossA.maxHp, 35);
  assert.equal(bossA.bossRank, 'F');
  assert.equal(bossB.name, 'Sombra da Forja Rank F');
  assert.equal(bossB.maxHp, 35);
  assert.equal(bossB.bossRank, 'F');

  const customRankFBoss = getBossForWorkout({
    ...treinoA,
    id: 'custom-rank-f',
  });
  assert.equal(customRankFBoss.maxHp, 35);
  assert.equal(customRankFBoss.bossRank, 'F');

  const supermanEx = treinoB.exercises.find((e) => e.name === 'Superman');
  assert.ok(supermanEx);
  assert.equal(getExerciseMotionSpec(supermanEx).archetype, 'superman');
});

test('Rank F é validado, ordenado, estilizável e integrado à progressão de treinos e chefes', () => {
  assert.deepEqual(VALID_WORKOUT_RANKS, ['F', 'E', 'D', 'C', 'B', 'A', 'S']);
  assert.deepEqual(HUNTER_RANK_HIERARCHY, ['F', 'E', 'D', 'C', 'B', 'A', 'S']);
  assert.equal(BASE_HUNTER_RANK, 'F');
  assert.equal(isValidHunterRank('F'), true);
  assert.equal(isValidHunterRank('S'), true);
  assert.equal(isValidHunterRank('Z'), false);
  assert.equal(isValidHunterRank(null), false);

  assert.equal(normalizeHunterRank('f'), 'F');
  assert.equal(normalizeHunterRank('Rank F'), 'F');
  assert.equal(normalizeHunterRank(undefined), 'F');
  assert.equal(normalizeHunterRank('invalido', 'F'), 'F');
  assert.equal(normalizeHunterRank('invalido', 'Z' as unknown as 'F'), 'F');
  assert.equal(getHunterRankOrder('F'), 0);
  assert.equal(getHunterRankOrder('E'), 1);
  assert.equal(getHunterRankDefinition('F').label, 'Caçador Rank F');
  assert.ok(getHunterRankBadgeClass('F').length > 0);
  assert.equal(isRankAppropriateForHero('F', 'F'), true);
  assert.equal(isRankAppropriateForHero('E', 'F'), true);
  assert.equal(isRankAppropriateForHero('B', 'F'), false);

  const newUserStats = createInitialGameStats('novo-cacador');
  assert.equal(newUserStats.totalXp, 0);
  assert.equal(newUserStats.level, 1);
  assert.equal(calculateHeroRankByXp(newUserStats.totalXp), 'F');
  assert.equal(getHunterRankForLevel(newUserStats.level, newUserStats.totalXp).current.rank, 'F');
});

test('Agenda Semanal alterna Despertar A/B para Rank F ou Iniciante e Híbrida para Rank E+ avançado', () => {
  const baseHero: HeroProfile = {
    userId: 'u-1',
    name: 'Caçador Teste',
    avatar: 'shadow',
    heroClass: 'Guerreiro',
    objective: 'Condicionamento',
    experience: 'Iniciante',
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-01T00:00:00.000Z',
  };
  const rankFStats = createInitialGameStats('u-1');
  const rankEStats = {
    ...rankFStats,
    totalXp: 4200,
    level: 3,
  };

  assert.equal(getRecommendedProgramForHero(baseHero, rankFStats).id, WARRIOR_AWAKENING_PROGRAM.id);
  assert.equal(
    getRecommendedProgramForHero({ ...baseHero, experience: 'Intermediário' }, rankFStats).id,
    WARRIOR_AWAKENING_PROGRAM.id
  );
  assert.equal(
    getRecommendedProgramForHero({ ...baseHero, experience: 'Intermediário' }, rankEStats).id,
    HYBRID_CALISTHENICS_PROGRAM.id
  );

  const monday = new Date('2026-11-16T12:00:00');
  const tuesday = new Date('2026-11-17T12:00:00');
  const wednesday = new Date('2026-11-18T12:00:00');
  assert.equal(
    getTodayScheduleEntry(monday, WARRIOR_AWAKENING_PROGRAM).workoutId,
    'w-despertar-guerreiro-a'
  );
  assert.equal(
    getTodayScheduleEntry(tuesday, WARRIOR_AWAKENING_PROGRAM).workoutId,
    'w-despertar-guerreiro-b'
  );
  assert.equal(
    getTodayScheduleEntry(wednesday, WARRIOR_AWAKENING_PROGRAM).workoutId,
    null
  );
});

test('Progressão de Níveis, Ranks e Reinos Murim segue escala de ~30 dias e recalcula pelo XP total', () => {
  assert.equal(DAYS_PER_RANK_BASELINE, 30);

  const expectedStartXp = {
    F: 0,
    E: 4000,
    D: 8500,
    C: 13500,
    B: 19000,
    A: 25000,
    S: 31500,
  } as const;

  for (const rank of VALID_WORKOUT_RANKS) {
    const startXp = getHunterRankStartXp(rank);
    assert.equal(startXp, expectedStartXp[rank]);
    const lvl = calculateLevel(startXp);
    const rankProgress = getHunterRankForLevel(lvl, startXp);
    assert.equal(rankProgress.current.rank, rank);
    if (rank !== 'S') {
      assert.equal(rankProgress.estimatedDaysToNextRank, 30);
    } else {
      assert.equal(rankProgress.estimatedDaysToNextRank, 0);
    }
  }

  assert.equal(calculateLevel(38500), 25);
  assert.equal(getHunterRankForLevel(1, 2000).estimatedDaysToNextRank, 15);

  const expectedMurimQi = [0, 1350, 2700, 4100, 5600, 7200, 8900, 10800];
  assert.deepEqual(
    MURIM_REALM_TIERS.map((r) => r.minQi),
    expectedMurimQi
  );

  const startMurim = getMurimRealmProgress(createInitialGameStats('u-m0'), '2026-11-16');
  assert.equal(startMurim.current.order, 1);
  assert.equal(startMurim.estimatedDaysToNextRealm, 30);

  const legacyOverleveled = normalizeGameStats({
    ...createInitialGameStats('u-legacy'),
    totalXp: 600,
    level: 5,
  });
  assert.equal(legacyOverleveled.level, 1);
  assert.equal(getHunterRankForLevel(legacyOverleveled.level, legacyOverleveled.totalXp).current.rank, 'F');
  assert.equal(getHunterRankForLevel(10, 600).current.rank, 'F');
});

test('src/utils/progressionCurves.ts: calculateHeroRankByXp e curva de 30 dias convertem e reajustam retroativamente Rank e Reino Murim', async () => {
  const {
    MURIM_XP_CURVE_POINTS,
    THIRTY_DAY_CONSISTENCY_CURVE,
    calculateHeroRankByXp,
    calculateMurimQiByXp,
    calculateMurimRealmByXp,
    recalculateHeroProgressionByXp,
  } = await import('../src/utils/progressionCurves.ts');

  const { getDualProgressionStatus } = await import('../src/utils/rpgLogic.ts');

  assert.equal(THIRTY_DAY_CONSISTENCY_CURVE.length, 7);
  assert.equal(THIRTY_DAY_CONSISTENCY_CURVE[0].rank, 'F');
  assert.equal(THIRTY_DAY_CONSISTENCY_CURVE[1].estimatedDayStart, 30);
  assert.equal(THIRTY_DAY_CONSISTENCY_CURVE[1].startXp, 4000);
  assert.equal(MURIM_XP_CURVE_POINTS.length, 8);

  assert.equal(calculateHeroRankByXp(-100), 'F');
  assert.equal(calculateHeroRankByXp(0), 'F');
  assert.equal(calculateHeroRankByXp(3999), 'F');
  assert.equal(calculateHeroRankByXp(4000), 'E');
  assert.equal(calculateHeroRankByXp(8499), 'E');
  assert.equal(calculateHeroRankByXp(8500), 'D');
  assert.equal(calculateHeroRankByXp(13500), 'C');
  assert.equal(calculateHeroRankByXp(19000), 'B');
  assert.equal(calculateHeroRankByXp(25000), 'A');
  assert.equal(calculateHeroRankByXp(31500), 'S');
  assert.equal(calculateHeroRankByXp(50000), 'S');

  assert.equal(calculateMurimQiByXp(0), 0);
  assert.equal(calculateMurimQiByXp(4000), 1350);
  assert.equal(calculateMurimQiByXp(8500), 2700);
  assert.equal(calculateMurimQiByXp(13500), 4100);
  assert.equal(calculateMurimQiByXp(19000), 5600);
  assert.equal(calculateMurimQiByXp(25000), 7200);
  assert.equal(calculateMurimQiByXp(31500), 8900);
  assert.equal(calculateMurimQiByXp(38500), 10800);

  assert.equal(calculateMurimRealmByXp(0).id, 'third_rate');
  assert.equal(calculateMurimRealmByXp(4000).id, 'second_rate');
  assert.equal(calculateMurimRealmByXp(8500).id, 'first_rate');
  assert.equal(calculateMurimRealmByXp(13500).id, 'peak');
  assert.equal(calculateMurimRealmByXp(19000).id, 'supreme_peak');
  assert.equal(calculateMurimRealmByXp(25000).id, 'unrestrained');
  assert.equal(calculateMurimRealmByXp(31500).id, 'profound');
  assert.equal(calculateMurimRealmByXp(38500).id, 'life_and_death');

  const retro = recalculateHeroProgressionByXp(4250);
  assert.equal(retro.level, 3);
  assert.equal(retro.rank, 'E');
  assert.equal(retro.rankProgress.current.rank, 'E');
  assert.equal(retro.murimRealm.id, 'second_rate');
  assert.ok(retro.murimQi >= 1350);

  const dualFromXpOnly = getDualProgressionStatus(
    {
      ...createInitialGameStats('u-xp-retro'),
      totalXp: 13500,
      level: 1,
    },
    '2026-11-16'
  );
  assert.equal(dualFromXpOnly.hunter.current.rank, 'C');
  assert.equal(dualFromXpOnly.murim.current.id, 'peak');
  assert.equal(dualFromXpOnly.murim.qiPoints, 4100);
});

test('PRs por série, 1RM Epley, bônus limitado e parser de prescrição funcionam com precisão', () => {
  assert.deepEqual(parseExercisePrescription('3 séries x 12 repetições'), {
    setsCount: 3,
    targetReps: 12,
    isTimeBased: false,
  });
  assert.deepEqual(parseExercisePrescription('4 séries x 8-12 repetições'), {
    setsCount: 4,
    targetReps: 10,
    isTimeBased: false,
  });
  assert.deepEqual(parseExercisePrescription('3 séries x 40-60s'), {
    setsCount: 3,
    targetReps: 50,
    isTimeBased: true,
  });

  assert.equal(calculateEstimated1RmKg(100, 1), 100);
  assert.equal(calculateEstimated1RmKg(60, 10), 80);
  assert.equal(calculateEstimated1RmKg(0, 12), 0);

  const firstPrEval = evaluateExercisePrUpdate(
    [
      { setIndex: 1, weightKg: 40, reps: 10, completed: true },
      { setIndex: 2, weightKg: 45, reps: 8, completed: true },
      { setIndex: 3, weightKg: 50, reps: 8, completed: false },
    ],
    null
  );
  assert.equal(firstPrEval.hasPr, true);
  assert.equal(firstPrEval.volumeKg, 40 * 10 + 45 * 8);
  assert.equal(firstPrEval.bestWeightKg, 45);
  assert.equal(firstPrEval.bestEstimated1RmKg, 57);
  assert.equal(firstPrEval.annotatedSets[2].isPr, false);

  const noPrEval = evaluateExercisePrUpdate(
    [{ setIndex: 1, weightKg: 40, reps: 8, completed: true }],
    { bestWeightKg: 45, bestReps: 10, bestVolumeKg: 400, estimated1RmKg: 57 }
  );
  assert.equal(noPrEval.hasPr, false);

  const beatenPrEval = evaluateExercisePrUpdate(
    [{ setIndex: 1, weightKg: 45, reps: 10, completed: true }],
    { bestWeightKg: 45, bestReps: 8, bestVolumeKg: 400, estimated1RmKg: 57 }
  );
  assert.equal(beatenPrEval.hasPr, true);
  assert.equal(beatenPrEval.nextBestVolumeKg, 450);

  assert.deepEqual(calculateSessionPrBonus(2), { prXpBonus: 40, prCoinsBonus: 20 });
  assert.deepEqual(calculateSessionPrBonus(8), { prXpBonus: 100, prCoinsBonus: 50 });
});

test('Chefe de sessão reage a séries parciais, golpes críticos, missões semanais e Raid Semanal', () => {
  const noSetsBoss = calculateWorkoutBossState(100, 0, 5, 0, 1200, 0);
  const partialSetsBoss = calculateWorkoutBossState(100, 0, 5, 0, 1200, 0, {
    completedSets: 6,
    totalSets: 15,
    criticalHits: 1,
  });
  assert.ok(partialSetsBoss.currentHp < noSetsBoss.currentHp);

  const refDay = '2026-11-18';
  const weekKey = getIsoWeekKey(refDay);
  const range = getIsoWeekDateRange(refDay);
  assert.equal(range.startDateKey, '2026-11-16');
  assert.equal(range.endDateKey, '2026-11-22');

  const weekLogs: WorkoutLog[] = [
    {
      id: 'w1', userId: 'u1', workoutId: 'a', workoutName: 'A', workoutType: 'forca',
      difficulty: 'Iniciante', completedExercises: 5, totalExercises: 5, durationMinutes: 40,
      xpEarned: 120, bonusXpEarned: 20, totalVolumeKg: 2400, prCount: 1,
      dateKey: '2026-11-16', completedAt: '2026-11-16T12:00:00Z',
    },
    {
      id: 'w2', userId: 'u1', workoutId: 'b', workoutName: 'B', workoutType: 'forca',
      difficulty: 'Iniciante', completedExercises: 5, totalExercises: 5, durationMinutes: 40,
      xpEarned: 120, bonusXpEarned: 0, totalVolumeKg: 2000, prCount: 0,
      dateKey: '2026-11-17', completedAt: '2026-11-17T12:00:00Z',
    },
    {
      id: 'w3', userId: 'u1', workoutId: 'a', workoutName: 'A', workoutType: 'forca',
      difficulty: 'Iniciante', completedExercises: 5, totalExercises: 5, durationMinutes: 40,
      xpEarned: 120, bonusXpEarned: 0, totalVolumeKg: 1800, prCount: 0,
      dateKey: '2026-11-18', completedAt: '2026-11-18T12:00:00Z',
    },
  ];

  const weeklyQuests = evaluateWeeklyAutoQuests(refDay, weekLogs, [], [`${weekKey}:weekly_workouts_3`]);
  assert.equal(weeklyQuests[0].isFulfilled, true);
  assert.equal(weeklyQuests[0].isClaimedThisWeek, true);
  assert.equal(weeklyQuests[1].isFulfilled, true);
  assert.equal(weeklyQuests[2].isFulfilled, true);

  const raid = getWeeklyRaidBossState(refDay, weekLogs, []);
  assert.equal(raid.isDefeated, true);
  assert.equal(raid.currentHp, 0);

  const achRes = evaluateAchievements(
    createInitialGameStats('u1'),
    {},
    '2026-11-18T12:00:00Z',
    { prCountTotal: 10, weeklyRaidDefeated: true }
  );
  const unlockedIds = achRes.newlyUnlocked.map((a) => a.id);
  assert.ok(unlockedIds.includes('first_pr'));
  assert.ok(unlockedIds.includes('pr_collector_10'));
  assert.ok(unlockedIds.includes('weekly_raid_clear'));
});

test('fila offline de treinos mantém idempotência e limpa por usuário', async () => {
  const storageMap = new Map<string, string>();
  const prevWindow = globalThis.window;
  (globalThis as unknown as { window: unknown }).window = {
    localStorage: {
      getItem: (k: string) => storageMap.get(k) ?? null,
      setItem: (k: string, v: string) => storageMap.set(k, v),
      removeItem: (k: string) => storageMap.delete(k),
    },
  };

  try {
    const {
      enqueueOfflineWorkout,
      listOfflineWorkouts,
      removeOfflineWorkout,
      clearOfflineWorkoutsForUser,
    } = await import('../src/utils/offlineWorkoutQueue.ts');

    enqueueOfflineWorkout({
      idempotencyKey: 'k-1',
      userId: 'u1',
      workoutId: 'w-despertar-guerreiro-a',
      completedExercises: 5,
      durationMinutes: 40,
      dateKey: '2026-11-18',
      queuedAt: '2026-11-18T12:00:00Z',
    });
    enqueueOfflineWorkout({
      idempotencyKey: 'k-1',
      userId: 'u1',
      workoutId: 'w-despertar-guerreiro-a',
      completedExercises: 5,
      durationMinutes: 42,
      dateKey: '2026-11-18',
      queuedAt: '2026-11-18T12:01:00Z',
    });
    assert.equal(listOfflineWorkouts('u1').length, 1);
    assert.equal(listOfflineWorkouts('u1')[0].durationMinutes, 42);

    removeOfflineWorkout('u1', 'k-1');
    assert.equal(listOfflineWorkouts('u1').length, 0);

    enqueueOfflineWorkout({
      idempotencyKey: 'k-2',
      userId: 'u1',
      workoutId: 'w-despertar-guerreiro-b',
      completedExercises: 5,
      durationMinutes: 35,
      dateKey: '2026-11-18',
      queuedAt: '2026-11-18T13:00:00Z',
    });
    clearOfflineWorkoutsForUser('u1');
    assert.equal(listOfflineWorkouts('u1').length, 0);
  } finally {
    (globalThis as unknown as { window: unknown }).window = prevWindow;
  }
});

