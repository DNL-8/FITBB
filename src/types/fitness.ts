export type HeroClass = 'Guerreiro' | 'Arqueiro' | 'Mago';
export type HeroObjective = 'Emagrecer' | 'Condicionamento' | 'Ambos';
export type HeroExperience = 'Iniciante' | 'Intermediário' | 'Avançado';

export type WorkoutType =
  | 'cardio'
  | 'forca'
  | 'hiit'
  | 'core'
  | 'mobilidade'
  | 'corpo_inteiro';

export type AchievementId =
  | 'first_blood'
  | 'week_warrior'
  | 'month_master'
  | 'fat_burner'
  | 'iron_will'
  | 'veteran'
  | 'elite'
  | 'legendary'
  | 'first_pr'
  | 'pr_collector_10'
  | 'weekly_raid_clear';

export type NavTab = 'inicio' | 'painel' | 'treinar' | 'arsenal' | 'progresso' | 'coach' | 'api' | 'perfil';

export type HunterRankLetter = 'F' | 'E' | 'D' | 'C' | 'B' | 'A' | 'S';

export interface HunterRankDefinition {
  rank: HunterRankLetter;
  label: string;
  minLevel: number;
  maxLevel: number;
  description: string;
  accentHex: string;
}

export type MurimRealmId =
  | 'third_rate'
  | 'second_rate'
  | 'first_rate'
  | 'peak'
  | 'supreme_peak'
  | 'unrestrained'
  | 'profound'
  | 'life_and_death';

export interface MurimRealmDefinition {
  id: MurimRealmId;
  order: number;
  name: string;
  englishName: string;
  minQi: number;
  qiTechnique: string;
  description: string;
  accentHex: string;
}

export interface HunterRankProgress {
  current: HunterRankDefinition;
  next: HunterRankDefinition | null;
  level: number;
  isMaxRank: boolean;
  levelsNeededForNext: number;
  xpNeededForNextRank: number;
  estimatedDaysToNextRank: number;
  progressPercent: number;
}

export interface MurimRealmProgress {
  qiPoints: number;
  current: MurimRealmDefinition;
  next: MurimRealmDefinition | null;
  qiIntoRealm: number;
  qiNeededForNext: number;
  estimatedDaysToNextRealm: number;
  progressPercent: number;
  isMaxRealm: boolean;
  breakdown: {
    fromWorkouts: number;
    fromBosses: number;
    fromStreak: number;
    fromMinutes: number;
    fromXp?: number;
  };
}

export type EquipmentSlot = 'elmo' | 'armadura' | 'capa' | 'arma';
export type EquipmentRarity = 'Comum' | 'Raro' | 'Épico' | 'Lendário';
export type EquipmentRarityKey = 'comum' | 'raro' | 'epico' | 'lendario';
export type EquipmentSetId =
  | 'presa_carmesim'
  | 'manto_mercador'
  | 'sabio_abissal'
  | 'monarca_eternidade'
  | 'familia_jin'
  | 'seita_rei_fogo'
  | 'associacao_cacadores'
  | 'espada_invisivel'
  | 'viajante'
  | 'guarda_aco';

export type EquipmentRequirementType =
  | 'inicial'
  | 'moedas_acumuladas'
  | 'streak_dias'
  | 'chefes_derrotados'
  | 'nivel'
  | 'treinos_concluidos'
  | 'rank_cacador'
  | 'reino_murim';

export interface EquipmentRequirement {
  tipo: EquipmentRequirementType;
  valor: number;
}

export type EquipmentIconName =
  | 'Crown'
  | 'Eye'
  | 'Sparkles'
  | 'Flame'
  | 'Shield'
  | 'ShieldAlert'
  | 'Coins'
  | 'ShieldCheck'
  | 'Wind'
  | 'BookOpen'
  | 'Gem'
  | 'Feather'
  | 'Ghost'
  | 'Sword'
  | 'Swords'
  | 'Wand2'
  | 'Zap';

export interface EquippedGear {
  elmo: string | null;
  armadura: string | null;
  capa: string | null;
  arma: string | null;
}

export interface EquipmentSetBonus {
  xpBonusPercent: number;
  coinBonusPercent: number;
  bossDamageBonusPercent: number;
  label: string;
}

export interface EquipmentSetDefinition {
  id: EquipmentSetId;
  name: string;
  themeColorHex: string;
  description: string;
  twoPieceBonus: EquipmentSetBonus;
  fourPieceBonus?: EquipmentSetBonus;
}

