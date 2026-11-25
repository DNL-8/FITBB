import React, { useMemo, useState } from 'react';
import {
  ArrowRight,
  Barbell,
  BookOpen,
  CaretDown,
  CaretUp,
  Check,
  CircleNotch,
  Clock,
  Coins,
  Compass,
  Info,
  Lightning,
  MagnifyingGlass,
  Minus,
  Play,
  Plus,
  Robot,
  Skull,
  SlidersHorizontal,
  Sparkle,
  Sword,
  X,
} from '@phosphor-icons/react';
import {
  ExerciseItem,
  ExercisePrRecord,
  HeroExperience,
  HunterRankLetter,
  OracleLoadAdjustmentResponse,
  OracleLoadSuggestionItem,
  WorkoutLog,
  WorkoutTemplate,
  WorkoutType,
} from '../types/fitness';
import {
  VALID_WORKOUT_RANKS,
  WARRIOR_AWAKENING_PROGRAM,
  WARRIOR_AWAKENING_WORKOUT_IDS,
  WORKOUT_TYPE_LABELS,
  calculateCoinsForWorkout,
  detectWorkoutStagnation,
  getBossForWorkout,
  getHunterRankBadgeClass,
  getHunterRankDefinition,
  normalizeHunterRank,
} from '../utils/rpgLogic';
import { fetchAuthenticatedApi } from '../services/api';
import { ExerciseInfoModal } from './ExerciseInfoModal';
import { ErrorBanner, WorkoutTypeGlyph } from './HudPrimitives';

interface WorkoutsListViewProps {
  workouts: WorkoutTemplate[];
  logs: WorkoutLog[];
  exercisePrs?: ExercisePrRecord[];
  onStartWorkout: (workout: WorkoutTemplate) => void;
  onUpdateExerciseLoad?: (
    workoutId: string,
    exerciseId: string,
    newLoadKg: number
  ) => Promise<void>;
}

