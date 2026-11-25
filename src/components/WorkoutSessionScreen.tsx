import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Dialog } from 'radix-ui';
import {
  ArrowsClockwise,
  Barbell,
  CaretDown,
  CaretUp,
  Check,
  CheckCircle,
  Circle,
  Clock,
  Coins,
  Crown,
  DeviceMobile,
  Fire,
  Gear,
  Info,
  Lightning,
  Medal,
  Minus,
  Pause,
  Play,
  Plus,
  SkipForward,
  Skull,
  SpeakerHigh,
  SpeakerSlash,
  Sword,
  Trash,
  Trophy,
  Video,
  X,
} from '@phosphor-icons/react';
import {
  EquippedGear,
  ExerciseItem,
  ExercisePrRecord,
  PerformedExerciseRecord,
  PerformedSetEntry,
  SessionRewardSummary,
  WorkoutLog,
  WorkoutTemplate,
} from '../types/fitness';
import type { CompleteWorkoutPayload } from '../services/api';
import {
  DEFAULT_EQUIPPED_GEAR,
  LEVEL_THRESHOLDS,
  calculateCoinsForWorkout,
  calculateGearBonusSummary,
  calculateProportionalXp,
  calculateSessionPrBonus,
  calculateWorkoutBossState,
  evaluateExercisePrUpdate,
  formatSecondsMMSS,
  getBossForWorkout,
  getFriendlyErrorMessage,
  getHunterRankBadgeClass,
  getLocalDateKey,
  normalizeHunterRank,
  parseExercisePrescription,
} from '../utils/rpgLogic';
import {
  RestAlertPreferences,
  loadRestAlertPreferences,
  saveRestAlertPreferences,
  triggerPrFanfareAlert,
  triggerRestCompleteAlert,
  unlockRestAudio,
} from '../utils/restAlert';
import { ExerciseDemoPlayer } from './ExerciseDemoPlayer';
import { ExerciseInfoModal } from './ExerciseInfoModal';
import { AchievementGlyph, AnimatedXpCounter, ErrorBanner } from './HudPrimitives';
import { DungeonBossSprite, ShadowKnightSprite } from './ShadowKnightSprite';

interface WorkoutConfirmation {
  payload: CompleteWorkoutPayload & {
    completedExerciseIds: string[];
    elapsedSeconds: number;
    bossDefeated: boolean;
    performedExercises: PerformedExerciseRecord[];
  };
  bossHp: number;
  xp: number;
  coins: number;
  totalVolumeKg: number;
  prCount: number;
  prExerciseNames: string[];
}

interface WorkoutSessionScreenProps {
  workout: WorkoutTemplate;
  equippedGear?: EquippedGear;
  exercisePrs?: ExercisePrRecord[];
  logs?: WorkoutLog[];
  onCancelSession: () => void;
  onCompleteSession: (
    workout: WorkoutTemplate,
    payload: CompleteWorkoutPayload
  ) => Promise<SessionRewardSummary>;
  onUpdateExerciseLoad?: (
    workoutId: string,
    exerciseId: string,
    newLoadKg: number
  ) => Promise<void>;
}

function buildInitialSetsForExercise(
  ex: ExerciseItem,
  pr?: ExercisePrRecord | null,
  lastPerformed?: PerformedExerciseRecord | null
): PerformedSetEntry[] {
  const parsed = parseExercisePrescription(ex.prescription);
  const lastCompletedSet = lastPerformed?.sets.find((s) => s.completed);
  const defaultWeight =
    typeof ex.loadKg === 'number'
      ? ex.loadKg
      : pr?.bestWeightKg ?? lastCompletedSet?.weightKg ?? 0;
  const defaultReps = lastCompletedSet?.reps && lastCompletedSet.reps > 0
    ? lastCompletedSet.reps
    : parsed.targetReps;

  return Array.from({ length: parsed.setsCount }, (_, index) => ({
    setIndex: index + 1,
    weightKg: defaultWeight,
    reps: defaultReps,
    completed: false,
    isPr: false,
  }));
}

