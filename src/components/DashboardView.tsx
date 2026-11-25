import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Barbell,
  CalendarBlank,
  Check,
  CheckCircle,
  Clock,
  Coins,
  Compass,
  Crown,
  Fire,
  Heart,
  HeartBreak,
  Heartbeat,
  Lightning,
  Play,
  Plus,
  Scroll,
  SealCheck,
  Shield,
  Skull,
  Sword,
  Trash,
  Trophy,
  X,
} from '@phosphor-icons/react';
import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import {
  AutoQuestEvaluation,
  DailyHealthMetric,
  DailyVow,
  GameStats,
  HealthActivity,
  HeroProfile,
  NavTab,
  WeeklyAutoQuestEvaluation,
  WeightLog,
  WorkoutLog,
  WorkoutTemplate,
  WorkoutType,
} from '../types/fitness';
import {
  WORKOUT_TYPE_LABELS,
  computeRecoveryAssessment,
  evaluateDailyAutoQuests,
  evaluateWeeklyAutoQuests,
  getCurrentWeekScheduleDates,
  getDualProgressionStatus,
  getEffectiveCurrentStreak,
  getFriendlyErrorMessage,
  getHunterRankOrder,
  getLocalDateKey,
  getRecommendedProgramForHero,
  getTodayScheduleEntry,
  getWeeklyRaidBossState,
  normalizeGameStats,
  normalizeHunterRank,
  resolveWorkoutForSchedule,
} from '../utils/rpgLogic';
import {
  ErrorBanner,
  HeroGlyph,
  WorkoutTypeGlyph,
  XpProgressBar,
} from './HudPrimitives';
import { DungeonBossSprite, ShadowKnightSprite } from './ShadowKnightSprite';
import { WeightTrackerCard } from './WeightTrackerCard';

interface CelebrationPayload {
  id: number;
  xpGained: number;
  fromXp: number;
  toXp: number;
  fromLevel: number;
  toLevel: number;
  isLevelUp: boolean;
}

const CELEBRATION_SPARKS = [
  { x: -34, y: -28, rotate: -35, size: 'w-2 h-2', color: 'bg-orange-400', delay: 0 },
  { x: 38, y: -32, rotate: 45, size: 'w-2 h-2', color: 'bg-[#10B981]', delay: 0.04 },
  { x: -46, y: 6, rotate: 20, size: 'w-1.5 h-1.5', color: 'bg-emerald-300', delay: 0.06 },
  { x: 48, y: 10, rotate: -25, size: 'w-2 h-2', color: 'bg-orange-300', delay: 0.08 },
  { x: -24, y: 36, rotate: 60, size: 'w-1.5 h-1.5', color: 'bg-zinc-200', delay: 0.05 },
  { x: 28, y: 34, rotate: -50, size: 'w-1.5 h-1.5', color: 'bg-orange-500', delay: 0.09 },
  { x: 0, y: -42, rotate: 15, size: 'w-2 h-2', color: 'bg-emerald-400', delay: 0.03 },
  { x: 64, y: -12, rotate: 40, size: 'w-1.5 h-1.5', color: 'bg-orange-300', delay: 0.1 },
] as const;

