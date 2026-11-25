import React, { useEffect, useState } from 'react';
import {
  Barbell,
  Crosshair,
  Crown,
  Fire,
  Heart,
  Heartbeat,
  Lightning,
  Medal,
  PersonSimpleRun,
  Shield,
  Skull,
  Sparkle,
  Star,
  Sword,
  Trophy,
  Wind,
} from '@phosphor-icons/react';
import { AnimatePresence, animate, motion, useReducedMotion } from 'motion/react';
import { HeroClass, WorkoutType } from '../types/fitness';
import { LEVEL_THRESHOLDS, getHunterRankForLevel, getLevelProgress } from '../utils/rpgLogic';

export const CLASS_BONUS_META: Record<
  HeroClass,
  { bonuses: string[]; ringClass: string; badgeClass: string }
> = {
  Guerreiro: {
    bonuses: ['+6 Força', '+3 Resistência'],
    ringClass: 'border-orange-500/45 bg-[#111113]',
    badgeClass: 'bg-[#111113] text-orange-400 border-[#27272A]',
  },
  Arqueiro: {
    bonuses: ['+6 Agilidade', '+3 Resistência'],
    ringClass: 'border-emerald-500/45 bg-[#111113]',
    badgeClass: 'bg-[#111113] text-emerald-400 border-[#27272A]',
  },
  Mago: {
    bonuses: ['+8 Disciplina', '+Foco mental'],
    ringClass: 'border-zinc-500/50 bg-[#111113]',
    badgeClass: 'bg-[#111113] text-zinc-200 border-[#27272A]',
  },
};

export const HeroGlyph: React.FC<{
  avatarOrClass?: string | null;
  size?: number;
  className?: string;
}> = ({ avatarOrClass, size = 18, className = 'text-zinc-200' }) => {
  switch (avatarOrClass) {
    case 'ranger':
    case 'Arqueiro':
    case '🏹':
      return <Crosshair size={size} strokeWidth={1.75} weight="regular" className={className} />;
    case 'arcane':
    case 'Mago':
    case '🔮':
      return <Sparkle size={size} strokeWidth={1.75} weight="regular" className={className} />;
    case 'phoenix':
    case '🔥':
      return <Fire size={size} strokeWidth={1.75} weight="regular" className={className} />;
    case 'titan':
    case '🛡️':
      return <Shield size={size} strokeWidth={1.75} weight="regular" className={className} />;
    case 'crown':
    case '👑':
      return <Crown size={size} strokeWidth={1.75} weight="regular" className={className} />;
    case 'blade':
    case 'Guerreiro':
    case '⚔️':
    default:
      return <Sword size={size} strokeWidth={1.75} weight="regular" className={className} />;
  }
};

export const WorkoutTypeGlyph: React.FC<{
  type: WorkoutType;
  size?: number;
  className?: string;
}> = ({ type, size = 18, className = 'text-zinc-300' }) => {
  switch (type) {
    case 'cardio':
      return <Heartbeat size={size} strokeWidth={1.75} weight="regular" className={className} />;
    case 'forca':
      return <Barbell size={size} strokeWidth={1.75} weight="regular" className={className} />;
    case 'hiit':
      return <Lightning size={size} strokeWidth={1.75} weight="regular" className={className} />;
    case 'core':
      return <Shield size={size} strokeWidth={1.75} weight="regular" className={className} />;
    case 'mobilidade':
      return <Wind size={size} strokeWidth={1.75} weight="regular" className={className} />;
    case 'corpo_inteiro':
      return <Fire size={size} strokeWidth={1.75} weight="regular" className={className} />;
    default:
      return <PersonSimpleRun size={size} strokeWidth={1.75} weight="regular" className={className} />;
  }
};

export const AchievementGlyph: React.FC<{
  id: string;
  size?: number;
  className?: string;
}> = ({ id, size = 18, className = 'text-zinc-200' }) => {
  switch (id) {
    case 'first_blood':
      return <Heart size={size} strokeWidth={1.75} weight="regular" className={className} />;
    case 'week_warrior':
      return <Fire size={size} strokeWidth={1.75} weight="regular" className={className} />;
    case 'month_master':
      return <Crown size={size} strokeWidth={1.75} weight="regular" className={className} />;
    case 'fat_burner':
      return <Lightning size={size} strokeWidth={1.75} weight="regular" className={className} />;
    case 'iron_will':
      return <Barbell size={size} strokeWidth={1.75} weight="regular" className={className} />;
    case 'veteran':
      return <Shield size={size} strokeWidth={1.75} weight="regular" className={className} />;
    case 'elite':
      return <Sword size={size} strokeWidth={1.75} weight="regular" className={className} />;
    case 'legendary':
      return <Trophy size={size} strokeWidth={1.75} weight="regular" className={className} />;
    case 'first_pr':
      return <Medal size={size} strokeWidth={1.75} weight="regular" className={className} />;
    case 'pr_collector_10':
      return <Trophy size={size} strokeWidth={1.75} weight="regular" className={className} />;
    case 'weekly_raid_clear':
      return <Skull size={size} strokeWidth={1.75} weight="regular" className={className} />;
    default:
      return <Medal size={size} strokeWidth={1.75} weight="regular" className={className} />;
  }
};