export interface GearLoadoutPreset {
  id: string;
  name: string;
  gear: EquippedGear;
  isExample?: boolean;
}

export interface GearActiveSetStatus {
  set: EquipmentSetDefinition;
  equippedCount: number;
  twoPieceActive: boolean;
  fourPieceActive: boolean;
}

export interface GearBonusSummary {
  xpBonusPercent: number;
  coinBonusPercent: number;
  bossDamageBonusPercent: number;
  totalPowerScore: number;
  dominantRarity: EquipmentRarity;
  dominantRarityKey: EquipmentRarityKey;
  auraMultiplier: number;
  activeSets: GearActiveSetStatus[];
}

export interface EquipmentItem {
  id: string;
  slot: EquipmentSlot;
  name: string;
  rarity: EquipmentRarity;
  rarityKey: EquipmentRarityKey;
  auraMultiplier: number;
  iconName: EquipmentIconName;
  priceCoins: number;
  requirement: EquipmentRequirement;
  unlockRequirementLabel: string;
  description: string;
  accentHex: string;
  secondaryHex: string;
  powerBonusLabel: string;
  xpBonusPercent: number;
  coinBonusPercent: number;
  bossDamageBonusPercent: number;
  powerScore: number;
  setId: EquipmentSetId | null;
}

export type AutoQuestId = 'steps_6000' | 'workout_today' | 'weight_today';
export type WeeklyAutoQuestId =
  | 'weekly_workouts_3'
  | 'weekly_volume_4000'
  | 'weekly_pr_1';
export type AnyAutoQuestId = AutoQuestId | WeeklyAutoQuestId;

export interface AutoQuestEvaluation {
  id: AutoQuestId;
  title: string;
  subtitle: string;
  xpReward: number;
  coinsReward: number;
  progressText: string;
  progressPercent: number;
  isFulfilled: boolean;
  isClaimedToday: boolean;
}

export interface WeeklyAutoQuestEvaluation {
  id: WeeklyAutoQuestId;
  weekKey: string;
  title: string;
  subtitle: string;
  xpReward: number;
  coinsReward: number;
  raidDamage: number;
  progressText: string;
  progressPercent: number;
  isFulfilled: boolean;
  isClaimedThisWeek: boolean;
}

export interface WeeklyRaidBossState {
  weekKey: string;
  bossName: string;
  bossSubtitle: string;
  variant: 'golem' | 'hydra' | 'sentinel' | 'dragon';
  maxHp: number;
  currentHp: number;
  damageDealt: number;
  hpPercent: number;
  isDefeated: boolean;
  workoutsThisWeek: number;
  weeklyVolumeKg: number;
  weeklyPrCount: number;
}

export type HealthSource = 'strava' | 'apple_health' | 'samsung_health' | 'gpx' | 'csv' | 'health_connect';
export type ReportPeriod = 7 | 28 | 90;
export type ReportSourceFilter = 'all' | 'strava' | 'samsung_health' | 'health_connect' | 'files' | 'rpg';

export interface UserRecord {
  userId: string;
  email: string | null;
  displayName: string;
  createdAt: string;
  lastLoginAt: string;
}

export interface HeroProfile {
  userId: string;
  name: string;
  avatar: string;
  heroClass: HeroClass;
  objective: HeroObjective;
  experience: HeroExperience;
  heightCm?: number | null;
  weightKg?: number | null;
  restingHrBaseline?: number;
  maxHrEstimated?: number;
  createdAt: string;
  updatedAt: string;
}

export interface GameStats {
  userId: string;
  totalXp: number;
  level: number;
  hunterHp?: number;
  goldCoins?: number;
  totalCoinsEarned?: number;
  bossesDefeated?: number;
  ownedEquipmentIds?: string[];
  equippedGear?: EquippedGear;
  gearLoadouts?: GearLoadoutPreset[];
  claimedAutoQuestKeys?: string[];
  currentStreak: number;
  longestStreak: number;
  lastWorkoutDate: string | null;
  totalWorkouts: number;
  totalMinutes: number;
  cardioWorkouts: number;
  forcaWorkouts: number;
  hiitWorkouts: number;
  coreWorkouts: number;
  mobilidadeWorkouts: number;
  corpoInteiroWorkouts: number;
  updatedAt: string;
}