interface DashboardViewProps {
  hero: HeroProfile;
  stats: GameStats;
  workouts: WorkoutTemplate[];
  logs: WorkoutLog[];
  healthActivities: HealthActivity[];
  dailyMetrics: DailyHealthMetric[];
  dailyVows: DailyVow[];
  weightLogs: WeightLog[];
  previousXp?: number;
  previousLevel?: number;
  onAcknowledgeProgress?: (totalXp: number, level: number) => void;
  onStartWorkout: (workout: WorkoutTemplate) => void;
  onNavigate: (tab: NavTab) => void;
  onCreateVow: (title: string) => Promise<void>;
  onCompleteVow: (vow: DailyVow) => Promise<void>;
  onViolateVow: (vow: DailyVow) => Promise<void>;
  onDeleteVow: (vowId: string) => Promise<void>;
  onClaimAutoQuest: (
    quest: AutoQuestEvaluation | WeeklyAutoQuestEvaluation,
    dateKey: string
  ) => Promise<void>;
  onSaveWeight: (weightKg: number, dateKey: string, note?: string | null) => Promise<void>;
  onDeleteWeight: (logId: string) => Promise<void>;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  hero,
  stats,
  workouts,
  logs,
  healthActivities,
  dailyMetrics,
  dailyVows,
  weightLogs,
  previousXp,
  previousLevel,
  onAcknowledgeProgress,
  onStartWorkout,
  onNavigate,
  onCreateVow,
  onCompleteVow,
  onViolateVow,
  onDeleteVow,
  onClaimAutoQuest,
  onSaveWeight,
  onDeleteWeight,
}) => {
  const todayKey = getLocalDateKey();
  const normalizedStats = useMemo(() => normalizeGameStats(stats), [stats]);

  const [newVowTitle, setNewVowTitle] = useState<string>('');
  const [vowBusyId, setVowBusyId] = useState<string | null>(null);
  const [penaltyTargetVow, setPenaltyTargetVow] = useState<DailyVow | null>(null);
  const [vowFeedback, setVowFeedback] = useState<string | null>(null);
  const [vowError, setVowError] = useState<string | null>(null);
  const [celebration, setCelebration] = useState<CelebrationPayload | null>(null);
  const autoClaimingRef = useRef<Set<string>>(new Set());

  const localBaselineRef = useRef<{ xp: number; level: number }>({
    xp: previousXp ?? normalizedStats.totalXp,
    level: previousLevel ?? normalizedStats.level,
  });

  useEffect(() => {
    const baselineXp = previousXp ?? localBaselineRef.current.xp;
    const baselineLevel = previousLevel ?? localBaselineRef.current.level;

    if (normalizedStats.totalXp > baselineXp || normalizedStats.level > baselineLevel) {
      const xpGained = Math.max(0, normalizedStats.totalXp - baselineXp);
      const isLevelUp = normalizedStats.level > baselineLevel;
      setCelebration({
        id: Date.now(),
        xpGained,
        fromXp: baselineXp,
        toXp: normalizedStats.totalXp,
        fromLevel: baselineLevel,
        toLevel: normalizedStats.level,
        isLevelUp,
      });
      localBaselineRef.current = {
        xp: normalizedStats.totalXp,
        level: normalizedStats.level,
      };
      onAcknowledgeProgress?.(normalizedStats.totalXp, normalizedStats.level);
    } else if (
      normalizedStats.totalXp < baselineXp ||
      normalizedStats.level < baselineLevel
    ) {
      localBaselineRef.current = {
        xp: normalizedStats.totalXp,
        level: normalizedStats.level,
      };
    }
  }, [
    normalizedStats.totalXp,
    normalizedStats.level,
    previousXp,
    previousLevel,
    onAcknowledgeProgress,
  ]);

  useEffect(() => {
    if (!celebration) return undefined;
    const timer = window.setTimeout(
      () => setCelebration(null),
      celebration.isLevelUp ? 5000 : 3400
    );
    return () => window.clearTimeout(timer);
  }, [celebration]);

  const effectiveStreak = getEffectiveCurrentStreak(
    normalizedStats.currentStreak,
    normalizedStats.lastWorkoutDate,
    todayKey
  );
  const dualProgression = useMemo(
    () => getDualProgressionStatus(normalizedStats, todayKey),
    [normalizedStats, todayKey]
  );
  const hunterAccentHex = dualProgression.hunter.current.accentHex;
  const murimAccentHex = dualProgression.murim.current.accentHex;
  const currentHp = normalizedStats.hunterHp ?? 100;
  const hunterLicenseCode = `SYS-${hero.userId.slice(0, 6).toUpperCase()}`;

  const recovery = useMemo(
    () =>
      computeRecoveryAssessment(
        logs,
        healthActivities,
        dailyMetrics,
        normalizedStats,
        hero.restingHrBaseline ?? 60
      ),
    [logs, healthActivities, dailyMetrics, normalizedStats, hero.restingHrBaseline]
  );

  const todayMetric = useMemo(
    () => dailyMetrics.find((m) => m.dateKey === todayKey) ?? null,
    [dailyMetrics, todayKey]
  );

  const autoQuests = useMemo(
    () =>
      evaluateDailyAutoQuests(
        todayKey,
        todayMetric,
        logs,
        healthActivities,
        weightLogs,
        normalizedStats.claimedAutoQuestKeys
      ),
    [
      todayKey,
      todayMetric,
      logs,
      healthActivities,
      weightLogs,
      normalizedStats.claimedAutoQuestKeys,
    ]
  );

  const weeklyAutoQuests = useMemo(
    () =>
      evaluateWeeklyAutoQuests(
        todayKey,
        logs,
        healthActivities,
        normalizedStats.claimedAutoQuestKeys
      ),
    [todayKey, logs, healthActivities, normalizedStats.claimedAutoQuestKeys]
  );

  const weeklyRaidBoss = useMemo(
    () => getWeeklyRaidBossState(todayKey, logs, healthActivities),
    [todayKey, logs, healthActivities]
  );

  // Auto-check automático ao detectar metas reais cumpridas hoje ou na semana (idempotente via claimedAutoQuestKeys)
  useEffect(() => {
    for (const q of autoQuests) {
      const claimKey = `${todayKey}:${q.id}`;
      if (q.isFulfilled && !q.isClaimedToday && !autoClaimingRef.current.has(claimKey)) {
        autoClaimingRef.current.add(claimKey);
        void onClaimAutoQuest(q, todayKey)
          .then(() => {
            setVowFeedback(
              `Auto-check concluído: "${q.title}" (+${q.xpReward} XP e +${q.coinsReward} Moedas).`
            );
          })
          .catch((err: unknown) => {
            autoClaimingRef.current.delete(claimKey);
            setVowError(getFriendlyErrorMessage(err));
          });
      }
    }

    for (const wq of weeklyAutoQuests) {
      const claimKey = `${wq.weekKey}:${wq.id}`;
      if (wq.isFulfilled && !wq.isClaimedThisWeek && !autoClaimingRef.current.has(claimKey)) {
        autoClaimingRef.current.add(claimKey);
        void onClaimAutoQuest(wq, todayKey)
          .then(() => {
            setVowFeedback(
              `Meta semanal concluída: "${wq.title}" (+${wq.xpReward} XP e +${wq.coinsReward} Moedas).`
            );
          })
          .catch((err: unknown) => {
            autoClaimingRef.current.delete(claimKey);
            setVowError(getFriendlyErrorMessage(err));
          });
      }
    }
  }, [autoQuests, weeklyAutoQuests, todayKey, onClaimAutoQuest]);

  const totalQuestsCount = autoQuests.length + dailyVows.length;
  const completedQuestsCount =
    autoQuests.filter((q) => q.isFulfilled).length +
    dailyVows.filter((v) => v.completedDateKey === todayKey).length;
  const remainingQuestsCount = Math.max(0, totalQuestsCount - completedQuestsCount);
  const remainingXpToday =
    autoQuests
      .filter((q) => !q.isFulfilled)
      .reduce((acc, q) => acc + q.xpReward, 0) +
    dailyVows
      .filter((v) => v.completedDateKey !== todayKey && v.violatedDateKey !== todayKey)
      .reduce((acc, v) => acc + v.xpReward, 0);

  const handleAddVowSubmit = async (e: React.FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    const trimmed = newVowTitle.trim();
    if (trimmed.length < 3) return;
    setVowBusyId('creating');
    setVowFeedback(null);
    setVowError(null);
    try {
      await onCreateVow(trimmed);
      setNewVowTitle('');
    } catch (err: unknown) {
      setVowError(getFriendlyErrorMessage(err));
    } finally {
      setVowBusyId(null);
    }
  };

  const handleFulfillVow = async (vow: DailyVow): Promise<void> => {
    if (vow.completedDateKey === todayKey || vow.violatedDateKey === todayKey) return;
    setVowBusyId(vow.id);
    setVowFeedback(null);
    setVowError(null);
    try {
      await onCompleteVow(vow);
      setVowFeedback(
        `Missão "${vow.title}" cumprida! +${vow.xpReward} XP, +10 Moedas e +5 HP.`
      );
    } catch (err: unknown) {
      setVowError(getFriendlyErrorMessage(err));
    } finally {
      setVowBusyId(null);
    }
  };

  const handleConfirmPenalty = async (): Promise<void> => {
    if (!penaltyTargetVow) return;
    const target = penaltyTargetVow;
    setVowBusyId(target.id);
    setPenaltyTargetVow(null);
    setVowFeedback(null);
    setVowError(null);
    try {
      await onViolateVow(target);
      setVowFeedback(
        `Penalidade aplicada por quebra de missão: -${target.penaltyXp} XP e -15 HP.`
      );
    } catch (err: unknown) {
      setVowError(getFriendlyErrorMessage(err));
    } finally {
      setVowBusyId(null);
    }
  };

  const handleRemoveVow = async (vowId: string): Promise<void> => {
    setVowBusyId(vowId);
    setVowError(null);
    try {
      await onDeleteVow(vowId);
    } catch (err: unknown) {
      setVowError(getFriendlyErrorMessage(err));
    } finally {
      setVowBusyId(null);
    }
  };

  const recommendedProgram = useMemo(
    () => getRecommendedProgramForHero(hero, normalizedStats),
    [hero, normalizedStats]
  );
  const todaySchedule = useMemo(
    () => getTodayScheduleEntry(new Date(), recommendedProgram),
    [todayKey, recommendedProgram]
  );
  const scheduledWorkoutToday = useMemo(
    () => resolveWorkoutForSchedule(todaySchedule, workouts),
    [todaySchedule, workouts]
  );
  const currentWeekDates = useMemo(() => getCurrentWeekScheduleDates(), [todayKey]);
  const programWorkoutA = useMemo(
    () => workouts.find((w) => w.id === recommendedProgram.workoutAId) ?? null,
    [workouts, recommendedProgram.workoutAId]
  );
  const programWorkoutB = useMemo(
    () => workouts.find((w) => w.id === recommendedProgram.workoutBId) ?? null,
    [workouts, recommendedProgram.workoutBId]
  );

  const dailyMission = useMemo<WorkoutTemplate>(() => {
    if (scheduledWorkoutToday) {
      return scheduledWorkoutToday;
    }

    const heroRank = dualProgression.hunter.current.rank;
    const preferredTypes: WorkoutType[] =
      hero.objective === 'Emagrecer'
        ? ['cardio', 'hiit', 'corpo_inteiro']
        : hero.objective === 'Condicionamento'
        ? ['forca', 'core', 'mobilidade']
        : ['corpo_inteiro', 'hiit', 'forca', 'cardio'];

    const rankAndTypeMatch = workouts.find(
      (w) =>
        normalizeHunterRank(w.rank, 'F') === heroRank &&
        preferredTypes.includes(w.type) &&
        w.difficulty === hero.experience
    );
    if (rankAndTypeMatch) return rankAndTypeMatch;

    const exactMatch = workouts.find(
      (w) => preferredTypes.includes(w.type) && w.difficulty === hero.experience
    );
    if (exactMatch) return exactMatch;

    const sortedByRankDistance = [...workouts].sort(
      (a, b) =>
        Math.abs(getHunterRankOrder(a.rank) - getHunterRankOrder(heroRank)) -
        Math.abs(getHunterRankOrder(b.rank) - getHunterRankOrder(heroRank))
    );
    const typeMatch = sortedByRankDistance.find((w) => preferredTypes.includes(w.type));
    return typeMatch ?? sortedByRankDistance[0] ?? workouts[0];
  }, [
    scheduledWorkoutToday,
    dualProgression.hunter.current.rank,
    hero.objective,
    hero.experience,
    workouts,
  ]);

  const last7DaysActivity = useMemo(() => {
    const weekdayShort = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
    const days: Array<{
      dateKey: string;
      weekdayLabel: string;
      dayNumber: string;
      count: number;
      isToday: boolean;
    }> = [];

    const now = new Date();
    for (let offset = 6; offset >= 0; offset--) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - offset);
      const key = getLocalDateKey(d);
      const count =
        logs.filter((log) => log.dateKey === key).length +
        healthActivities.filter((a) => a.dateKey === key).length;
      days.push({
        dateKey: key,
        weekdayLabel: weekdayShort[d.getDay()],
        dayNumber: String(d.getDate()).padStart(2, '0'),
        count,
        isToday: offset === 0,
      });
    }
    return days;
  }, [logs, healthActivities]);

  const trainedToday =
    logs.some((l) => l.dateKey === todayKey) ||
    healthActivities.some((a) => a.dateKey === todayKey);

  return (
    <MotionConfig reducedMotion="user">
      <div className="space-y-5">
        {/* Bento Superior Assimétrico: 8 colunas Sistema do Caçador + 4 colunas Telemetria */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
          <motion.section
            animate={
              celebration?.isLevelUp ? { scale: [1, 1.004, 1] } : { scale: 1 }
            }
            transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
            className={`lg:col-span-8 relative overflow-hidden bg-[#18181B] border rounded-lg p-5 space-y-5 transition-colors duration-300 ${
              celebration?.isLevelUp
                ? 'border-orange-500/70'
                : celebration
                ? 'border-emerald-500/60'
                : 'border-[#27272A]'
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-[#27272A]">
              <div className="flex items-center gap-2 text-xs font-semibold text-zinc-300">
                <SealCheck size={18} strokeWidth={1.75} weight="regular" className="text-[#F97316] shrink-0" />
                <span>Sistema do caçador</span>
                <span className="text-zinc-500 font-mono-tabular tabular-nums">
                  · {hunterLicenseCode}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-3.5">
                <button
                  type="button"
                  onClick={() => onNavigate('arsenal')}
                  className="min-h-[34px] inline-flex items-center gap-1.5 px-2.5 py-1 rounded-sm bg-[#111113] hover:bg-[#27272A] border border-[#27272A] text-xs font-semibold text-zinc-200 font-mono-tabular tabular-nums whitespace-nowrap shrink-0 transition-colors"
                >
                  <Coins size={18} strokeWidth={1.75} weight="regular" className="text-[#F97316]" />
                  {normalizedStats.goldCoins.toLocaleString('pt-BR')} moedas
                </button>

                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-[#10B981] flex items-center gap-1 font-mono-tabular tabular-nums whitespace-nowrap">
                    <Heart size={18} strokeWidth={1.75} weight="regular" className="text-[#10B981]" />
                    HP {currentHp}/100
                  </span>
                  <div className="w-20 h-2 rounded-sm bg-[#09090B] border border-[#27272A] overflow-hidden">
                    <div
                      className={`h-full transition-all duration-500 ${
                        currentHp >= 60
                          ? 'bg-[#10B981]'
                          : currentHp >= 35
                          ? 'bg-[#F97316]'
                          : 'bg-red-500'
                      }`}
                      style={{ width: `${currentHp}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>

            <AnimatePresence>
              {celebration && (
                <motion.div
                  key={`banner-${celebration.id}`}
                  role="status"
                  aria-live="polite"
                  initial={{ opacity: 0, y: -8, scale: 0.99 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -6, scale: 0.99 }}
                  transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                  className={`rounded-md px-4 py-3 border flex items-center justify-between gap-3 bg-[#111113] ${
                    celebration.isLevelUp
                      ? 'border-orange-500/60 text-zinc-100'
                      : 'border-emerald-500/55 text-zinc-100'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`w-8 h-8 rounded-md flex items-center justify-center shrink-0 border bg-[#18181B] ${
                        celebration.isLevelUp
                          ? 'border-orange-500/50 text-[#F97316]'
                          : 'border-emerald-500/50 text-[#10B981]'
                      }`}
                    >
                      {celebration.isLevelUp ? (
                        <Crown size={18} strokeWidth={1.75} weight="regular" />
                      ) : (
                        <Lightning size={18} strokeWidth={1.75} weight="regular" />
                      )}
                    </div>
                    <div className="min-w-0 text-left">
                      <div className="text-xs font-semibold">
                        {celebration.isLevelUp
                          ? celebration.toLevel >= 20
                            ? `Rank ${dualProgression.hunter.current.rank} desbloqueado · ${dualProgression.murim.current.name}`
                            : `Subida de nível · Nível ${celebration.toLevel} (${dualProgression.hunter.current.label})`
                          : 'Experiência adquirida'}
                      </div>
                      <div className="text-xs text-zinc-400 font-mono-tabular tabular-nums">
                        {celebration.xpGained > 0 && (
                          <span className="text-[#10B981]">
                            +{celebration.xpGained.toLocaleString('pt-BR')} XP ·{' '}
                          </span>
                        )}
                        <span>
                          {celebration.isLevelUp
                            ? `Rank evoluído para ${dualProgression.hunter.current.label}`
                            : `Total atualizado para ${celebration.toXp.toLocaleString(
                                'pt-BR'
                              )} XP`}
                        </span>
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setCelebration(null)}
                    aria-label="Fechar celebração"
                    className="p-1.5 rounded text-zinc-400 hover:text-white hover:bg-white/5 transition-colors shrink-0"
                  >
                    <X size={18} strokeWidth={1.75} weight="regular" />
                  </button>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-4 min-w-0">
                <div className="relative shrink-0">
                  <AnimatePresence>
                    {celebration &&
                      CELEBRATION_SPARKS.slice(
                        0,
                        celebration.isLevelUp ? 8 : 5
                      ).map((sp, idx) => (
                        <motion.span
                          key={`spark-${celebration.id}-${idx}`}
                          initial={{ x: 0, y: 0, scale: 0, rotate: 0, opacity: 0 }}
                          animate={{
                            x: sp.x,
                            y: sp.y,
                            scale: [0, 1.15, 0],
                            rotate: sp.rotate,
                            opacity: [0, 1, 0],
                          }}
                          transition={{
                            duration: celebration.isLevelUp ? 0.95 : 0.75,
                            delay: sp.delay,
                            ease: [0.16, 1, 0.3, 1],
                          }}
                          aria-hidden="true"
                          className={`pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-xs ${sp.size} ${sp.color}`}
                        />
                      ))}
                  </AnimatePresence>

                  <button
                    type="button"
                    onClick={() => onNavigate('arsenal')}
                    title="Abrir Arsenal do Cavaleiro"
                    className="relative p-1.5 rounded-md bg-[#111113] border transition-colors flex items-center justify-center hover:border-orange-500/60"
                    style={{ borderColor: `${hunterAccentHex}55` }}
                  >
                    <ShadowKnightSprite
                      equippedGear={normalizedStats.equippedGear}
                      size="md"
                      isCelebrating={Boolean(celebration?.isLevelUp)}
                    />
                  </button>
                  <motion.span
                    key={
                      celebration?.isLevelUp
                        ? `rank-${dualProgression.hunter.current.rank}`
                        : 'rank-steady'
                    }
                    animate={
                      celebration?.isLevelUp ? { scale: [0.85, 1.2, 1] } : { scale: 1 }
                    }
                    transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                    className="absolute -bottom-1.5 -right-1.5 px-1.5 py-0.5 rounded-sm bg-[#09090B] border text-[10px] font-bold font-mono-tabular tabular-nums"
                    style={{
                      borderColor: `${hunterAccentHex}70`,
                      color: hunterAccentHex,
                    }}
                  >
                    {dualProgression.hunter.current.rank}
                  </motion.span>
                </div>

                <div className="min-w-0 space-y-1 text-left">
                  <h1 className="text-xl sm:text-2xl font-bold text-zinc-100 truncate tracking-tight">
                    {hero.name}
                  </h1>
                  <p className="text-xs text-zinc-400 flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                    <span className="inline-flex items-center gap-1 font-semibold text-zinc-200">
                      <HeroGlyph avatarOrClass={hero.heroClass} size={18} className="text-[#F97316]" />
                      {hero.heroClass}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono-tabular tabular-nums font-semibold text-zinc-300">
                      Nível {normalizedStats.level}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="font-semibold" style={{ color: hunterAccentHex }}>
                      {dualProgression.hunter.current.label}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="text-zinc-300 font-medium font-mono-tabular tabular-nums">
                      {remainingQuestsCount === 0
                        ? 'Missões de hoje concluídas'
                        : `${remainingQuestsCount} ${
                            remainingQuestsCount === 1
                              ? 'missão restante'
                              : 'missões restantes'
                          } (+${remainingXpToday} XP)`}
                    </span>
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between sm:flex-col sm:items-end gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => onNavigate('arsenal')}
                  className="min-h-[38px] px-3 py-2 rounded-md bg-[#111113] hover:bg-[#27272A] border border-[#27272A] text-zinc-200 font-semibold text-xs flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
                >
                  <Shield size={18} strokeWidth={1.75} weight="regular" className="text-[#F97316]" />
                  Equipar no Arsenal
                </button>
                <span className="text-[11px] font-medium text-zinc-400 whitespace-nowrap">
                  Objetivo: <strong className="text-zinc-200">{hero.objective}</strong>
                </span>
              </div>
            </div>

            {/* Faixa Dual: Mundo Real (Caçadores) & Mundo de Murim */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-stretch">
              <div
                className="rounded-md bg-[#111113] border p-3.5 flex flex-col justify-between gap-2.5"
                style={{ borderColor: `${hunterAccentHex}45` }}
              >
                <div className="flex items-center justify-between gap-2">
                  <span
                    className="text-[11px] font-semibold uppercase tracking-wider flex items-center gap-1.5"
                    style={{ color: hunterAccentHex }}
                  >
                    <Compass size={18} strokeWidth={1.75} weight="regular" className="shrink-0" />
                    Mundo real · Caçador
                  </span>
                  <span
                    className="text-xs font-bold font-mono-tabular tabular-nums whitespace-nowrap"
                    style={{ color: hunterAccentHex }}
                  >
                    {dualProgression.hunter.current.label}
                  </span>
                </div>

                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-semibold text-zinc-100 truncate font-mono-tabular tabular-nums">
                    Nível {normalizedStats.level}{' '}
                    <span className="text-xs font-normal text-zinc-400">
                      (Nv. {dualProgression.hunter.current.minLevel}–{dualProgression.hunter.current.maxLevel})
                    </span>
                  </span>
                  <span className="text-[11px] font-medium text-zinc-400 font-mono-tabular tabular-nums shrink-0">
                    {dualProgression.hunter.next
                      ? `Meta: ${dualProgression.hunter.next.label}`
                      : 'Patente máxima'}
                  </span>
                </div>

                <div className="space-y-1.5">
                  <div
                    className="w-full h-1.5 rounded-sm bg-[#09090B] border border-[#27272A] overflow-hidden"
                    role="progressbar"
                    aria-valuenow={dualProgression.hunter.progressPercent}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label="Progresso no Rank de Caçador"
                  >
                    <div
                      className="h-full transition-all duration-500"
                      style={{
                        width: `${dualProgression.hunter.progressPercent}%`,
                        backgroundColor: hunterAccentHex,
                      }}
                    />
                  </div>
                  <div className="flex items-center justify-between gap-2 text-[11px] text-zinc-400 font-mono-tabular tabular-nums">
                    <span>{dualProgression.hunter.progressPercent}% do rank</span>
                    <span className="truncate">
                      {dualProgression.hunter.next
                        ? `Faltam ${dualProgression.hunter.xpNeededForNextRank.toLocaleString('pt-BR')} XP (~${dualProgression.hunter.estimatedDaysToNextRank}d) → ${dualProgression.hunter.next.label}`
                        : 'Patente máxima (Rank S)'}
                    </span>
                  </div>
                </div>
              </div>

              <div
                className="rounded-md bg-[#111113] border p-3.5 flex flex-col justify-between gap-2.5"
                style={{ borderColor: `${murimAccentHex}45` }}
              >
                <div className="flex items-center justify-between gap-2">
                  <span
                    className="text-[11px] font-semibold uppercase tracking-wider flex items-center gap-1.5"
                    style={{ color: murimAccentHex }}
                  >
                    <Sword size={18} strokeWidth={1.75} weight="regular" className="shrink-0" />
                    Murim · Reino marcial
                  </span>
                  <span
                    className="text-xs font-bold font-mono-tabular tabular-nums whitespace-nowrap"
                    style={{ color: murimAccentHex }}
                  >
                    {dualProgression.murim.qiPoints.toLocaleString('pt-BR')} Qi
                  </span>
                </div>

                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-semibold text-zinc-100 truncate">
                    {dualProgression.murim.current.name}
                  </span>
                  <span className="text-[11px] text-zinc-400 font-medium shrink-0 truncate max-w-[52%]">
                    Técnica: {dualProgression.murim.current.qiTechnique}
                  </span>
                </div>

                <div className="space-y-1.5">
                  <div
                    className="w-full h-1.5 rounded-sm bg-[#09090B] border border-[#27272A] overflow-hidden"
                    role="progressbar"
                    aria-valuenow={dualProgression.murim.progressPercent}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label="Progresso no Reino de Murim"
                  >
                    <div
                      className="h-full transition-all duration-500"
                      style={{
                        width: `${dualProgression.murim.progressPercent}%`,
                        backgroundColor: murimAccentHex,
                      }}
                    />
                  </div>
                  <div className="flex items-center justify-between gap-2 text-[11px] text-zinc-400 font-mono-tabular tabular-nums">
                    <span>{dualProgression.murim.progressPercent}% do reino</span>
                    <span className="truncate">
                      {dualProgression.murim.next
                        ? `Faltam ${dualProgression.murim.qiNeededForNext.toLocaleString('pt-BR')} Qi (~${dualProgression.murim.estimatedDaysToNextRealm}d) → ${dualProgression.murim.next.name}`
                        : 'Ápice de Murim alcançado'}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <XpProgressBar
              totalXp={normalizedStats.totalXp}
              animateFromXp={celebration ? celebration.fromXp : null}
              xpGainDelta={
                celebration && celebration.xpGained > 0
                  ? celebration.xpGained
                  : null
              }
              isCelebrating={Boolean(celebration)}
            />
          </motion.section>

          {/* Coluna Direita (4 cols): Pilha de Telemetria */}
          <aside className="lg:col-span-4 grid grid-cols-2 lg:grid-cols-1 gap-3">
            <div className="bg-[#18181B] border border-[#27272A] rounded-lg p-4 flex flex-col justify-between">
              <div className="flex items-center justify-between text-zinc-400 text-xs mb-1.5">
                <span className="font-medium">Sequência atual</span>
                <Fire
                  size={18} strokeWidth={1.75}
                  weight="regular"
                  className={effectiveStreak > 0 ? 'text-[#F97316]' : 'text-zinc-600'}
                />
              </div>
              <div className="text-2xl font-bold text-zinc-100 font-mono-tabular tabular-nums">
                {effectiveStreak}{' '}
                <span className="text-xs font-sans font-medium text-zinc-400">
                  {effectiveStreak === 1 ? 'dia' : 'dias'}
                </span>
              </div>
            </div>

            <div className="bg-[#18181B] border border-[#27272A] rounded-lg p-4 flex flex-col justify-between">
              <div className="flex items-center justify-between text-zinc-400 text-xs mb-1.5">
                <span className="font-medium">Prontidão física</span>
                <Heartbeat size={18} strokeWidth={1.75} weight="regular" className="text-[#10B981]" />
              </div>
              <div className="text-2xl font-bold text-zinc-100 font-mono-tabular tabular-nums">
                {recovery.score}%{' '}
                <span className="text-xs font-sans font-medium text-[#10B981]">
                  {recovery.statusLabel}
                </span>
              </div>
            </div>

            <div className="bg-[#18181B] border border-[#27272A] rounded-lg p-4 flex flex-col justify-between">
              <div className="flex items-center justify-between text-zinc-400 text-xs mb-1.5">
                <span className="font-medium">Chefes e treinos</span>
                <Sword size={18} strokeWidth={1.75} weight="regular" className="text-[#F97316]" />
              </div>
              <div className="text-2xl font-bold text-zinc-100 font-mono-tabular tabular-nums">
                {normalizedStats.bossesDefeated}{' '}
                <span className="text-xs font-sans font-medium text-zinc-400">
                  / {normalizedStats.totalWorkouts + healthActivities.length} sessões
                </span>
              </div>
            </div>

            <div className="bg-[#18181B] border border-[#27272A] rounded-lg p-4 flex flex-col justify-between">
              <div className="flex items-center justify-between text-zinc-400 text-xs mb-1.5">
                <span className="font-medium">Passos hoje</span>
                <Trophy size={18} strokeWidth={1.75} weight="regular" className="text-zinc-400" />
              </div>
              <div className="text-2xl font-bold text-zinc-100 font-mono-tabular tabular-nums">
                {todayMetric ? todayMetric.steps.toLocaleString('pt-BR') : '—'}
              </div>
            </div>
          </aside>
        </div>

        {/* Registro e Curva de Peso Corporal */}
        <WeightTrackerCard
          hero={hero}
          weightLogs={weightLogs}
          onSaveWeight={onSaveWeight}
          onDeleteWeight={onDeleteWeight}
          onNavigateProfile={() => onNavigate('perfil')}
        />

        {/* Missões de Hoje: Auto-Check + Votos Diários */}
        <section className="bg-[#18181B] border border-[#27272A] rounded-lg p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="space-y-0.5 text-left">
              <h2 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
                <Scroll size={18} strokeWidth={1.75} weight="regular" className="text-[#F97316]" />
                Missões de hoje
              </h2>
              <p className="text-xs text-zinc-400">
                Metas de saúde são marcadas via <strong>Auto-check</strong>; missões pessoais rendem +15 XP e +10 moedas.
              </p>
            </div>
            <span className="text-xs font-semibold text-zinc-200 font-mono-tabular tabular-nums">
              {completedQuestsCount}/{totalQuestsCount} concluídas
            </span>
          </div>

          {/* Barra segmentada técnica */}
          {totalQuestsCount > 0 && (
            <div
              className="grid gap-1.5"
              style={{ gridTemplateColumns: `repeat(${totalQuestsCount}, minmax(0, 1fr))` }}
            >
              {[
                ...autoQuests.map((q) => ({ id: q.id, done: q.isFulfilled })),
                ...dailyVows.map((v) => ({
                  id: v.id,
                  done: v.completedDateKey === todayKey,
                })),
              ].map((seg) => (
                <div
                  key={seg.id}
                  className={`h-2 rounded-sm transition-colors duration-300 ${
                    seg.done
                      ? 'bg-[#10B981]'
                      : 'bg-[#09090B] border border-[#27272A]'
                  }`}
                />
              ))}
            </div>
          )}

          <ErrorBanner message={vowError} onDismiss={() => setVowError(null)} />

          {vowFeedback && (
            <div className="p-3 rounded-md bg-[#111113] border border-emerald-500/40 text-xs text-emerald-200 flex items-center justify-between gap-2">
              <span className="font-medium">{vowFeedback}</span>
              <button
                type="button"
                onClick={() => setVowFeedback(null)}
                aria-label="Fechar aviso"
                className="text-emerald-300 hover:text-white p-1"
              >
                <X size={18} strokeWidth={1.75} weight="regular" />
              </button>
            </div>
          )}

          {/* Lista de Auto-Check Quests */}
          <div className="space-y-2">
            {autoQuests.map((quest) => (
              <div
                key={quest.id}
                className={`p-3.5 rounded-md border flex flex-wrap items-center justify-between gap-3 ${
                  quest.isFulfilled
                    ? 'bg-emerald-950/15 border-emerald-500/35'
                    : 'bg-[#111113] border-[#27272A]'
                }`}
              >
                <div className="min-w-0 flex-1 space-y-1 text-left">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`text-xs sm:text-sm font-semibold ${
                        quest.isFulfilled ? 'text-[#10B981]' : 'text-zinc-100'
                      }`}
                    >
                      {quest.title}
                    </span>
                    <span className="text-[11px] font-medium text-[#F97316]">
                      · Auto-check
                    </span>
                  </div>
                  <div className="text-[11px] text-zinc-400">{quest.subtitle}</div>
                  <div className="w-full max-w-xs h-1.5 rounded-sm bg-[#09090B] border border-[#27272A] overflow-hidden mt-1">
                    <div
                      className={`h-full transition-all duration-500 ${
                        quest.isFulfilled ? 'bg-[#10B981]' : 'bg-[#F97316]'
                      }`}
                      style={{ width: `${quest.progressPercent}%` }}
                    />
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <div className="text-right font-mono-tabular tabular-nums">
                    <div className="text-xs font-semibold text-zinc-200">
                      {quest.progressText}
                    </div>
                    <div className="text-[11px] text-orange-400 font-medium">
                      +{quest.xpReward} XP · +{quest.coinsReward} moedas
                    </div>
                  </div>
                  {quest.isFulfilled ? (
                    <CheckCircle size={18} strokeWidth={1.75} weight="regular" className="text-[#10B981] shrink-0" />
                  ) : (
                    <div className="w-5 h-5 rounded-sm border border-[#27272A] bg-[#09090B] shrink-0" />
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Adicionar Missão Manual */}
          <form onSubmit={(e) => void handleAddVowSubmit(e)} className="flex items-center gap-2 pt-1">
            <input
              type="text"
              value={newVowTitle}
              maxLength={60}
              onChange={(e) => setNewVowTitle(e.target.value)}
              placeholder="Nova missão pessoal (ex: Beber 2L de água, Alongamento 10m)..."
              className="flex-1 px-3.5 py-2 rounded-md bg-[#09090B] border border-[#27272A] text-xs sm:text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-[#F97316] focus-visible:ring-2 focus-visible:ring-[#F97316]/60"
            />
            <button
              type="submit"
              disabled={newVowTitle.trim().length < 3 || vowBusyId === 'creating'}
              className="min-h-[38px] px-4 py-2 rounded-md bg-[#F97316] hover:bg-orange-400 disabled:bg-[#27272A] disabled:text-zinc-500 text-[#09090B] font-semibold text-xs flex items-center gap-1.5 shrink-0 transition-colors"
            >
              <Plus size={18} strokeWidth={1.75} weight="regular" />
              Adicionar
            </button>
          </form>

          {dailyVows.length > 0 && (
            <div className="space-y-2">
              {dailyVows.map((vow) => {
                const completedToday = vow.completedDateKey === todayKey;
                const violatedToday = vow.violatedDateKey === todayKey;
                const resolvedToday = completedToday || violatedToday;

                return (
                  <div
                    key={vow.id}
                    className={`p-3.5 rounded-md border flex flex-wrap items-center justify-between gap-3 transition-colors ${
                      completedToday
                        ? 'bg-emerald-950/15 border-emerald-500/35'
                        : violatedToday
                        ? 'bg-red-950/15 border-red-500/35'
                        : 'bg-[#111113] border-[#27272A]'
                    }`}
                  >
                    <div className="min-w-0 flex-1 text-left">
                      <div
                        className={`text-xs sm:text-sm font-semibold ${
                          completedToday
                            ? 'text-[#10B981] line-through'
                            : violatedToday
                            ? 'text-red-300'
                            : 'text-zinc-100'
                        }`}
                      >
                        {vow.title}
                      </div>
                      <div className="text-[11px] text-zinc-400 mt-0.5 font-mono-tabular tabular-nums">
                        {completedToday
                          ? `Cumprido hoje (+${vow.xpReward} XP · +10 moedas)`
                          : violatedToday
                          ? `Penalidade aplicada hoje (-${vow.penaltyXp} XP)`
                          : `Recompensa: +${vow.xpReward} XP · +10 moedas · Falha: -${vow.penaltyXp} XP`}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        disabled={resolvedToday || vowBusyId === vow.id}
                        onClick={() => void handleFulfillVow(vow)}
                        className="min-h-[34px] px-3 py-1.5 rounded-md bg-emerald-500/15 hover:bg-emerald-500/25 disabled:opacity-40 border border-emerald-500/35 text-[#10B981] font-semibold text-xs flex items-center gap-1"
                      >
                        <Check size={18} strokeWidth={1.75} weight="regular" />
                        Cumprir
                      </button>

                      <button
                        type="button"
                        disabled={resolvedToday || vowBusyId === vow.id}
                        onClick={() => setPenaltyTargetVow(vow)}
                        className="min-h-[34px] px-2.5 py-1.5 rounded-md bg-red-500/10 hover:bg-red-500/20 disabled:opacity-40 border border-red-500/30 text-red-400 font-semibold text-xs flex items-center gap-1"
                      >
                        <HeartBreak size={18} strokeWidth={1.75} weight="regular" />
                        Falhei
                      </button>

                      <button
                        type="button"
                        disabled={vowBusyId === vow.id}
                        onClick={() => void handleRemoveVow(vow.id)}
                        aria-label={`Remover missão ${vow.title}`}
                        className="p-2 rounded-md text-zinc-500 hover:text-zinc-200 hover:bg-white/5"
                      >
                        <Trash size={18} strokeWidth={1.75} weight="regular" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Raid Semanal + Missões Semanais Auto-check */}
        <section
          aria-label="Chefe de Raid Semanal e Missões da Semana"
          className="bg-[#18181B] border border-[#27272A] rounded-lg p-5 space-y-4"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4 min-w-0 text-left">
              <div className="shrink-0 rounded-lg bg-[#111113] border border-[#27272A] p-1">
                <DungeonBossSprite
                  variant={weeklyRaidBoss.variant}
                  isDefeated={weeklyRaidBoss.isDefeated}
                />
              </div>
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono-tabular uppercase tracking-wider text-orange-400">
                  <Skull size={16} strokeWidth={1.75} weight="regular" className="shrink-0" />
                  <span>Raid Semanal · {weeklyRaidBoss.weekKey}</span>
                </div>
                <h2 className="text-base sm:text-lg font-bold text-zinc-100 truncate">
                  {weeklyRaidBoss.bossName}
                </h2>
                <p className="text-xs text-zinc-400 leading-relaxed">
                  {weeklyRaidBoss.bossSubtitle}
                </p>
              </div>
            </div>

            <div className="text-left sm:text-right shrink-0 space-y-1 font-mono-tabular tabular-nums">
              <div
                className={`text-sm font-bold ${
                  weeklyRaidBoss.isDefeated ? 'text-emerald-400' : 'text-red-400'
                }`}
              >
                {weeklyRaidBoss.isDefeated
                  ? 'RAID CONCLUÍDA'
                  : `${weeklyRaidBoss.currentHp} / ${weeklyRaidBoss.maxHp} HP`}
              </div>
              <div className="text-[11px] text-zinc-400">
                {weeklyRaidBoss.workoutsThisWeek} treinos ·{' '}
                {weeklyRaidBoss.weeklyVolumeKg.toLocaleString('pt-BR')} kg ·{' '}
                {weeklyRaidBoss.weeklyPrCount} PR{weeklyRaidBoss.weeklyPrCount === 1 ? '' : 's'}
              </div>
            </div>
          </div>

          <div className="w-full h-2.5 rounded-sm bg-[#09090B] border border-[#27272A] overflow-hidden">
            <div
              className={`h-full transition-all duration-500 ${
                weeklyRaidBoss.isDefeated ? 'bg-[#10B981]' : 'bg-[#F97316]'
              }`}
              style={{ width: `${weeklyRaidBoss.hpPercent}%` }}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
            {weeklyAutoQuests.map((wq) => (
              <div
                key={wq.id}
                className={`p-3.5 rounded-md border flex flex-col justify-between gap-2.5 text-left ${
                  wq.isFulfilled
                    ? 'bg-emerald-950/15 border-emerald-500/35'
                    : 'bg-[#111113] border-[#27272A]'
                }`}
              >
                <div className="space-y-1">
                  <div className="flex items-start justify-between gap-2">
                    <span
                      className={`text-xs sm:text-sm font-semibold ${
                        wq.isFulfilled ? 'text-[#10B981]' : 'text-zinc-100'
                      }`}
                    >
                      {wq.title}
                    </span>
                    {wq.isFulfilled ? (
                      <CheckCircle size={18} strokeWidth={1.75} weight="regular" className="text-[#10B981] shrink-0" />
                    ) : (
                      <Trophy size={16} strokeWidth={1.75} weight="regular" className="text-orange-400 shrink-0" />
                    )}
                  </div>
                  <p className="text-[11px] text-zinc-400 leading-relaxed">{wq.subtitle}</p>
                </div>

                <div className="space-y-1.5">
                  <div className="w-full h-1.5 rounded-sm bg-[#09090B] border border-[#27272A] overflow-hidden">
                    <div
                      className={`h-full transition-all duration-500 ${
                        wq.isFulfilled ? 'bg-[#10B981]' : 'bg-[#F97316]'
                      }`}
                      style={{ width: `${wq.progressPercent}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-[11px] font-mono-tabular tabular-nums">
                    <span className="font-semibold text-zinc-200">{wq.progressText}</span>
                    <span className="text-orange-400 font-medium">
                      +{wq.xpReward} XP · +{wq.coinsReward} m
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Faixa de Telemetria & Saúde Conectada */}
        <section className="bg-[#18181B] border border-[#27272A] rounded-lg p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1 text-left">
            <div className="text-xs font-semibold text-[#F97316] flex items-center gap-2">
              <Heartbeat size={18} strokeWidth={1.75} weight="regular" />
              Central de saúde e relatórios de desempenho
            </div>
            <p className="text-xs text-zinc-400 leading-relaxed">
              {recovery.recommendation}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('progresso')}
            className="px-4 py-2 rounded-md bg-[#111113] hover:bg-[#27272A] border border-[#27272A] text-zinc-100 font-semibold text-xs whitespace-nowrap shrink-0 transition-colors"
          >
            Abrir saúde e relatórios
          </button>
        </section>

        {/* Agenda Semanal adaptada ao Rank e Experiência */}
        <section className="bg-[#18181B] border border-[#27272A] rounded-lg p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-1 text-left">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-[#F97316] flex items-center gap-1.5 font-mono-tabular tabular-nums">
                <Barbell size={18} strokeWidth={1.75} weight="regular" />
                Agenda semanal · {recommendedProgram.weeklyFrequency}x por semana
              </div>
              <h2 className="text-base sm:text-lg font-bold text-zinc-100">
                {recommendedProgram.name}
              </h2>
              <p className="text-xs text-zinc-400">
                Equipamentos: {recommendedProgram.equipments.join(' · ')}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {scheduledWorkoutToday ? (
                <button
                  type="button"
                  onClick={() => onStartWorkout(scheduledWorkoutToday)}
                  className="min-h-[40px] px-4 py-2 rounded-md bg-[#F97316] hover:bg-orange-400 text-[#09090B] font-semibold text-xs flex items-center gap-2 transition-colors"
                >
                  <Play size={18} strokeWidth={1.75} weight="regular" />
                  Iniciar {todaySchedule.sessionCode} hoje
                </button>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  {programWorkoutA && (
                    <button
                      type="button"
                      onClick={() => onStartWorkout(programWorkoutA)}
                      className="min-h-[40px] px-3.5 py-2 rounded-md bg-[#111113] hover:bg-[#27272A] border border-[#27272A] text-zinc-100 font-semibold text-xs flex items-center gap-1.5 transition-colors"
                    >
                      <Play size={18} strokeWidth={1.75} weight="regular" className="text-[#F97316]" />
                      {recommendedProgram.trainAButtonLabel}
                    </button>
                  )}
                  {programWorkoutB && (
                    <button
                      type="button"
                      onClick={() => onStartWorkout(programWorkoutB)}
                      className="min-h-[40px] px-3.5 py-2 rounded-md bg-[#111113] hover:bg-[#27272A] border border-[#27272A] text-zinc-100 font-semibold text-xs flex items-center gap-1.5 transition-colors"
                    >
                      <Play size={18} strokeWidth={1.75} weight="regular" className="text-[#F97316]" />
                      {recommendedProgram.trainBButtonLabel}
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
            {recommendedProgram.weeklySchedule.map((day) => {
              const isToday = day.dayIndex === todaySchedule.dayIndex;
              const isRest = day.workoutId === null;
              const weekDateKey = currentWeekDates.get(day.dayIndex);
              const completedThisWeek =
                !isRest &&
                Boolean(
                  weekDateKey &&
                    logs.some(
                      (l) => l.dateKey === weekDateKey && l.workoutId === day.workoutId
                    )
                );
              const targetWorkout = resolveWorkoutForSchedule(day, workouts);
              const shortFocus =
                day.shortFocus ??
                (isRest
                  ? 'Descanso'
                  : day.sessionCode.startsWith('A')
                  ? 'Treino A'
                  : 'Treino B');

              if (!isRest && targetWorkout) {
                return (
                  <button
                    key={day.dayName}
                    type="button"
                    onClick={() => onStartWorkout(targetWorkout)}
                    title={`${day.dayName}: ${day.focus} · Clique para iniciar`}
                    className={`min-h-[90px] p-3 rounded-md border text-left flex flex-col justify-between transition-colors ${
                      completedThisWeek
                        ? 'bg-emerald-950/15 border-emerald-500/40'
                        : isToday
                        ? 'bg-[#111113] border-orange-500/60'
                        : 'bg-[#111113] border-[#27272A] hover:border-zinc-500'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1 w-full">
                      <span
                        className={`text-[11px] font-semibold uppercase ${
                          isToday ? 'text-[#F97316]' : 'text-zinc-400'
                        }`}
                      >
                        {day.shortDay}
                      </span>
                      {completedThisWeek ? (
                        <CheckCircle size={18} strokeWidth={1.75} weight="regular" className="text-[#10B981] shrink-0" />
                      ) : isToday ? (
                        <span className="text-[10px] font-semibold uppercase text-[#F97316]">
                          Hoje
                        </span>
                      ) : null}
                    </div>

                    <div className="space-y-0.5">
                      <div className="text-base font-bold text-zinc-100 font-mono-tabular tabular-nums">
                        {day.sessionCode}
                      </div>
                      <div className="text-[11px] font-medium text-zinc-400 truncate">
                        {shortFocus}
                      </div>
                    </div>
                  </button>
                );
              }

              return (
                <div
                  key={day.dayName}
                  className={`min-h-[90px] p-3 rounded-md border flex flex-col justify-between ${
                    isToday
                      ? 'bg-[#111113] border-orange-500/45'
                      : 'bg-[#09090B] border-[#27272A]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-1 w-full">
                    <span
                      className={`text-[11px] font-semibold uppercase ${
                        isToday ? 'text-[#F97316]' : 'text-zinc-500'
                      }`}
                    >
                      {day.shortDay}
                    </span>
                    {isToday && (
                      <span className="text-[10px] font-semibold uppercase text-[#F97316]">
                        Hoje
                      </span>
                    )}
                  </div>

                  <div className="space-y-0.5">
                    <div className="text-xs font-semibold uppercase text-zinc-400">
                      Descanso
                    </div>
                    <div className="text-[11px] text-zinc-500 truncate">
                      {day.focus}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-400 pt-2 border-t border-[#27272A]">
            <span>
              Hoje ({todaySchedule.dayName}):{' '}
              <strong className="text-zinc-200">{todaySchedule.focus}</strong>
            </span>
            <span className="font-mono-tabular tabular-nums text-zinc-300 font-semibold">
              Rank {recommendedProgram.rankLabel} · +{recommendedProgram.baseXpPerSession} XP por sessão
            </span>
          </div>
        </section>

        {/* Atividade 7 Dias (5 cols) + Missão do Dia (7 cols) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <section className="lg:col-span-5 bg-[#18181B] border border-[#27272A] rounded-lg p-5 flex flex-col justify-between space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <CalendarBlank size={18} strokeWidth={1.75} weight="regular" className="text-[#F97316]" />
                <h2 className="text-sm font-semibold text-zinc-100">Últimos 7 dias</h2>
              </div>
              <span
                className={`text-xs font-semibold ${
                  trainedToday ? 'text-[#10B981]' : 'text-zinc-400'
                }`}
              >
                {trainedToday ? 'Hoje concluído' : 'Pendente hoje'}
              </span>
            </div>

            <div className="grid grid-cols-7 gap-1.5">
              {last7DaysActivity.map((day) => {
                const active = day.count > 0;
                return (
                  <div
                    key={day.dateKey}
                    className={`flex flex-col items-center py-2.5 px-1 rounded-md border transition-colors ${
                      active
                        ? 'bg-emerald-950/15 border-emerald-500/40 text-zinc-100'
                        : day.isToday
                        ? 'bg-[#111113] border-orange-500/50 text-zinc-200'
                        : 'bg-[#111113] border-[#27272A] text-zinc-500'
                    }`}
                  >
                    <span className="text-[10px] font-semibold uppercase">
                      {day.weekdayLabel}
                    </span>
                    <div
                      className={`w-7 h-7 rounded-sm my-1.5 flex items-center justify-center text-[11px] font-bold font-mono-tabular tabular-nums ${
                        active
                          ? 'bg-[#10B981] text-[#09090B]'
                          : day.isToday
                          ? 'border border-dashed border-[#F97316] text-[#F97316]'
                          : 'bg-[#09090B] border border-[#27272A] text-zinc-500'
                      }`}
                    >
                      {active ? (
                        <Check size={18} strokeWidth={1.75} weight="bold" />
                      ) : (
                        day.dayNumber
                      )}
                    </div>
                    <span className="text-[9px] font-semibold font-mono-tabular tabular-nums">
                      {day.count > 1
                        ? `${day.count}x`
                        : day.isToday
                        ? 'Hoje'
                        : day.dayNumber}
                    </span>
                  </div>
                );
              })}
            </div>

            <p className="text-xs text-zinc-400 leading-relaxed text-left">
              Treinos no aplicativo e sessões importadas do Samsung Health, Strava, Apple Health ou GPX somam consistência diária.
            </p>
          </section>

          {dailyMission && (
            <section className="lg:col-span-7 bg-[#18181B] border border-[#27272A] rounded-lg p-5 flex flex-col justify-between space-y-4">
              <div className="space-y-2.5 text-left">
                <div className="flex items-start justify-between gap-3">
                  <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#F97316]">
                    <Compass size={18} strokeWidth={1.75} weight="regular" />
                    Sessão recomendada · Rank {normalizeHunterRank(dailyMission.rank, 'F')}
                  </div>
                  <div className="px-2.5 py-1 rounded-sm bg-[#111113] border border-[#27272A] text-[#10B981] font-semibold text-xs shrink-0 flex items-center gap-1 font-mono-tabular tabular-nums">
                    <Lightning size={18} strokeWidth={1.75} weight="regular" />
                    +{dailyMission.baseXp} XP
                  </div>
                </div>

                <h2 className="text-lg sm:text-xl font-bold text-zinc-100">
                  {dailyMission.name}
                </h2>
                <p className="text-xs text-zinc-400 leading-relaxed">
                  {dailyMission.description}
                </p>
              </div>

              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-300">
                  <span className="inline-flex items-center gap-1.5">
                    <WorkoutTypeGlyph type={dailyMission.type} size={18} className="text-[#F97316]" />
                    {WORKOUT_TYPE_LABELS[dailyMission.type].label}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>{dailyMission.difficulty}</span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono-tabular tabular-nums flex items-center gap-1">
                    <Clock size={18} strokeWidth={1.75} weight="regular" className="text-zinc-400" />
                    {dailyMission.durationMinutes} min
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono-tabular tabular-nums">
                    {dailyMission.exercises.length} exercícios
                  </span>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => onStartWorkout(dailyMission)}
                    className="flex-1 min-h-[42px] py-2.5 px-5 rounded-md bg-[#F97316] hover:bg-orange-400 text-[#09090B] font-semibold text-xs flex items-center justify-center gap-2 transition-colors active:scale-[0.99]"
                  >
                    <Play size={18} strokeWidth={1.75} weight="regular" />
                    Pronto para a sessão de hoje
                  </button>
                  <button
                    type="button"
                    onClick={() => onNavigate('treinar')}
                    className="min-h-[42px] py-2.5 px-4 rounded-md bg-[#111113] hover:bg-[#27272A] border border-[#27272A] text-zinc-200 font-semibold text-xs transition-colors whitespace-nowrap shrink-0 font-mono-tabular tabular-nums"
                  >
                    Explorar ({workouts.length})
                  </button>
                </div>
              </div>
            </section>
          )}
        </div>

        {penaltyTargetVow && (
          <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
            <div className="bg-[#18181B] border border-red-500/40 rounded-lg max-w-sm w-full p-5 space-y-4">
              <div className="flex items-center gap-2 text-red-400">
                <HeartBreak size={18} strokeWidth={1.75} weight="regular" className="shrink-0" />
                <h3 className="text-base font-bold text-zinc-100">Registrar falha</h3>
              </div>
              <p className="text-xs text-zinc-300 leading-relaxed text-left">
                Registrar quebra da missão{' '}
                <strong>&ldquo;{penaltyTargetVow.title}&rdquo;</strong> aplicará uma
                punição de{' '}
                <strong className="text-red-400 font-mono-tabular tabular-nums">
                  -{penaltyTargetVow.penaltyXp} XP
                </strong>{' '}
                e <strong className="text-red-400 font-mono-tabular tabular-nums">-15 HP</strong> no Sistema.
              </p>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setPenaltyTargetVow(null)}
                  className="flex-1 py-2.5 rounded-md bg-[#111113] hover:bg-[#27272A] border border-[#27272A] text-zinc-200 font-semibold text-xs transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => void handleConfirmPenalty()}
                  className="flex-1 py-2.5 rounded-md bg-red-600 hover:bg-red-500 text-white font-semibold text-xs transition-colors"
                >
                  Confirmar
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </MotionConfig>
  );
};
