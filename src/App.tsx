import React, { Suspense, lazy, useCallback, useEffect, useState } from 'react';
import { signOut, type User as FirebaseUser } from 'firebase/auth';
import {
  DocumentReference,
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  runTransaction,
  setDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { OperationType, auth, db, handleFirestoreError } from './firebase';
import {
  AnyAutoQuestId,
  AutoQuestEvaluation,
  ChatMessage,
  DailyVow,
  EquipmentItem,
  EquipmentSlot,
  EquippedGear,
  ExercisePrRecord,
  GameStats,
  GearLoadoutPreset,
  HeroProfile,
  SessionRewardSummary,
  UserAchievement,
  WeeklyAutoQuestEvaluation,
  WeightLog,
  WorkoutTemplate,
} from './types/fitness';
import {
  ApiServiceError, api, fetchStrava, type CompleteWorkoutPayload,
} from './services/api';
import {
  ACHIEVEMENT_DEFINITIONS,
  INITIAL_WORKOUTS,
  calculateCoinsForWorkout,
  calculateGearBonusSummary,
  calculateLevel,
  calculateProportionalXp,
  calculateSessionPrBonus,
  createInitialGameStats,
  evaluateExercisePrUpdate,
  getBossForWorkout,
  getFriendlyErrorMessage,
  getLocalDateKey,
  getWeeklyRaidBossState,
} from './utils/rpgLogic';
import { useOnlineStatus } from './hooks/useOnlineStatus';
import {
  type OfflineQueuedWorkout,
  clearOfflineWorkoutsForUser,
  enqueueOfflineWorkout,
  listOfflineWorkouts,
  removeOfflineWorkout,
  updateOfflineWorkoutError,
} from './utils/offlineWorkoutQueue';
import { OfflineIndicator } from './components/OfflineIndicator';
import { DashboardView } from './components/DashboardView';
import { useWorkspace } from './features/workspace/useWorkspace';
import { useHealthImport } from './features/health/useHealthImport';
import { useHealthReports } from './features/health/useHealthReports';
import { useNavigation } from './features/navigation/useNavigation';
import { AppShell } from './features/navigation/AppShell';
import { PageErrorBoundary } from './features/navigation/PageErrorBoundary';
import {
  ErrorBanner,
  SystemHudSkeleton,
} from './components/HudPrimitives';
import { OnboardingFlow } from './components/OnboardingFlow';

const ApiCommandCenterView = lazy(() =>
  import('./components/ApiCommandCenterView').then((m) => ({ default: m.ApiCommandCenterView }))
);
const ArmoryView = lazy(() =>
  import('./components/ArmoryView').then((m) => ({ default: m.ArmoryView }))
);
const ControlPanelView = lazy(() =>
  import('./components/ControlPanelView').then((m) => ({ default: m.ControlPanelView }))
);
const OracleCoachView = lazy(() =>
  import('./components/OracleCoachView').then((m) => ({ default: m.OracleCoachView }))
);
const ProfileView = lazy(() =>
  import('./components/ProfileView').then((m) => ({ default: m.ProfileView }))
);
const ReportsAndHealthView = lazy(() =>
  import('./components/ReportsAndHealthView').then((m) => ({ default: m.ReportsAndHealthView }))
);
const WorkoutSessionScreen = lazy(() =>
  import('./components/WorkoutSessionScreen').then((m) => ({ default: m.WorkoutSessionScreen }))
);
const WorkoutsListView = lazy(() =>
  import('./components/WorkoutsListView').then((m) => ({ default: m.WorkoutsListView }))
);

const DEFAULT_STARTER_VOWS: readonly string[] = [
  'Beber pelo menos 2L de água hoje',
  'Evitar açúcar refinado e ultraprocessados',
  'Dormir 7h+ e respeitar o horário de descanso',
];

interface AppProps {
  authUser: FirebaseUser;
}

export default function App({ authUser }: AppProps): React.ReactElement {
  const { activeTab, setActiveTab } = useNavigation();
  const isOnline = useOnlineStatus();
  const {
    heroProfile, setHeroProfile, profileLoad, retryProfile, globalError, setGlobalError,
    gameStats, setGameStats, workouts, setWorkouts, workoutLogs, historyError, refreshHistory,
    healthActivities, dailyHealthMetrics, userAchievements, chatMessages, dailyVows, weightLogs, exercisePrs,
  } = useWorkspace(authUser);
  const [pendingOfflineWorkouts, setPendingOfflineWorkouts] = useState<OfflineQueuedWorkout[]>(() =>
    listOfflineWorkouts(authUser.uid)
  );
  const [isSyncingOffline, setIsSyncingOffline] = useState(false);

  useEffect(() => {
    setPendingOfflineWorkouts(listOfflineWorkouts(authUser.uid));
  }, [authUser.uid]);
  const reporting = activeTab === 'progresso' && profileLoad.status === 'ready' && !!heroProfile;
  const { healthReports, healthConnectStatus } = useHealthReports(
    authUser.uid, reporting, healthActivities, dailyHealthMetrics
  );
  const handleImportHealthData = useHealthImport(authUser, healthActivities);
  const safeStats = React.useMemo(
    () => gameStats ?? createInitialGameStats(authUser.uid),
    [gameStats, authUser.uid]
  );

  const [activeWorkoutSession, setActiveWorkoutSession] =
    useState<WorkoutTemplate | null>(null);
  const startWorkout = useCallback((workout: WorkoutTemplate): void => {
    setActiveWorkoutSession(workout);
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, []);
  const [acknowledgedStats, setAcknowledgedStats] = useState<{
    userId: string;
    totalXp: number;
    level: number;
  } | null>(null);

  const [driveAccessToken, setDriveAccessToken] = useState<string | null>(null);
  useEffect(() => {
    document.documentElement.classList.add('dark');
  }, []);

  useEffect(() => {
    if (!authUser || !heroProfile || !gameStats) return;
    setAcknowledgedStats((prev) => {
      if (!prev || prev.userId !== authUser.uid) {
        return {
          userId: authUser.uid,
          totalXp: gameStats.totalXp,
          level: gameStats.level,
        };
      }
      if (gameStats.totalXp < prev.totalXp || gameStats.level < prev.level) {
        return {
          userId: authUser.uid,
          totalXp: gameStats.totalXp,
          level: gameStats.level,
        };
      }
      return prev;
    });
  }, [authUser, heroProfile, gameStats]);

  const handleAcknowledgeProgress = useCallback(
    (totalXp: number, level: number): void => {
      if (!authUser) return;
      setAcknowledgedStats({ userId: authUser.uid, totalXp, level });
    },
    [authUser]
  );

  const handleCompleteOnboarding = useCallback(
    async (newProfile: HeroProfile): Promise<void> => {
      if (!authUser) return;
      const uid = authUser.uid;
      try {
        const batch = writeBatch(db);
        batch.set(doc(db, 'users', uid, 'heroProfiles', 'main'), newProfile);
        batch.set(doc(db, 'users', uid, 'gameStats', 'main'), createInitialGameStats(uid));

        for (const w of INITIAL_WORKOUTS) {
          batch.set(doc(db, 'users', uid, 'workouts', w.id), { ...w, userId: uid });
        }

        for (const def of ACHIEVEMENT_DEFINITIONS) {
          const initialAch: UserAchievement = {
            id: def.id,
            userId: uid,
            unlocked: false,
            unlockedAt: null,
          };
          batch.set(doc(db, 'users', uid, 'achievements', def.id), initialAch);
        }

        const nowIso = new Date().toISOString();
        DEFAULT_STARTER_VOWS.forEach((vowTitle, idx) => {
          const vowId = `vow-starter-${idx + 1}`;
          const starterVow: DailyVow = {
            id: vowId,
            userId: uid,
            title: vowTitle,
            xpReward: 15,
            penaltyXp: 15,
            completedDateKey: null,
            violatedDateKey: null,
            createdAt: nowIso,
          };
          batch.set(doc(db, 'users', uid, 'dailyVows', vowId), starterVow);
        });

        await batch.commit();
        setHeroProfile(newProfile);
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE);
      }
    },
    [authUser]
  );

  const buildOptimisticOfflineSummary = useCallback(
    (workout: WorkoutTemplate, payload: CompleteWorkoutPayload): SessionRewardSummary => {
      const prByExercise = new Map<string, ExercisePrRecord>();
      for (const pr of exercisePrs) prByExercise.set(pr.exerciseId, pr);

      let totalVolumeKg = 0;
      let prCount = 0;
      const prExerciseNames: string[] = [];
      for (const entry of payload.performedExercises ?? []) {
        const evalResult = evaluateExercisePrUpdate(entry.sets, prByExercise.get(entry.exerciseId) ?? null);
        totalVolumeKg += evalResult.volumeKg;
        if (evalResult.hasPr && evalResult.bestReps >= 1) {
          prCount += 1;
          prExerciseNames.push(entry.exerciseName || entry.exerciseId);
        }
      }

      const completedExercises = Math.max(
        1,
        Math.min(
          workout.exercises.length,
          payload.completedExercises ?? payload.completedExerciseIds?.length ?? workout.exercises.length
        )
      );
      const totalExercises = Math.max(1, workout.exercises.length);
      const bossDefeated = payload.bossDefeated ?? completedExercises >= totalExercises;
      const gearBonus = calculateGearBonusSummary(safeStats.equippedGear);
      const baseXpFromWorkout = calculateProportionalXp(workout.baseXp, completedExercises, totalExercises, 0);
      const xpFromWorkout = calculateProportionalXp(
        workout.baseXp,
        completedExercises,
        totalExercises,
        gearBonus.xpBonusPercent
      );
      const baseCoinsEarned = calculateCoinsForWorkout(
        workout.baseXp,
        completedExercises,
        totalExercises,
        bossDefeated,
        0
      );
      const workoutCoinsEarned = calculateCoinsForWorkout(
        workout.baseXp,
        completedExercises,
        totalExercises,
        bossDefeated,
        gearBonus.coinBonusPercent
      );
      const { prXpBonus, prCoinsBonus } = calculateSessionPrBonus(prCount);
      const boss = getBossForWorkout(workout);
      const estimatedTotalXp = safeStats.totalXp + xpFromWorkout + prXpBonus;
      const newLevel = calculateLevel(estimatedTotalXp);

      return {
        workoutName: workout.name,
        xpFromWorkout,
        baseXpFromWorkout,
        gearXpBonus: Math.max(0, xpFromWorkout - baseXpFromWorkout),
        gearBonusPercentXp: gearBonus.xpBonusPercent,
        bonusXp: prXpBonus,
        totalXpGained: xpFromWorkout + prXpBonus,
        coinsEarned: workoutCoinsEarned + prCoinsBonus,
        baseCoinsEarned,
        gearCoinsBonus: Math.max(0, workoutCoinsEarned - baseCoinsEarned),
        gearBonusPercentCoins: gearBonus.coinBonusPercent,
        bossName: boss.name,
        bossDefeated,
        totalVolumeKg: Number(totalVolumeKg.toFixed(1)),
        prCount,
        prXpBonus,
        prCoinsBonus,
        prExerciseNames,
        offlineQueued: true,
        previousLevel: safeStats.level,
        newLevel,
        leveledUp: newLevel > safeStats.level,
        isNowMaster: newLevel >= 5,
        unlockedAchievements: [],
        completedExercises,
        totalExercises,
        durationMinutes: Math.max(1, payload.durationMinutes ?? workout.durationMinutes),
      };
    },
    [exercisePrs, safeStats]
  );

  const handleSyncOfflineWorkouts = useCallback(async (): Promise<void> => {
    if (!authUser || isSyncingOffline) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
    const queued = listOfflineWorkouts(authUser.uid);
    if (queued.length === 0) return;

    setIsSyncingOffline(true);
    let syncedAny = false;
    try {
      for (const item of queued) {
        try {
          await api.workouts.complete(
            item.workoutId,
            {
              idempotencyKey: item.idempotencyKey,
              completedExercises: item.completedExercises,
              durationMinutes: item.durationMinutes,
              performedExercises: item.performedExercises,
              dateKey: item.dateKey,
            },
            authUser
          );
          setPendingOfflineWorkouts(removeOfflineWorkout(authUser.uid, item.idempotencyKey));
          syncedAny = true;
        } catch (err) {
          if (
            err instanceof ApiServiceError &&
            (err.status === 409 || err.code === 'idempotency_conflict')
          ) {
            setPendingOfflineWorkouts(removeOfflineWorkout(authUser.uid, item.idempotencyKey));
            syncedAny = true;
            continue;
          }
          const message = getFriendlyErrorMessage(err);
          setPendingOfflineWorkouts(updateOfflineWorkoutError(authUser.uid, item.idempotencyKey, message));
          break;
        }
      }
      if (syncedAny) {
        refreshHistory();
      }
    } finally {
      setIsSyncingOffline(false);
    }
  }, [authUser, isSyncingOffline, refreshHistory]);

  useEffect(() => {
    if (isOnline && pendingOfflineWorkouts.length > 0 && !isSyncingOffline) {
      void handleSyncOfflineWorkouts();
    }
  }, [isOnline, pendingOfflineWorkouts.length, isSyncingOffline, handleSyncOfflineWorkouts]);

  const handleCompleteWorkoutSession = useCallback(
    async (
      workout: WorkoutTemplate,
      payload: CompleteWorkoutPayload
    ): Promise<SessionRewardSummary> => {
      if (!authUser) throw new Error('Usuário não autenticado.');
      const shouldQueueOffline =
        typeof navigator !== 'undefined' && navigator.onLine === false;

      if (shouldQueueOffline) {
        const queuedItem: OfflineQueuedWorkout = {
          idempotencyKey: payload.idempotencyKey,
          userId: authUser.uid,
          workoutId: workout.id,
          completedExercises:
            payload.completedExercises ??
            payload.completedExerciseIds?.length ??
            workout.exercises.length,
          durationMinutes: Math.max(1, payload.durationMinutes ?? workout.durationMinutes),
          performedExercises: payload.performedExercises,
          dateKey: payload.dateKey ?? getLocalDateKey(),
          queuedAt: new Date().toISOString(),
        };
        setPendingOfflineWorkouts(enqueueOfflineWorkout(queuedItem));
        return buildOptimisticOfflineSummary(workout, payload);
      }

      try {
        const result = await api.workouts.complete(workout.id, payload, authUser);
        refreshHistory();
        return result.rewardSummary;
      } catch (err) {
        const isNetworkError =
          (typeof navigator !== 'undefined' && navigator.onLine === false) ||
          (err instanceof TypeError) ||
          (err instanceof Error && /failed to fetch|network|offline|load failed/i.test(err.message));

        if (isNetworkError && !(err instanceof ApiServiceError)) {
          const queuedItem: OfflineQueuedWorkout = {
            idempotencyKey: payload.idempotencyKey,
            userId: authUser.uid,
            workoutId: workout.id,
            completedExercises:
              payload.completedExercises ??
              payload.completedExerciseIds?.length ??
              workout.exercises.length,
            durationMinutes: Math.max(1, payload.durationMinutes ?? workout.durationMinutes),
            performedExercises: payload.performedExercises,
            dateKey: payload.dateKey ?? getLocalDateKey(),
            queuedAt: new Date().toISOString(),
          };
          setPendingOfflineWorkouts(enqueueOfflineWorkout(queuedItem));
          return buildOptimisticOfflineSummary(workout, payload);
        }
        throw err;
      }
    },
    [authUser, buildOptimisticOfflineSummary, refreshHistory]
  );

  const handleSaveChatMessage = useCallback(
    async (role: 'user' | 'oracle', content: string): Promise<void> => {
      if (!authUser) return;
      const uid = authUser.uid;
      const now = new Date();
      const uniquePart =
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : `${now.getTime()}-${Math.random().toString(36).slice(2, 10)}`;
      const msgId = `msg-${uniquePart}-${role}`;
      const record: ChatMessage = {
        id: msgId,
        userId: uid,
        role,
        content: content.trim().slice(0, 4000),
        createdAt: now.toISOString(),
      };
      try {
        await setDoc(doc(db, 'users', uid, 'chatMessages', msgId), record);
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE);
      }
    },
    [authUser]
  );

  const handleUpdateHeroProfile = useCallback(
    async (updated: HeroProfile): Promise<void> => {
      if (!authUser) return;
      const uid = authUser.uid;
      try {
        await setDoc(doc(db, 'users', uid, 'heroProfiles', 'main'), {
          ...updated,
          userId: uid,
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE);
      }
    },
    [authUser]
  );

  const handleResetProgress = useCallback(async (): Promise<void> => {
    if (!authUser) return;
    const uid = authUser.uid;
    try {
      const BATCH_LIMIT = 450;

      // 1. Resetar stats, conquistas e votos em lotes <= 450 operações
      const resetWrites: Array<{ ref: DocumentReference; data: Record<string, unknown> }> = [
        {
          ref: doc(db, 'users', uid, 'gameStats', 'main'),
          data: createInitialGameStats(uid) as unknown as Record<string, unknown>,
        },
        ...ACHIEVEMENT_DEFINITIONS.map((def) => ({
          ref: doc(db, 'users', uid, 'achievements', def.id),
          data: {
            id: def.id,
            userId: uid,
            unlocked: false,
            unlockedAt: null,
          },
        })),
        ...dailyVows.map((vow) => ({
          ref: doc(db, 'users', uid, 'dailyVows', vow.id),
          data: {
            ...vow,
            completedDateKey: null,
            violatedDateKey: null,
          },
        })),
      ];

      for (let i = 0; i < resetWrites.length; i += BATCH_LIMIT) {
        const chunk = resetWrites.slice(i, i + BATCH_LIMIT);
        const batch = writeBatch(db);
        for (const op of chunk) {
          batch.set(op.ref, op.data);
        }
        await batch.commit();
      }

      // 2. Excluir registros de subcoleções em lotes de até 450 para evitar estouro do limite de 500 ops do Firestore
      const ledgerSnapshot = getDocs(query(collection(db, 'users', uid, 'progressLedger'), where('userId', '==', uid)))
        .catch((error: unknown) => {
          if (error && typeof error === 'object' && 'code' in error && error.code === 'permission-denied') return null;
          throw error;
        });
      const [logsSnap, chatSnap, healthActsSnap, dailySnap, prsSnap, ledgerSnap] = await Promise.all([
        getDocs(query(collection(db, 'users', uid, 'workoutLogs'), where('userId', '==', uid))),
        getDocs(query(collection(db, 'users', uid, 'chatMessages'), where('userId', '==', uid))),
        getDocs(query(collection(db, 'users', uid, 'healthActivities'), where('userId', '==', uid))),
        getDocs(query(collection(db, 'users', uid, 'dailyHealthMetrics'), where('userId', '==', uid))),
        getDocs(query(collection(db, 'users', uid, 'exercisePrs'), where('userId', '==', uid))),
        ledgerSnapshot,
      ]);

      const deleteRefs: DocumentReference[] = [];
      logsSnap.forEach((d) => deleteRefs.push(d.ref));
      chatSnap.forEach((d) => deleteRefs.push(d.ref));
      healthActsSnap.forEach((d) => deleteRefs.push(d.ref));
      dailySnap.forEach((d) => deleteRefs.push(d.ref));
      prsSnap.forEach((d) => deleteRefs.push(d.ref));
      ledgerSnap?.forEach((d) => deleteRefs.push(d.ref));

      for (let i = 0; i < deleteRefs.length; i += BATCH_LIMIT) {
        const chunk = deleteRefs.slice(i, i + BATCH_LIMIT);
        const batch = writeBatch(db);
        for (const ref of chunk) {
          batch.delete(ref);
        }
        await batch.commit();
      }
      clearOfflineWorkoutsForUser(uid);
      setPendingOfflineWorkouts([]);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE);
    } finally {
      refreshHistory();
    }
  }, [authUser, dailyVows, refreshHistory]);

  const handleCreateVow = useCallback(
    async (title: string): Promise<void> => {
      if (!authUser) return;
      await api.vows.create({ title: title.trim().slice(0, 80) }, authUser);
    },
    [authUser]
  );

  const handleCompleteVow = useCallback(
    async (vow: DailyVow): Promise<void> => {
      if (!authUser) return;
      await api.vows.complete(vow.id, getLocalDateKey(), authUser);
    },
    [authUser]
  );

  const handleViolateVow = useCallback(
    async (vow: DailyVow): Promise<void> => {
      if (!authUser) return;
      await api.vows.violate(vow.id, getLocalDateKey(), authUser);
    },
    [authUser]
  );

  const handleClaimAutoQuest = useCallback(
    async (
      quest: AutoQuestEvaluation | WeeklyAutoQuestEvaluation,
      dateKey: string
    ): Promise<void> => {
      if (!authUser) throw new Error('Usuário não autenticado.');
      if (!quest.isFulfilled) {
        throw new Error('A meta desta missão automática ainda não foi atingida.');
      }
      try {
        await api.vows.claimDailyQuest(quest.id as AnyAutoQuestId, dateKey, authUser);
      } catch (err) {
        if (
          err instanceof ApiServiceError &&
          (err.status === 409 || err.code === 'quest_already_claimed')
        ) {
          return;
        }
        throw err;
      }
    },
    [authUser]
  );

  const applyConfirmedArmoryState = useCallback((
    changes: Pick<GameStats, 'equippedGear' | 'updatedAt'> & Partial<Pick<GameStats, 'goldCoins' | 'ownedEquipmentIds'>>
  ): void => {
    setGameStats((previous) => {
      if (previous && (previous.userId !== authUser.uid || previous.updatedAt >= changes.updatedAt)) return previous;
      return { ...(previous ?? createInitialGameStats(authUser.uid)), ...changes };
    });
  }, [authUser.uid]);

  const handlePurchaseAndEquip = useCallback(
    async (item: EquipmentItem): Promise<void> => {
      if (!authUser) throw new Error('Usuário não autenticado.');
      const { goldCoins, ownedEquipmentIds, equippedGear, updatedAt } = await api.arsenal.purchase(item.id, true, authUser);
      applyConfirmedArmoryState({ goldCoins, ownedEquipmentIds, equippedGear, updatedAt });
    },
    [authUser, applyConfirmedArmoryState]
  );

  const handleEquipToggle = useCallback(
    async (slot: EquipmentSlot, itemId: string | null): Promise<void> => {
      if (!authUser) throw new Error('Usuário não autenticado.');
      const { equippedGear, updatedAt } = await api.arsenal.equip({ slot, itemId }, authUser);
      applyConfirmedArmoryState({ equippedGear, updatedAt });
    },
    [authUser, applyConfirmedArmoryState]
  );

  const handleSaveLoadoutPreset = useCallback(
    async (name: string, gear: EquippedGear): Promise<void> => {
      if (!authUser) throw new Error('Usuário não autenticado.');
      const trimmedName = name.trim().slice(0, 28);
      if (trimmedName.length < 2) {
        throw new Error('Informe um nome válido para o loadout.');
      }
      await api.arsenal.saveLoadout(trimmedName, gear, authUser);
    },
    [authUser]
  );

  const handleApplyLoadoutPreset = useCallback(
    async (preset: GearLoadoutPreset): Promise<void> => {
      if (!authUser) throw new Error('Usuário não autenticado.');
      await api.arsenal.applyLoadout(preset.id, authUser);
    },
    [authUser]
  );

  const handleDeleteLoadoutPreset = useCallback(
    async (presetId: string): Promise<void> => {
      if (!authUser) throw new Error('Usuário não autenticado.');
      await api.arsenal.deleteLoadout(presetId, authUser);
    },
    [authUser]
  );

  const handleDeleteVow = useCallback(
    async (vowId: string): Promise<void> => {
      if (!authUser) return;
      await api.vows.remove(vowId, authUser);
    },
    [authUser]
  );

  const handleSaveWeightLog = useCallback(
    async (weightKg: number, dateKey: string, note?: string | null): Promise<void> => {
      if (!authUser) throw new Error('Usuário não autenticado.');
      if (!Number.isFinite(weightKg) || weightKg < 25 || weightKg > 350) {
        throw new Error('Peso inválido. Informe um valor entre 25 kg e 350 kg.');
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
        throw new Error('Data inválida para registro de peso.');
      }

      const uid = authUser.uid;
      const roundedWeight = Math.min(350, Math.max(25, Math.round(weightKg * 10) / 10));
      const cleanNote = note && note.trim() ? note.trim().slice(0, 140) : null;
      const nowIso = new Date().toISOString();

      const weightRef = doc(db, 'users', uid, 'weightLogs', dateKey);
      const heroRef = doc(db, 'users', uid, 'heroProfiles', 'main');
      const latestExistingDate =
        weightLogs.length > 0 ? weightLogs[weightLogs.length - 1].dateKey : null;
      const shouldSyncHeroWeight =
        !latestExistingDate || dateKey >= latestExistingDate;

      try {
        await runTransaction(db, async (tx) => {
          const [weightSnap, heroSnap] = await Promise.all([
            tx.get(weightRef),
            tx.get(heroRef),
          ]);

          if (weightSnap.exists()) {
            tx.update(weightRef, {
              weightKg: roundedWeight,
              note: cleanNote,
              updatedAt: nowIso,
            });
          } else {
            const newRecord: WeightLog = {
              id: dateKey,
              userId: uid,
              weightKg: roundedWeight,
              dateKey,
              note: cleanNote,
              recordedAt: nowIso,
              updatedAt: nowIso,
            };
            tx.set(weightRef, newRecord);
          }

          if (shouldSyncHeroWeight && heroSnap.exists()) {
            tx.update(heroRef, {
              weightKg: roundedWeight,
              updatedAt: nowIso,
            });
          }
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE);
      }
    },
    [authUser, weightLogs]
  );

  const handleDeleteWeightLog = useCallback(
    async (logId: string): Promise<void> => {
      if (!authUser) return;
      const uid = authUser.uid;
      try {
        await deleteDoc(doc(db, 'users', uid, 'weightLogs', logId));
        const remaining = weightLogs.filter((l) => l.id !== logId);
        const latestRemaining =
          remaining.length > 0 ? remaining[remaining.length - 1] : null;
        if (latestRemaining) {
          await setDoc(
            doc(db, 'users', uid, 'heroProfiles', 'main'),
            {
              ...(heroProfile as HeroProfile),
              userId: uid,
              weightKg: latestRemaining.weightKg,
              updatedAt: new Date().toISOString(),
            }
          );
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE);
      }
    },
    [authUser, weightLogs, heroProfile]
  );

  const handleUpdateWorkoutExerciseLoad = useCallback(
    async (workoutId: string, exerciseId: string, newLoadKg: number): Promise<void> => {
      if (!authUser) throw new Error('Usuário não autenticado.');
      if (!Number.isFinite(newLoadKg)) {
        throw new Error('Carga inválida.');
      }
      const loadKg = Math.min(400, Math.max(0, Math.round(newLoadKg * 2) / 2));
      const { workout } = await api.workouts.update(workoutId, {
        exerciseLoadUpdates: [{ exerciseId, loadKg }],
      }, authUser);

      setWorkouts((previous) => previous.map((item) => item.id === workoutId ? workout : item));
      setActiveWorkoutSession((previous) => previous?.id === workoutId ? workout : previous);
    },
    [authUser, setWorkouts]
  );

  const handleLogout = useCallback(async (): Promise<void> => {
    setDriveAccessToken(null);
    try {
      await fetchStrava('disconnect', { method: 'POST', signal: AbortSignal.timeout(3000) })
        .catch(() => undefined);
      await signOut(auth);
    } catch (err: unknown) {
      setGlobalError(getFriendlyErrorMessage(err));
    }
  }, [setGlobalError]);

  if (profileLoad.status === 'loading') return <SystemHudSkeleton />;

  if (profileLoad.status === 'error') {
    return (
      <main className="min-h-screen grid place-items-center px-4">
        <section className="w-full max-w-md space-y-4 rounded-lg border border-[#27272A] bg-[#18181B] p-5">
          <h1 className="text-lg font-bold text-white">Não foi possível carregar o perfil</h1>
          <ErrorBanner message={profileLoad.message} />
          {globalError && <ErrorBanner message={globalError} />}
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              className="min-h-11 rounded-md bg-[#F97316] px-4 text-sm font-semibold text-zinc-950"
              onClick={retryProfile}
            >
              Tentar novamente
            </button>
            <button
              type="button"
              className="min-h-11 rounded-md border border-[#52525B] px-4 text-sm text-zinc-200"
              onClick={() => void handleLogout()}
            >
              Sair
            </button>
          </div>
        </section>
      </main>
    );
  }

  if (!heroProfile) {
    return (
      <OnboardingFlow
        userId={authUser.uid}
        defaultName={authUser.displayName?.split(' ')[0] ?? ''}
        onCompleteHero={handleCompleteOnboarding}
      />
    );
  }

  if (activeWorkoutSession) {
    return (
      <Suspense fallback={<SystemHudSkeleton />}>
        <div className="ui-screen-enter">
          <OfflineIndicator
            isOnline={isOnline}
            pendingCount={pendingOfflineWorkouts.length}
            isSyncing={isSyncingOffline}
            onSyncNow={() => void handleSyncOfflineWorkouts()}
          />
          <WorkoutSessionScreen
            workout={activeWorkoutSession}
            equippedGear={safeStats.equippedGear}
            exercisePrs={exercisePrs}
            logs={workoutLogs}
            onCancelSession={() => setActiveWorkoutSession(null)}
            onCompleteSession={handleCompleteWorkoutSession}
            onUpdateExerciseLoad={handleUpdateWorkoutExerciseLoad}
          />
        </div>
      </Suspense>
    );
  }

  return (
    <AppShell activeTab={activeTab} setActiveTab={setActiveTab} heroProfile={heroProfile} safeStats={safeStats}>
      <OfflineIndicator
        isOnline={isOnline}
        pendingCount={pendingOfflineWorkouts.length}
        isSyncing={isSyncingOffline}
        onSyncNow={() => void handleSyncOfflineWorkouts()}
      />

      {globalError && (
        <div className="mb-4 mt-3">
          <ErrorBanner
            message={globalError}
            onDismiss={() => setGlobalError(null)}
          />
        </div>
      )}

      {historyError && (
        <div className="mb-4 space-y-2">
          <ErrorBanner message={`Não foi possível atualizar o histórico de treinos. ${historyError}`} />
          <button
            type="button"
            className="min-h-11 rounded-md border border-[#52525B] px-3 text-sm text-zinc-200"
            onClick={refreshHistory}
          >
            Atualizar histórico
          </button>
        </div>
      )}

      <PageErrorBoundary key={activeTab}>
        <Suspense fallback={<SystemHudSkeleton embedded />}>
          <div key={activeTab} className="ui-screen-enter">
            {activeTab === 'inicio' && (
              <DashboardView
                hero={heroProfile}
                stats={safeStats}
                workouts={workouts}
                logs={workoutLogs}
                healthActivities={healthActivities}
                dailyMetrics={dailyHealthMetrics}
                dailyVows={dailyVows}
                weightLogs={weightLogs}
                previousXp={
                  acknowledgedStats && acknowledgedStats.userId === authUser.uid
                    ? acknowledgedStats.totalXp
                    : safeStats.totalXp
                }
                previousLevel={
                  acknowledgedStats && acknowledgedStats.userId === authUser.uid
                    ? acknowledgedStats.level
                    : safeStats.level
                }
                onAcknowledgeProgress={handleAcknowledgeProgress}
                onStartWorkout={startWorkout}
                onNavigate={(tab) => setActiveTab(tab)}
                onCreateVow={handleCreateVow}
                onCompleteVow={handleCompleteVow}
                onViolateVow={handleViolateVow}
                onDeleteVow={handleDeleteVow}
                onClaimAutoQuest={handleClaimAutoQuest}
                onSaveWeight={handleSaveWeightLog}
                onDeleteWeight={handleDeleteWeightLog}
              />
            )}

            {activeTab === 'painel' && (
              <ControlPanelView
                user={authUser}
                hero={heroProfile}
                stats={safeStats}
                workouts={workouts}
                logs={workoutLogs}
                healthActivities={healthActivities}
                dailyMetrics={dailyHealthMetrics}
                dailyVows={dailyVows}
                weightLogs={weightLogs}
                onStartWorkout={startWorkout}
                onNavigate={(tab) => setActiveTab(tab)}
              />
            )}

            {activeTab === 'treinar' && (
              <WorkoutsListView
                workouts={workouts}
                logs={workoutLogs}
                exercisePrs={exercisePrs}
                onStartWorkout={startWorkout}
                onUpdateExerciseLoad={handleUpdateWorkoutExerciseLoad}
              />
            )}

            {activeTab === 'arsenal' && (
              <ArmoryView
                hero={heroProfile}
                stats={safeStats}
                onPurchaseAndEquip={handlePurchaseAndEquip}
                onEquipToggle={handleEquipToggle}
                onSaveLoadoutPreset={handleSaveLoadoutPreset}
                onApplyLoadoutPreset={handleApplyLoadoutPreset}
                onDeleteLoadoutPreset={handleDeleteLoadoutPreset}
              />
            )}

            {activeTab === 'progresso' && healthReports && (
              <ReportsAndHealthView
                hero={heroProfile}
                stats={safeStats}
                logs={workoutLogs}
                exercisePrs={exercisePrs}
                healthActivities={healthReports.activities}
                dailyMetrics={healthReports.metrics}
                healthConnectStatus={healthConnectStatus}
                healthConnectDays={healthReports.days}
                latestHealthConnectHeartRate={healthReports.latestHeartRate}
                latestHealthConnectRecordUpdate={healthReports.latestRecordUpdate}
                weightLogs={weightLogs}
                achievements={userAchievements}
                driveAccessToken={driveAccessToken}
                onDriveAccessTokenChange={setDriveAccessToken}
                onImportHealthData={handleImportHealthData}
              />
            )}

            {activeTab === 'coach' && (
              <OracleCoachView
                hero={heroProfile}
                stats={safeStats}
                logs={workoutLogs}
                healthActivities={healthActivities}
                dailyMetrics={dailyHealthMetrics}
                messages={chatMessages}
                onSaveChatMessage={handleSaveChatMessage}
              />
            )}

            {activeTab === 'api' && (
              <ApiCommandCenterView
                user={authUser}
                hero={heroProfile}
                stats={safeStats}
                workouts={workouts}
                dailyVows={dailyVows}
              />
            )}

            {activeTab === 'perfil' && (
              <ProfileView
                user={authUser}
                hero={heroProfile}
                stats={safeStats}
                achievements={userAchievements}
                exercisePrsCount={exercisePrs.length}
                weeklyRaidDefeated={
                  getWeeklyRaidBossState(getLocalDateKey(), workoutLogs, healthActivities).isDefeated
                }
                onUpdateProfile={handleUpdateHeroProfile}
                onResetProgress={handleResetProgress}
                onLogout={handleLogout}
              />
            )}
          </div>
        </Suspense>
      </PageErrorBoundary>
    </AppShell>
  );
}
