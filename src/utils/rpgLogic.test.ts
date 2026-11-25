import {
  EquippedGear,
  GameStats,
  TestCaseResult,
  WorkoutLog,
} from '../types/fitness';
import {
  EQUIPMENT_CATALOG,
  INITIAL_WORKOUTS,
  applyHabitPenalty,
  applyVowCompletion,
  calculateCoinsForWorkout,
  calculateGearBonusSummary,
  calculateLevel,
  calculateNextStreak,
  calculateProportionalXp,
  calculateWorkoutBossState,
  computeZoneMinutesFromHrStream,
  createInitialGameStats,
  detectWorkoutStagnation,
  evaluateAchievements,
  getEffectiveCurrentStreak,
  getHunterRankForLevel,
  getLevelProgress,
  getMurimRealmProgress,
  isEquipmentMilestoneUnlocked,
  migrateEquippedGear,
} from './rpgLogic';

export function runGameLogicTests(): TestCaseResult[] {
  const results: TestCaseResult[] = [];

  const assertEqual = <T,>(name: string, actual: T, expected: T): void => {
    const passed = JSON.stringify(actual) === JSON.stringify(expected);
    results.push({
      name,
      passed,
      details: passed
        ? `OK (${JSON.stringify(actual)})`
        : `Falhou: esperado ${JSON.stringify(expected)}, obtido ${JSON.stringify(actual)}`,
    });
  };

  assertEqual(
    'XP proporcional: 100% dos exercícios (4/4 de 120 XP)',
    calculateProportionalXp(120, 4, 4),
    120
  );
  assertEqual(
    'XP proporcional: 50% dos exercícios (2/4 de 125 XP)',
    calculateProportionalXp(125, 2, 4),
    63
  );
  assertEqual(
    'XP proporcional: 0 exercícios concluídos retorna 0 XP',
    calculateProportionalXp(200, 0, 5),
    0
  );

  assertEqual('Nível 1 com 0 XP', calculateLevel(0), 1);
  assertEqual('Nível 2 ao atingir 2000 XP', calculateLevel(2000), 2);
  assertEqual('Nível 3 ao atingir 4000 XP (Rank E)', calculateLevel(4000), 3);
  assertEqual('Nível 4 ao atingir 6250 XP', calculateLevel(6250), 4);
  assertEqual('Nível 5 ao atingir 8500 XP (Rank D)', calculateLevel(8500), 5);
  assertEqual(
    'Título Rank D ativado no Nível 5',
    getLevelProgress(8650).isMaster && getLevelProgress(8650).levelTitle === 'Rank D',
    true
  );

  assertEqual(
    'Streak: primeiro treino inicia em 1',
    calculateNextStreak(0, 0, null, '2026-11-14'),
    { currentStreak: 1, longestStreak: 1 }
  );
  assertEqual(
    'Streak: treino extra no mesmo dia mantém streak',
    calculateNextStreak(3, 5, '2026-11-14', '2026-11-14'),
    { currentStreak: 3, longestStreak: 5 }
  );
  assertEqual(
    'Streak: treino no dia seguinte aumenta streak (+1)',
    calculateNextStreak(3, 3, '2026-11-13', '2026-11-14'),
    { currentStreak: 4, longestStreak: 4 }
  );
  assertEqual(
    'Streak: gap > 1 dia reinicia para 0 e 1 após treino',
    getEffectiveCurrentStreak(6, '2026-11-11', '2026-11-14') === 0 &&
      calculateNextStreak(6, 6, '2026-11-11', '2026-11-14').currentStreak === 1,
    true
  );

  const mockStats: GameStats = {
    ...createInitialGameStats('test-uid'),
    totalXp: 8400,
    level: 4,
    currentStreak: 7,
    longestStreak: 7,
    lastWorkoutDate: '2026-11-14',
    totalWorkouts: 10,
    cardioWorkouts: 10,
    forcaWorkouts: 0,
  };
  const evalResult = evaluateAchievements(mockStats, {}, '2026-11-14T12:00:00Z');
  assertEqual(
    'Conquistas desbloqueadas + bônus XP',
    evalResult.newlyUnlocked.map((a) => a.id),
    ['first_blood', 'week_warrior', 'fat_burner', 'veteran']
  );

  assertEqual(
    'Recálculo de nível após bônus (8400 + 210 XP -> Nível 5)',
    calculateLevel(mockStats.totalXp + evalResult.bonusXpTotal),
    5
  );

  assertEqual(
    'Zonas cardíacas calculadas de stream BPM (Z2 + Z4)',
    computeZoneMinutesFromHrStream([125, 130, 160, 165], 40, 190),
    [0, 20, 0, 20, 0]
  );

  assertEqual(
    'Voto Diário cumprido concede +15 XP e recupera HP',
    applyVowCompletion(1990, 96, 15, 5),
    { newXp: 2005, newHp: 100, newLevel: 2 }
  );
  assertEqual(
    'Penalidade por mau hábito reduz XP com piso 0 e reduz HP',
    applyHabitPenalty(10, 80, 15, 15),
    { newXp: 0, newHp: 65, newLevel: 1 }
  );

  const refDate = new Date('2026-11-17T12:00:00');
  const flatLogs: WorkoutLog[] = [
    {
      id: 'l1',
      userId: 'u1',
      workoutId: 'w-calistenia-upper-a',
      workoutName: 'Calistenia Híbrida — Dia A: Superior',
      workoutType: 'forca',
      difficulty: 'Intermediário',
      completedExercises: 7,
      totalExercises: 7,
      durationMinutes: 45,
      xpEarned: 220,
      bonusXpEarned: 0,
      dateKey: '2026-11-16',
      completedAt: '2026-11-16T18:00:00Z',
    },
    {
      id: 'l2',
      userId: 'u1',
      workoutId: 'w-calistenia-lower-b',
      workoutName: 'Calistenia Híbrida — Dia B: Inferior',
      workoutType: 'forca',
      difficulty: 'Intermediário',
      completedExercises: 6,
      totalExercises: 6,
      durationMinutes: 42,
      xpEarned: 220,
      bonusXpEarned: 0,
      dateKey: '2026-11-14',
      completedAt: '2026-11-14T18:00:00Z',
    },
    {
      id: 'l3',
      userId: 'u1',
      workoutId: 'w-calistenia-upper-a',
      workoutName: 'Calistenia Híbrida — Dia A: Superior',
      workoutType: 'forca',
      difficulty: 'Intermediário',
      completedExercises: 7,
      totalExercises: 7,
      durationMinutes: 45,
      xpEarned: 220,
      bonusXpEarned: 0,
      dateKey: '2026-11-11',
      completedAt: '2026-11-11T18:00:00Z',
    },
  ];
  const progressingLogs: WorkoutLog[] = [
    { ...flatLogs[0], xpEarned: 240 },
    { ...flatLogs[1], workoutId: 'w-hiit-intermediario', xpEarned: 165 },
    { ...flatLogs[2], workoutId: 'w-cardio-iniciante', xpEarned: 110 },
  ];

  assertEqual(
    'Estagnação detectada quando últimas sessões mantêm XP plano',
    detectWorkoutStagnation(flatLogs, [...INITIAL_WORKOUTS], refDate).isStagnant,
    true
  );
  assertEqual(
    'Sem estagnação quando sessões apresentam progressão de XP',
    detectWorkoutStagnation(progressingLogs, [...INITIAL_WORKOUTS], refDate).isStagnant,
    false
  );

  assertEqual('Nível 12 atingido com 20500 XP', calculateLevel(20500), 12);
  assertEqual('Nível 20 atingido com 31500 XP', calculateLevel(31500), 20);

  const monarchGear: EquippedGear = {
    elmo: 'elmo_monarca',
    armadura: 'armadura_monarca',
    capa: 'capa_monarca',
    arma: 'arma_presas_monarca',
  };
  const monarchSummary = calculateGearBonusSummary(monarchGear);
  assertEqual(
    'Conjunto Monarca da Eternidade 4/4 soma peças + sinergia 4/4 (+83% XP, +77% Moedas, +101% Chefe)',
    {
      xp: monarchSummary.xpBonusPercent,
      coins: monarchSummary.coinBonusPercent,
      bossDmg: monarchSummary.bossDamageBonusPercent,
      dominant: monarchSummary.dominantRarity,
      auraMultiplier: monarchSummary.auraMultiplier,
    },
    {
      xp: 83,
      coins: 77,
      bossDmg: 101,
      dominant: 'Lendário',
      auraMultiplier: 2.0,
    }
  );

  assertEqual(
    'Migração automática traduz IDs e slots legados',
    migrateEquippedGear({
      helm: 'hm-monarch-crown',
      armor: 'ar-shadow-plate',
      cape: 'cp-abyssal-wings',
      weapon: 'wp-wooden-blade',
    }),
    {
      elmo: 'elmo_monarca',
      armadura: 'armadura_monarca',
      capa: 'capa_monarca',
      arma: 'arma_bastao_treino',
    }
  );

  assertEqual(
    'XP proporcional aplica bônus real do Arsenal (+83% sobre 100 = 183)',
    calculateProportionalXp(100, 4, 4, monarchSummary.xpBonusPercent),
    183
  );

  assertEqual(
    'Moedas de treino aplicam bônus real do Arsenal',
    calculateCoinsForWorkout(100, 4, 4, true, 50),
    80
  );

  const baseBoss = calculateWorkoutBossState(100, 3, 5, 600, 1200, 0);
  const boostedBoss = calculateWorkoutBossState(100, 3, 5, 600, 1200, 101);
  assertEqual(
    'Dano bônus do Arsenal acelera derrota do Chefe de Masmorra',
    boostedBoss.currentHp < baseBoss.currentHp && boostedBoss.bossDefeated,
    true
  );

  assertEqual(
    'Mundo Real: Nível 1 = Rank F, Nível 15 = Rank A, Nível 20 = Rank S',
    [
      getHunterRankForLevel(1, 0).current.rank,
      getHunterRankForLevel(15, 25000).current.rank,
      getHunterRankForLevel(20, 31500).current.rank,
    ],
    ['F', 'A', 'S']
  );

  const starterMurim = getMurimRealmProgress(createInitialGameStats('u-murim-0'), '2026-11-14');
  const peakMurim = getMurimRealmProgress(
    {
      ...createInitialGameStats('u-murim-peak'),
      totalWorkouts: 60,
      bossesDefeated: 48,
      longestStreak: 14,
      currentStreak: 4,
      lastWorkoutDate: '2026-11-14',
      totalMinutes: 2400,
    },
    '2026-11-14'
  );
  const apexMurim = getMurimRealmProgress(
    {
      ...createInitialGameStats('u-murim-apex'),
      totalWorkouts: 160,
      bossesDefeated: 120,
      longestStreak: 60,
      currentStreak: 30,
      lastWorkoutDate: '2026-11-14',
      totalMinutes: 6400,
    },
    '2026-11-14'
  );

  assertEqual(
    'Murim: 0 Qi = 3ª Classe; 4150 Qi = Pico (Qi da Espada); 11240+ Qi = Vida e Morte',
    [starterMurim.current.id, peakMurim.current.id, apexMurim.current.id],
    ['third_rate', 'peak', 'life_and_death']
  );

  const rarityCounts = {
    Comum: EQUIPMENT_CATALOG.filter((i) => i.rarity === 'Comum').length,
    Raro: EQUIPMENT_CATALOG.filter((i) => i.rarity === 'Raro').length,
    Épico: EQUIPMENT_CATALOG.filter((i) => i.rarity === 'Épico').length,
    Lendário: EQUIPMENT_CATALOG.filter((i) => i.rarity === 'Lendário').length,
  };
  const slotCounts = {
    elmo: EQUIPMENT_CATALOG.filter((i) => i.slot === 'elmo').length,
    armadura: EQUIPMENT_CATALOG.filter((i) => i.slot === 'armadura').length,
    capa: EQUIPMENT_CATALOG.filter((i) => i.slot === 'capa').length,
    arma: EQUIPMENT_CATALOG.filter((i) => i.slot === 'arma').length,
  };
  assertEqual(
    'Arsenal possui 52 itens: 13 de cada raridade e 13 de cada slot',
    { total: EQUIPMENT_CATALOG.length, rarityCounts, slotCounts },
    {
      total: 52,
      rarityCounts: { Comum: 13, Raro: 13, Épico: 13, Lendário: 13 },
      slotCounts: { elmo: 13, armadura: 13, capa: 13, arma: 13 },
    }
  );

  const rankBItem = EQUIPMENT_CATALOG.find((i) => i.id === 'capa_elite_rank_b')!;
  const murimPeakItem = EQUIPMENT_CATALOG.find((i) => i.id === 'elmo_mascara_pico')!;
  const nonStarterDualReqCount = EQUIPMENT_CATALOG.filter(
    (i) =>
      i.requirement.tipo === 'rank_cacador' || i.requirement.tipo === 'reino_murim'
  ).length;
  assertEqual(
    'Todos os 50 itens desbloqueáveis usam requisitos de Rank de Caçador (F-S) ou Reino de Murim',
    nonStarterDualReqCount,
    50
  );
  assertEqual(
    'Requisitos duais: Rank B bloqueia Nv.1 e libera Nv.11; Pico bloqueia 0 Qi e libera 4150 Qi',
    [
      isEquipmentMilestoneUnlocked(rankBItem, createInitialGameStats('u-lock')),
      isEquipmentMilestoneUnlocked(rankBItem, {
        ...createInitialGameStats('u-rank-b'),
        totalXp: 19000,
        level: 11,
      }),
      isEquipmentMilestoneUnlocked(murimPeakItem, createInitialGameStats('u-murim-0')),
      isEquipmentMilestoneUnlocked(murimPeakItem, {
        ...createInitialGameStats('u-murim-peak'),
        totalWorkouts: 60,
        bossesDefeated: 48,
        longestStreak: 14,
        currentStreak: 4,
        lastWorkoutDate: '2026-11-14',
        totalMinutes: 2400,
      }),
    ],
    [false, true, false, true]
  );

  return results;
}
