import { useCallback, useEffect, useState } from 'react';
import type { User } from 'firebase/auth';
import { collection, doc, limit, onSnapshot, orderBy, query, runTransaction, where } from 'firebase/firestore';
import { db, getFirestoreErrorMessage } from '../../firebase';
import { api } from '../../services/api';
import type {
  ChatMessage, DailyHealthMetric, DailyVow, ExercisePrRecord, GameStats, HealthActivity, HeroProfile,
  UserAchievement, UserRecord, WeightLog, WorkoutLog, WorkoutTemplate,
} from '../../types/fitness';
import { getFriendlyErrorMessage } from '../../utils/errors';
import { createInitialGameStats, mergeWithInitialWorkouts, normalizeGameStats } from '../../utils/rpgLogic';
import { readRecentWorkoutLogs } from '../../utils/workoutHistory';

type ProfileLoad = { status: 'loading' | 'ready' } | { status: 'error'; message: string };

export function useWorkspace(user: User) {
  const { uid } = user;
  const [profileLoad, setProfileLoad] = useState<ProfileLoad>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [heroProfile, setHeroProfile] = useState<HeroProfile | null>(null);
  const [gameStats, setGameStats] = useState<GameStats | null>(null);
  const [workouts, setWorkouts] = useState<WorkoutTemplate[]>(() => mergeWithInitialWorkouts([], uid));
  const [healthActivities, setHealthActivities] = useState<HealthActivity[]>([]);
  const [dailyHealthMetrics, setDailyHealthMetrics] = useState<DailyHealthMetric[]>([]);
  const [userAchievements, setUserAchievements] = useState<UserAchievement[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [dailyVows, setDailyVows] = useState<DailyVow[]>([]);
  const [weightLogs, setWeightLogs] = useState<WeightLog[]>([]);
  const [exercisePrs, setExercisePrs] = useState<ExercisePrRecord[]>([]);

  const retryProfile = useCallback(() => {
    setProfileLoad({ status: 'loading' });
    setAttempt((value) => value + 1);
  }, []);

  useEffect(() => {
    let active = true;
    const unsubscribe: Array<() => void> = [];
    const reportError = (error: unknown) => {
      if (active) setGlobalError(getFirestoreErrorMessage(error));
    };
    const profileError = (error: unknown) => {
      if (active) setProfileLoad({ status: 'error', message: getFirestoreErrorMessage(error) });
    };

    function subscribeOwned<T extends { userId?: string }>(
      name: string,
      maximum: number,
      receive: (documents: T[]) => void,
      sortField?: string,
    ) {
      const owned = query(collection(db, 'users', uid, name), where('userId', '==', uid));
      const recent = sortField ? query(owned, orderBy(sortField, 'desc'), limit(maximum)) : query(owned, limit(maximum));
      unsubscribe.push(onSnapshot(recent, (snapshot) => {
        if (!active) return;
        const entries: T[] = [];
        snapshot.forEach((item) => {
          const entry = item.data() as T;
          if (entry.userId === uid) entries.push(entry);
        });
        receive(entries);
      }, (error) => {
        if (!active) return;
        if (sortField && error.code === 'failed-precondition') {
          subscribeOwned(name, maximum, receive);
          return;
        }
        reportError(error);
      }));
    }

    async function start() {
      setGlobalError(null);
      const ref = doc(db, 'users', uid);
      const now = new Date().toISOString();
      const isOfflineNow = typeof navigator !== 'undefined' && navigator.onLine === false;
      if (!isOfflineNow) {
        try {
          await runTransaction(db, async (transaction) => {
            const snapshot = await transaction.get(ref);
            const existing = snapshot.data() as UserRecord | undefined;
            const payload: UserRecord = {
              userId: uid,
              email: user.email,
              displayName: (user.displayName?.trim() || existing?.displayName?.trim() || 'Jogador').slice(0, 80),
              createdAt: existing?.createdAt || now,
              lastLoginAt: now,
            };
            transaction.set(ref, payload);
          });
        } catch (error) {
          const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
          const offlineFallback =
            (typeof navigator !== 'undefined' && navigator.onLine === false) ||
            code === 'unavailable' ||
            code === 'failed-precondition';
          if (!offlineFallback) {
            profileError(error);
            return;
          }
        }
      }
      if (!active) return;

      unsubscribe.push(onSnapshot(doc(db, 'users', uid, 'heroProfiles', 'main'), { includeMetadataChanges: true }, (snapshot) => {
        if (!active || (!snapshot.exists() && snapshot.metadata.fromCache)) return;
        const profile = snapshot.exists() ? snapshot.data() as HeroProfile : null;
        if (profile && profile.userId !== uid) {
          setProfileLoad({ status: 'error', message: 'O perfil encontrado não pertence à sua conta.' });
          return;
        }
        setHeroProfile(profile);
        setProfileLoad({ status: 'ready' });
      }, profileError));

      unsubscribe.push(onSnapshot(doc(db, 'users', uid, 'gameStats', 'main'), { includeMetadataChanges: true }, (snapshot) => {
        if (!active || (!snapshot.exists() && snapshot.metadata.fromCache)) return;
        const stats = snapshot.exists() ? snapshot.data() as GameStats : undefined;
        if (stats && stats.userId !== uid) return;
        setGameStats((previous) => {
          if (snapshot.metadata.fromCache && stats && previous && previous.updatedAt > stats.updatedAt) return previous;
          return stats ? normalizeGameStats(stats) : createInitialGameStats(uid);
        });
      }, reportError));

      subscribeOwned<WorkoutTemplate>('workouts', 100, (loaded) => setWorkouts(mergeWithInitialWorkouts(loaded, uid)));
      subscribeOwned('healthActivities', 400, setHealthActivities, 'dateKey');
      subscribeOwned('dailyHealthMetrics', 250, setDailyHealthMetrics, 'dateKey');
      subscribeOwned('achievements', 50, setUserAchievements);
      subscribeOwned('chatMessages', 150, setChatMessages, 'createdAt');
      subscribeOwned<DailyVow>('dailyVows', 100, (loaded) => setDailyVows(loaded.sort((a, b) => a.createdAt.localeCompare(b.createdAt))));
      subscribeOwned<WeightLog>('weightLogs', 400, (loaded) => setWeightLogs(loaded.sort((a, b) => a.dateKey.localeCompare(b.dateKey))), 'dateKey');
      subscribeOwned<ExercisePrRecord>('exercisePrs', 200, (loaded) =>
        setExercisePrs(loaded.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)))
      );
    }

    void start();
    return () => {
      active = false;
      unsubscribe.forEach((stop) => stop());
    };
  }, [user, uid, attempt]);

  const [workoutLogs, setWorkoutLogs] = useState<WorkoutLog[]>([]);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyRevision, setHistoryRevision] = useState(0);
  const refreshHistory = useCallback(() => setHistoryRevision((value) => value + 1), []);
  const totalWorkouts = gameStats?.totalWorkouts;
  const profileReady = profileLoad.status === 'ready' && heroProfile !== null;
  useEffect(() => {
    if (!profileReady) return;

    let inFlight: AbortController;
    let lastLoad = 0;
    const load = () => {
      inFlight?.abort();
      const current = new AbortController();
      inFlight = current;
      lastLoad = Date.now();
      void readRecentWorkoutLogs(
        (maximum, cursor) => api.workouts.listLogs(maximum, user, cursor, current.signal),
        current.signal,
      ).then((logs) => {
        if (current.signal.aborted) return;
        setWorkoutLogs(logs);
        setHistoryError(null);
      }).catch((error: unknown) => {
        if (!current.signal.aborted) setHistoryError(getFriendlyErrorMessage(error));
      });
    };
    const onFocus = () => { if (Date.now() - lastLoad >= 15_000) load(); };
    load();
    window.addEventListener('focus', onFocus);
    return () => {
      inFlight.abort();
      window.removeEventListener('focus', onFocus);
    };
  }, [user, profileReady, totalWorkouts, historyRevision]);

  return {
    profileLoad, retryProfile, globalError, setGlobalError,
    heroProfile, setHeroProfile, gameStats, setGameStats, workouts, setWorkouts,
    workoutLogs, historyError, refreshHistory,
    healthActivities, dailyHealthMetrics, userAchievements, chatMessages, dailyVows, weightLogs, exercisePrs,
  };
}