export interface ExerciseItem {
  id: string;
  name: string;
  prescription: string;
  restSeconds: number;
  muscleGroups: string[];
  executionTip: string;
  equipment?: string;
  loadKg?: number;
  loadNote?: string;
  unilateral?: boolean;
}

export interface WeeklyScheduleDay {
  dayIndex: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  dayName: string;
  shortDay: string;
  sessionCode: 'A1' | 'B1' | 'A2' | 'B2' | 'DESCANSO';
  focus: string;
  shortFocus?: string;
  workoutId: string | null;
}

export interface TrainingProgram {
  id: string;
  name: string;
  shortLabel: string;
  rankLabel: HunterRankLetter;
  baseXpPerSession: number;
  weeklyFrequency: number;
  equipments: readonly string[];
  workoutAId: string;
  workoutBId: string;
  trainAButtonLabel: string;
  trainBButtonLabel: string;
  weeklySchedule: readonly WeeklyScheduleDay[];
}

export interface ExerciseInsight {
  primaryFocus: string;
  activationCues: string[];
  xpPerExercise: number;
  bossDamagePercent: number;
  xpStrategyTip: string;
}

export interface WorkoutTemplate {
  id: string;
  userId?: string;
  name: string;
  description: string;
  type: WorkoutType;
  difficulty: HeroExperience;
  durationMinutes: number;
  baseXp: number;
  rank: HunterRankLetter;
  exercises: ExerciseItem[];
}

export interface PerformedSetEntry {
  setIndex: number;
  weightKg: number;
  reps: number;
  completed: boolean;
  isPr?: boolean;
}

export interface PerformedExerciseRecord {
  exerciseId: string;
  exerciseName: string;
  sets: PerformedSetEntry[];
  volumeKg: number;
  hasPr: boolean;
  bestWeightKg: number;
  bestSetVolumeKg: number;
  bestEstimated1RmKg: number;
}

export interface ExercisePrRecord {
  id: string;
  userId: string;
  exerciseId: string;
  exerciseName: string;
  bestWeightKg: number;
  bestReps: number;
  bestVolumeKg: number;
  estimated1RmKg: number;
  updatedAt: string;
  workoutLogId: string;
  dateKey: string;
}

export interface WorkoutLog {
  id: string;
  userId: string;
  workoutId: string;
  workoutName: string;
  workoutType: WorkoutType;
  difficulty: HeroExperience;
  completedExercises: number;
  totalExercises: number;
  durationMinutes: number;
  xpEarned: number;
  bonusXpEarned: number;
  performedExercises?: PerformedExerciseRecord[];
  totalVolumeKg?: number;
  prCount?: number;
  dateKey: string;
  completedAt: string;
}

export interface AchievementDefinition {
  id: AchievementId;
  title: string;
  description: string;
  icon: string;
  bonusXp: number;
  targetValue: number;
  metricLabel: string;
}

export interface UserAchievement {
  id: AchievementId;
  userId: string;
  unlocked: boolean;
  unlockedAt: string | null;
}

export interface ChatMessage {
  id: string;
  userId: string;
  role: 'user' | 'oracle';
  content: string;
  createdAt: string;
}

export interface DailyVow {
  id: string;
  userId: string;
  title: string;
  xpReward: number;
  penaltyXp: number;
  completedDateKey: string | null;
  violatedDateKey: string | null;
  createdAt: string;
}

export interface HealthActivity {
  id: string;
  userId: string;
  externalId: string;
  source: HealthSource;
  title: string;
  sportType: string;
  dateKey: string;
  startedAt: string;
  durationMinutes: number;
  distanceKm: number;
  calories: number;
  elevationGainM: number;
  avgHeartRate: number | null;
  maxHeartRate: number | null;
  zoneMinutes: [number, number, number, number, number];
  hrSamplePoints: number[];
  xpAwarded: number;
  createdAt: string;
}

export interface DailyHealthMetric {
  id: string;
  userId: string;
  dateKey: string;
  steps: number;
  activeCalories: number;
  sleepHours: number;
  restingHeartRate: number | null;
  hrvMs: number | null;
  trainingLoadScore: number;
  recoveryScore: number;
  sources: string[];
  updatedAt: string;
}

export interface WeightLog {
  id: string;
  userId: string;
  weightKg: number;
  dateKey: string;
  note?: string | null;
  recordedAt: string;
  updatedAt: string;
}

