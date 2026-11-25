import React, { useMemo, useRef, useState } from 'react';
import type { User as FirebaseUser } from 'firebase/auth';
import {
  ArrowCounterClockwise,
  ArrowsClockwise,
  Barbell,
  Check,
  CheckCircle,
  Coins,
  Crown,
  Fire,
  Gauge,
  Heartbeat,
  MagnifyingGlass,
  Play,
  Plus,
  Shield,
  Sparkle,
  Sword,
  Trash,
  WarningCircle,
  X,
} from '@phosphor-icons/react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { api, ApiServiceError, FullSystemStateResponse, type CompleteWorkoutPayload } from '../services/api';
import {
  AutoQuestEvaluation,
  DailyHealthMetric,
  DailyVow,
  EquipmentSlot,
  GameStats,
  GearLoadoutPreset,
  HealthActivity,
  HeroProfile,
  NavTab,
  WeightLog,
  WorkoutLog,
  WorkoutTemplate,
  WorkoutType,
} from '../types/fitness';
import {
  ARSENAL_CONFIG,
  EQUIPMENT_CATALOG,
  EXAMPLE_LOADOUT_PRESETS,
  WORKOUT_TYPE_LABELS,
  calculateGearBonusSummary,
  computeBmiSummary,
  computeRecoveryAssessment,
  evaluateDailyAutoQuests,
  formatBrazilianDate,
  getDualProgressionStatus,
  getEffectiveCurrentStreak,
  getFriendlyErrorMessage,
  getHunterRankBadgeClass,
  getLevelProgress,
  getLocalDateKey,
  isVowResolvedToday,
  normalizeHunterRank,
} from '../utils/rpgLogic';

interface ControlPanelViewProps {
  user: FirebaseUser;
  hero: HeroProfile;
  stats: GameStats;
  workouts: WorkoutTemplate[];
  logs: WorkoutLog[];
  healthActivities: HealthActivity[];
  dailyMetrics: DailyHealthMetric[];
  dailyVows: DailyVow[];
  weightLogs: WeightLog[];
  onStartWorkout: (workout: WorkoutTemplate) => void;
  onNavigate: (tab: NavTab) => void;
}

type PanelFeedback = {
  tone: 'success' | 'error';
  message: string;
};

type WorkoutFilter = 'todos' | WorkoutType;

const WORKOUT_FILTER_OPTIONS: ReadonlyArray<{ id: WorkoutFilter; label: string }> = [
  { id: 'todos', label: 'Todos' },
  { id: 'forca', label: 'Força' },
  { id: 'cardio', label: 'Cardio' },
  { id: 'hiit', label: 'HIIT' },
  { id: 'core', label: 'Core' },
  { id: 'mobilidade', label: 'Mobilidade' },
  { id: 'corpo_inteiro', label: 'Completo' },
];

const SLOT_ORDER: readonly EquipmentSlot[] = ['elmo', 'armadura', 'capa', 'arma'];

