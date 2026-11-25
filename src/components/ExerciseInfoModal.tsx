import React, { useEffect } from 'react';
import {
  Barbell,
  CheckCircle,
  Fire,
  Info,
  Lightning,
  Target,
  Trophy,
  X,
} from '@phosphor-icons/react';
import { ExerciseItem, ExercisePrRecord, WorkoutTemplate } from '../types/fitness';
import { getExerciseInsight } from '../utils/rpgLogic';
import { ExerciseDemoPlayer } from './ExerciseDemoPlayer';

interface ExerciseInfoModalProps {
  exercise: ExerciseItem | null;
  workout: WorkoutTemplate | null;
  exercisePr?: ExercisePrRecord | null;
  currentLoadKg?: number;
  isCompleted?: boolean;
  onToggleComplete?: (exerciseId: string) => void;
  onClose: () => void;
}

export const ExerciseInfoModal: React.FC<ExerciseInfoModalProps> = ({
  exercise,
  workout,
  exercisePr = null,
  currentLoadKg,
  isCompleted = false,
  onToggleComplete,
  onClose,
}) => {
  useEffect(() => {
    if (!exercise) return undefined;
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [exercise, onClose]);

  if (!exercise || !workout) return null;

  const insight = getExerciseInsight(exercise, workout);
  const resolvedLoadKg =
    currentLoadKg !== undefined ? currentLoadKg : exercise.loadKg;
  const loadLabel =
    resolvedLoadKg === undefined
      ? null
      : resolvedLoadKg > 0
      ? `${resolvedLoadKg} kg`
      : 'Peso corporal';

  return (
    <div
      className="fixed inset-0 z-50 bg-black/85 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="exercise-info-modal-title"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-xl md:max-w-2xl bg-[#18181B] border border-[#27272A] rounded-t-2xl sm:rounded-xl max-h-[92dvh] flex flex-col overflow-hidden"
      >
        {/* Header */}
        <header className="px-4 sm:px-6 pt-4 pb-3.5 bg-[#111113] border-b border-[#27272A] flex items-start justify-between gap-3 shrink-0">
          <div className="space-y-1.5 min-w-0 text-left">
            <div className="text-xs font-semibold text-orange-400 flex items-start gap-1.5 leading-snug">
              <Info size={16} strokeWidth={1.75} weight="regular" className="shrink-0 mt-0.5" />
              <span className="line-clamp-2">Guia técnico · {workout.name}</span>
            </div>

            <h2
              id="exercise-info-modal-title"
              className="text-xl sm:text-2xl font-bold tracking-tight text-white leading-tight text-balance"
            >
              {exercise.name}
            </h2>

            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-zinc-400 font-mono-tabular tabular-nums">
              <span className="text-zinc-200 font-semibold">
                {exercise.prescription}
              </span>
              <span aria-hidden="true">·</span>
              <span>Descanso {exercise.restSeconds}s</span>
              {loadLabel && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="text-orange-400 font-semibold">{loadLabel}</span>
                </>
              )}
              {exercise.unilateral && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="text-zinc-300 font-medium font-sans">
                    Unilateral
                  </span>
                </>
              )}
            </div>

            {exercise.equipment && (
              <div className="text-xs text-zinc-300 flex items-center gap-1.5 pt-0.5">
                <Barbell size={16} strokeWidth={1.75} weight="regular" className="text-orange-400 shrink-0" />
                <span>{exercise.equipment}</span>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar guia técnico"
            className="min-h-[44px] min-w-[44px] -mr-2 -mt-1 rounded-md flex items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors shrink-0 cursor-pointer"
          >
            <X size={20} strokeWidth={1.75} weight="regular" />
          </button>
        </header>

        {/* Scrollable Content */}
        <div className="min-h-0 overflow-y-auto overscroll-contain divide-y divide-[#27272A]">
          {/* Athletic Silhouette Player & Cycle Bar */}
          <div className="px-4 sm:px-6 py-4">
            <ExerciseDemoPlayer exercise={exercise} />
          </div>

          {/* Unified Technical Execution & Muscle Focus */}
          <section className="px-4 sm:px-6 py-4 space-y-4 text-left">
            <div className="space-y-1.5">
              <h3 className="text-xs font-semibold text-orange-400 flex items-center gap-1.5">
                <Fire size={16} strokeWidth={1.75} weight="regular" />
                Execução técnica
              </h3>
              <p className="text-sm text-zinc-200 leading-relaxed">
                {exercise.executionTip}
              </p>
              {exercise.loadNote && (
                <p className="text-xs text-zinc-400 pt-1">
                  Carga: {exercise.loadNote}
                </p>
              )}
            </div>

            <div className="pt-3 border-t border-[#27272A]/80 space-y-2.5">
              <div className="space-y-1">
                <h3 className="text-xs font-semibold text-zinc-200 flex items-center gap-1.5">
                  <Target size={16} strokeWidth={1.75} weight="regular" className="text-orange-400" />
                  Foco muscular · {insight.primaryFocus}
                </h3>
                <p className="text-xs text-zinc-400">
                  Músculos ativados: {exercise.muscleGroups.join(' · ')}
                </p>
              </div>

              <ul className="space-y-1.5">
                {insight.activationCues.map((cue, index) => (
                  <li
                    key={index}
                    className="text-xs sm:text-sm text-zinc-300 leading-relaxed flex items-start gap-2.5"
                  >
                    <span className="font-mono-tabular tabular-nums text-xs font-semibold text-orange-400 shrink-0 mt-0.5">
                      {String(index + 1).padStart(2, '0')}.
                    </span>
                    <span>{cue}</span>
                  </li>
                ))}
              </ul>
            </div>
          </section>

          {/* Session Impact Summary */}
          <section className="px-4 sm:px-6 py-4 space-y-3 text-left">
            <h3 className="text-xs font-semibold text-orange-400 flex items-center gap-1.5">
              <Lightning size={16} strokeWidth={1.75} weight="regular" />
              Impacto na sessão
            </h3>

            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-lg bg-[#111113] border border-[#27272A]">
                <div className="text-xs text-zinc-400">Ganho estimado</div>
                <div className="text-base font-bold text-emerald-400 font-mono-tabular tabular-nums mt-0.5">
                  +{insight.xpPerExercise} XP
                </div>
              </div>
              <div className="p-3 rounded-lg bg-[#111113] border border-[#27272A]">
                <div className="text-xs text-zinc-400">Dano no chefe</div>
                <div className="text-base font-bold text-orange-400 font-mono-tabular tabular-nums mt-0.5">
                  ~{insight.bossDamagePercent}% HP
                </div>
              </div>
            </div>

            <p className="text-xs text-zinc-300 leading-relaxed">
              {insight.xpStrategyTip}
            </p>
          </section>

          {exercisePr && (
            <section className="px-4 sm:px-6 py-4 space-y-3 text-left">
              <h3 className="text-xs font-semibold text-emerald-400 flex items-center gap-1.5">
                <Trophy size={16} strokeWidth={1.75} weight="regular" />
                Seu Recorde Pessoal (PR)
              </h3>
              <div className="grid grid-cols-3 gap-2.5">
                <div className="p-3 rounded-lg bg-[#111113] border border-[#27272A]">
                  <div className="text-[11px] text-zinc-400">Melhor carga</div>
                  <div className="text-sm font-bold text-white font-mono-tabular tabular-nums mt-0.5">
                    {exercisePr.bestWeightKg > 0 ? `${exercisePr.bestWeightKg} kg` : `${exercisePr.bestReps} reps`}
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-[#111113] border border-[#27272A]">
                  <div className="text-[11px] text-zinc-400">Série recorde</div>
                  <div className="text-sm font-bold text-orange-400 font-mono-tabular tabular-nums mt-0.5">
                    {exercisePr.bestVolumeKg > 0
                      ? `${exercisePr.bestVolumeKg} kg`
                      : `${exercisePr.bestReps} reps`}
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-[#111113] border border-[#27272A]">
                  <div className="text-[11px] text-zinc-400">1RM est. (Epley)</div>
                  <div className="text-sm font-bold text-emerald-400 font-mono-tabular tabular-nums mt-0.5">
                    {exercisePr.estimated1RmKg > 0 ? `${exercisePr.estimated1RmKg} kg` : '—'}
                  </div>
                </div>
              </div>
              <p className="text-[11px] text-zinc-400 font-mono-tabular tabular-nums">
                Registrado em {exercisePr.dateKey.split('-').reverse().join('/')} · Máximo {exercisePr.bestReps} reps
              </p>
            </section>
          )}
        </div>

        {/* Sticky Thumb-Zone Footer */}
        <footer className="px-4 sm:px-6 pt-3 pb-[max(0.875rem,env(safe-area-inset-bottom))] border-t border-[#27272A] bg-[#111113] flex items-center gap-2.5 shrink-0">
          {onToggleComplete && !isCompleted && (
            <button
              type="button"
              onClick={() => {
                onToggleComplete(exercise.id);
                onClose();
              }}
              className="flex-1 min-h-[44px] py-2.5 px-4 rounded-md bg-[#10B981] hover:bg-emerald-400 text-zinc-950 font-semibold text-xs sm:text-sm flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer"
            >
              <CheckCircle size={18} strokeWidth={1.75} weight="regular" />
              Concluir exercício
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="flex-1 min-h-[44px] py-2.5 px-4 rounded-md bg-[#18181B] hover:bg-zinc-800 border border-[#27272A] text-zinc-200 font-semibold text-xs sm:text-sm transition-colors whitespace-nowrap cursor-pointer"
          >
            Fechar
          </button>
        </footer>
      </div>
    </div>
  );
};