export interface ParsedHealthImport {
  activities: Omit<HealthActivity, 'userId'>[];
  dailyMetrics: Omit<DailyHealthMetric, 'userId'>[];
  warnings: string[];
  sourceLabel: string;
}

export interface HealthImportProgress {
  phase: 'activities' | 'metrics' | 'done';
  processedActivities: number;
  totalActivities: number;
  processedMetrics: number;
  totalMetrics: number;
  importedActivities: number;
  skippedDuplicates: number;
  errorCount: number;
  xpAdded: number;
  currentLabel: string;
}

export interface HealthImportBatchResult {
  importedActivities: number;
  skippedDuplicates: number;
  errorCount: number;
  importedDays: number;
  xpAdded: number;
  truncatedOverLimit: boolean;
  totalOriginalActivities: number;
  completedExternalIds: string[];
  completedMetricDates: string[];
  failedActivities: Array<{
    activity: Omit<HealthActivity, 'userId'>;
    error: string;
  }>;
  failedMetrics: Array<{
    metric: Omit<DailyHealthMetric, 'userId'>;
    error: string;
  }>;
  lastError: string | null;
}

export interface StravaAthleteSummary {
  id: number;
  firstname: string;
  lastname: string;
  profile?: string;
  city?: string;
  country?: string;
}

export interface HrZoneSummary {
  zone: 1 | 2 | 3 | 4 | 5;
  label: string;
  rangeLabel: string;
  minutes: number;
  percentage: number;
  colorClass: string;
  barHex: string;
  benefit: string;
}

export interface WeeklyTrendPoint {
  weekLabel: string;
  startDateKey: string;
  totalMinutes: number;
  distanceKm: number;
  stepsAvg: number;
  calories: number;
  sessionsCount: number;
  xpEarned: number;
  totalVolumeKg?: number;
}

export interface RecoveryAssessment {
  score: number;
  statusLabel: 'Ótima' | 'Moderada' | 'Atenção' | 'Sobrecarga';
  acwrRatio: number;
  acuteLoad7d: number;
  chronicWeeklyAvg28d: number;
  avgSleepHours: number | null;
  latestRestingHr: number | null;
  avgHrvMs: number | null;
  recommendation: string;
}

export interface SessionRewardSummary {
  workoutName: string;
  xpFromWorkout: number;
  baseXpFromWorkout?: number;
  gearXpBonus?: number;
  gearBonusPercentXp?: number;
  bonusXp: number;
  totalXpGained: number;
  coinsEarned?: number;
  baseCoinsEarned?: number;
  gearCoinsBonus?: number;
  gearBonusPercentCoins?: number;
  bossName?: string;
  bossDefeated?: boolean;
  totalVolumeKg?: number;
  prCount?: number;
  prXpBonus?: number;
  prCoinsBonus?: number;
  prExerciseNames?: string[];
  criticalHitsCount?: number;
  offlineQueued?: boolean;
  previousLevel: number;
  newLevel: number;
  leveledUp: boolean;
  isNowMaster: boolean;
  unlockedAchievements: AchievementDefinition[];
  completedExercises: number;
  totalExercises: number;
  durationMinutes: number;
}

export type StagnationSignalKind =
  | 'none'
  | 'repeated_incomplete'
  | 'stalled_xp'
  | 'frequency_drop';

export interface StagnationCandidateExercise {
  exerciseId: string;
  name: string;
  equipment?: string;
  currentLoadKg: number;
  prescription: string;
  unilateral?: boolean;
  loadNote?: string;
}

export interface StagnationCandidateWorkout {
  workoutId: string;
  workoutName: string;
  recentCount: number;
  avgCompletionPercent: number;
  exercises: StagnationCandidateExercise[];
}

export interface StagnationAssessment {
  isStagnant: boolean;
  signalKind: StagnationSignalKind;
  reason: string;
  recentSessionsCount: number;
  avgCompletionPercent: number;
  daysSinceLastSession: number | null;
  candidateWorkouts: StagnationCandidateWorkout[];
}

export interface OracleLoadSuggestionItem {
  workoutId: string;
  workoutName: string;
  exerciseId: string;
  exerciseName: string;
  currentLoadKg: number;
  suggestedLoadKg: number;
  deltaKg: number;
  rationale: string;
}

export interface OracleLoadAdjustmentResponse {
  analysisSummary: string;
  strategyLabel: string;
  recommendations: OracleLoadSuggestionItem[];
}

export interface TestCaseResult {
  name: string;
  passed: boolean;
  details: string;
}