export const WorkoutSessionScreen: React.FC<WorkoutSessionScreenProps> = ({
  workout,
  equippedGear = DEFAULT_EQUIPPED_GEAR,
  exercisePrs = [],
  logs = [],
  onCancelSession,
  onCompleteSession,
  onUpdateExerciseLoad,
}) => {
  const [clock, setClock] = useState<{ startedAt: number | null; elapsedMs: number }>(
    () => ({ startedAt: Date.now(), elapsedMs: 0 })
  );
  const [now, setNow] = useState(Date.now);
  const [{ completedIds, attackId }, setExerciseProgress] = useState<{
    completedIds: string[];
    attackId: number;
  }>({
    completedIds: [],
    attackId: 0,
  });
  const [lastHitWasCrit, setLastHitWasCrit] = useState<boolean>(false);

  // Rest timer (wall-clock based for background/lockscreen resilience)
  const [restEndWallMs, setRestEndWallMs] = useState<number | null>(null);
  const [restFinishedNotice, setRestFinishedNotice] = useState<boolean>(false);
  const restTriggeredRef = useRef<boolean>(false);
  const [alertPrefs, setAlertPrefs] = useState<RestAlertPreferences>(() =>
    loadRestAlertPreferences()
  );
  const alertPrefsRef = useRef<RestAlertPreferences>(alertPrefs);
  alertPrefsRef.current = alertPrefs;

  const [showTipExpanded, setShowTipExpanded] = useState<boolean>(false);
  const [showDemoExpanded, setShowDemoExpanded] = useState<boolean>(true);
  const [confirmation, setConfirmation] = useState<WorkoutConfirmation | null>(null);
  const [pendingCompletion, setPendingCompletion] = useState<WorkoutConfirmation | null>(null);
  const [completionError, setCompletionError] = useState<string | null>(null);
  const [showExitModal, setShowExitModal] = useState<boolean>(false);
  const exitOpener = useRef<HTMLButtonElement>(null);
  const [showExerciseSettingsModal, setShowExerciseSettingsModal] = useState<boolean>(false);
  const settingsOpener = useRef<HTMLButtonElement>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [rewardSummary, setRewardSummary] = useState<SessionRewardSummary | null>(null);
  const [localLoads, setLocalLoads] = useState<Record<string, number>>(() => {
    const map: Record<string, number> = {};
    for (const ex of workout.exercises) {
      if (typeof ex.loadKg === 'number') {
        map[ex.id] = ex.loadKg;
      }
    }
    return map;
  });
  const [loadInputDraft, setLoadInputDraft] = useState<Record<string, string>>({});
  const [setWeightDraft, setSetWeightDraft] = useState<Record<string, string>>({});
  const [setRepsDraft, setSetRepsDraft] = useState<Record<string, string>>({});
  const [savingLoadId, setSavingLoadId] = useState<string | null>(null);
  const [savedLoadId, setSavedLoadId] = useState<string | null>(null);
  const [selectedExerciseForInfo, setSelectedExerciseForInfo] =
    useState<ExerciseItem | null>(null);

  const prByExerciseId = useMemo(() => {
    const map = new Map<string, ExercisePrRecord>();
    for (const pr of exercisePrs) {
      map.set(pr.exerciseId, pr);
    }
    return map;
  }, [exercisePrs]);

  const lastPerformedByExerciseId = useMemo(() => {
    const map = new Map<string, PerformedExerciseRecord>();
    const sortedLogs = [...logs].sort((a, b) =>
      (b.completedAt || b.dateKey).localeCompare(a.completedAt || a.dateKey)
    );
    for (const log of sortedLogs) {
      if (!Array.isArray(log.performedExercises)) continue;
      for (const rec of log.performedExercises) {
        if (!map.has(rec.exerciseId)) {
          map.set(rec.exerciseId, rec);
        }
      }
    }
    return map;
  }, [logs]);

  const [setsByExercise, setSetsByExercise] = useState<Record<string, PerformedSetEntry[]>>(() => {
    const map: Record<string, PerformedSetEntry[]> = {};
    for (const ex of workout.exercises) {
      map[ex.id] = buildInitialSetsForExercise(
        ex,
        prByExerciseId.get(ex.id) ?? null,
        lastPerformedByExerciseId.get(ex.id) ?? null
      );
    }
    return map;
  });

  useEffect(() => {
    setSetsByExercise((prev) => {
      const next: Record<string, PerformedSetEntry[]> = { ...prev };
      let changed = false;
      for (const ex of workout.exercises) {
        if (!next[ex.id]) {
          next[ex.id] = buildInitialSetsForExercise(
            ex,
            prByExerciseId.get(ex.id) ?? null,
            lastPerformedByExerciseId.get(ex.id) ?? null
          );
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [workout.id, workout.exercises, prByExerciseId, lastPerformedByExerciseId]);

  const boss = useMemo(() => getBossForWorkout(workout), [workout]);
  const targetDurationSeconds = Math.max(60, workout.durationMinutes * 60);

  useEffect(() => {
    setLocalLoads((prev) => {
      const next: Record<string, number> = { ...prev };
      for (const ex of workout.exercises) {
        if (typeof ex.loadKg === 'number' && next[ex.id] === undefined) {
          next[ex.id] = ex.loadKg;
        }
      }
      return next;
    });
  }, [workout.id, workout.exercises]);

  const getEffectiveLoadKg = (exerciseId: string, fallback?: number): number => {
    if (localLoads[exerciseId] !== undefined) return localLoads[exerciseId];
    return typeof fallback === 'number' ? fallback : 0;
  };

  const handleToggleAlertPref = (key: keyof RestAlertPreferences): void => {
    void unlockRestAudio();
    setAlertPrefs((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      saveRestAlertPreferences(next);
      return next;
    });
  };

  const startRestTimer = useCallback((seconds: number): void => {
    void unlockRestAudio();
    restTriggeredRef.current = false;
    setRestFinishedNotice(false);
    setRestEndWallMs(Date.now() + Math.max(5, Math.round(seconds)) * 1000);
    setNow(Date.now());
  }, []);

  const handleAdjustLoad = async (
    exerciseId: string,
    nextRawKg: number,
    clearDraft: boolean = false
  ): Promise<void> => {
    if (!Number.isFinite(nextRawKg)) return;
    const clamped = Math.min(400, Math.max(0, Math.round(nextRawKg * 2) / 2));
    setLocalLoads((prev) => ({ ...prev, [exerciseId]: clamped }));
    setSetsByExercise((prev) => {
      const currentSets = prev[exerciseId];
      if (!currentSets) return prev;
      const updated = currentSets.map((s) =>
        s.completed ? s : { ...s, weightKg: clamped }
      );
      return { ...prev, [exerciseId]: updated };
    });
    if (clearDraft) {
      setLoadInputDraft((prev) => {
        if (!(exerciseId in prev)) return prev;
        const copy = { ...prev };
        delete copy[exerciseId];
        return copy;
      });
    }

    if (!onUpdateExerciseLoad) return;
    setSavingLoadId(exerciseId);
    setSessionError(null);
    try {
      await onUpdateExerciseLoad(workout.id, exerciseId, clamped);
      setSavedLoadId(exerciseId);
      window.setTimeout(() => {
        setSavedLoadId((cur) => (cur === exerciseId ? null : cur));
      }, 1800);
    } catch (err: unknown) {
      setSessionError(getFriendlyErrorMessage(err));
    } finally {
      setSavingLoadId((cur) => (cur === exerciseId ? null : cur));
    }
  };

  const isPaused = clock.startedAt === null;
  const getElapsedMs = (at: number) => clock.elapsedMs +
    (clock.startedAt === null ? 0 : Math.max(0, at - clock.startedAt));
  const elapsedMs = getElapsedMs(now);
  const elapsedSeconds = pendingCompletion?.payload.elapsedSeconds ?? Math.floor(elapsedMs / 1000);
  const restTimerSeconds =
    pendingCompletion || restEndWallMs === null
      ? 0
      : Math.max(0, Math.ceil((restEndWallMs - now) / 1000));

  useEffect(() => {
    if ((isPaused && restEndWallMs === null) || pendingCompletion || rewardSummary) return;

    const tick = () => {
      const currentAt = Date.now();
      setNow(currentAt);
      if (
        restEndWallMs !== null &&
        currentAt >= restEndWallMs &&
        !restTriggeredRef.current
      ) {
        restTriggeredRef.current = true;
        setRestEndWallMs(null);
        setRestFinishedNotice(true);
        triggerRestCompleteAlert(alertPrefsRef.current);
      }
    };

    tick();
    const interval = window.setInterval(tick, 250);
    document.addEventListener('visibilitychange', tick);
    window.addEventListener('focus', tick);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', tick);
      window.removeEventListener('focus', tick);
    };
  }, [isPaused, restEndWallMs, pendingCompletion, rewardSummary]);

  const togglePause = () => {
    const at = Date.now();
    setClock({ startedAt: isPaused ? at : null, elapsedMs: getElapsedMs(at) });
    setNow(at);
  };

  const totalExercises = Math.max(1, workout.exercises.length);
  const completedCount = completedIds.length;

  const { completedSetsCount, totalSetsCount, criticalHitsCount } = useMemo(() => {
    let done = 0;
    let total = 0;
    let crits = 0;
    for (const ex of workout.exercises) {
      const sets = setsByExercise[ex.id] ?? [];
      total += Math.max(1, sets.length);
      for (const s of sets) {
        if (s.completed) {
          done += 1;
          if (s.isPr) crits += 1;
        }
      }
    }
    return {
      completedSetsCount: done,
      totalSetsCount: Math.max(1, total),
      criticalHitsCount: crits,
    };
  }, [workout.exercises, setsByExercise]);

  const performedEvaluationSummary = useMemo(() => {
    const performedExercises: PerformedExerciseRecord[] = [];
    let totalVolumeKg = 0;
    let prCount = 0;
    const prExerciseNames: string[] = [];

    for (const ex of workout.exercises) {
      const rawSets = setsByExercise[ex.id] ?? [];
      const anySetCompleted = rawSets.some((s) => s.completed);
      const isExerciseCompleted = completedIds.includes(ex.id);
      if (!anySetCompleted && !isExerciseCompleted) continue;

      const normalizedSets =
        anySetCompleted
          ? rawSets
          : rawSets.map((s) => ({ ...s, completed: true }));
      const evalResult = evaluateExercisePrUpdate(
        normalizedSets,
        prByExerciseId.get(ex.id) ?? null
      );

      performedExercises.push({
        exerciseId: ex.id,
        exerciseName: ex.name,
        sets: evalResult.annotatedSets,
        volumeKg: evalResult.volumeKg,
        hasPr: evalResult.hasPr,
        bestWeightKg: evalResult.bestWeightKg,
        bestSetVolumeKg: evalResult.bestSetVolumeKg,
        bestEstimated1RmKg: evalResult.bestEstimated1RmKg,
      });
      totalVolumeKg += evalResult.volumeKg;
      if (evalResult.hasPr) {
        prCount += 1;
        prExerciseNames.push(ex.name);
      }
    }

    const { prXpBonus, prCoinsBonus } = calculateSessionPrBonus(prCount);
    return {
      performedExercises,
      totalVolumeKg: Number(totalVolumeKg.toFixed(1)),
      prCount,
      prExerciseNames,
      prXpBonus,
      prCoinsBonus,
    };
  }, [workout.exercises, setsByExercise, completedIds, prByExerciseId]);

  const updateExerciseSets = (
    ex: ExerciseItem,
    updater: (prevSets: PerformedSetEntry[]) => PerformedSetEntry[],
    options?: { startRestIfIncomplete?: boolean; triggerStrike?: boolean }
  ): void => {
    if (pendingCompletion) return;
    setSessionError(null);
    const existingPr = prByExerciseId.get(ex.id) ?? null;

    const currentSets =
      setsByExercise[ex.id] ??
      buildInitialSetsForExercise(ex, existingPr, lastPerformedByExerciseId.get(ex.id) ?? null);
    const nextRawSets = updater(currentSets).map((s, idx) => ({
      ...s,
      setIndex: idx + 1,
    }));
    const evaluation = evaluateExercisePrUpdate(nextRawSets, existingPr);
    const annotatedSets = evaluation.annotatedSets;

    const prevPrCount = currentSets.filter((s) => s.completed && s.isPr).length;
    const nextPrCount = annotatedSets.filter((s) => s.completed && s.isPr).length;
    const hitNewPr = nextPrCount > prevPrCount;

    if (hitNewPr) {
      triggerPrFanfareAlert(alertPrefsRef.current);
      setLastHitWasCrit(true);
    } else if (options?.triggerStrike) {
      setLastHitWasCrit(false);
    }

    setSetsByExercise((prev) => ({
      ...prev,
      [ex.id]: annotatedSets,
    }));

    const allSetsDone = annotatedSets.length > 0 && annotatedSets.every((s) => s.completed);
    setExerciseProgress((prev) => {
      const alreadyDone = prev.completedIds.includes(ex.id);
      let nextCompletedIds = prev.completedIds;
      if (allSetsDone && !alreadyDone) {
        nextCompletedIds = [...prev.completedIds, ex.id];
      } else if (!allSetsDone && alreadyDone) {
        nextCompletedIds = prev.completedIds.filter((id) => id !== ex.id);
      }
      const nextAttackId =
        options?.triggerStrike || hitNewPr || (allSetsDone && !alreadyDone)
          ? prev.attackId + 1
          : prev.attackId;

      if (options?.startRestIfIncomplete) {
        const allExercisesDone = nextCompletedIds.length >= workout.exercises.length;
        if (!allExercisesDone) {
          startRestTimer(ex.restSeconds);
        }
      }

      return { completedIds: nextCompletedIds, attackId: nextAttackId };
    });
  };

  const handleToggleSetComplete = (ex: ExerciseItem, setIdx: number): void => {
    void unlockRestAudio();
    const currentSets = setsByExercise[ex.id] ?? [];
    const targetSet = currentSets[setIdx];
    const becomingCompleted = targetSet ? !targetSet.completed : false;

    updateExerciseSets(
      ex,
      (prevSets) =>
        prevSets.map((s, idx) =>
          idx === setIdx ? { ...s, completed: !s.completed } : s
        ),
      {
        startRestIfIncomplete: becomingCompleted,
        triggerStrike: becomingCompleted,
      }
    );
  };

  const handleSetWeightChange = (
    ex: ExerciseItem,
    setIdx: number,
    rawValue: string,
    commitBlur: boolean = false
  ): void => {
    const key = `${ex.id}:${setIdx}`;
    if (!commitBlur) {
      setSetWeightDraft((prev) => ({ ...prev, [key]: rawValue }));
    } else {
      setSetWeightDraft((prev) => {
        const copy = { ...prev };
        delete copy[key];
        return copy;
      });
    }

    const parsed = parseFloat(rawValue.replace(',', '.'));
    if (rawValue.trim() === '' || rawValue.endsWith('.') || Number.isNaN(parsed)) {
      return;
    }
    const clamped = Number(Math.min(500, Math.max(0, parsed)).toFixed(1));
    updateExerciseSets(ex, (prevSets) =>
      prevSets.map((s, idx) => (idx === setIdx ? { ...s, weightKg: clamped } : s))
    );
  };

  const handleSetRepsChange = (
    ex: ExerciseItem,
    setIdx: number,
    rawValue: string,
    commitBlur: boolean = false
  ): void => {
    const key = `${ex.id}:${setIdx}`;
    if (!commitBlur) {
      setSetRepsDraft((prev) => ({ ...prev, [key]: rawValue }));
    } else {
      setSetRepsDraft((prev) => {
        const copy = { ...prev };
        delete copy[key];
        return copy;
      });
    }

    const parsed = parseInt(rawValue, 10);
    if (rawValue.trim() === '' || Number.isNaN(parsed)) {
      return;
    }
    const clamped = Math.min(500, Math.max(0, parsed));
    updateExerciseSets(ex, (prevSets) =>
      prevSets.map((s, idx) => (idx === setIdx ? { ...s, reps: clamped } : s))
    );
  };

  const handleAddSet = (ex: ExerciseItem): void => {
    updateExerciseSets(ex, (prevSets) => {
      const lastSet = prevSets[prevSets.length - 1];
      return [
        ...prevSets,
        {
          setIndex: prevSets.length + 1,
          weightKg: lastSet?.weightKg ?? ex.loadKg ?? 0,
          reps: lastSet?.reps ?? parseExercisePrescription(ex.prescription).targetReps,
          completed: false,
          isPr: false,
        },
      ];
    });
  };

  const handleRemoveSet = (ex: ExerciseItem, setIdx: number): void => {
    updateExerciseSets(ex, (prevSets) => {
      if (prevSets.length <= 1) return prevSets;
      return prevSets.filter((_, idx) => idx !== setIdx);
    });
  };

  const toggleExercise = (exerciseId: string): void => {
    if (pendingCompletion) return;
    void unlockRestAudio();
    setSessionError(null);

    const ex = workout.exercises.find((item) => item.id === exerciseId);
    const wasCompleted = completedIds.includes(exerciseId);

    if (ex) {
      const currentSets =
        setsByExercise[exerciseId] ??
        buildInitialSetsForExercise(
          ex,
          prByExerciseId.get(ex.id) ?? null,
          lastPerformedByExerciseId.get(ex.id) ?? null
        );
      const nextRaw = currentSets.map((s) => ({
        ...s,
        completed: !wasCompleted,
      }));
      const evalRes = evaluateExercisePrUpdate(nextRaw, prByExerciseId.get(ex.id) ?? null);
      if (!wasCompleted && evalRes.hasPr) {
        triggerPrFanfareAlert(alertPrefsRef.current);
        setLastHitWasCrit(true);
      } else {
        setLastHitWasCrit(false);
      }
      setSetsByExercise((prev) => ({
        ...prev,
        [exerciseId]: evalRes.annotatedSets,
      }));

      if (!wasCompleted && completedIds.length + 1 < workout.exercises.length) {
        startRestTimer(ex.restSeconds);
      }
    }

    setExerciseProgress((prev) =>
      prev.completedIds.includes(exerciseId)
        ? { ...prev, completedIds: prev.completedIds.filter((id) => id !== exerciseId) }
        : { completedIds: [...prev.completedIds, exerciseId], attackId: prev.attackId + 1 }
    );
  };

  const gearBonusSummary = useMemo(
    () => calculateGearBonusSummary(equippedGear),
    [equippedGear]
  );

  const estimatedWorkoutXp = calculateProportionalXp(
    workout.baseXp,
    completedCount,
    totalExercises,
    gearBonusSummary.xpBonusPercent
  );
  const estimatedXp = estimatedWorkoutXp + performedEvaluationSummary.prXpBonus;

  const bossState = calculateWorkoutBossState(
    boss.maxHp,
    completedCount,
    totalExercises,
    elapsedSeconds,
    targetDurationSeconds,
    gearBonusSummary.bossDamageBonusPercent,
    {
      completedSets: completedSetsCount,
      totalSets: totalSetsCount,
      criticalHits: criticalHitsCount,
    }
  );
  const bossCurrentHp = bossState.currentHp;
  const bossDefeated = bossState.bossDefeated;
  const bossHpPercent = bossState.hpPercent;
  const estimatedCoins =
    calculateCoinsForWorkout(
      workout.baseXp,
      completedCount,
      totalExercises,
      bossDefeated,
      gearBonusSummary.coinBonusPercent
    ) + performedEvaluationSummary.prCoinsBonus;

  // Anel circular Focus Gate
  const remainingSeconds = Math.max(0, targetDurationSeconds - elapsedSeconds);
  const ringProgress = Math.min(1, elapsedSeconds / targetDurationSeconds);
  const ringRadius = 74;
  const ringCircumference = 2 * Math.PI * ringRadius;
  const ringOffset = ringCircumference * (1 - ringProgress);

  const currentExerciseIndex = workout.exercises.findIndex(
    (ex) => !completedIds.includes(ex.id)
  );
  const currentExercise =
    currentExerciseIndex >= 0 ? workout.exercises[currentExerciseIndex] : null;

  const handleOpenFinishConfirm = (): void => {
    if (pendingCompletion) {
      setConfirmation(pendingCompletion);
      return;
    }
    if (completedCount === 0) {
      setSessionError(
        'Conclua pelo menos 1 exercício antes de finalizar a sessão.'
      );
      return;
    }
    if (typeof crypto.randomUUID !== 'function') {
      setSessionError('Abra o aplicativo por HTTPS para salvar o treino.');
      return;
    }
    const at = Date.now();
    const seconds = Math.floor(getElapsedMs(at) / 1000);
    const confirmedBoss = calculateWorkoutBossState(
      boss.maxHp,
      completedCount,
      totalExercises,
      seconds,
      targetDurationSeconds,
      gearBonusSummary.bossDamageBonusPercent,
      {
        completedSets: completedSetsCount,
        totalSets: totalSetsCount,
        criticalHits: criticalHitsCount,
      }
    );
    const confirmedCoins =
      calculateCoinsForWorkout(
        workout.baseXp,
        completedCount,
        totalExercises,
        confirmedBoss.bossDefeated,
        gearBonusSummary.coinBonusPercent
      ) + performedEvaluationSummary.prCoinsBonus;

    setConfirmation({
      payload: {
        idempotencyKey: crypto.randomUUID(),
        completedExerciseIds: completedIds,
        elapsedSeconds: seconds,
        bossDefeated: confirmedBoss.bossDefeated,
        performedExercises: performedEvaluationSummary.performedExercises,
        dateKey: getLocalDateKey(new Date(at)),
      },
      bossHp: confirmedBoss.currentHp,
      xp: estimatedXp,
      coins: confirmedCoins,
      totalVolumeKg: performedEvaluationSummary.totalVolumeKg,
      prCount: performedEvaluationSummary.prCount,
      prExerciseNames: performedEvaluationSummary.prExerciseNames,
    });
  };

  const handleConfirmFinish = async (): Promise<void> => {
    if (submitting || !confirmation) return;
    setSubmitting(true);
    setCompletionError(null);
    setPendingCompletion(confirmation);
    try {
      const summary = await onCompleteSession(workout, confirmation.payload);
      setConfirmation(null);
      setRewardSummary(summary);
    } catch (err: unknown) {
      setCompletionError(getFriendlyErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleOpenExit = (event: React.MouseEvent<HTMLButtonElement>) => {
    exitOpener.current = event.currentTarget;
    setShowExitModal(true);
  };

  if (rewardSummary) {
    return (
      <div className="min-h-screen bg-[#09090B] text-zinc-100 px-4 py-8 flex flex-col justify-center">
        <div className="max-w-lg w-full mx-auto space-y-5">
          {rewardSummary.offlineQueued && (
            <div className="p-3.5 rounded-lg bg-amber-500/10 border border-amber-500/45 text-left text-xs text-amber-200 font-medium">
              Treino salvo localmente no modo offline — será sincronizado automaticamente ao recuperar conexão.
            </div>
          )}

          {rewardSummary.leveledUp && (
            <div className="p-5 rounded-lg bg-[#18181B] border border-orange-500/60 text-left space-y-1.5">
              <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-orange-400">
                <Crown size={18} strokeWidth={1.75} weight="regular" />
                Subida de nível desbloqueada
              </div>
              <h2 className="text-2xl font-bold tracking-tight text-white font-mono-tabular tabular-nums">
                {`Nível ${rewardSummary.newLevel} · ${
                  LEVEL_THRESHOLDS.find((t) => t.level === rewardSummary.newLevel)?.title ??
                  'Rank S Nacional'
                }`}
              </h2>
            </div>
          )}

          <div className="bg-[#18181B] border border-[#27272A] rounded-lg p-6 space-y-5">
            <div className="flex items-center justify-between gap-4">
              <div className="space-y-1 text-left">
                <span className="text-xs font-semibold text-emerald-400">
                  {rewardSummary.bossDefeated
                    ? `Chefe derrotado · ${rewardSummary.bossName ?? boss.name}`
                    : 'Sessão concluída'}
                </span>
                <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
                  {rewardSummary.workoutName}
                </h1>
              </div>
              <ShadowKnightSprite equippedGear={equippedGear} size="md" isCelebrating />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-left">
              <div className="p-4 rounded-md bg-[#111113] border border-[#27272A] space-y-1">
                <div className="text-xs font-medium text-zinc-400">
                  Experiência adquirida
                </div>
                <div className="text-2xl font-bold text-emerald-400 flex items-center gap-1.5 font-mono-tabular tabular-nums">
                  <Lightning size={18} strokeWidth={1.75} weight="regular" />
                  <AnimatedXpCounter targetValue={rewardSummary.totalXpGained} />
                </div>
                {(rewardSummary.bonusXp > 0 || (rewardSummary.gearXpBonus ?? 0) > 0) && (
                  <div className="text-[11px] text-zinc-400 font-medium font-mono-tabular tabular-nums">
                    ({rewardSummary.baseXpFromWorkout ?? rewardSummary.xpFromWorkout} base
                    {(rewardSummary.gearXpBonus ?? 0) > 0
                      ? ` + ${rewardSummary.gearXpBonus} Arsenal`
                      : ''}
                    {(rewardSummary.prXpBonus ?? 0) > 0
                      ? ` + ${rewardSummary.prXpBonus} PRs`
                      : ''}
                    {rewardSummary.bonusXp > (rewardSummary.prXpBonus ?? 0)
                      ? ` + ${rewardSummary.bonusXp - (rewardSummary.prXpBonus ?? 0)} conquista`
                      : ''}
                    )
                  </div>
                )}
              </div>

              <div className="p-4 rounded-md bg-[#111113] border border-[#27272A] space-y-1">
                <div className="text-xs font-medium text-zinc-400">
                  Moedas de Ouro
                </div>
                <div className="text-2xl font-bold text-orange-400 flex items-center gap-1.5 font-mono-tabular tabular-nums">
                  <Coins size={18} strokeWidth={1.75} weight="regular" />
                  +{rewardSummary.coinsEarned ?? estimatedCoins}
                </div>
                <div className="text-[11px] text-zinc-400 font-medium font-mono-tabular tabular-nums">
                  {(rewardSummary.gearCoinsBonus ?? 0) > 0
                    ? `Inclui +${rewardSummary.gearCoinsBonus} Arsenal (+${rewardSummary.gearBonusPercentCoins ?? 0}%)`
                    : (rewardSummary.prCoinsBonus ?? 0) > 0
                    ? `Inclui +${rewardSummary.prCoinsBonus} bônus por PR`
                    : 'Disponível no Arsenal'}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-left">
              <div className="p-3 rounded-md bg-[#111113] border border-[#27272A]">
                <div className="text-[11px] text-zinc-400">Exercícios</div>
                <div className="text-base font-bold text-white font-mono-tabular tabular-nums mt-0.5">
                  {rewardSummary.completedExercises}/{rewardSummary.totalExercises}
                </div>
              </div>
              <div className="p-3 rounded-md bg-[#111113] border border-[#27272A]">
                <div className="text-[11px] text-zinc-400">Duração</div>
                <div className="text-base font-bold text-white font-mono-tabular tabular-nums mt-0.5">
                  {rewardSummary.durationMinutes} min
                </div>
              </div>
              <div className="p-3 rounded-md bg-[#111113] border border-[#27272A]">
                <div className="text-[11px] text-zinc-400">Volume total</div>
                <div className="text-base font-bold text-emerald-400 font-mono-tabular tabular-nums mt-0.5">
                  {(rewardSummary.totalVolumeKg ?? 0).toLocaleString('pt-BR')} kg
                </div>
              </div>
              <div className="p-3 rounded-md bg-[#111113] border border-[#27272A]">
                <div className="text-[11px] text-zinc-400">Patente</div>
                <div className="text-base font-bold text-orange-400 font-mono-tabular tabular-nums mt-0.5">
                  {rewardSummary.isNowMaster ? 'Mestre' : `Nível ${rewardSummary.newLevel}`}
                </div>
              </div>
            </div>

            {(rewardSummary.prCount ?? 0) > 0 && (
              <div className="p-3.5 rounded-md bg-emerald-500/10 border border-emerald-500/40 text-left space-y-1">
                <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-400 font-mono-tabular tabular-nums">
                  <Trophy size={16} strokeWidth={1.75} weight="regular" />
                  {rewardSummary.prCount} Novo{rewardSummary.prCount === 1 ? '' : 's'} Recorde
                  {rewardSummary.prCount === 1 ? '' : 's'} Pessoal{rewardSummary.prCount === 1 ? '' : 'is'} (PR)!
                </div>
                {rewardSummary.prExerciseNames && rewardSummary.prExerciseNames.length > 0 && (
                  <p className="text-xs text-zinc-200">
                    {rewardSummary.prExerciseNames.join(' · ')}
                  </p>
                )}
              </div>
            )}
          </div>

          {rewardSummary.unlockedAchievements.length > 0 && (
            <div className="space-y-2.5 text-left">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-orange-400 flex items-center gap-1.5">
                <Medal size={18} strokeWidth={1.75} weight="regular" />
                Conquistas desbloqueadas ({rewardSummary.unlockedAchievements.length})
              </h3>
              {rewardSummary.unlockedAchievements.map((ach) => (
                <div
                  key={ach.id}
                  className="p-4 rounded-lg bg-[#18181B] border border-emerald-500/45 flex items-center gap-3.5"
                >
                  <div className="w-10 h-10 rounded-md bg-[#111113] border border-[#27272A] flex items-center justify-center shrink-0">
                    <AchievementGlyph id={ach.id} size={18} className="text-emerald-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-white">{ach.title}</span>
                      {ach.bonusXp > 0 && (
                        <span className="text-[11px] font-semibold text-emerald-400 font-mono-tabular tabular-nums">
                          +{ach.bonusXp} XP
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-zinc-400 mt-0.5">{ach.description}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          <button
            type="button"
            onClick={onCancelSession}
            className="w-full min-h-[44px] py-3 px-5 rounded-md bg-[#F97316] hover:bg-orange-400 text-zinc-950 font-semibold text-sm transition-colors cursor-pointer"
          >
            Voltar ao início
          </button>
        </div>
      </div>
    );
  }

  const currentSets = currentExercise
    ? setsByExercise[currentExercise.id] ?? []
    : [];
  const currentPrescribedSets = currentExercise
    ? parseExercisePrescription(currentExercise.prescription).setsCount
    : 3;
  const currentTimeBased = currentExercise
    ? parseExercisePrescription(currentExercise.prescription).isTimeBased
    : false;
  const currentLastPerformed = currentExercise
    ? lastPerformedByExerciseId.get(currentExercise.id)
    : undefined;
  const currentPrRecord = currentExercise
    ? prByExerciseId.get(currentExercise.id)
    : undefined;
  const currentExerciseCompletedVolume = currentSets
    .filter((s) => s.completed)
    .reduce((acc, s) => acc + s.weightKg * s.reps, 0);

  return (
    <div className="min-h-screen bg-[#09090B] text-zinc-100 pb-24">
      <header className="sticky top-0 z-20 bg-[#111113] border-b border-[#27272A] px-3 sm:px-4 py-2.5">
        <div className="max-w-2xl mx-auto flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={handleOpenExit}
            className="min-h-11 min-w-11 rounded-md bg-[#18181B] border border-[#27272A] text-zinc-400 hover:text-white flex items-center justify-center transition-colors shrink-0 cursor-pointer"
            aria-label="Retirar-se do treino"
          >
            <X size={18} strokeWidth={1.75} weight="regular" />
          </button>

          <div className="text-left min-w-0 flex-1">
            <div className="text-[11px] font-mono-tabular font-semibold text-orange-400">
              Modo foco · Rank {normalizeHunterRank(workout.rank, 'F')}
            </div>
            <h1 className="text-sm font-bold text-white truncate">{workout.name}</h1>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <span className="px-2.5 py-2 rounded-sm bg-[#18181B] border border-[#27272A] text-emerald-400 font-semibold text-xs font-mono-tabular tabular-nums whitespace-nowrap shrink-0">
              +{estimatedXp} XP
            </span>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 pt-4 space-y-5">
        <ErrorBanner message={sessionError} onDismiss={() => setSessionError(null)} />

        {restFinishedNotice && (
          <div
            role="status"
            className="p-3.5 rounded-lg bg-emerald-500/10 border border-emerald-500/50 flex items-center justify-between gap-3 text-left"
          >
            <div className="flex items-center gap-2 text-xs sm:text-sm font-semibold text-emerald-300">
              <CheckCircle size={18} strokeWidth={1.75} weight="fill" className="text-emerald-400 shrink-0" />
              <span>Descanso concluído — hora da próxima série</span>
            </div>
            <button
              type="button"
              onClick={() => setRestFinishedNotice(false)}
              className="min-h-11 min-w-11 px-3 rounded-md bg-[#111113] border border-emerald-500/35 text-xs font-semibold text-emerald-300 hover:text-white cursor-pointer"
            >
              Ok
            </button>
          </div>
        )}

        {/* Anel Circular Focus Gate + Arena de Batalha */}
        <section className="bg-[#18181B] border border-[#27272A] rounded-lg p-4 sm:p-6 space-y-5">
          {/* Anel Circular */}
          <div className="flex flex-col items-center justify-center space-y-3">
            <div className="relative w-40 h-40 sm:w-44 sm:h-44 flex items-center justify-center">
              <svg viewBox="0 0 180 180" className="w-full h-full -rotate-90">
                <circle
                  cx="90"
                  cy="90"
                  r={ringRadius}
                  fill="none"
                  stroke="#27272A"
                  strokeWidth="8"
                />
                <circle
                  cx="90"
                  cy="90"
                  r={ringRadius}
                  fill="none"
                  stroke={remainingSeconds === 0 ? '#10B981' : '#F97316'}
                  strokeWidth="8"
                  strokeLinecap="round"
                  strokeDasharray={ringCircumference}
                  strokeDashoffset={ringOffset}
                  className="transition-all duration-700"
                />
              </svg>

              <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                <span
                  className={`text-[10px] font-mono-tabular font-semibold tracking-wider uppercase px-2 py-0.5 rounded-sm border mb-1 ${getHunterRankBadgeClass(
                    workout.rank
                  )}`}
                >
                  RANK {normalizeHunterRank(workout.rank, 'F')}
                </span>
                <div className="text-3xl font-bold text-white font-mono-tabular tabular-nums tracking-tight">
                  {remainingSeconds > 0
                    ? formatSecondsMMSS(remainingSeconds)
                    : formatSecondsMMSS(elapsedSeconds)}
                </div>
                <span className="text-[11px] text-zinc-400 font-mono-tabular tabular-nums mt-0.5">
                  {remainingSeconds > 0
                    ? `Decorrido: ${formatSecondsMMSS(elapsedSeconds)}`
                    : 'Tempo alvo atingido'}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={togglePause}
                disabled={pendingCompletion !== null}
                className={`min-h-[44px] px-4 py-2 rounded-md font-semibold text-xs flex items-center gap-2 border transition-colors cursor-pointer ${
                  isPaused
                    ? 'bg-[#10B981] text-zinc-950 border-emerald-400'
                    : 'bg-[#111113] text-zinc-200 border-[#27272A] hover:border-zinc-600'
                }`}
              >
                {isPaused ? (
                  <>
                    <Play size={18} strokeWidth={1.75} weight="fill" />
                    Continuar
                  </>
                ) : (
                  <>
                    <Pause size={18} strokeWidth={1.75} weight="regular" />
                    Pausar
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handleOpenExit}
                className="min-h-[44px] px-3.5 py-2 rounded-md bg-[#111113] hover:bg-red-500/10 border border-[#27272A] hover:border-red-500/40 text-red-400 font-semibold text-xs transition-colors cursor-pointer"
              >
                Recuar
              </button>
            </div>
          </div>

          {/* Card do Chefe */}
          <div className="p-4 sm:p-5 rounded-lg bg-[#111113] border border-[#27272A] space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <Skull
                  size={18} strokeWidth={1.75}
                  weight="regular"
                  className={`shrink-0 ${
                    bossDefeated ? 'text-emerald-400' : 'text-red-400'
                  }`}
                />
                <span className="text-sm font-bold text-white truncate">
                  {boss.name}
                </span>
              </div>

              <span
                className={`text-xs font-semibold font-mono-tabular tabular-nums shrink-0 ${
                  bossDefeated ? 'text-emerald-400' : 'text-red-400'
                }`}
              >
                {bossDefeated ? 'DERROTADO' : `${bossCurrentHp} / ${boss.maxHp} HP`}
              </span>
            </div>

            <div className="w-full h-2 rounded-sm bg-[#09090B] border border-[#27272A] overflow-hidden">
              <div
                className={`h-full rounded-sm transition-all duration-500 ${
                  bossDefeated ? 'bg-[#10B981]' : 'bg-[#F97316]'
                }`}
                style={{ width: `${bossHpPercent}%` }}
              />
            </div>

            {/* Palco Cavaleiro vs Chefe */}
            <div className="flex items-center justify-around py-2">
              <div className="flex flex-col items-center gap-1">
                <ShadowKnightSprite
                  equippedGear={equippedGear}
                  size="lg"
                  attackId={attackId}
                />
                <span className="text-[11px] font-semibold text-zinc-300">Seu herói</span>
              </div>

              <div className="flex flex-col items-center gap-1 text-zinc-500">
                <Sword
                  size={18} strokeWidth={1.75}
                  weight="regular"
                  key={attackId}
                  className={attackId ? 'ui-combat-flash text-zinc-500' : 'text-zinc-500'}
                />
                <span className="text-[10px] font-mono-tabular tabular-nums text-zinc-400">
                  {completedSetsCount}/{totalSetsCount} séries
                </span>
                {criticalHitsCount > 0 && (
                  <span className="text-[10px] font-mono-tabular tabular-nums font-semibold text-orange-400 flex items-center gap-0.5">
                    <Fire size={12} weight="fill" /> {criticalHitsCount} crítico{criticalHitsCount === 1 ? '' : 's'}
                  </span>
                )}
              </div>

              <div className="flex flex-col items-center gap-1">
                <DungeonBossSprite
                  variant={boss.variant}
                  hitId={attackId}
                  isDefeated={bossDefeated}
                  isCriticalHit={lastHitWasCrit}
                />
                <span className="text-[11px] font-semibold text-zinc-400">
                  Chefe Rank {boss.bossRank}
                </span>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-zinc-400 pt-2 border-t border-[#27272A]">
              <span>
                {boss.subtitle}
                {gearBonusSummary.bossDamageBonusPercent > 0 && (
                  <span className="text-orange-400 font-semibold font-mono-tabular tabular-nums ml-1.5">
                    · +{gearBonusSummary.bossDamageBonusPercent}% dano Arsenal
                  </span>
                )}
              </span>
              <span className="font-semibold text-orange-400 font-mono-tabular tabular-nums">
                Recompensa: +{boss.coinReward} moedas bônus
              </span>
            </div>
          </div>

          {restTimerSeconds > 0 && (
            <div className="p-3.5 rounded-md bg-[#111113] border border-orange-500/45 flex flex-wrap items-center justify-between gap-2.5">
              <div className="flex items-center gap-2 text-xs font-semibold text-zinc-200">
                <Clock size={18} strokeWidth={1.75} weight="regular" className="text-orange-400" />
                Descanso:
                <span className="text-lg font-bold text-white font-mono-tabular tabular-nums">
                  {formatSecondsMMSS(restTimerSeconds)}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const currentAt = Date.now();
                    const nextEnd = (restEndWallMs ?? currentAt) - 15_000;
                    if (nextEnd <= currentAt) {
                      restTriggeredRef.current = true;
                      setRestEndWallMs(null);
                      setRestFinishedNotice(false);
                    } else {
                      setRestEndWallMs(nextEnd);
                      setNow(currentAt);
                    }
                  }}
                  aria-label="Reduzir 15 segundos de descanso"
                  className="min-h-[44px] min-w-[52px] text-xs font-semibold text-zinc-200 hover:text-white px-2.5 rounded-md bg-[#18181B] border border-[#27272A] flex items-center justify-center gap-1 font-mono-tabular tabular-nums cursor-pointer"
                >
                  <Minus size={14} strokeWidth={1.75} weight="regular" /> 15s
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const currentAt = Date.now();
                    setRestEndWallMs((prev) => Math.max(prev ?? currentAt, currentAt) + 15_000);
                    setNow(currentAt);
                  }}
                  aria-label="Adicionar 15 segundos de descanso"
                  className="min-h-[44px] min-w-[52px] text-xs font-semibold text-zinc-200 hover:text-white px-2.5 rounded-md bg-[#18181B] border border-[#27272A] flex items-center justify-center gap-1 font-mono-tabular tabular-nums cursor-pointer"
                >
                  <Plus size={14} strokeWidth={1.75} weight="regular" /> 15s
                </button>
                <button
                  type="button"
                  onClick={() => {
                    restTriggeredRef.current = true;
                    setRestEndWallMs(null);
                    setRestFinishedNotice(false);
                  }}
                  className="min-h-[44px] min-w-[68px] text-xs font-semibold text-zinc-950 bg-[#F97316] hover:bg-orange-400 px-3 rounded-md flex items-center justify-center gap-1 cursor-pointer"
                >
                  <SkipForward size={16} strokeWidth={1.75} weight="regular" /> Pular
                </button>
              </div>
            </div>
          )}
        </section>

        {currentExercise ? (
          <section className="bg-[#18181B] border border-orange-500/55 rounded-lg p-4 sm:p-5 space-y-4 text-left">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-semibold text-orange-400 font-mono-tabular tabular-nums">
                Exercício atual · {currentExerciseIndex + 1}/{totalExercises}
              </span>
              <button
                type="button"
                disabled={pendingCompletion !== null}
                onClick={() => startRestTimer(currentExercise.restSeconds)}
                className="min-h-[44px] text-xs font-semibold text-zinc-200 hover:text-white bg-[#111113] px-3 py-1.5 rounded-md border border-[#27272A] flex items-center gap-1.5 font-mono-tabular tabular-nums cursor-pointer"
              >
                <Clock size={18} strokeWidth={1.75} weight="regular" className="text-orange-400" />
                Descanso ({currentExercise.restSeconds}s)
              </button>
            </div>

            <div>
              <div className="flex items-start justify-between gap-2">
                <h2 className="text-lg sm:text-xl font-bold tracking-tight text-white">
                  {currentExercise.name}
                  {currentExercise.unilateral && (
                    <span className="ml-2 text-xs font-semibold uppercase text-zinc-400">
                      · Unilateral
                    </span>
                  )}
                </h2>
                <div className="flex items-center gap-1.5 -mt-1 -mr-1.5 shrink-0">
                  <button
                    type="button"
                    ref={settingsOpener}
                    onClick={() => {
                      void unlockRestAudio();
                      setShowExerciseSettingsModal(true);
                    }}
                    aria-label={`Ajustar séries, carga e alertas de ${currentExercise.name}`}
                    title="Ajustar séries reais, carga padrão e alertas do descanso"
                    className="min-h-11 min-w-11 rounded-md flex items-center justify-center bg-[#111113] hover:bg-zinc-800 border border-[#27272A] text-zinc-300 hover:text-orange-400 transition-colors shrink-0 cursor-pointer"
                  >
                    <Gear size={18} strokeWidth={1.75} weight="regular" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedExerciseForInfo(currentExercise)}
                    aria-label={`Ver guia técnico e foco muscular de ${currentExercise.name}`}
                    title="Guia técnico, foco muscular e estratégia de XP"
                    className="min-h-11 min-w-11 rounded-md flex items-center justify-center bg-[#111113] hover:bg-zinc-800 border border-[#27272A] text-zinc-300 hover:text-orange-400 transition-colors shrink-0 cursor-pointer"
                  >
                    <Info size={18} strokeWidth={1.75} weight="regular" />
                  </button>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs mt-2">
                <span className="text-orange-400 font-semibold font-mono-tabular tabular-nums">
                  {currentExercise.prescription}
                </span>
                <span aria-hidden="true" className="text-zinc-600">·</span>
                <span className="text-zinc-400 font-medium">
                  Alvo: {currentExercise.muscleGroups.join(', ')}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-zinc-400 mt-1.5 font-mono-tabular tabular-nums">
                <span>
                  Séries: {currentSets.filter((s) => s.completed).length}/{currentSets.length}
                </span>
                {(currentExercise.loadKg !== undefined || currentExercise.equipment) && (
                  <>
                    <span aria-hidden="true" className="text-zinc-600">·</span>
                    <span className="text-zinc-300 font-medium">
                      Carga:{' '}
                      {getEffectiveLoadKg(currentExercise.id, currentExercise.loadKg) > 0
                        ? `${getEffectiveLoadKg(currentExercise.id, currentExercise.loadKg)} kg`
                        : 'Peso corporal'}
                    </span>
                  </>
                )}
                {currentExerciseCompletedVolume > 0 && (
                  <>
                    <span aria-hidden="true" className="text-zinc-600">·</span>
                    <span className="text-emerald-400 font-semibold">
                      Volume: {currentExerciseCompletedVolume.toLocaleString('pt-BR')} kg
                    </span>
                  </>
                )}
                {currentPrRecord && (
                  <>
                    <span aria-hidden="true" className="text-zinc-600">·</span>
                    <span>
                      PR: {currentPrRecord.bestWeightKg} kg × {currentPrRecord.bestReps}
                    </span>
                  </>
                )}
              </div>
              {currentExercise.equipment && (
                <div className="flex items-center gap-1.5 text-xs text-zinc-300 mt-1.5">
                  <Barbell size={18} strokeWidth={1.75} weight="regular" className="text-zinc-400 shrink-0" />
                  <span>{currentExercise.equipment}</span>
                </div>
              )}
            </div>

            {/* Demonstração Animada em Loop */}
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => setShowDemoExpanded((prev) => !prev)}
                className="w-full min-h-[44px] px-3.5 py-2 rounded-md bg-[#111113] border border-[#27272A] flex items-center justify-between text-xs font-semibold text-zinc-200 hover:bg-zinc-800/50 transition-colors cursor-pointer"
              >
                <span className="flex items-center gap-1.5">
                  <Video size={18} strokeWidth={1.75} weight="regular" className="text-orange-400" />
                  Demonstração do movimento
                </span>
                {showDemoExpanded ? (
                  <CaretUp size={18} strokeWidth={1.75} weight="regular" className="text-zinc-400" />
                ) : (
                  <CaretDown size={18} strokeWidth={1.75} weight="regular" className="text-zinc-400" />
                )}
              </button>
              {showDemoExpanded && (
                <ExerciseDemoPlayer exercise={currentExercise} compact />
              )}
            </div>

            <div className="rounded-md bg-[#111113] border border-[#27272A] overflow-hidden">
              <button
                type="button"
                onClick={() => setShowTipExpanded((prev) => !prev)}
                className="w-full min-h-[44px] px-3.5 py-2.5 flex items-center justify-between text-xs font-semibold text-zinc-200 hover:bg-zinc-800/40 cursor-pointer"
              >
                <span>Dicas técnicas de execução</span>
                {showTipExpanded ? (
                  <CaretUp size={18} strokeWidth={1.75} weight="regular" className="text-zinc-400" />
                ) : (
                  <CaretDown size={18} strokeWidth={1.75} weight="regular" className="text-zinc-400" />
                )}
              </button>
              {showTipExpanded && (
                <div className="px-3.5 pb-3 text-xs text-zinc-300 leading-relaxed border-t border-[#27272A] pt-2.5">
                  {currentExercise.executionTip}
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => toggleExercise(currentExercise.id)}
              disabled={pendingCompletion !== null}
              className="w-full min-h-[44px] py-3 rounded-md bg-[#10B981] hover:bg-emerald-400 text-zinc-950 font-semibold text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <CheckCircle size={18} strokeWidth={1.75} weight="regular" />
              Concluir exercício e atacar chefe
            </button>
          </section>
        ) : (
          <section className="p-5 rounded-lg bg-[#18181B] border border-emerald-500/45 text-left space-y-1">
            <div className="text-base font-bold text-emerald-400">
              Chefe derrotado · Todos os exercícios concluídos
            </div>
            <p className="text-xs text-zinc-300">
              Toque em &ldquo;Finalizar treino&rdquo; abaixo para resgatar +{estimatedXp} XP e +{estimatedCoins} Moedas.
            </p>
          </section>
        )}

        <section className="space-y-2.5 text-left">
          <h3 className="text-xs font-semibold text-zinc-400 font-mono-tabular tabular-nums">
            Lista de exercícios ({completedCount}/{totalExercises})
          </h3>
          {workout.exercises.map((ex, idx) => {
            const done = completedIds.includes(ex.id);
            const isCurrent = currentExercise?.id === ex.id;
            const effectiveLoad = getEffectiveLoadKg(ex.id, ex.loadKg);
            const hasLoadMeta = ex.loadKg !== undefined || Boolean(ex.equipment);
            const exSets = setsByExercise[ex.id] ?? [];
            const exDoneSets = exSets.filter((s) => s.completed).length;

            return (
              <div
                key={ex.id}
                onClick={() => toggleExercise(ex.id)}
                role="checkbox"
                aria-checked={done}
                aria-disabled={pendingCompletion !== null}
                tabIndex={pendingCompletion ? -1 : 0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    toggleExercise(ex.id);
                  }
                }}
                className={`p-4 rounded-lg border cursor-pointer transition-colors flex items-center gap-3.5 ${
                  done
                    ? 'bg-[#111113] border-emerald-500/40'
                    : isCurrent
                    ? 'bg-[#18181B] border-orange-500/55'
                    : 'bg-[#18181B] border-[#27272A] hover:border-zinc-600'
                }`}
              >
                <div className="shrink-0">
                  {done ? (
                    <CheckCircle size={18} strokeWidth={1.75} weight="regular" className="text-emerald-400" />
                  ) : (
                    <Circle size={18} strokeWidth={1.75} weight="regular" className="text-zinc-600" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div
                      className={`font-semibold text-sm pt-0.5 ${
                        done ? 'line-through text-zinc-500' : 'text-white'
                      }`}
                    >
                      {idx + 1}. {ex.name}
                      {ex.unilateral && (
                        <span className="ml-1.5 text-[10px] font-semibold uppercase text-zinc-400">
                          · Unilateral
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {hasLoadMeta && (
                        <span className="text-xs font-semibold text-orange-400 font-mono-tabular tabular-nums">
                          {effectiveLoad > 0 ? `${effectiveLoad} kg` : 'Peso corporal'}
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedExerciseForInfo(ex);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.stopPropagation();
                          }
                        }}
                        aria-label={`Ver guia técnico e foco muscular de ${ex.name}`}
                        title="Guia técnico e foco muscular"
                        className="min-h-11 min-w-11 -my-2 -mr-2 rounded-md flex items-center justify-center text-zinc-400 hover:text-orange-400 hover:bg-zinc-800/60 transition-colors cursor-pointer"
                      >
                        <Info size={18} strokeWidth={1.75} weight="regular" />
                      </button>
                    </div>
                  </div>
                  <div className="text-xs text-zinc-400 mt-0.5 font-mono-tabular tabular-nums">
                    {ex.prescription} · {exDoneSets}/{exSets.length} séries · Descanso {ex.restSeconds}s
                  </div>
                  {ex.equipment && (
                    <div className="text-[11px] text-zinc-500 mt-0.5 flex items-center gap-1">
                      <Barbell size={18} strokeWidth={1.75} weight="regular" className="text-zinc-500 shrink-0" />
                      <span className="truncate">{ex.equipment}</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </section>
      </main>

      <footer className="fixed bottom-0 inset-x-0 bg-[#111113]/95 backdrop-blur border-t border-[#27272A] px-3 pt-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] z-20">
        <div className="max-w-2xl mx-auto">
          <Dialog.Root open={confirmation !== null} onOpenChange={(open) => {
            if (open) handleOpenFinishConfirm();
            else if (!submitting) setConfirmation(null);
          }}>
            <Dialog.Trigger asChild>
              <button
                type="button"
                disabled={completedCount === 0}
                className="w-full min-h-[44px] py-2.5 px-4 rounded-md bg-[#F97316] hover:bg-orange-400 disabled:bg-[#18181B] disabled:text-zinc-500 disabled:border disabled:border-[#27272A] disabled:cursor-not-allowed text-zinc-950 font-semibold text-sm transition-colors flex items-center justify-center gap-2 font-mono-tabular tabular-nums cursor-pointer"
              >
                <Trophy size={18} strokeWidth={1.75} weight="regular" />
                {pendingCompletion
                  ? 'Revisar envio pendente'
                  : completedCount === 0
                  ? 'Conclua 1 exercício para finalizar'
                  : `Finalizar treino (+${estimatedXp} XP · +${estimatedCoins} Moedas)`}
              </button>
            </Dialog.Trigger>
            {confirmation && (
              <Dialog.Portal>
                <Dialog.Overlay className="ui-dialog-overlay fixed inset-0 z-50 bg-black/85" />
                <Dialog.Content className="ui-dialog-enter fixed left-1/2 top-1/2 z-50 max-h-[90dvh] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-lg border border-[#27272A] bg-[#18181B] p-6 text-left space-y-5">
                  <div className="space-y-1">
                    <Dialog.Title className="text-lg font-bold text-white">Finalizar sessão?</Dialog.Title>
                    <Dialog.Description className="text-xs text-zinc-400">
                      {pendingCompletion
                        ? 'O reenvio mantém os dados da primeira tentativa.'
                        : 'Revise o resumo antes de salvar o treino.'}
                    </Dialog.Description>
                  </div>

                  <div className="p-4 rounded-md bg-[#111113] border border-[#27272A] space-y-2.5 text-sm">
                    <div className="flex justify-between">
                      <span className="text-zinc-400">Exercícios concluídos</span>
                      <span className="font-semibold text-white font-mono-tabular tabular-nums">
                        {confirmation.payload.completedExerciseIds.length}/{totalExercises}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-zinc-400">Volume total</span>
                      <span className="font-semibold text-white font-mono-tabular tabular-nums">
                        {confirmation.totalVolumeKg.toLocaleString('pt-BR')} kg
                      </span>
                    </div>
                    {confirmation.prCount > 0 && (
                      <div className="flex justify-between">
                        <span className="text-emerald-400 font-semibold">Novos PRs</span>
                        <span className="font-semibold text-emerald-400 font-mono-tabular tabular-nums">
                          {confirmation.prCount} exercício{confirmation.prCount === 1 ? '' : 's'}
                        </span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-zinc-400">Chefe ({boss.name})</span>
                      <span className={confirmation.payload.bossDefeated ? 'text-emerald-400' : 'text-orange-400'}>
                        {confirmation.payload.bossDefeated ? 'Derrotado' : `${confirmation.bossHp}/${boss.maxHp} HP`}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-zinc-400">Tempo total</span>
                      <span className="font-semibold text-white font-mono-tabular tabular-nums">
                        {formatSecondsMMSS(confirmation.payload.elapsedSeconds)}
                      </span>
                    </div>
                    <div className="flex justify-between border-t border-[#27272A] pt-2.5">
                      <span className="text-zinc-200 font-semibold">Recompensa estimada</span>
                      <span className="font-bold text-emerald-400 font-mono-tabular tabular-nums">
                        +{confirmation.xp} XP · +{confirmation.coins} Moedas
                      </span>
                    </div>
                  </div>

                  <ErrorBanner message={completionError} />
                  <div className="flex items-center gap-3">
                    <Dialog.Close asChild>
                      <button
                        type="button"
                        disabled={submitting}
                        className="flex-1 min-h-11 rounded-md bg-[#111113] border border-[#27272A] text-zinc-300 hover:text-white font-semibold text-xs cursor-pointer"
                      >
                        Voltar
                      </button>
                    </Dialog.Close>
                    <button
                      type="button"
                      disabled={submitting}
                      onClick={() => void handleConfirmFinish()}
                      className="flex-1 min-h-11 rounded-md bg-[#10B981] hover:bg-emerald-400 text-zinc-950 font-semibold text-xs flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      {submitting ? (
                        <ArrowsClockwise size={18} strokeWidth={1.75} weight="regular" className="animate-spin" />
                      ) : (
                        <Check size={18} strokeWidth={1.75} weight="regular" />
                      )}
                      {submitting ? 'Salvando…' : pendingCompletion ? 'Reenviar treino' : 'Salvar treino'}
                    </button>
                  </div>
                </Dialog.Content>
              </Dialog.Portal>
            )}
          </Dialog.Root>
        </div>
      </footer>

      <Dialog.Root open={showExitModal} onOpenChange={setShowExitModal}>
        <Dialog.Portal>
          <Dialog.Overlay className="ui-dialog-overlay fixed inset-0 z-50 bg-black/85" />
          <Dialog.Content
            className="ui-dialog-enter fixed left-1/2 top-1/2 z-50 max-h-[90dvh] w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-lg border border-[#27272A] bg-[#18181B] p-6 text-left space-y-4"
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              exitOpener.current?.focus();
            }}
          >
            <Dialog.Title className="text-lg font-bold text-white">Encerrar sessão?</Dialog.Title>
            <Dialog.Description className="text-xs text-zinc-400 leading-relaxed">
              {pendingCompletion
                ? 'O envio anterior pode ter sido registrado. Confira o histórico se sair agora.'
                : 'Sair agora descartará o progresso desta sessão.'}
            </Dialog.Description>
            <div className="flex items-center gap-3">
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="flex-1 min-h-11 rounded-md bg-[#111113] border border-[#27272A] text-zinc-200 font-semibold text-xs cursor-pointer"
                >
                  Voltar
                </button>
              </Dialog.Close>
              <button
                type="button"
                onClick={onCancelSession}
                className="flex-1 min-h-11 rounded-md bg-red-600 hover:bg-red-500 text-white font-semibold text-xs cursor-pointer"
              >
                Sair da sessão
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <Dialog.Root
        open={showExerciseSettingsModal && currentExercise !== null}
        onOpenChange={setShowExerciseSettingsModal}
      >
        {currentExercise && (
          <Dialog.Portal>
            <Dialog.Overlay className="ui-dialog-overlay fixed inset-0 z-50 bg-black/85 backdrop-blur-sm" />
            <Dialog.Content
              className="fixed inset-x-0 bottom-0 z-50 max-h-[88dvh] w-full overflow-y-auto rounded-t-2xl border-t border-[#27272A] bg-[#18181B] p-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-left space-y-5 sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:w-[calc(100%-2rem)] sm:max-w-md sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-lg sm:border sm:p-6"
              onCloseAutoFocus={(event) => {
                event.preventDefault();
                settingsOpener.current?.focus();
              }}
            >
              <div className="sm:hidden w-10 h-1.5 bg-zinc-700 rounded-full mx-auto -mt-1 mb-1" aria-hidden="true" />

              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1 min-w-0">
                  <Dialog.Title className="text-base sm:text-lg font-bold text-white truncate">
                    {currentExercise.name}
                  </Dialog.Title>
                  <Dialog.Description className="text-xs text-zinc-400">
                    Séries reais, carga padrão e alertas do descanso
                  </Dialog.Description>
                </div>
                <Dialog.Close asChild>
                  <button
                    type="button"
                    aria-label="Fechar ajustes do exercício"
                    className="min-h-11 min-w-11 -mt-1 -mr-1 rounded-md bg-[#111113] border border-[#27272A] text-zinc-400 hover:text-white flex items-center justify-center shrink-0 cursor-pointer"
                  >
                    <X size={18} strokeWidth={1.75} weight="regular" />
                  </button>
                </Dialog.Close>
              </div>

              {/* 1. Registro Real de Séries (Peso × Reps) & PR */}
              <div className="p-3.5 rounded-md bg-[#111113] border border-[#27272A] space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="space-y-0.5">
                    <div className="text-xs font-semibold text-white">
                      Séries reais ({currentSets.filter((s) => s.completed).length}/{currentSets.length})
                    </div>
                    {(currentLastPerformed || currentPrRecord) && (
                      <div className="text-[11px] text-zinc-400 font-mono-tabular tabular-nums">
                        {currentPrRecord
                          ? `PR: ${currentPrRecord.bestWeightKg} kg × ${currentPrRecord.bestReps} (1RM ${currentPrRecord.estimated1RmKg} kg)`
                          : ''}
                        {currentPrRecord && currentLastPerformed ? ' · ' : ''}
                        {currentLastPerformed && currentLastPerformed.sets[0]
                          ? `Anterior: ${currentLastPerformed.sets[0].weightKg} kg × ${currentLastPerformed.sets[0].reps}`
                          : ''}
                      </div>
                    )}
                  </div>

                  {currentExerciseCompletedVolume > 0 && (
                    <span className="text-[11px] font-semibold text-emerald-400 font-mono-tabular tabular-nums">
                      Volume: {currentExerciseCompletedVolume.toLocaleString('pt-BR')} kg
                    </span>
                  )}
                </div>

                <div className="space-y-2">
                  {currentSets.map((setRow, idx) => {
                    const key = `${currentExercise.id}:${idx}`;
                    const wValue = setWeightDraft[key] ?? String(setRow.weightKg);
                    const rValue = setRepsDraft[key] ?? String(setRow.reps);

                    return (
                      <div
                        key={key}
                        className={`p-2 rounded-md border transition-colors ${
                          setRow.completed && setRow.isPr
                            ? 'bg-emerald-500/10 border-emerald-500/50'
                            : setRow.completed
                            ? 'bg-[#18181B] border-emerald-500/35'
                            : 'bg-[#09090B] border-[#27272A]'
                        }`}
                      >
                        <div className="flex items-center gap-1.5 sm:gap-2">
                          <span className="w-7 text-xs font-bold text-zinc-400 font-mono-tabular tabular-nums shrink-0 text-center">
                            S{idx + 1}
                          </span>

                          <div className="flex-1 min-w-0 flex items-center bg-[#111113] border border-[#27272A] focus-within:border-orange-500 rounded-md px-2 min-h-[44px]">
                            <input
                              type="number"
                              inputMode="decimal"
                              step="0.5"
                              min="0"
                              max="500"
                              aria-label={`Carga da série ${idx + 1} em kg`}
                              value={wValue}
                              onChange={(e) =>
                                handleSetWeightChange(currentExercise, idx, e.target.value, false)
                              }
                              onBlur={(e) =>
                                handleSetWeightChange(currentExercise, idx, e.target.value, true)
                              }
                              className="w-full min-w-0 bg-transparent text-center text-base font-bold text-white font-mono-tabular tabular-nums focus:outline-none"
                            />
                            <span className="text-[11px] font-medium text-zinc-400 ml-1 shrink-0">
                              kg
                            </span>
                          </div>

                          <span className="text-xs text-zinc-500 font-bold shrink-0">×</span>

                          <div className="w-20 sm:w-24 flex items-center bg-[#111113] border border-[#27272A] focus-within:border-orange-500 rounded-md px-2 min-h-[44px] shrink-0">
                            <input
                              type="number"
                              inputMode="numeric"
                              step="1"
                              min="0"
                              max="500"
                              aria-label={`${currentTimeBased ? 'Segundos' : 'Repetições'} da série ${idx + 1}`}
                              value={rValue}
                              onChange={(e) =>
                                handleSetRepsChange(currentExercise, idx, e.target.value, false)
                              }
                              onBlur={(e) =>
                                handleSetRepsChange(currentExercise, idx, e.target.value, true)
                              }
                              className="w-full min-w-0 bg-transparent text-center text-base font-bold text-white font-mono-tabular tabular-nums focus:outline-none"
                            />
                            <span className="text-[11px] font-medium text-zinc-400 ml-1 shrink-0">
                              {currentTimeBased ? 's' : 'rep'}
                            </span>
                          </div>

                          <button
                            type="button"
                            onClick={() => handleToggleSetComplete(currentExercise, idx)}
                            aria-pressed={setRow.completed}
                            aria-label={
                              setRow.completed
                                ? `Desmarcar série ${idx + 1}`
                                : `Concluir série ${idx + 1}`
                            }
                            className={`min-h-[44px] min-w-[44px] rounded-md flex items-center justify-center border transition-colors shrink-0 cursor-pointer ${
                              setRow.completed
                                ? 'bg-[#10B981] border-emerald-400 text-zinc-950'
                                : 'bg-[#18181B] border-[#27272A] text-zinc-400 hover:text-white hover:border-zinc-500'
                            }`}
                          >
                            <Check size={18} strokeWidth={2} weight="bold" />
                          </button>

                          {idx >= currentPrescribedSets && currentSets.length > 1 && (
                            <button
                              type="button"
                              onClick={() => handleRemoveSet(currentExercise, idx)}
                              aria-label={`Remover série ${idx + 1}`}
                              className="min-h-[44px] min-w-[44px] rounded-md flex items-center justify-center bg-[#18181B] border border-[#27272A] text-zinc-400 hover:text-red-400 transition-colors shrink-0 cursor-pointer"
                            >
                              <Trash size={16} strokeWidth={1.75} weight="regular" />
                            </button>
                          )}
                        </div>

                        {setRow.completed && setRow.isPr && (
                          <div className="mt-1.5 pl-9 flex items-center gap-1.5 text-[11px] font-bold text-emerald-400">
                            <Trophy size={13} strokeWidth={1.75} weight="fill" />
                            <span>Novo PR! Golpe Crítico no Chefe</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                <button
                  type="button"
                  onClick={() => handleAddSet(currentExercise)}
                  className="w-full min-h-[44px] rounded-md bg-[#18181B] hover:bg-zinc-800 border border-[#27272A] text-xs font-semibold text-zinc-200 flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Plus size={16} strokeWidth={1.75} weight="regular" />
                  Série extra
                </button>
              </div>

              {/* 2. Carga padrão do treino (kg) */}
              {(currentExercise.loadKg !== undefined || currentExercise.equipment) && (
                <div className="p-3.5 rounded-md bg-[#111113] border border-[#27272A] space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-zinc-300">
                      Carga padrão do treino (kg)
                    </span>
                    <span className="text-[11px] font-semibold font-mono-tabular tabular-nums">
                      {savingLoadId === currentExercise.id ? (
                        <span className="text-zinc-300">Salvando...</span>
                      ) : savedLoadId === currentExercise.id ? (
                        <span className="text-emerald-400">Salvo no treino</span>
                      ) : getEffectiveLoadKg(currentExercise.id, currentExercise.loadKg) === 0 ? (
                        <span className="text-zinc-400">Peso corporal</span>
                      ) : (
                        <span className="text-orange-400">
                          {getEffectiveLoadKg(currentExercise.id, currentExercise.loadKg)} kg atuais
                        </span>
                      )}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        void handleAdjustLoad(
                          currentExercise.id,
                          getEffectiveLoadKg(currentExercise.id, currentExercise.loadKg) - 2.5,
                          true
                        )
                      }
                      disabled={
                        getEffectiveLoadKg(currentExercise.id, currentExercise.loadKg) <= 0
                      }
                      aria-label="Reduzir 2,5 kg"
                      className="min-h-[44px] min-w-[68px] px-3 rounded-md bg-[#18181B] hover:bg-zinc-800 disabled:opacity-40 border border-[#27272A] text-zinc-200 font-semibold text-xs font-mono-tabular tabular-nums flex items-center justify-center gap-1 transition-colors cursor-pointer"
                    >
                      <Minus size={18} strokeWidth={1.75} weight="regular" />
                      2,5
                    </button>

                    <div className="flex-1 flex items-center bg-[#09090B] border border-[#27272A] focus-within:border-orange-500 rounded-md px-3 min-h-[44px]">
                      <input
                        type="number"
                        inputMode="decimal"
                        step="0.5"
                        min="0"
                        max="400"
                        aria-label="Carga em quilogramas"
                        value={
                          loadInputDraft[currentExercise.id] ??
                          String(
                            getEffectiveLoadKg(currentExercise.id, currentExercise.loadKg)
                          )
                        }
                        onChange={(e) => {
                          const raw = e.target.value;
                          setLoadInputDraft((prev) => ({
                            ...prev,
                            [currentExercise.id]: raw,
                          }));
                          const parsed = parseFloat(raw.replace(',', '.'));
                          if (raw.trim() !== '' && !raw.endsWith('.') && !Number.isNaN(parsed)) {
                            void handleAdjustLoad(currentExercise.id, parsed, false);
                          }
                        }}
                        onBlur={() => {
                          const raw = loadInputDraft[currentExercise.id];
                          if (raw !== undefined) {
                            const parsed = parseFloat(raw.replace(',', '.'));
                            if (!Number.isNaN(parsed)) {
                              void handleAdjustLoad(currentExercise.id, parsed, true);
                            } else {
                              setLoadInputDraft((prev) => {
                                const copy = { ...prev };
                                delete copy[currentExercise.id];
                                return copy;
                              });
                            }
                          }
                        }}
                        className="w-full bg-transparent text-center text-base font-bold text-white font-mono-tabular tabular-nums focus:outline-none"
                      />
                      <span className="text-xs font-medium text-zinc-400 ml-1">kg</span>
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        void handleAdjustLoad(
                          currentExercise.id,
                          getEffectiveLoadKg(currentExercise.id, currentExercise.loadKg) + 2.5,
                          true
                        )
                      }
                      aria-label="Adicionar 2,5 kg"
                      className="min-h-[44px] min-w-[68px] px-3 rounded-md bg-[#18181B] hover:bg-zinc-800 border border-[#27272A] text-orange-400 font-semibold text-xs font-mono-tabular tabular-nums flex items-center justify-center gap-1 transition-colors cursor-pointer"
                    >
                      <Plus size={18} strokeWidth={1.75} weight="regular" />
                      2,5
                    </button>
                  </div>

                  {currentExercise.loadNote && (
                    <p className="text-[11px] text-zinc-400 leading-relaxed">
                      {currentExercise.loadNote}
                    </p>
                  )}
                </div>
              )}

              {/* 3. Alertas do cronômetro de descanso */}
              <div className="p-3.5 rounded-md bg-[#111113] border border-[#27272A] space-y-2.5">
                <div className="text-xs font-semibold text-zinc-300">
                  Alertas do descanso
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => handleToggleAlertPref('soundEnabled')}
                    aria-pressed={alertPrefs.soundEnabled}
                    aria-label={
                      alertPrefs.soundEnabled
                        ? 'Desativar som do descanso'
                        : 'Ativar som do descanso'
                    }
                    className={`min-h-[44px] px-3 rounded-md border flex items-center justify-center gap-1.5 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                      alertPrefs.soundEnabled
                        ? 'bg-[#18181B] border-orange-500/45 text-orange-400'
                        : 'bg-[#18181B] border-[#27272A] text-zinc-400'
                    }`}
                  >
                    {alertPrefs.soundEnabled ? (
                      <SpeakerHigh size={18} strokeWidth={1.75} weight="regular" />
                    ) : (
                      <SpeakerSlash size={18} strokeWidth={1.75} weight="regular" />
                    )}
                    <span>Som: {alertPrefs.soundEnabled ? 'Ativo' : 'Mudo'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleToggleAlertPref('vibrationEnabled')}
                    aria-pressed={alertPrefs.vibrationEnabled}
                    aria-label={
                      alertPrefs.vibrationEnabled
                        ? 'Desativar vibração do descanso'
                        : 'Ativar vibração do descanso'
                    }
                    className={`min-h-[44px] px-3 rounded-md border flex items-center justify-center gap-1.5 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                      alertPrefs.vibrationEnabled
                        ? 'bg-[#18181B] border-emerald-500/45 text-emerald-400'
                        : 'bg-[#18181B] border-[#27272A] text-zinc-400'
                    }`}
                  >
                    <DeviceMobile size={18} strokeWidth={1.75} weight="regular" />
                    <span>Vibração: {alertPrefs.vibrationEnabled ? 'Ativa' : 'Off'}</span>
                  </button>
                </div>
              </div>

              <Dialog.Close asChild>
                <button
                  type="button"
                  className="w-full min-h-[44px] py-2.5 px-4 rounded-md bg-[#F97316] hover:bg-orange-400 text-zinc-950 font-semibold text-xs transition-colors cursor-pointer"
                >
                  Concluir ajustes
                </button>
              </Dialog.Close>
            </Dialog.Content>
          </Dialog.Portal>
        )}
      </Dialog.Root>

      <ExerciseInfoModal
        exercise={selectedExerciseForInfo}
        workout={workout}
        exercisePr={
          selectedExerciseForInfo
            ? (prByExerciseId.get(selectedExerciseForInfo.id) ?? null)
            : null
        }
        currentLoadKg={
          selectedExerciseForInfo
            ? getEffectiveLoadKg(
                selectedExerciseForInfo.id,
                selectedExerciseForInfo.loadKg
              )
            : undefined
        }
        isCompleted={
          selectedExerciseForInfo
            ? completedIds.includes(selectedExerciseForInfo.id)
            : false
        }
        onToggleComplete={pendingCompletion ? undefined : toggleExercise}
        onClose={() => setSelectedExerciseForInfo(null)}
      />
    </div>
  );
};