export const ControlPanelView: React.FC<ControlPanelViewProps> = ({
  user,
  hero,
  stats,
  workouts,
  logs,
  healthActivities,
  dailyMetrics,
  dailyVows,
  weightLogs,
  onStartWorkout,
  onNavigate,
}) => {
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [workoutFilter, setWorkoutFilter] = useState<WorkoutFilter>('todos');
  const [activeSubTab, setActiveSubTab] = useState<string>('visao-geral');

  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [syncedSnapshot, setSyncedSnapshot] = useState<FullSystemStateResponse | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const pendingCompletions = useRef(new Map<string, CompleteWorkoutPayload>());
  const [feedback, setFeedback] = useState<PanelFeedback | null>(null);

  const [newVowTitle, setNewVowTitle] = useState<string>('');
  const latestWeightFromLogs =
    weightLogs.length > 0 ? weightLogs[weightLogs.length - 1] : null;
  const [weightInput, setWeightInput] = useState<string>(() => {
    const initial = latestWeightFromLogs?.weightKg ?? hero.weightKg ?? '';
    return initial !== '' ? String(initial) : '';
  });
  const [weightNote, setWeightNote] = useState<string>('');

  const todayKey = getLocalDateKey();

  const activeHero = syncedSnapshot?.hero ?? hero;
  const activeStats = syncedSnapshot?.stats ?? stats;
  const activeWorkouts = syncedSnapshot?.workouts ?? workouts;
  const activeLogs = syncedSnapshot?.workoutLogs ?? logs;
  const activeActivities = syncedSnapshot?.healthActivities ?? healthActivities;
  const activeDailyMetrics = syncedSnapshot?.dailyMetrics ?? dailyMetrics;
  const activeVows = syncedSnapshot?.dailyVows ?? dailyVows;
  const activeWeightLogs = syncedSnapshot?.weightLogs ?? weightLogs;

  const levelProgress = useMemo(
    () => getLevelProgress(activeStats.totalXp),
    [activeStats.totalXp]
  );

  const dualProgression = useMemo(
    () =>
      syncedSnapshot?.dualProgression ??
      getDualProgressionStatus(activeStats, todayKey),
    [syncedSnapshot?.dualProgression, activeStats, todayKey]
  );

  const gearBonuses = useMemo(
    () => calculateGearBonusSummary(activeStats.equippedGear),
    [activeStats.equippedGear]
  );

  const recovery = useMemo(
    () =>
      computeRecoveryAssessment(
        activeLogs,
        activeActivities,
        activeDailyMetrics,
        activeStats,
        activeHero.restingHrBaseline ?? 60
      ),
    [activeLogs, activeActivities, activeDailyMetrics, activeStats, activeHero.restingHrBaseline]
  );

  const todayMetric = useMemo(
    () => activeDailyMetrics.find((m) => m.dateKey === todayKey) ?? null,
    [activeDailyMetrics, todayKey]
  );

  const autoQuests = useMemo<AutoQuestEvaluation[]>(
    () =>
      evaluateDailyAutoQuests(
        todayKey,
        todayMetric,
        activeLogs,
        activeActivities,
        activeWeightLogs,
        activeStats.claimedAutoQuestKeys ?? []
      ),
    [
      todayKey,
      todayMetric,
      activeLogs,
      activeActivities,
      activeWeightLogs,
      activeStats.claimedAutoQuestKeys,
    ]
  );

  const effectiveStreak = useMemo(
    () => getEffectiveCurrentStreak(activeStats.currentStreak, activeStats.lastWorkoutDate),
    [activeStats.currentStreak, activeStats.lastWorkoutDate]
  );

  const currentWeightRecord =
    activeWeightLogs.length > 0 ? activeWeightLogs[activeWeightLogs.length - 1] : null;
  const displayedWeightKg = currentWeightRecord?.weightKg ?? activeHero.weightKg ?? null;
  const bmiSummary = useMemo(
    () => computeBmiSummary(displayedWeightKg, activeHero.heightCm ?? null),
    [displayedWeightKg, activeHero.heightCm]
  );

  const normalizedQuery = searchTerm.trim().toLowerCase();

  const filteredVows = useMemo(() => {
    if (!normalizedQuery) return activeVows;
    return activeVows.filter((v) => v.title.toLowerCase().includes(normalizedQuery));
  }, [activeVows, normalizedQuery]);

  const filteredWorkouts = useMemo(() => {
    return activeWorkouts.filter((w) => {
      if (workoutFilter !== 'todos' && w.type !== workoutFilter) return false;
      if (!normalizedQuery) return true;
      return (
        w.name.toLowerCase().includes(normalizedQuery) ||
        w.description.toLowerCase().includes(normalizedQuery) ||
        w.difficulty.toLowerCase().includes(normalizedQuery)
      );
    });
  }, [activeWorkouts, workoutFilter, normalizedQuery]);

  const allLoadouts = useMemo<GearLoadoutPreset[]>(() => {
    const saved = activeStats.gearLoadouts ?? [];
    const savedIds = new Set(saved.map((p) => p.id));
    const examples = EXAMPLE_LOADOUT_PRESETS.filter((ex) => !savedIds.has(ex.id));
    return [...saved, ...examples];
  }, [activeStats.gearLoadouts]);

  const filteredLoadouts = useMemo(() => {
    if (!normalizedQuery) return allLoadouts;
    return allLoadouts.filter((preset) =>
      preset.name.toLowerCase().includes(normalizedQuery)
    );
  }, [allLoadouts, normalizedQuery]);

  const equipmentMap = useMemo(
    () => new Map(EQUIPMENT_CATALOG.map((item) => [item.id, item])),
    []
  );

  const reportError = (err: unknown): void => {
    if (err instanceof ApiServiceError) {
      setFeedback({ tone: 'error', message: err.message });
      return;
    }
    setFeedback({ tone: 'error', message: getFriendlyErrorMessage(err) });
  };

  const refreshRemoteState = async (showBanner: boolean): Promise<void> => {
    setIsSyncing(true);
    try {
      const snapshot = await api.global.getFullState(user);
      setSyncedSnapshot(snapshot);
      setLastSyncedAt(
        new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
      );
      if (showBanner) {
        setFeedback({
          tone: 'success',
          message: 'Dados sincronizados com sucesso via API autenticada.',
        });
      }
    } catch (err) {
      reportError(err);
    } finally {
      setIsSyncing(false);
    }
  };

  const runAction = async (
    actionKey: string,
    fn: () => Promise<string>
  ): Promise<void> => {
    if (pendingKey) return;
    setPendingKey(actionKey);
    try {
      const successMessage = await fn();
      const snapshot = await api.global.getFullState(user).catch(() => null);
      if (snapshot) {
        setSyncedSnapshot(snapshot);
        setLastSyncedAt(
          new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
        );
      }
      setFeedback({ tone: 'success', message: successMessage });
    } catch (err) {
      reportError(err);
    } finally {
      setPendingKey(null);
    }
  };

  const handleCreateVow = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    const clean = newVowTitle.trim();
    if (clean.length < 3) {
      setFeedback({
        tone: 'error',
        message: 'Informe um título com pelo menos 3 caracteres para o voto.',
      });
      return;
    }
    await runAction('vow:create', async () => {
      await api.vows.create({ title: clean, xpReward: 15, penaltyXp: 15 }, user);
      setNewVowTitle('');
      return `Voto "${clean}" adicionado com sucesso.`;
    });
  };

  const handleCompleteVow = async (vow: DailyVow): Promise<void> => {
    await runAction(`vow:complete:${vow.id}`, async () => {
      await api.vows.complete(vow.id, todayKey, user);
      return `Voto "${vow.title}" cumprido (+${vow.xpReward} XP, +10 moedas).`;
    });
  };

  const handleViolateVow = async (vow: DailyVow): Promise<void> => {
    await runAction(`vow:violate:${vow.id}`, async () => {
      await api.vows.violate(vow.id, todayKey, user);
      return `Quebra registrada em "${vow.title}" (-${vow.penaltyXp} XP, -15 HP).`;
    });
  };

  const handleDeleteVow = async (vow: DailyVow): Promise<void> => {
    await runAction(`vow:delete:${vow.id}`, async () => {
      await api.vows.remove(vow.id, user);
      return `Voto "${vow.title}" removido.`;
    });
  };

  const handleClaimQuest = async (quest: AutoQuestEvaluation): Promise<void> => {
    await runAction(`quest:claim:${quest.id}`, async () => {
      await api.vows.claimDailyQuest(quest.id, todayKey, user);
      return `Missão "${quest.title}" resgatada (+${quest.xpReward} XP, +${quest.coinsReward} moedas).`;
    });
  };

  const handleLogWeight = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    const parsed = Number(weightInput.replace(',', '.'));
    if (!Number.isFinite(parsed) || parsed < 25 || parsed > 350) {
      setFeedback({
        tone: 'error',
        message: 'Digite um peso válido entre 25 kg e 350 kg.',
      });
      return;
    }
    await runAction('health:weight', async () => {
      await api.health.logWeight(
        {
          weightKg: Math.round(parsed * 10) / 10,
          dateKey: todayKey,
          note: weightNote.trim() || null,
        },
        user
      );
      setWeightNote('');
      return `Peso de ${parsed.toFixed(1)} kg registrado para hoje.`;
    });
  };

  const handleQuickCompleteWorkout = async (workout: WorkoutTemplate): Promise<void> => {
    await runAction(`workout:complete:${workout.id}`, async () => {
      const pendingId = `${user.uid}/${workout.id}`;
      let payload = pendingCompletions.current.get(pendingId);
      if (!payload) {
        payload = {
          idempotencyKey: crypto.randomUUID(),
          completedExerciseIds: workout.exercises.map((ex) => ex.id),
          durationMinutes: workout.durationMinutes,
          bossDefeated: true,
          dateKey: todayKey,
        };
        pendingCompletions.current.set(pendingId, payload);
      }
      const result = await api.workouts.complete(workout.id, payload, user);
      pendingCompletions.current.delete(pendingId);
      return `Treino "${workout.name}" concluído (+${result.rewardSummary.totalXpGained} XP).`;
    });
  };

  const handleApplyLoadout = async (preset: GearLoadoutPreset): Promise<void> => {
    await runAction(`arsenal:apply:${preset.id}`, async () => {
      await api.arsenal.applyLoadout(preset.id, user);
      return `Loadout "${preset.name}" equipado com sucesso.`;
    });
  };

  const recoveryStatusTone =
    recovery.statusLabel === 'Ótima'
      ? 'text-emerald-400'
      : recovery.statusLabel === 'Moderada'
      ? 'text-zinc-200'
      : recovery.statusLabel === 'Atenção'
      ? 'text-orange-400'
      : 'text-red-400';

  const ownedSet = useMemo(
    () => new Set(activeStats.ownedEquipmentIds ?? []),
    [activeStats.ownedEquipmentIds]
  );

  return (
    <section
      aria-label="Painel de controle Fitness RPG"
      className="space-y-6 text-zinc-100 text-left"
    >
      {/* Cabeçalho e Barra de Ferramentas */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
            Painel de controle
          </h1>
          <p className="text-sm text-zinc-400 flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-semibold text-white">{activeHero.name}</span>
            <span aria-hidden="true">·</span>
            <span>{activeHero.heroClass}</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono-tabular tabular-nums text-orange-400">
              {dualProgression.hunter.current.label} (Nv. {levelProgress.level})
            </span>
            <span aria-hidden="true">·</span>
            <span className="font-mono-tabular tabular-nums text-emerald-400">
              {dualProgression.murim.current.name} ({dualProgression.murim.qiPoints.toLocaleString('pt-BR')} Qi)
            </span>
            {lastSyncedAt && (
              <>
                <span aria-hidden="true">·</span>
                <span className="font-mono-tabular tabular-nums text-zinc-400">
                  Atualizado às {lastSyncedAt}
                </span>
              </>
            )}
          </p>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center gap-3 w-full lg:w-auto">
          <div className="relative flex-1 sm:w-64">
            <MagnifyingGlass
              size={18} strokeWidth={1.75}
              weight="regular"
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500"
            />
            <Input
              type="search"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Filtrar treinos, votos ou builds..."
              aria-label="Filtrar itens do painel"
              className="h-11 sm:h-9 pl-9 bg-[#111113] border-[#27272A] text-zinc-100 placeholder:text-zinc-500 focus-visible:border-orange-500 focus-visible:ring-0"
            />
          </div>

          <Button
            type="button"
            variant="outline"
            onClick={() => void refreshRemoteState(true)}
            disabled={isSyncing}
            className="h-11 sm:h-9 px-3.5 whitespace-nowrap shrink-0 bg-[#18181B] border-[#27272A] text-zinc-200 hover:bg-zinc-800 hover:text-white cursor-pointer"
          >
            <ArrowsClockwise
              size={18} strokeWidth={1.75}
              weight="regular"
              aria-hidden="true"
              className={`text-orange-400 ${isSyncing ? 'animate-spin' : ''}`}
            />
            <span>{isSyncing ? 'Sincronizando' : 'Sincronizar'}</span>
          </Button>
        </div>
      </div>

      {/* Feedback de Operação */}
      {feedback && (
        <div
          role={feedback.tone === 'error' ? 'alert' : 'status'}
          className={`flex items-center justify-between gap-3 rounded-md border px-4 py-3 text-sm transition-colors ${
            feedback.tone === 'error'
              ? 'border-red-500/45 bg-[#18181B] text-red-400'
              : 'border-emerald-500/45 bg-[#18181B] text-emerald-400'
          }`}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            {feedback.tone === 'error' ? (
              <WarningCircle size={18} strokeWidth={1.75} weight="regular" aria-hidden="true" className="shrink-0 text-red-400" />
            ) : (
              <CheckCircle size={18} strokeWidth={1.75} weight="regular" aria-hidden="true" className="shrink-0 text-emerald-400" />
            )}
            <span className="truncate sm:whitespace-normal">{feedback.message}</span>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setFeedback(null)}
            className="h-8 px-2 whitespace-nowrap shrink-0 text-zinc-300 hover:text-white hover:bg-zinc-800"
          >
            Fechar
          </Button>
        </div>
      )}

      {/* Faixa de 4 KPIs */}
      {isSyncing ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, idx) => (
            <Card key={idx} className="bg-[#18181B] border border-[#27272A] ring-0 shadow-none rounded-lg">
              <CardHeader className="pb-2">
                <Skeleton className="h-4 w-28 bg-[#111113]" />
                <Skeleton className="h-7 w-36 mt-1 bg-[#111113]" />
              </CardHeader>
              <CardContent className="space-y-2">
                <Skeleton className="h-2 w-full bg-[#111113]" />
                <Skeleton className="h-3.5 w-40 bg-[#111113]" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <Card className="bg-[#18181B] border border-[#27272A] ring-0 shadow-none rounded-lg transition-colors hover:border-zinc-600">
            <CardHeader className="pb-1">
              <div className="flex items-center justify-between gap-2">
                <CardDescription className="text-xs font-medium text-zinc-400">
                  Mundo Real · Caçador
                </CardDescription>
                <Badge
                  variant="secondary"
                  className="font-mono-tabular tabular-nums bg-[#111113] text-orange-400 border border-[#27272A]"
                >
                  {dualProgression.hunter.current.label}
                </Badge>
              </div>
              <CardTitle className="text-2xl font-bold font-mono-tabular tabular-nums text-white">
                Nível {levelProgress.level}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2.5">
              <Progress
                value={levelProgress.progressPercent}
                aria-label="Progresso para o próximo nível"
                className="h-1.5 rounded-sm bg-[#111113] [&_[data-slot=progress-indicator]]:bg-[#F97316]"
              />
              <div className="flex items-center justify-between text-xs text-zinc-400 font-mono-tabular tabular-nums">
                <span>{activeStats.totalXp.toLocaleString('pt-BR')} XP total</span>
                <span>
                  {levelProgress.isMaxLevel
                    ? 'Nível máximo'
                    : `Faltam ${levelProgress.xpNeededForNext.toLocaleString('pt-BR')} XP`}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-[#18181B] border border-[#27272A] ring-0 shadow-none rounded-lg transition-colors hover:border-zinc-600">
            <CardHeader className="pb-1">
              <div className="flex items-center justify-between gap-2">
                <CardDescription className="text-xs font-medium text-zinc-400">
                  Vitalidade e prontidão
                </CardDescription>
                <Heartbeat size={18} strokeWidth={1.75} weight="regular" aria-hidden="true" className="text-emerald-400 shrink-0" />
              </div>
              <CardTitle className="text-2xl font-bold font-mono-tabular tabular-nums text-white">
                {activeStats.hunterHp ?? 100}/100 HP
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2.5">
              <Progress
                value={recovery.score}
                aria-label="Índice de prontidão e recuperação"
                className="h-1.5 rounded-sm bg-[#111113] [&_[data-slot=progress-indicator]]:bg-[#10B981]"
              />
              <div className="flex items-center justify-between text-xs">
                <span className={`font-semibold ${recoveryStatusTone}`}>
                  Recuperação {recovery.statusLabel}
                </span>
                <span className="text-zinc-400 font-mono-tabular tabular-nums">
                  ACWR {recovery.acwrRatio.toFixed(2)}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-[#18181B] border border-[#27272A] ring-0 shadow-none rounded-lg transition-colors hover:border-zinc-600">
            <CardHeader className="pb-1">
              <div className="flex items-center justify-between gap-2">
                <CardDescription className="text-xs font-medium text-zinc-400">
                  Moedas e Arsenal
                </CardDescription>
                <Coins size={18} strokeWidth={1.75} weight="regular" aria-hidden="true" className="text-orange-400 shrink-0" />
              </div>
              <CardTitle className="text-2xl font-bold font-mono-tabular tabular-nums text-white">
                {(activeStats.goldCoins ?? 0).toLocaleString('pt-BR')}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Badge
                variant="secondary"
                className="font-mono-tabular tabular-nums bg-[#111113] text-orange-400 border border-[#27272A]"
              >
                +{gearBonuses.xpBonusPercent}% XP · +{gearBonuses.coinBonusPercent}% Ouro
              </Badge>
              <p className="text-xs text-zinc-400 font-mono-tabular tabular-nums">
                Poder {gearBonuses.totalPowerScore} · +{gearBonuses.bossDamageBonusPercent}% Dano
              </p>
            </CardContent>
          </Card>

          <Card className="bg-[#18181B] border border-[#27272A] ring-0 shadow-none rounded-lg transition-colors hover:border-zinc-600">
            <CardHeader className="pb-1">
              <div className="flex items-center justify-between gap-2">
                <CardDescription className="text-xs font-medium text-zinc-400">
                  Sequência e volume
                </CardDescription>
                <Fire size={18} strokeWidth={1.75} weight="regular" aria-hidden="true" className="text-orange-400 shrink-0" />
              </div>
              <CardTitle className="text-2xl font-bold font-mono-tabular tabular-nums text-white">
                {effectiveStreak} {effectiveStreak === 1 ? 'dia' : 'dias'}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5 text-xs text-zinc-400 font-mono-tabular tabular-nums">
              <div className="flex items-center justify-between">
                <span>Treinos concluídos</span>
                <span className="font-semibold text-white">
                  {activeStats.totalWorkouts}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span>Tempo acumulado</span>
                <span className="font-semibold text-white">
                  {activeStats.totalMinutes} min
                </span>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Abas Principais */}
      <Tabs
        value={activeSubTab}
        onValueChange={setActiveSubTab}
        className="space-y-5"
      >
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <TabsList className="w-full sm:w-auto h-11 sm:h-9 grid grid-cols-3 sm:inline-flex bg-[#111113] border border-[#27272A] p-1 rounded-md">
            <TabsTrigger
              value="visao-geral"
              className="whitespace-nowrap shrink-0 px-3 text-zinc-400 data-[state=active]:bg-[#F97316] data-[state=active]:text-zinc-950 rounded-sm"
            >
              Visão geral
            </TabsTrigger>
            <TabsTrigger
              value="treinos"
              className="whitespace-nowrap shrink-0 px-3 text-zinc-400 data-[state=active]:bg-[#F97316] data-[state=active]:text-zinc-950 rounded-sm"
            >
              Treinos ({filteredWorkouts.length})
            </TabsTrigger>
            <TabsTrigger
              value="arsenal"
              className="whitespace-nowrap shrink-0 px-3 text-zinc-400 data-[state=active]:bg-[#F97316] data-[state=active]:text-zinc-950 rounded-sm"
            >
              Arsenal
            </TabsTrigger>
          </TabsList>

          <div className="flex items-center gap-2 text-xs text-zinc-400 font-mono-tabular tabular-nums">
            <span>{activeStats.bossesDefeated ?? 0} chefes derrotados</span>
            <span aria-hidden="true">·</span>
            <span>Recorde de {activeStats.longestStreak} dias</span>
          </div>
        </div>

        {/* ABA 1: VISÃO GERAL */}
        <TabsContent value="visao-geral" className="space-y-6 mt-0">
          {/* Classificação Dual: Mundo Real & Mundo de Murim */}
          <Card className="bg-[#18181B] border border-[#27272A] ring-0 shadow-none rounded-lg">
            <CardHeader className="pb-3">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div>
                  <CardTitle className="text-lg text-white">
                    Classificação dual: Mundo Real e Murim
                  </CardTitle>
                  <CardDescription className="text-zinc-400">
                    Evolução paralela entre sua licença de Caçador (XP) e sua maestria de Qi em Murim (treinos, chefes e consistência).
                  </CardDescription>
                </div>
                <Badge
                  variant="outline"
                  className="w-fit font-mono-tabular tabular-nums border-[#27272A] text-orange-400 bg-[#111113]"
                >
                  {dualProgression.hunter.current.label} · {dualProgression.murim.current.name}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-md border border-[#27272A] bg-[#111113] p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
                    <Crown size={18} strokeWidth={1.75} weight="regular" aria-hidden="true" className="text-orange-400" />
                    Mundo Real · Caçador
                  </span>
                  <Badge
                    variant="secondary"
                    className="font-mono-tabular tabular-nums bg-[#18181B] text-orange-400 border border-[#27272A]"
                  >
                    {dualProgression.hunter.current.label}
                  </Badge>
                </div>
                <div className="space-y-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-base font-bold text-white">
                      {dualProgression.hunter.current.label}
                    </span>
                    <span className="text-xs text-zinc-400 font-mono-tabular tabular-nums">
                      Nível {levelProgress.level} · {activeStats.totalXp.toLocaleString('pt-BR')} XP
                    </span>
                  </div>
                  <p className="text-xs text-zinc-400">
                    {dualProgression.hunter.current.description}
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Progress
                    value={dualProgression.hunter.progressPercent}
                    aria-label="Progresso no ranking de Caçador"
                    className="h-1.5 rounded-sm bg-[#09090B] [&_[data-slot=progress-indicator]]:bg-[#F97316]"
                  />
                  <div className="flex items-center justify-between text-xs text-zinc-400 font-mono-tabular tabular-nums">
                    <span>{dualProgression.hunter.progressPercent}% do rank</span>
                    <span>
                      {dualProgression.hunter.next
                        ? `Próx: ${dualProgression.hunter.next.label} (${dualProgression.hunter.xpNeededForNextRank.toLocaleString('pt-BR')} XP)`
                        : 'Patente máxima (Rank S)'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="rounded-md border border-[#27272A] bg-[#111113] p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
                    <Sword size={18} strokeWidth={1.75} weight="regular" aria-hidden="true" className="text-emerald-400" />
                    Mundo de Murim · Reino marcial
                  </span>
                  <Badge
                    variant="secondary"
                    className="font-mono-tabular tabular-nums bg-[#18181B] text-emerald-400 border border-[#27272A]"
                  >
                    {dualProgression.murim.qiPoints.toLocaleString('pt-BR')} Qi
                  </Badge>
                </div>
                <div className="space-y-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-base font-bold text-white">
                      {dualProgression.murim.current.name}
                    </span>
                    <span className="text-xs font-medium text-emerald-400 shrink-0">
                      {dualProgression.murim.current.qiTechnique}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-400">
                    {dualProgression.murim.current.description}
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Progress
                    value={dualProgression.murim.progressPercent}
                    aria-label="Progresso no reino de Murim"
                    className="h-1.5 rounded-sm bg-[#09090B] [&_[data-slot=progress-indicator]]:bg-[#10B981]"
                  />
                  <div className="flex items-center justify-between text-xs text-zinc-400 font-mono-tabular tabular-nums">
                    <span>
                      Treinos +{dualProgression.murim.breakdown.fromWorkouts} · Chefes +{dualProgression.murim.breakdown.fromBosses}
                    </span>
                    <span>
                      {dualProgression.murim.next
                        ? `Próx: ${dualProgression.murim.next.name} (${dualProgression.murim.qiNeededForNext.toLocaleString('pt-BR')} Qi)`
                        : 'Ápice de Murim alcançado'}
                    </span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Votos Diários + Missões Automáticas */}
            <Card className="lg:col-span-7 bg-[#18181B] border border-[#27272A] ring-0 shadow-none rounded-lg">
              <CardHeader>
                <CardTitle className="text-lg text-white">Votos diários e missões</CardTitle>
                <CardDescription className="text-zinc-400">
                  Cumpra seus compromissos diários para ganhar XP e moedas ou resgate metas automáticas.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <form onSubmit={handleCreateVow} className="flex flex-col sm:flex-row gap-2.5">
                  <Input
                    type="text"
                    value={newVowTitle}
                    onChange={(e) => setNewVowTitle(e.target.value)}
                    placeholder="Novo voto diário (ex: Beber 2,5L de água)"
                    maxLength={80}
                    aria-label="Título do novo voto diário"
                    className="h-11 sm:h-9 flex-1 bg-[#111113] border-[#27272A] text-zinc-100 placeholder:text-zinc-500 focus-visible:border-orange-500 focus-visible:ring-0"
                  />
                  <Button
                    type="submit"
                    disabled={pendingKey === 'vow:create'}
                    className="h-11 sm:h-9 px-4 whitespace-nowrap shrink-0 bg-[#F97316] hover:bg-orange-400 text-zinc-950 font-semibold cursor-pointer"
                  >
                    <Plus size={18} strokeWidth={1.75} weight="regular" aria-hidden="true" />
                    <span>{pendingKey === 'vow:create' ? 'Salvando...' : 'Adicionar'}</span>
                  </Button>
                </form>

                {filteredVows.length === 0 ? (
                  <div className="rounded-md border border-dashed border-[#27272A] bg-[#111113] p-6 text-left space-y-3">
                    <p className="text-sm font-medium text-white">
                      {normalizedQuery
                        ? 'Nenhum voto corresponde ao filtro atual.'
                        : 'Nenhum voto diário cadastrado ainda.'}
                    </p>
                    <p className="text-xs text-zinc-400">
                      {normalizedQuery
                        ? 'Limpe a busca para visualizar seus compromissos.'
                        : 'Crie seu primeiro hábito acima para acumular XP diário.'}
                    </p>
                    {normalizedQuery && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setSearchTerm('')}
                        className="whitespace-nowrap shrink-0 border-[#27272A] text-zinc-200 hover:bg-zinc-800"
                      >
                        <ArrowCounterClockwise size={18} strokeWidth={1.75} weight="regular" aria-hidden="true" />
                        <span>Limpar filtro</span>
                      </Button>
                    )}
                  </div>
                ) : (
                  <div className="divide-y divide-[#27272A]">
                    {filteredVows.map((vow) => {
                      const completedToday = vow.completedDateKey === todayKey;
                      const violatedToday = vow.violatedDateKey === todayKey;
                      const resolved = isVowResolvedToday(vow, todayKey);
                      const isRowBusy =
                        pendingKey === `vow:complete:${vow.id}` ||
                        pendingKey === `vow:violate:${vow.id}` ||
                        pendingKey === `vow:delete:${vow.id}`;

                      return (
                        <div
                          key={vow.id}
                          className="py-3.5 first:pt-0 last:pb-0 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                        >
                          <div className="min-w-0 space-y-1">
                            <p
                              className={`text-sm font-medium ${
                                completedToday
                                  ? 'line-through text-zinc-500'
                                  : 'text-zinc-100'
                              }`}
                            >
                              {vow.title}
                            </p>
                            <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-400 font-mono-tabular tabular-nums">
                              <span>+{vow.xpReward} XP</span>
                              <span aria-hidden="true">·</span>
                              <span>+10 moedas</span>
                              {completedToday && (
                                <>
                                  <span aria-hidden="true">·</span>
                                  <span className="text-emerald-400 font-sans font-medium">
                                    Cumprido hoje
                                  </span>
                                </>
                              )}
                              {violatedToday && (
                                <>
                                  <span aria-hidden="true">·</span>
                                  <span className="text-red-400 font-sans font-medium">
                                    Quebrado hoje
                                  </span>
                                </>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            {!resolved && (
                              <>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="default"
                                  disabled={Boolean(pendingKey)}
                                  onClick={() => void handleCompleteVow(vow)}
                                  className="min-h-[40px] sm:min-h-8 px-3 whitespace-nowrap shrink-0 bg-[#10B981] hover:bg-emerald-400 text-zinc-950 font-semibold cursor-pointer"
                                >
                                  <Check size={18} strokeWidth={1.75} weight="regular" aria-hidden="true" />
                                  <span>{isRowBusy ? 'Salvando' : 'Cumprir'}</span>
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  disabled={Boolean(pendingKey)}
                                  onClick={() => void handleViolateVow(vow)}
                                  className="min-h-[40px] sm:min-h-8 px-3 whitespace-nowrap shrink-0 border-[#27272A] bg-[#111113] text-zinc-200 hover:bg-red-500/15 hover:text-red-400 hover:border-red-500/40 cursor-pointer"
                                >
                                  <X size={18} strokeWidth={1.75} weight="regular" aria-hidden="true" />
                                  <span>Quebrar</span>
                                </Button>
                              </>
                            )}
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              disabled={Boolean(pendingKey)}
                              onClick={() => void handleDeleteVow(vow)}
                              aria-label={`Remover voto ${vow.title}`}
                              className="size-10 sm:size-8 text-zinc-400 hover:text-red-400 hover:bg-red-500/10 shrink-0 cursor-pointer"
                            >
                              <Trash size={18} strokeWidth={1.75} weight="regular" aria-hidden="true" />
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                <Separator className="bg-[#27272A]" />

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-white">
                      Missões automáticas de hoje
                    </h3>
                    <span className="text-xs text-zinc-400 font-mono-tabular tabular-nums">
                      {autoQuests.filter((q) => q.isFulfilled).length} / {autoQuests.length} prontas
                    </span>
                  </div>

                  <div className="divide-y divide-[#27272A]">
                    {autoQuests.map((quest) => (
                      <div
                        key={quest.id}
                        className="py-3 first:pt-0 last:pb-0 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                      >
                        <div className="min-w-0 flex-1 space-y-1.5">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-medium text-zinc-100">
                              {quest.title}
                            </span>
                            <span className="text-xs text-zinc-400 font-mono-tabular tabular-nums shrink-0">
                              {quest.progressText}
                            </span>
                          </div>
                          <Progress
                            value={quest.progressPercent}
                            className="h-1.5 rounded-sm bg-[#111113] [&_[data-slot=progress-indicator]]:bg-[#F97316]"
                          />
                          <p className="text-xs text-zinc-400 font-mono-tabular tabular-nums">
                            Recompensa: +{quest.xpReward} XP · +{quest.coinsReward} moedas
                          </p>
                        </div>

                        <div className="shrink-0">
                          {quest.isClaimedToday ? (
                            <Badge
                              variant="secondary"
                              className="bg-[#10B981]/15 text-emerald-400 border border-emerald-500/35"
                            >
                              Resgatada
                            </Badge>
                          ) : quest.isFulfilled ? (
                            <Button
                              type="button"
                              size="sm"
                              disabled={Boolean(pendingKey)}
                              onClick={() => void handleClaimQuest(quest)}
                              className="min-h-[40px] sm:min-h-8 px-3 whitespace-nowrap shrink-0 bg-[#F97316] hover:bg-orange-400 text-zinc-950 font-semibold cursor-pointer"
                            >
                              <Sparkle size={18} strokeWidth={1.75} weight="regular" aria-hidden="true" />
                              <span>
                                {pendingKey === `quest:claim:${quest.id}`
                                  ? 'Resgatando...'
                                  : 'Resgatar'}
                              </span>
                            </Button>
                          ) : (
                            <span className="text-xs text-zinc-500 whitespace-nowrap">
                              Em andamento
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Coluna Direita: Check-in Biométrico & Peso */}
            <Card className="lg:col-span-5 bg-[#18181B] border border-[#27272A] ring-0 shadow-none rounded-lg">
              <CardHeader>
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-lg text-white">Check-in corporal</CardTitle>
                  <Gauge size={18} strokeWidth={1.75} weight="regular" aria-hidden="true" className="text-orange-400" />
                </div>
                <CardDescription className="text-zinc-400">
                  Registre seu peso de hoje e acompanhe o equilíbrio entre carga e descanso.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <span className="text-xs text-zinc-400">Peso atual</span>
                    <p className="text-2xl font-bold font-mono-tabular tabular-nums text-white">
                      {displayedWeightKg !== null ? `${displayedWeightKg.toFixed(1)} kg` : '—'}
                    </p>
                    <p className="text-xs text-zinc-400">
                      {currentWeightRecord
                        ? `Em ${formatBrazilianDate(currentWeightRecord.dateKey)}`
                        : 'Sem pesagem'}
                    </p>
                  </div>

                  <div className="space-y-1">
                    <span className="text-xs text-zinc-400">IMC estimado</span>
                    <p className="text-2xl font-bold font-mono-tabular tabular-nums text-white">
                      {bmiSummary ? bmiSummary.bmi.toFixed(1) : '—'}
                    </p>
                    <p className="text-xs text-zinc-400">
                      {bmiSummary ? bmiSummary.label : 'Informe altura no Perfil'}
                    </p>
                  </div>
                </div>

                <Separator className="bg-[#27272A]" />

                <form onSubmit={handleLogWeight} className="space-y-3">
                  <div className="space-y-1.5">
                    <label
                      htmlFor="panel-weight-input"
                      className="text-xs font-medium text-zinc-200"
                    >
                      Novo registro de peso (kg)
                    </label>
                    <Input
                      id="panel-weight-input"
                      type="number"
                      step="0.1"
                      min={25}
                      max={350}
                      value={weightInput}
                      onChange={(e) => setWeightInput(e.target.value)}
                      placeholder="Ex: 74.5"
                      className="h-11 sm:h-9 font-mono-tabular tabular-nums bg-[#111113] border-[#27272A] text-zinc-100 placeholder:text-zinc-500 focus-visible:border-orange-500 focus-visible:ring-0"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label
                      htmlFor="panel-weight-note"
                      className="text-xs font-medium text-zinc-200"
                    >
                      Observação (opcional)
                    </label>
                    <Input
                      id="panel-weight-note"
                      type="text"
                      maxLength={140}
                      value={weightNote}
                      onChange={(e) => setWeightNote(e.target.value)}
                      placeholder="Ex: Em jejum após descanso"
                      className="h-11 sm:h-9 bg-[#111113] border-[#27272A] text-zinc-100 placeholder:text-zinc-500 focus-visible:border-orange-500 focus-visible:ring-0"
                    />
                  </div>
                  <Button
                    type="submit"
                    disabled={pendingKey === 'health:weight'}
                    className="w-full h-11 sm:h-9 whitespace-nowrap bg-[#F97316] hover:bg-orange-400 text-zinc-950 font-semibold cursor-pointer"
                  >
                    {pendingKey === 'health:weight' ? 'Salvando...' : 'Salvar peso'}
                  </Button>
                </form>

                <Separator className="bg-[#27272A]" />

                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-zinc-200">Recomendação de hoje</span>
                    <span className={`font-semibold ${recoveryStatusTone}`}>
                      {recovery.statusLabel}
                    </span>
                  </div>
                  <p className="text-xs leading-relaxed text-zinc-400">
                    {recovery.recommendation}
                  </p>
                  <div className="pt-1 flex items-center justify-between text-xs text-zinc-400 font-mono-tabular tabular-nums">
                    <span>Carga 7d: {recovery.acuteLoad7d}</span>
                    <span>Média 28d: {recovery.chronicWeeklyAvg28d}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ABA 2: TREINOS & MISSÕES */}
        <TabsContent value="treinos" className="space-y-4 mt-0">
          <div className="flex flex-wrap items-center gap-2">
            {WORKOUT_FILTER_OPTIONS.map((opt) => {
              const isSelected = workoutFilter === opt.id;
              return (
                <Button
                  key={opt.id}
                  type="button"
                  size="sm"
                  variant={isSelected ? 'default' : 'outline'}
                  onClick={() => setWorkoutFilter(opt.id)}
                  className={`min-h-[40px] sm:min-h-8 px-3 whitespace-nowrap shrink-0 cursor-pointer ${
                    isSelected
                      ? 'bg-[#F97316] hover:bg-orange-400 text-zinc-950 font-semibold'
                      : 'bg-[#18181B] border-[#27272A] text-zinc-300 hover:text-white hover:bg-zinc-800'
                  }`}
                >
                  {opt.label}
                </Button>
              );
            })}
          </div>

          {filteredWorkouts.length === 0 ? (
            <Card className="bg-[#18181B] border border-dashed border-[#27272A] ring-0 shadow-none rounded-lg">
              <CardContent className="py-10 text-left space-y-3">
                <Barbell
                  size={18} strokeWidth={1.75}
                  weight="regular"
                  aria-hidden="true"
                  className="text-zinc-500"
                />
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-white">
                    Nenhum treino encontrado
                  </p>
                  <p className="text-xs text-zinc-400">
                    Tente ajustar a modalidade selecionada ou limpar o termo de busca.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setWorkoutFilter('todos');
                    setSearchTerm('');
                  }}
                  className="whitespace-nowrap shrink-0 border-[#27272A] text-zinc-200 hover:bg-zinc-800 cursor-pointer"
                >
                  <ArrowCounterClockwise size={18} strokeWidth={1.75} weight="regular" aria-hidden="true" />
                  <span>Limpar filtros</span>
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredWorkouts.map((workout) => {
                const typeMeta = WORKOUT_TYPE_LABELS[workout.type];
                const completeKey = `workout:complete:${workout.id}`;
                return (
                  <Card
                    key={workout.id}
                    className="bg-[#18181B] border border-[#27272A] ring-0 shadow-none rounded-lg flex flex-col justify-between transition-colors hover:border-zinc-600"
                  >
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1 min-w-0">
                          <CardTitle className="text-base leading-snug text-white">
                            {workout.name}
                          </CardTitle>
                          <p className="text-xs text-zinc-400 flex flex-wrap items-center gap-1.5 font-mono-tabular tabular-nums">
                            <span className="font-sans">{typeMeta.label}</span>
                            <span aria-hidden="true">·</span>
                            <span>{workout.durationMinutes} min</span>
                            <span aria-hidden="true">·</span>
                            <span>{workout.exercises.length} exercícios</span>
                            <span aria-hidden="true">·</span>
                            <span className="text-emerald-400">+{workout.baseXp} XP</span>
                          </p>
                        </div>
                        <Badge
                          variant="outline"
                          className={`shrink-0 font-mono-tabular ${getHunterRankBadgeClass(workout.rank)}`}
                        >
                          Rank {normalizeHunterRank(workout.rank, 'F')}
                        </Badge>
                      </div>
                      <CardDescription className="line-clamp-2 pt-1 text-zinc-400">
                        {workout.description}
                      </CardDescription>
                    </CardHeader>

                    <CardContent className="pt-0 flex flex-wrap items-center gap-2">
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => onStartWorkout(workout)}
                        className="min-h-[42px] sm:min-h-8 px-3.5 flex-1 whitespace-nowrap shrink-0 bg-[#F97316] hover:bg-orange-400 text-zinc-950 font-semibold cursor-pointer"
                      >
                        <Play size={18} strokeWidth={1.75} weight="fill" aria-hidden="true" />
                        <span>Iniciar sessão</span>
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={Boolean(pendingKey)}
                        onClick={() => void handleQuickCompleteWorkout(workout)}
                        className="min-h-[42px] sm:min-h-8 px-3.5 whitespace-nowrap shrink-0 bg-[#111113] border-[#27272A] text-zinc-200 hover:bg-zinc-800 hover:text-white cursor-pointer"
                      >
                        <CheckCircle size={18} strokeWidth={1.75} weight="regular" aria-hidden="true" />
                        <span>
                          {pendingKey === completeKey ? 'Registrando...' : 'Concluir agora'}
                        </span>
                      </Button>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* ABA 3: ARSENAL & LOADOUTS */}
        <TabsContent value="arsenal" className="space-y-6 mt-0">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            <Card className="lg:col-span-6 bg-[#18181B] border border-[#27272A] ring-0 shadow-none rounded-lg">
              <CardHeader>
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-lg text-white">Equipamento ativo</CardTitle>
                  <Shield size={18} strokeWidth={1.75} weight="regular" aria-hidden="true" className="text-orange-400" />
                </div>
                <CardDescription className="text-zinc-400">
                  Os 4 slots atualmente equipados somam bônus automáticos aos seus treinos.
                </CardDescription>
              </CardHeader>
              <CardContent className="divide-y divide-[#27272A]">
                {SLOT_ORDER.map((slotId) => {
                  const slotMeta = ARSENAL_CONFIG.slots.find((s) => s.id === slotId);
                  const equippedId = activeStats.equippedGear?.[slotId] ?? null;
                  const item = equippedId ? equipmentMap.get(equippedId) ?? null : null;

                  return (
                    <div
                      key={slotId}
                      className="py-3.5 first:pt-0 last:pb-0 flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0 space-y-0.5">
                        <p className="text-xs text-zinc-400">
                          {slotMeta?.nome ?? slotId}
                        </p>
                        <p className="text-sm font-medium text-white truncate">
                          {item ? item.name : 'Slot vazio'}
                        </p>
                        {item && (
                          <p className="text-xs text-zinc-400 font-mono-tabular tabular-nums">
                            +{item.xpBonusPercent}% XP · +{item.coinBonusPercent}% moedas · +
                            {item.bossDamageBonusPercent}% chefe
                          </p>
                        )}
                      </div>

                      {item ? (
                        <Badge
                          variant="secondary"
                          className="shrink-0 bg-[#111113] text-orange-400 border border-[#27272A]"
                        >
                          {item.rarity}
                        </Badge>
                      ) : (
                        <span className="text-xs text-zinc-500 shrink-0">
                          Sem item
                        </span>
                      )}
                    </div>
                  );
                })}

                <div className="pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => onNavigate('arsenal')}
                    className="w-full h-11 sm:h-9 whitespace-nowrap bg-[#111113] border-[#27272A] text-zinc-200 hover:bg-zinc-800 hover:text-white cursor-pointer"
                  >
                    <Sword size={18} strokeWidth={1.75} weight="regular" aria-hidden="true" className="text-orange-400" />
                    <span>Abrir loja completa do Arsenal</span>
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card className="lg:col-span-6 bg-[#18181B] border border-[#27272A] ring-0 shadow-none rounded-lg">
              <CardHeader>
                <CardTitle className="text-lg text-white">Presets de loadout</CardTitle>
                <CardDescription className="text-zinc-400">
                  Aplique uma configuração salva ou modelo rápido com um clique.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {filteredLoadouts.length === 0 ? (
                  <div className="rounded-md border border-dashed border-[#27272A] bg-[#111113] p-6 text-left space-y-3">
                    <p className="text-sm font-medium text-white">
                      Nenhum loadout encontrado
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setSearchTerm('')}
                      className="border-[#27272A] text-zinc-200 hover:bg-zinc-800 cursor-pointer"
                    >
                      <ArrowCounterClockwise size={18} strokeWidth={1.75} weight="regular" aria-hidden="true" />
                      <span>Limpar busca</span>
                    </Button>
                  </div>
                ) : (
                  <div className="divide-y divide-[#27272A]">
                    {filteredLoadouts.map((preset) => {
                      const slotIds = SLOT_ORDER.map((s) => preset.gear[s]).filter(
                        (id): id is string => Boolean(id)
                      );
                      const ownedCount = slotIds.filter((id) => ownedSet.has(id)).length;
                      const summary = calculateGearBonusSummary(preset.gear);
                      const applyKey = `arsenal:apply:${preset.id}`;

                      return (
                        <div
                          key={preset.id}
                          className="py-3.5 first:pt-0 last:pb-0 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                        >
                          <div className="min-w-0 space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-semibold text-white truncate">
                                {preset.name}
                              </span>
                              <span className="text-xs text-zinc-400 font-mono-tabular tabular-nums">
                                {ownedCount}/{slotIds.length} desbloqueados
                              </span>
                            </div>
                            <p className="text-xs text-zinc-400 font-mono-tabular tabular-nums">
                              +{summary.xpBonusPercent}% XP · +{summary.coinBonusPercent}% moedas · +
                              {summary.bossDamageBonusPercent}% chefe
                            </p>
                          </div>

                          <Button
                            type="button"
                            size="sm"
                            variant={ownedCount > 0 ? 'outline' : 'ghost'}
                            disabled={ownedCount === 0 || Boolean(pendingKey)}
                            onClick={() => void handleApplyLoadout(preset)}
                            className={`min-h-[40px] sm:min-h-8 px-3 whitespace-nowrap shrink-0 cursor-pointer ${
                              ownedCount > 0
                                ? 'bg-[#111113] border-[#27272A] text-zinc-200 hover:bg-zinc-800 hover:text-white'
                                : 'text-zinc-500'
                            }`}
                          >
                            {pendingKey === applyKey
                              ? 'Aplicando...'
                              : ownedCount > 0
                              ? 'Aplicar loadout'
                              : 'Bloqueado'}
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </section>
  );
};