export const WorkoutsListView: React.FC<WorkoutsListViewProps> = ({
  workouts,
  logs,
  exercisePrs = [],
  onStartWorkout,
  onUpdateExerciseLoad,
}) => {
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedType, setSelectedType] = useState<'all' | WorkoutType>('all');
  const [selectedDifficulty, setSelectedDifficulty] = useState<'all' | HeroExperience>('all');
  const [selectedRank, setSelectedRank] = useState<'all' | HunterRankLetter>('all');
  const [expandedWorkoutId, setExpandedWorkoutId] = useState<string | null>(null);
  const [infoModalTarget, setInfoModalTarget] = useState<{
    exercise: ExerciseItem;
    workout: WorkoutTemplate;
  } | null>(null);

  const [dismissedCard, setDismissedCard] = useState(false);
  const [oracleLoading, setOracleLoading] = useState(false);
  const [oracleError, setOracleError] = useState<string | null>(null);
  const [oracleResult, setOracleResult] = useState<OracleLoadAdjustmentResponse | null>(null);
  const [applyingKey, setApplyingKey] = useState<string | null>(null);
  const [appliedKeys, setAppliedKeys] = useState<Record<string, boolean>>({});
  const [updatingLoadKey, setUpdatingLoadKey] = useState<string | null>(null);

  const stagnation = useMemo(
    () => detectWorkoutStagnation(logs, workouts),
    [logs, workouts]
  );

  const prByExerciseId = useMemo(() => {
    const map = new Map<string, ExercisePrRecord>();
    for (const pr of exercisePrs) {
      map.set(pr.exerciseId, pr);
    }
    return map;
  }, [exercisePrs]);

  const sortedRecentLogs = useMemo(
    () =>
      [...logs]
        .sort(
          (a, b) =>
            new Date(b.completedAt || b.dateKey).getTime() -
            new Date(a.completedAt || a.dateKey).getTime()
        )
        .slice(0, 12),
    [logs]
  );

  const handleRequestOracleAdjustments = async (): Promise<void> => {
    if (!stagnation.isStagnant || oracleLoading) return;
    setOracleLoading(true);
    setOracleError(null);

    try {
      const payloadBody = JSON.stringify({
        recentLogs: sortedRecentLogs.map((log) => ({
          dateKey: log.dateKey,
          workoutId: log.workoutId,
          workoutName: log.workoutName,
          workoutType: log.workoutType,
          completedExercises: log.completedExercises,
          totalExercises: log.totalExercises,
          durationMinutes: log.durationMinutes,
          xpEarned: log.xpEarned,
        })),
        stagnation: {
          signalKind: stagnation.signalKind,
          reason: stagnation.reason,
          avgCompletionPercent: stagnation.avgCompletionPercent,
          daysSinceLastSession: stagnation.daysSinceLastSession,
        },
        candidateWorkouts: stagnation.candidateWorkouts.slice(0, 6).map((candidate) => ({
          ...candidate,
          exercises: candidate.exercises.slice(0, 10),
        })),
      });

      const response = await fetchAuthenticatedApi('/api/oracle/load-adjustments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payloadBody,
      });

      const data = (await response.json()) as Partial<OracleLoadAdjustmentResponse> & {
        error?: string;
      };

      if (!response.ok) {
        throw new Error(data.error || `Erro HTTP ${response.status} ao consultar o Oráculo.`);
      }

      if (!Array.isArray(data.recommendations) || data.recommendations.length === 0) {
        throw new Error('O Oráculo não retornou recomendações de ajuste válidas.');
      }

      setOracleResult({
        analysisSummary: data.analysisSummary || '',
        strategyLabel: data.strategyLabel || 'Ajuste estratégico',
        recommendations: data.recommendations,
      });
      setAppliedKeys({});
    } catch (err) {
      setOracleError(
        err instanceof Error
          ? err.message
          : 'Não foi possível gerar sugestões de ajuste com o Oráculo.'
      );
    } finally {
      setOracleLoading(false);
    }
  };

  const isRecommendationApplied = (rec: OracleLoadSuggestionItem): boolean => {
    const key = `${rec.workoutId}::${rec.exerciseId}`;
    if (appliedKeys[key]) return true;
    const workout = workouts.find((w) => w.id === rec.workoutId);
    const exercise = workout?.exercises.find((e) => e.id === rec.exerciseId);
    if (!exercise) return false;
    return typeof exercise.loadKg === 'number' && exercise.loadKg === rec.suggestedLoadKg;
  };

  const handleApplySuggestion = async (rec: OracleLoadSuggestionItem): Promise<void> => {
    if (!onUpdateExerciseLoad) return;
    const key = `${rec.workoutId}::${rec.exerciseId}`;
    setApplyingKey(key);
    setOracleError(null);
    try {
      await onUpdateExerciseLoad(rec.workoutId, rec.exerciseId, rec.suggestedLoadKg);
      setAppliedKeys((prev) => ({ ...prev, [key]: true }));
    } catch (err) {
      setOracleError(
        err instanceof Error ? err.message : 'Falha ao salvar a nova carga no treino.'
      );
    } finally {
      setApplyingKey(null);
    }
  };

  const handleApplyAllSuggestions = async (): Promise<void> => {
    if (!onUpdateExerciseLoad || !oracleResult) return;
    setApplyingKey('ALL');
    setOracleError(null);
    try {
      for (const rec of oracleResult.recommendations) {
        if (!isRecommendationApplied(rec)) {
          await onUpdateExerciseLoad(rec.workoutId, rec.exerciseId, rec.suggestedLoadKg);
          const key = `${rec.workoutId}::${rec.exerciseId}`;
          setAppliedKeys((prev) => ({ ...prev, [key]: true }));
        }
      }
    } catch (err) {
      setOracleError(
        err instanceof Error ? err.message : 'Falha ao aplicar os ajustes de carga.'
      );
    } finally {
      setApplyingKey(null);
    }
  };

  const filteredWorkouts = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return workouts.filter((w) => {
      const normalizedRank = normalizeHunterRank(w.rank, 'F');
      if (selectedType !== 'all' && w.type !== selectedType) return false;
      if (selectedDifficulty !== 'all' && w.difficulty !== selectedDifficulty) return false;
      if (selectedRank !== 'all' && normalizedRank !== selectedRank) return false;
      if (!query) return true;

      const matchesTitle = w.name.toLowerCase().includes(query);
      const matchesDesc = w.description.toLowerCase().includes(query);
      const matchesRank = `rank ${normalizedRank}`.toLowerCase().includes(query);
      const matchesExercise = w.exercises.some(
        (ex) =>
          ex.name.toLowerCase().includes(query) ||
          ex.muscleGroups.some((mg) => mg.toLowerCase().includes(query)) ||
          (ex.equipment && ex.equipment.toLowerCase().includes(query)) ||
          (ex.loadNote && ex.loadNote.toLowerCase().includes(query))
      );
      return matchesTitle || matchesDesc || matchesRank || matchesExercise;
    });
  }, [workouts, searchQuery, selectedType, selectedDifficulty, selectedRank]);

  const typeFilters: ReadonlyArray<{ id: 'all' | WorkoutType; label: string }> = [
    { id: 'all', label: 'Todos' },
    { id: 'cardio', label: 'Cardio' },
    { id: 'forca', label: 'Força' },
    { id: 'hiit', label: 'HIIT' },
    { id: 'core', label: 'Abdômen' },
    { id: 'mobilidade', label: 'Mobilidade' },
    { id: 'corpo_inteiro', label: 'Corpo inteiro' },
  ];

  const difficultyFilters: ReadonlyArray<'all' | HeroExperience> = [
    'all',
    'Iniciante',
    'Intermediário',
    'Avançado',
  ];

  const isStarterTrackWorkout = (workout: WorkoutTemplate): boolean =>
    normalizeHunterRank(workout.rank, 'F') === 'F' ||
    WARRIOR_AWAKENING_WORKOUT_IDS.includes(
      workout.id as (typeof WARRIOR_AWAKENING_WORKOUT_IDS)[number]
    );

  const starterTrackWorkouts = useMemo(() => {
    return filteredWorkouts
      .filter((w) => isStarterTrackWorkout(w))
      .sort((a, b) => {
        const aIdx = WARRIOR_AWAKENING_WORKOUT_IDS.indexOf(
          a.id as (typeof WARRIOR_AWAKENING_WORKOUT_IDS)[number]
        );
        const bIdx = WARRIOR_AWAKENING_WORKOUT_IDS.indexOf(
          b.id as (typeof WARRIOR_AWAKENING_WORKOUT_IDS)[number]
        );
        const aPriority = aIdx === -1 ? Number.MAX_SAFE_INTEGER : aIdx;
        const bPriority = bIdx === -1 ? Number.MAX_SAFE_INTEGER : bIdx;
        if (aPriority !== bPriority) return aPriority - bPriority;
        return a.name.localeCompare(b.name, 'pt-BR');
      });
  }, [filteredWorkouts]);

  const catalogWorkouts = useMemo(() => {
    return filteredWorkouts.filter((w) => !isStarterTrackWorkout(w));
  }, [filteredWorkouts]);

  const hasActiveFilters =
    searchQuery.trim().length > 0 ||
    selectedType !== 'all' ||
    selectedDifficulty !== 'all' ||
    selectedRank !== 'all';

  const handleResetFilters = (): void => {
    setSearchQuery('');
    setSelectedType('all');
    setSelectedDifficulty('all');
    setSelectedRank('all');
  };

  const handleStepExerciseLoad = async (
    workoutId: string,
    exercise: ExerciseItem,
    deltaKg: number
  ): Promise<void> => {
    if (!onUpdateExerciseLoad) return;
    const key = `${workoutId}::${exercise.id}`;
    const current = typeof exercise.loadKg === 'number' ? exercise.loadKg : 0;
    const nextLoad = Math.max(0, Math.min(400, Math.round((current + deltaKg) * 2) / 2));
    if (nextLoad === current) return;
    setUpdatingLoadKey(key);
    try {
      await onUpdateExerciseLoad(workoutId, exercise.id, nextLoad);
    } finally {
      setUpdatingLoadKey(null);
    }
  };

  const pendingSuggestionsCount = oracleResult
    ? oracleResult.recommendations.filter((rec) => !isRecommendationApplied(rec)).length
    : 0;

  const renderWorkoutCard = (
    workout: WorkoutTemplate,
    isStarterHighlight: boolean = false
  ): React.ReactNode => {
    const typeMeta = WORKOUT_TYPE_LABELS[workout.type];
    const isExpanded = expandedWorkoutId === workout.id;
    const displayRank = normalizeHunterRank(workout.rank, 'F');
    const isRankF = displayRank === 'F';
    const highlightAsStarter = isStarterHighlight || isRankF;
    const rankDef = getHunterRankDefinition(displayRank);
    const boss = getBossForWorkout(workout);
    const maxCoins = calculateCoinsForWorkout(
      workout.baseXp,
      workout.exercises.length,
      workout.exercises.length,
      true
    );
    const rankBadgeStyle = getHunterRankBadgeClass(displayRank);

    return (
      <article
        key={workout.id}
        data-rank={displayRank}
        data-starter-track={highlightAsStarter ? 'true' : undefined}
        className={`bg-[#18181B] rounded-lg p-5 flex flex-col justify-between space-y-4 transition-colors border ${
          highlightAsStarter
            ? 'border-orange-500/45 hover:border-orange-400'
            : 'border-[#27272A] hover:border-zinc-600'
        }`}
      >
        <div className="space-y-3 text-left">
          <div className="flex items-start justify-between gap-2">
            <div className="text-xs font-medium text-zinc-400 flex flex-wrap items-center gap-1.5">
              <span
                title={isRankF ? `${rankDef.label} · Trilha inicial` : rankDef.label}
                className={`px-2 py-0.5 rounded-sm border font-mono-tabular font-semibold whitespace-nowrap shrink-0 ${rankBadgeStyle}`}
              >
                RANK {displayRank}
              </span>
              {highlightAsStarter && (
                <>
                  <span className="text-orange-400 font-semibold whitespace-nowrap">
                    Trilha inicial
                  </span>
                  <span aria-hidden="true" className="text-zinc-600">
                    ·
                  </span>
                </>
              )}
              <span className="inline-flex items-center gap-1 text-zinc-300">
                <WorkoutTypeGlyph type={workout.type} size={18} className="text-zinc-400" />
                {typeMeta.label}
              </span>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <span className="px-2 py-1 rounded-sm bg-[#111113] border border-[#27272A] text-emerald-400 font-semibold text-xs flex items-center gap-1 font-mono-tabular tabular-nums">
                <Lightning size={18} strokeWidth={1.75} weight="regular" />+
                {workout.baseXp} XP
              </span>
              <span className="px-2 py-1 rounded-sm bg-[#111113] border border-[#27272A] text-orange-400 font-semibold text-xs flex items-center gap-1 font-mono-tabular tabular-nums">
                <Coins size={18} strokeWidth={1.75} weight="regular" />+{maxCoins}
              </span>
            </div>
          </div>

          <div>
            <h2 className="text-base sm:text-lg font-bold tracking-tight text-white">
              {workout.name}
            </h2>
            <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
              {workout.description}
            </p>
          </div>

          <div className="px-3 py-2 rounded-md bg-[#111113] border border-[#27272A] flex items-center justify-between gap-2 text-[11px]">
            <span className="text-red-400 font-medium flex items-center gap-1.5 truncate">
              <Skull size={18} strokeWidth={1.75} weight="regular" className="shrink-0" />
              Chefe (Rank {boss.bossRank}): {boss.name}
            </span>
            <span className="font-mono-tabular tabular-nums font-semibold text-red-400 shrink-0">
              {boss.maxHp} HP
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-400 font-medium">
            <span>{workout.difficulty}</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono-tabular tabular-nums flex items-center gap-1">
              <Clock size={18} strokeWidth={1.75} weight="regular" className="text-zinc-400" />
              {workout.durationMinutes} min
            </span>
            <span aria-hidden="true">·</span>
            <span className="font-mono-tabular tabular-nums">
              {workout.exercises.length} exercícios
            </span>
          </div>

          <div className="rounded-md bg-[#111113] border border-[#27272A] overflow-hidden">
            <button
              type="button"
              onClick={() => setExpandedWorkoutId(isExpanded ? null : workout.id)}
              className="w-full min-h-[44px] px-3.5 py-2.5 flex items-center justify-between text-xs font-semibold text-zinc-300 hover:bg-zinc-800/40 transition-colors cursor-pointer"
            >
              <span className="flex items-center gap-1.5">
                <BookOpen size={18} strokeWidth={1.75} weight="regular" className="text-orange-400" />
                Ver exercícios ({workout.exercises.length})
              </span>
              {isExpanded ? (
                <CaretUp size={18} strokeWidth={1.75} weight="regular" className="text-zinc-400" />
              ) : (
                <CaretDown size={18} strokeWidth={1.75} weight="regular" className="text-zinc-400" />
              )}
            </button>

            {isExpanded && (
              <div className="px-3.5 pb-3 pt-2 border-t border-[#27272A] space-y-2">
                {workout.exercises.map((ex, idx) => {
                  const hasLoadInfo =
                    ex.loadKg !== undefined || Boolean(ex.equipment);
                  const loadLabel =
                    ex.loadKg === undefined
                      ? null
                      : ex.loadKg > 0
                      ? `${ex.loadKg} kg`
                      : 'Peso corporal';
                  const loadBusy = updatingLoadKey === `${workout.id}::${ex.id}`;
                  const exPr = prByExerciseId.get(ex.id);

                  return (
                    <div
                      key={ex.id}
                      className="p-2.5 rounded-md bg-[#18181B] border border-[#27272A] text-xs space-y-1.5"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="font-semibold text-white pt-1">
                          {idx + 1}. {ex.name}
                          {ex.unilateral && (
                            <span className="ml-1.5 text-[10px] font-semibold uppercase text-zinc-400">
                              · Unilateral
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {exPr && (
                            <span className="text-[11px] font-semibold text-emerald-400 font-mono-tabular tabular-nums mr-1">
                              PR {exPr.bestWeightKg > 0 ? `${exPr.bestWeightKg}kg` : `${exPr.bestReps}r`}
                            </span>
                          )}
                          {loadLabel && (
                            <span className="text-[11px] font-semibold text-orange-400 font-mono-tabular tabular-nums">
                              {loadLabel}
                            </span>
                          )}
                          {onUpdateExerciseLoad && ex.loadKg !== undefined && (
                            <div className="flex items-center gap-1 ml-1">
                              <button
                                type="button"
                                onClick={() => void handleStepExerciseLoad(workout.id, ex, -2.5)}
                                disabled={loadBusy || (ex.loadKg ?? 0) <= 0}
                                aria-label={`Reduzir carga de ${ex.name} em 2.5 kg`}
                                className="min-h-[36px] min-w-[36px] rounded-md bg-[#111113] border border-[#27272A] text-zinc-300 hover:text-white disabled:opacity-40 flex items-center justify-center transition-colors cursor-pointer"
                              >
                                <Minus size={18} strokeWidth={1.75} weight="regular" />
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleStepExerciseLoad(workout.id, ex, 2.5)}
                                disabled={loadBusy}
                                aria-label={`Aumentar carga de ${ex.name} em 2.5 kg`}
                                className="min-h-[36px] min-w-[36px] rounded-md bg-[#111113] border border-[#27272A] text-zinc-300 hover:text-white disabled:opacity-40 flex items-center justify-center transition-colors cursor-pointer"
                              >
                                <Plus size={18} strokeWidth={1.75} weight="regular" />
                              </button>
                            </div>
                          )}
                          <button
                            type="button"
                            onClick={() =>
                              setInfoModalTarget({ exercise: ex, workout })
                            }
                            aria-label={`Ver guia técnico e foco muscular de ${ex.name}`}
                            title="Guia técnico e foco muscular"
                            className="min-h-11 min-w-11 -my-1.5 -mr-1.5 rounded-md flex items-center justify-center text-zinc-400 hover:text-orange-400 hover:bg-zinc-800/60 transition-colors cursor-pointer"
                          >
                            <Info size={18} strokeWidth={1.75} weight="regular" />
                          </button>
                        </div>
                      </div>
                      <div className="text-[11px] text-zinc-300 font-medium font-mono-tabular tabular-nums">
                        {ex.prescription} · Descanso {ex.restSeconds}s
                      </div>
                      {hasLoadInfo && ex.equipment && (
                        <div className="text-[11px] text-zinc-400 flex items-center gap-1.5">
                          <Barbell size={18} strokeWidth={1.75} weight="regular" className="text-zinc-500 shrink-0" />
                          <span>{ex.equipment}</span>
                        </div>
                      )}
                      {ex.loadNote && (
                        <div className="text-[10px] text-zinc-500 leading-relaxed">
                          {ex.loadNote}
                        </div>
                      )}
                      <div className="text-[10px] text-zinc-500">
                        Músculos: {ex.muscleGroups.join(', ')}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={() => onStartWorkout(workout)}
          className="w-full min-h-[44px] py-2.5 px-4 rounded-md bg-[#F97316] hover:bg-orange-400 text-zinc-950 font-semibold text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer"
        >
          <Play size={18} strokeWidth={1.75} weight="fill" />
          Iniciar treino · Enfrentar chefe
        </button>
      </article>
    );
  };

  return (
    <div className="space-y-5">
      <div className="space-y-1 text-left">
        <div className="text-[11px] font-mono-tabular uppercase tracking-wider text-orange-400">
          Sessões disponíveis
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
          <Sword size={18} strokeWidth={1.75} weight="regular" className="text-orange-400" />
          Catálogo de treinos
        </h1>
        <p className="text-xs text-zinc-400">
          Cada sessão abre um combate em Modo Foco contra um chefe: conclua os exercícios no tempo alvo para ganhar XP e Moedas.
        </p>
      </div>

      {stagnation.isStagnant && !dismissedCard && (
        <section
          aria-label="Alerta de estagnação e sugestão do Oráculo"
          className="bg-[#18181B] border border-[#27272A] rounded-lg p-4 space-y-3"
        >
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
            <div className="flex items-start gap-3 min-w-0">
              <div className="w-9 h-9 rounded-md bg-[#111113] border border-[#27272A] flex items-center justify-center shrink-0">
                <Robot size={18} strokeWidth={1.75} weight="regular" className="text-orange-400" />
              </div>
              <div className="min-w-0 space-y-1 text-left">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <h2 className="text-sm font-bold text-white">
                    Oráculo · Ajuste de carga por estagnação
                  </h2>
                  <span className="text-[11px] font-semibold text-zinc-400 font-mono-tabular tabular-nums">
                    {stagnation.recentSessionsCount} sessões · {stagnation.avgCompletionPercent}% concluído
                  </span>
                </div>
                <p className="text-xs text-zinc-400 leading-relaxed">
                  {stagnation.reason}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleRequestOracleAdjustments}
                disabled={oracleLoading}
                className="min-h-[40px] px-3.5 py-2 rounded-md bg-[#F97316] hover:bg-orange-400 disabled:opacity-60 text-zinc-950 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                {oracleLoading ? (
                  <CircleNotch size={18} strokeWidth={1.75} weight="regular" className="animate-spin" />
                ) : (
                  <Sparkle size={18} strokeWidth={1.75} weight="regular" />
                )}
                {oracleLoading
                  ? 'Analisando...'
                  : oracleResult
                  ? 'Recalcular cargas'
                  : 'Consultar Oráculo'}
              </button>
              <button
                type="button"
                onClick={() => setDismissedCard(true)}
                aria-label="Ocultar aviso do Oráculo"
                className="min-h-[40px] min-w-[40px] rounded-md bg-[#111113] border border-[#27272A] text-zinc-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
              >
                <X size={18} strokeWidth={1.75} weight="regular" />
              </button>
            </div>
          </div>

          {oracleError && (
            <ErrorBanner
              message={oracleError}
              onDismiss={() => setOracleError(null)}
            />
          )}

          {oracleResult && (
            <div className="pt-3 border-t border-[#27272A] space-y-2.5 text-left">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs text-zinc-300 leading-relaxed">
                  <span className="font-semibold text-orange-400 mr-1.5">
                    {oracleResult.strategyLabel}:
                  </span>
                  {oracleResult.analysisSummary}
                </div>

                {onUpdateExerciseLoad && pendingSuggestionsCount > 1 && (
                  <button
                    type="button"
                    onClick={handleApplyAllSuggestions}
                    disabled={applyingKey !== null}
                    className="min-h-[40px] px-3 py-1.5 rounded-md bg-[#10B981]/15 hover:bg-[#10B981]/25 border border-emerald-500/40 text-emerald-400 text-xs font-semibold whitespace-nowrap shrink-0 transition-colors cursor-pointer"
                  >
                    {applyingKey === 'ALL' ? 'Aplicando...' : 'Aplicar todos'}
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {oracleResult.recommendations.map((rec) => {
                  const key = `${rec.workoutId}::${rec.exerciseId}`;
                  const applied = isRecommendationApplied(rec);
                  const isApplying = applyingKey === key || applyingKey === 'ALL';
                  const deltaLabel =
                    rec.deltaKg > 0
                      ? `+${rec.deltaKg} kg`
                      : rec.deltaKg < 0
                      ? `${rec.deltaKg} kg`
                      : 'Manter';

                  return (
                    <div
                      key={key}
                      className="p-3 rounded-md bg-[#111113] border border-[#27272A] flex flex-col justify-between gap-2"
                    >
                      <div className="space-y-1">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="text-xs font-semibold text-white truncate">
                              {rec.exerciseName}
                            </div>
                            <div className="text-[10px] text-zinc-500 truncate">
                              {rec.workoutName}
                            </div>
                          </div>
                          <span
                            className={`text-[11px] font-semibold font-mono-tabular tabular-nums shrink-0 ${
                              rec.deltaKg > 0
                                ? 'text-emerald-400'
                                : rec.deltaKg < 0
                                ? 'text-orange-400'
                                : 'text-zinc-400'
                            }`}
                          >
                            {deltaLabel}
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5 text-xs font-mono-tabular tabular-nums">
                          <span className="text-zinc-400">
                            {rec.currentLoadKg > 0 ? `${rec.currentLoadKg} kg` : 'Peso corp.'}
                          </span>
                          <ArrowRight size={18} strokeWidth={1.75} weight="regular" className="text-orange-400" />
                          <span className="font-semibold text-white">
                            {rec.suggestedLoadKg > 0 ? `${rec.suggestedLoadKg} kg` : 'Peso corp.'}
                          </span>
                        </div>

                        <p className="text-[11px] text-zinc-400 leading-relaxed">
                          {rec.rationale}
                        </p>
                      </div>

                      {onUpdateExerciseLoad && (
                        <button
                          type="button"
                          onClick={() => handleApplySuggestion(rec)}
                          disabled={applied || isApplying}
                          className={`min-h-[40px] w-full px-3 rounded-md text-xs font-semibold flex items-center justify-center gap-1.5 border transition-colors cursor-pointer ${
                            applied
                              ? 'bg-[#10B981]/15 border-emerald-500/35 text-emerald-400'
                              : 'bg-[#18181B] hover:bg-zinc-800 border-[#27272A] text-zinc-200'
                          }`}
                        >
                          {applied ? (
                            <>
                              <Check size={18} strokeWidth={1.75} weight="regular" />
                              Carga aplicada
                            </>
                          ) : isApplying ? (
                            <>
                              <CircleNotch size={18} strokeWidth={1.75} weight="regular" className="animate-spin" />
                              Salvando...
                            </>
                          ) : (
                            <>Aplicar ajuste ({rec.suggestedLoadKg} kg)</>
                          )}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </section>
      )}

      <section className="bg-[#18181B] border border-[#27272A] rounded-lg p-4 space-y-3">
        <div className="relative">
          <MagnifyingGlass size={18} strokeWidth={1.75} weight="regular" className="text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar treino, exercício, equipamento ou músculo..."
            className="w-full pl-10 pr-9 py-2.5 rounded-md bg-[#111113] border border-[#27272A] text-xs sm:text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-orange-500"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              aria-label="Limpar busca"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white cursor-pointer"
            >
              <X size={18} strokeWidth={1.75} weight="regular" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          {typeFilters.map((filter) => {
            const active = selectedType === filter.id;
            return (
              <button
                key={filter.id}
                type="button"
                onClick={() => setSelectedType(filter.id)}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold whitespace-nowrap shrink-0 border transition-colors cursor-pointer ${
                  active
                    ? 'bg-[#F97316] text-zinc-950 border-[#F97316]'
                    : 'bg-[#111113] text-zinc-400 border-[#27272A] hover:text-zinc-200'
                }`}
              >
                {filter.label}
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
          <span className="text-[11px] font-medium text-zinc-500 flex items-center gap-1 mr-1">
            <SlidersHorizontal size={18} strokeWidth={1.75} weight="regular" />
            Dificuldade:
          </span>
          {difficultyFilters.map((diff) => {
            const active = selectedDifficulty === diff;
            return (
              <button
                key={diff}
                type="button"
                onClick={() => setSelectedDifficulty(diff)}
                className={`px-2.5 py-1 rounded-sm text-[11px] font-semibold border whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                  active
                    ? 'bg-orange-500/15 text-orange-400 border-orange-500/45'
                    : 'bg-[#111113] text-zinc-400 border-[#27272A] hover:text-zinc-200'
                }`}
              >
                {diff === 'all' ? 'Todas' : diff}
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
          <span className="text-[11px] font-medium text-zinc-500 mr-1">
            Rank:
          </span>
          {(['all', ...VALID_WORKOUT_RANKS] as const).map((rankOption) => {
            const active = selectedRank === rankOption;
            const isRankFOption = rankOption === 'F';
            return (
              <button
                key={rankOption}
                type="button"
                onClick={() => setSelectedRank(rankOption)}
                title={isRankFOption ? 'Rank F · Trilha inicial' : undefined}
                aria-label={
                  rankOption === 'all'
                    ? 'Mostrar todos os ranks'
                    : isRankFOption
                    ? 'Filtrar por Rank F (Trilha inicial)'
                    : `Filtrar por Rank ${rankOption}`
                }
                className={`px-2.5 py-1 rounded-sm text-[11px] font-mono-tabular tabular-nums font-semibold border whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                  active
                    ? 'bg-orange-500/15 text-orange-400 border-orange-500/45'
                    : 'bg-[#111113] text-zinc-400 border-[#27272A] hover:text-zinc-200'
                }`}
              >
                {rankOption === 'all' ? 'Todos' : rankOption}
              </button>
            );
          })}
        </div>
      </section>

      {filteredWorkouts.length === 0 ? (
        <div className="bg-[#18181B] border border-[#27272A] rounded-lg p-8 text-left space-y-3">
          <Barbell size={18} strokeWidth={1.75} weight="regular" className="text-zinc-500" />
          <div className="space-y-1">
            <h3 className="text-sm font-bold text-white">Nenhum treino encontrado</h3>
            <p className="text-xs text-zinc-400">
              Ajuste os filtros de categoria, dificuldade, rank ou limpe o termo de busca.
            </p>
          </div>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={handleResetFilters}
              className="min-h-[40px] px-4 py-2 rounded-md bg-[#111113] hover:bg-zinc-800 border border-[#27272A] text-orange-400 text-xs font-semibold transition-colors cursor-pointer"
            >
              Limpar filtros
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          {starterTrackWorkouts.length > 0 && (
            <section
              aria-label="Trilha inicial Rank F — Despertar do Guerreiro"
              className={`space-y-4 ${
                catalogWorkouts.length > 0 ? 'pb-6 border-b border-[#27272A]' : ''
              }`}
            >
              <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2 text-left">
                <div className="space-y-1">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-orange-400 flex items-center gap-1.5">
                    <Compass size={18} strokeWidth={1.75} weight="regular" />
                    Trilha inicial · Rank F
                  </div>
                  <h2 className="text-base sm:text-lg font-bold tracking-tight text-white">
                    Despertar do guerreiro — Treinos A e B
                  </h2>
                  <p className="text-xs text-zinc-400">
                    Alternância recomendada para Rank F e iniciantes · 40 min · Equipamentos:{' '}
                    {WARRIOR_AWAKENING_PROGRAM.equipments.join(' · ')}
                  </p>
                </div>
                <span className="text-xs font-mono-tabular tabular-nums font-medium text-zinc-400 whitespace-nowrap shrink-0">
                  Cargas leves 5–10 kg editáveis
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {starterTrackWorkouts.map((workout) =>
                  renderWorkoutCard(workout, true)
                )}
              </div>
            </section>
          )}

          {catalogWorkouts.length > 0 && (
            <section aria-label="Catálogo geral de portais de treino" className="space-y-3">
              {starterTrackWorkouts.length > 0 && (
                <div className="flex items-center justify-between text-left">
                  <h2 className="text-sm font-bold text-zinc-200">
                    Demais portais de combate (Ranks E–S)
                  </h2>
                  <span className="text-xs font-mono-tabular tabular-nums text-zinc-400">
                    {catalogWorkouts.length} treinos
                  </span>
                </div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {catalogWorkouts.map((workout) => renderWorkoutCard(workout, false))}
              </div>
            </section>
          )}
        </div>
      )}

      <ExerciseInfoModal
        exercise={infoModalTarget?.exercise ?? null}
        workout={infoModalTarget?.workout ?? null}
        exercisePr={
          infoModalTarget
            ? prByExerciseId.get(infoModalTarget.exercise.id) ?? null
            : null
        }
        onClose={() => setInfoModalTarget(null)}
      />
    </div>
  );
};