export function getHeroHunterRank(level: number): { rank: string; label: string } {
  const rankProgress = getHunterRankForLevel(level);
  const title =
    LEVEL_THRESHOLDS.find((t) => t.level === level)?.title ??
    (level >= 25 ? 'Rank S Nacional' : `Rank ${rankProgress.current.rank}`);
  return {
    rank: rankProgress.current.rank,
    label: `${rankProgress.current.label} · ${title}`,
  };
}

export const AnimatedXpCounter: React.FC<{ targetValue: number; durationMs?: number }> = ({
  targetValue,
  durationMs = 1100,
}) => {
  const [displayValue, setDisplayValue] = useState<number>(0);

  useEffect(() => {
    let frameId = 0;
    const startTime = performance.now();

    const step = (now: number): void => {
      const elapsed = now - startTime;
      const progress = Math.min(1, elapsed / durationMs);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayValue(Math.round(targetValue * eased));
      if (progress < 1) {
        frameId = window.requestAnimationFrame(step);
      }
    };

    frameId = window.requestAnimationFrame(step);
    return () => window.cancelAnimationFrame(frameId);
  }, [targetValue, durationMs]);

  return (
    <span className="font-mono-tabular tabular-nums">+{displayValue.toLocaleString('pt-BR')} XP</span>
  );
};

export const XpProgressBar: React.FC<{
  totalXp: number;
  compact?: boolean;
  animateFromXp?: number | null;
  xpGainDelta?: number | null;
  isCelebrating?: boolean;
}> = ({
  totalXp,
  compact = false,
  animateFromXp = null,
  xpGainDelta = null,
  isCelebrating = false,
}) => {
  const info = getLevelProgress(totalXp);
  const reduceMotion = useReducedMotion();
  const [displayedXp, setDisplayedXp] = useState<number>(totalXp);

  useEffect(() => {
    if (!reduceMotion && animateFromXp !== null && animateFromXp < totalXp) {
      setDisplayedXp(animateFromXp);
      const controls = animate(animateFromXp, totalXp, {
        duration: 0.65,
        ease: [0.16, 1, 0.3, 1],
        onUpdate: (latest) => setDisplayedXp(Math.round(latest)),
      });
      return () => controls.stop();
    }
    setDisplayedXp(totalXp);
    return undefined;
  }, [totalXp, animateFromXp, reduceMotion]);

  return (
    <div className="xp-progress-bar-container w-full min-w-0 mx-auto flex flex-col items-stretch">
      <div className="w-full min-w-0 flex flex-wrap items-center justify-between gap-x-2 gap-y-1 text-xs mb-1.5">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 min-w-0 max-w-full">
          <motion.span
            key={isCelebrating ? `xp-celebrate-${totalXp}` : 'xp-steady'}
            initial={isCelebrating ? { scale: 0.96 } : false}
            animate={isCelebrating ? { scale: [1, 1.05, 1] } : { scale: 1 }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            className="font-semibold text-zinc-100 inline-flex items-center gap-1.5 font-mono-tabular tabular-nums min-w-0 max-w-full"
          >
            <Lightning size={18} strokeWidth={1.75} weight="regular" className="text-[#F97316] shrink-0" />
            <span className="truncate">{displayedXp.toLocaleString('pt-BR')} XP</span>
          </motion.span>

          <AnimatePresence>
            {xpGainDelta !== null && xpGainDelta > 0 && (
              <motion.span
                key={`delta-${totalXp}-${xpGainDelta}`}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                className="text-[11px] font-semibold text-[#10B981] font-mono-tabular tabular-nums whitespace-nowrap shrink-0"
              >
                +{xpGainDelta.toLocaleString('pt-BR')} XP
              </motion.span>
            )}
          </AnimatePresence>
        </div>

        {compact ? (
          <span className="text-[11px] font-medium text-zinc-400 font-mono-tabular tabular-nums whitespace-nowrap shrink-0 ml-auto text-right">
            {info.isMaxLevel ? 'Nível máximo' : `Meta Nv. ${info.level + 1}`}
          </span>
        ) : info.isMaxLevel ? (
          <span className="font-semibold text-[#10B981] inline-flex items-center gap-1 text-[11px] font-mono-tabular tabular-nums whitespace-nowrap shrink-0 ml-auto text-right">
            <Crown size={18} strokeWidth={1.75} weight="regular" className="shrink-0" /> Patente máxima · {info.levelTitle}
          </span>
        ) : (
          <span className="text-zinc-400 font-mono-tabular tabular-nums text-[11px] whitespace-nowrap shrink-0 ml-auto text-right">
            Faltam <strong className="text-zinc-100 tabular-nums">{info.xpNeededForNext.toLocaleString('pt-BR')} XP</strong> · Nv.{' '}
            {info.level + 1}
          </span>
        )}
      </div>

      {/* Trilho técnico chanfrado / reto com marcadores de escala 25% / 50% / 75% */}
      <div
        className={`relative w-full mx-auto bg-[#09090B] border rounded-sm overflow-hidden transition-colors duration-200 ${
          isCelebrating ? 'border-[#10B981]' : 'border-[#27272A]'
        } ${compact ? 'h-2' : 'h-2.5'}`}
        role="progressbar"
        aria-valuenow={info.progressPercent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Progresso de experiência"
      >
        <motion.div
          style={{ transformOrigin: 'left center' }}
          initial={false}
          animate={{ scaleX: Math.max(0, Math.min(1, info.progressPercent / 100)) }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          className={`w-full h-full ${
            isCelebrating ? 'bg-[#10B981]' : 'bg-[#F97316]'
          }`}
        />
        <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-1/4 w-px bg-white/10" />
        <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-1/2 w-px bg-white/15" />
        <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-3/4 w-px bg-white/10" />
      </div>

      {compact ? (
        <div className="w-full min-w-0 mt-1.5 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 text-[11px] text-zinc-400 font-mono-tabular tabular-nums">
          {info.isMaxLevel ? (
            <span className="font-medium text-[#10B981] inline-flex items-center gap-1 min-w-0 truncate">
              <Crown size={18} strokeWidth={1.75} weight="regular" className="shrink-0" />
              <span className="truncate">{info.levelTitle}</span>
            </span>
          ) : (
            <span className="min-w-0 truncate">
              Faltam <strong className="font-semibold text-zinc-200 tabular-nums">{info.xpNeededForNext.toLocaleString('pt-BR')} XP</strong>
            </span>
          )}
          <span className="text-zinc-200 font-semibold tabular-nums shrink-0 text-right">
            {info.progressPercent}%
          </span>
        </div>
      ) : (
        <div className="w-full min-w-0 mt-1.5 flex items-center justify-between gap-2 text-[11px] text-zinc-500 font-mono-tabular tabular-nums">
          <span>Progresso do nível {info.level}</span>
          <span className="text-zinc-300 font-semibold text-right">{info.progressPercent}%</span>
        </div>
      )}
    </div>
  );
};

export const LevelBadge: React.FC<{
  level: number;
  size?: 'sm' | 'md' | 'lg';
  showHunterRank?: boolean;
  celebrate?: boolean;
}> = ({ level, size = 'md', showHunterRank = false, celebrate = false }) => {
  const isMaster = level >= 5;
  const hunter = getHeroHunterRank(level);
  const levelTitle =
    LEVEL_THRESHOLDS.find((t) => t.level === level)?.title ??
    (level >= 25 ? 'Rank S Nacional' : `Rank ${hunter.rank}`);
  const sizeClasses =
    size === 'sm'
      ? 'text-[11px] px-2 py-0.5'
      : size === 'lg'
      ? 'text-xs px-3 py-1'
      : 'text-xs px-2.5 py-0.5';

  return (
    <motion.span
      key={celebrate ? `lvl-pop-${level}` : `lvl-static-${level}`}
      initial={celebrate ? { scale: 0.92, opacity: 0.75 } : false}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      className={`inline-flex items-center gap-1.5 rounded-sm border whitespace-nowrap shrink-0 font-mono-tabular tabular-nums ${sizeClasses} ${
        isMaster
          ? 'font-semibold bg-[#111113] text-orange-400 border-orange-500/45'
          : 'font-semibold bg-[#111113] text-zinc-200 border-[#27272A]'
      }`}
    >
      {isMaster ? (
        <>
          <Crown size={18} strokeWidth={1.75} weight="regular" className="text-orange-400 shrink-0" />
          Nível {level} · {levelTitle}
        </>
      ) : (
        <>
          <Star size={18} strokeWidth={1.75} weight="regular" className="text-zinc-400 shrink-0" />
          {showHunterRank ? `Nível ${level} · Rank ${hunter.rank}` : `Nível ${level} · ${levelTitle}`}
        </>
      )}
    </motion.span>
  );
};

export { ErrorBanner, SystemHudSkeleton } from './StatusFeedback';

export const AttributeRadarChart: React.FC<{
  forca: number;
  resistencia: number;
  agilidade: number;
  disciplina: number;
}> = ({ forca, resistencia, agilidade, disciplina }) => {
  const cx = 140;
  const cy = 125;
  const maxRadius = 76;

  const clampRatio = (val: number): number => Math.min(1, Math.max(0.1, val / 100));

  const pForca = { x: cx, y: cy - maxRadius * clampRatio(forca) };
  const pResistencia = { x: cx + maxRadius * clampRatio(resistencia), y: cy };
  const pAgilidade = { x: cx, y: cy + maxRadius * clampRatio(agilidade) };
  const pDisciplina = { x: cx - maxRadius * clampRatio(disciplina), y: cy };

  const polygonPoints = `${pForca.x},${pForca.y} ${pResistencia.x},${pResistencia.y} ${pAgilidade.x},${pAgilidade.y} ${pDisciplina.x},${pDisciplina.y}`;
  const levels = [0.25, 0.5, 0.75, 1];

  return (
    <div className="w-full flex items-center justify-center py-2">
      <svg
        viewBox="0 0 280 250"
        className="w-full max-w-[290px] h-auto overflow-visible"
        role="img"
        aria-label={`Gráfico radar de atributos: Força ${forca}, Resistência ${resistencia}, Agilidade ${agilidade}, Disciplina ${disciplina}`}
      >
        <defs>
          <linearGradient id="radarFillGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#F97316" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#10B981" stopOpacity="0.14" />
          </linearGradient>
        </defs>

        {levels.map((ratio) => {
          const r = maxRadius * ratio;
          const pts = `${cx},${cy - r} ${cx + r},${cy} ${cx},${cy + r} ${cx - r},${cy}`;
          return (
            <polygon
              key={ratio}
              points={pts}
              fill="none"
              stroke="rgba(161,161,170,0.18)"
              strokeWidth="1"
            />
          );
        })}

        <line
          x1={cx}
          y1={cy - maxRadius}
          x2={cx}
          y2={cy + maxRadius}
          stroke="rgba(161,161,170,0.18)"
          strokeWidth="1"
        />
        <line
          x1={cx - maxRadius}
          y1={cy}
          x2={cx + maxRadius}
          y2={cy}
          stroke="rgba(161,161,170,0.18)"
          strokeWidth="1"
        />

        <polygon
          points={polygonPoints}
          fill="url(#radarFillGrad)"
          stroke="#F97316"
          strokeWidth="1.75"
          strokeLinejoin="round"
        />

        <circle cx={pForca.x} cy={pForca.y} r="3.5" fill="#F97316" stroke="#09090B" strokeWidth="1.5" />
        <circle cx={pResistencia.x} cy={pResistencia.y} r="3.5" fill="#10B981" stroke="#09090B" strokeWidth="1.5" />
        <circle cx={pAgilidade.x} cy={pAgilidade.y} r="3.5" fill="#F4F4F5" stroke="#09090B" strokeWidth="1.5" />
        <circle cx={pDisciplina.x} cy={pDisciplina.y} r="3.5" fill="#A1A1AA" stroke="#09090B" strokeWidth="1.5" />

        <text x={cx} y={24} textAnchor="middle" className="fill-orange-400 text-[11px] font-semibold font-mono-tabular">
          FORÇA ({forca})
        </text>
        <text x={232} y={cy + 4} textAnchor="start" className="fill-emerald-400 text-[10px] font-semibold font-mono-tabular">
          RES ({resistencia})
        </text>
        <text x={cx} y={232} textAnchor="middle" className="fill-zinc-200 text-[11px] font-semibold font-mono-tabular">
          AGILIDADE ({agilidade})
        </text>
        <text x={48} y={cy + 4} textAnchor="end" className="fill-zinc-400 text-[10px] font-semibold font-mono-tabular">
          DISC ({disciplina})
        </text>
      </svg>
    </div>
  );
};
