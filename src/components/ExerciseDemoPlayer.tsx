import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { ArrowCounterClockwise, Gauge, Pause, Play } from '@phosphor-icons/react';
import { ExerciseItem } from '../types/fitness';
import {
  BODY_ZONE_LABELS,
  buildAthleticBodyGeometry,
  computeMuscleHeatmapLevel,
  type HeatmapIntensityLevel,
  type MuscleHeatmapState,
} from '../utils/athleticAnatomy';
import {
  type BodyZone,
  CYCLE_PHASE_BOUNDARIES,
  getExerciseMotionSpec,
  interpolatePose,
} from '../utils/exerciseMotion';

interface ExerciseDemoPlayerProps {
  exercise: ExerciseItem;
  compact?: boolean;
}

const [HOLD_START, HOLD_END] = CYCLE_PHASE_BOUNDARIES;
const PHASE_CHECKPOINTS = [HOLD_START / 2, (HOLD_START + HOLD_END) / 2, (1 + HOLD_END) / 2] as const;
const LAST_CYCLE_POSITION = 0.999;

const HEATMAP_LEVEL_CLASSES: Record<
  HeatmapIntensityLevel,
  { text: string; swatch: string }
> = {
  Baixa: { text: 'text-sky-300', swatch: 'bg-sky-400' },
  Moderada: { text: 'text-amber-300', swatch: 'bg-amber-400' },
  Alta: { text: 'text-orange-400', swatch: 'bg-orange-500' },
  Máxima: { text: 'text-rose-300', swatch: 'bg-red-500' },
};

function clampCyclePosition(value: number): number {
  return Math.min(LAST_CYCLE_POSITION, Math.max(0, value));
}

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function getShortPhaseName(fullLabel: string): string {
  const head = fullLabel.split('·')[0]?.trim();
  return head || fullLabel;
}

export const ExerciseDemoPlayer: React.FC<ExerciseDemoPlayerProps> = ({
  exercise,
  compact = false,
}) => {
  const uid = useId().replace(/:/g, '');
  const spec = useMemo(() => getExerciseMotionSpec(exercise), [exercise]);
  const [isPlaying, setIsPlaying] = useState<boolean>(
    () => !prefersReducedMotion()
  );
  const [playbackRate, setPlaybackRate] = useState<0.5 | 1>(1);
  const [progress, setProgress] = useState<number>(() =>
    prefersReducedMotion() ? 0.5 : 0
  );
  const [selectedMuscle, setSelectedMuscle] = useState<BodyZone | 'all'>('all');

  const lastTimestampRef = useRef<number | null>(null);
  const scrubberRef = useRef<HTMLDivElement | null>(null);
  const draggingRef = useRef<boolean>(false);

  useEffect(() => {
    setProgress(prefersReducedMotion() ? 0.5 : 0);
    setIsPlaying(!prefersReducedMotion());
    setSelectedMuscle('all');
    lastTimestampRef.current = null;
  }, [exercise.id]);

  useEffect(() => {
    if (!isPlaying) {
      lastTimestampRef.current = null;
      return undefined;
    }

    let frameId = 0;
    const step = (timestamp: number): void => {
      if (lastTimestampRef.current !== null) {
        const dtSeconds = Math.min(0.1, (timestamp - lastTimestampRef.current) / 1000);
        const deltaProgress = (dtSeconds * playbackRate) / spec.cycleSeconds;
        setProgress((prev) => (prev + deltaProgress) % 1);
      }
      lastTimestampRef.current = timestamp;
      frameId = window.requestAnimationFrame(step);
    };

    frameId = window.requestAnimationFrame(step);
    return () => {
      window.cancelAnimationFrame(frameId);
      lastTimestampRef.current = null;
    };
  }, [isPlaying, playbackRate, spec.cycleSeconds]);

  const { pose, phaseIndex, contractionIntensity } = useMemo(
    () => interpolatePose(spec.keyFrames, progress),
    [spec.keyFrames, progress]
  );

  const geometry = useMemo(
    () => buildAthleticBodyGeometry(pose, spec.archetype, spec.highlightZones),
    [pose, spec.archetype, spec.highlightZones]
  );

  const heatmapByZone = useMemo(() => {
    const map = new Map<BodyZone, MuscleHeatmapState>();
    for (const zone of spec.highlightZones) {
      map.set(
        zone,
        computeMuscleHeatmapLevel(
          spec.highlightZones,
          zone,
          selectedMuscle,
          contractionIntensity,
          phaseIndex
        )
      );
    }
    return map;
  }, [spec.highlightZones, selectedMuscle, contractionIntensity, phaseIndex]);

  const activeFocusZone: BodyZone | undefined =
    selectedMuscle !== 'all' && heatmapByZone.has(selectedMuscle)
      ? selectedMuscle
      : spec.highlightZones[0];
  const activeFocusState = activeFocusZone ? heatmapByZone.get(activeFocusZone) : undefined;
  const activeLevelStyles = activeFocusState
    ? HEATMAP_LEVEL_CLASSES[activeFocusState.colors.levelLabel]
    : HEATMAP_LEVEL_CLASSES.Moderada;

  const [phaseName, phaseCue] = spec.phaseLabels[phaseIndex].split(' · ');
  const progressPercent = Math.round(progress * 100);

  const updateProgressFromClientX = (clientX: number): void => {
    const el = scrubberRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0) return;
    setProgress(clampCyclePosition((clientX - rect.left) / rect.width));
  };

  const handleScrubberPointerDown = (
    e: React.PointerEvent<HTMLDivElement>
  ): void => {
    if (!e.isPrimary || e.button !== 0) return;
    draggingRef.current = true;
    setIsPlaying(false);
    e.currentTarget.setPointerCapture(e.pointerId);
    updateProgressFromClientX(e.clientX);
  };

  const handleScrubberPointerMove = (
    e: React.PointerEvent<HTMLDivElement>
  ): void => {
    if (!draggingRef.current) return;
    updateProgressFromClientX(e.clientX);
  };

  const handleScrubberPointerEnd = (
    e: React.PointerEvent<HTMLDivElement>
  ): void => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  const handleScrubberKeyDown = (e: React.KeyboardEvent<HTMLDivElement>): void => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      e.preventDefault();
      setIsPlaying(false);
      setProgress((prev) => clampCyclePosition(prev + 0.05));
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      e.preventDefault();
      setIsPlaying(false);
      setProgress((prev) => clampCyclePosition(prev - 0.05));
    } else if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      setIsPlaying(false);
      setProgress(e.key === 'Home' ? 0 : LAST_CYCLE_POSITION);
    } else if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      setIsPlaying((prev) => !prev);
    }
  };

  const jumpToPhase = (index: 0 | 1 | 2): void => {
    setIsPlaying(false);
    setProgress(PHASE_CHECKPOINTS[index]);
  };

  const handleToggleMuscle = (zone: BodyZone): void => {
    if (spec.highlightZones.length <= 1) return;
    setSelectedMuscle((prev) => (prev === zone ? 'all' : zone));
  };

  const rearFill = `url(#body-rear-${uid})`;
  const rearStroke = geometry.isFrontal ? '#A9816C' : '#73564B';
  const surfaceFill = (surface: keyof typeof geometry.surfaceLighting) => `url(#surface-${surface}-${uid})`;
  const supportFoot = pose.foot2 && pose.foot2.y > pose.foot.y ? pose.foot2 : pose.foot;

  const renderMuscleOverlayLayer = (layers: Array<'torso' | 'leg' | 'arm'>) => (
    <g pointerEvents="none">
      {geometry.muscleOverlays
        .filter((muscle) => layers.includes(muscle.layer))
        .map((muscle, idx) => {
          const state = heatmapByZone.get(muscle.zone);
          if (!state) return null;
          const isExplicitSelection = selectedMuscle === muscle.zone;
          const fillOpacity = state.isDimmed
            ? 0.14
            : isExplicitSelection
            ? 0.68 + state.intensity * 0.30
            : 0.48 + state.intensity * 0.46;
          const striationOpacity = state.isDimmed
            ? 0.08
            : 0.25 + state.intensity * 0.55;
          const haloOpacity = state.isDimmed
            ? 0
            : Math.max(0, (state.intensity - 0.32) * (isExplicitSelection ? 0.72 : 0.48));

          return (
            <g key={`${muscle.zone}-${muscle.layer}-${idx}`}>
              {haloOpacity > 0.02 && (
                <path
                  d={muscle.d}
                  fill={state.colors.glow}
                  opacity={haloOpacity}
                  filter={`url(#heat-glow-${uid})`}
                />
              )}
              <path
                d={muscle.d}
                fill={`url(#heat-zone-${muscle.zone}-${uid})`}
                stroke={isExplicitSelection ? '#FAFAFA' : state.colors.stroke}
                strokeWidth={isExplicitSelection ? 1.1 : 0.7}
                opacity={fillOpacity}
              />
              {muscle.striationD && (
                <path
                  d={muscle.striationD}
                  fill="none"
                  stroke={state.colors.highlight}
                  strokeWidth="0.55"
                  strokeLinecap="round"
                  opacity={striationOpacity}
                />
              )}
            </g>
          );
        })}
    </g>
  );

  return (
    <div className="overflow-hidden rounded-xl border border-zinc-800 bg-[#09090B]">
      <div className="flex items-center justify-between gap-3 border-b border-zinc-800 bg-[#111113] px-3.5 py-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold leading-tight text-zinc-50">{phaseName}</p>
          {phaseCue && <p className="mt-0.5 text-xs leading-tight text-zinc-400">{phaseCue}</p>}
        </div>
        <span className="shrink-0 rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs font-medium tabular-nums text-zinc-200">{progressPercent}%</span>
      </div>

      <div className={`relative aspect-[272/162] w-full select-none bg-[#09090B] ${compact ? 'max-h-[185px]' : 'max-h-[328px]'}`}>
        <svg
          viewBox="24 0 272 162"
          role="img"
          aria-label={`Demonstração anatômica com mapa de calor muscular do exercício ${exercise.name}`}
          className="w-full h-full block"
        >
          <defs>
            <radialGradient id={`stage-spot-${uid}`} cx="50%" cy="48%" r="48%">
              <stop offset="0%" stopColor="#2A201B" stopOpacity="0.82" />
              <stop offset="100%" stopColor="#09090B" stopOpacity="0" />
            </radialGradient>
            <linearGradient id={`body-material-${uid}`}>
              <stop offset="0%" stopColor="#A97C69" />
              <stop offset="32%" stopColor="#F1D8BD" />
              <stop offset="58%" stopColor="#D3AA91" />
              <stop offset="100%" stopColor="#8D6256" />
            </linearGradient>
            {Object.entries(geometry.surfaceLighting).map(([surface, coords]) => (
              <linearGradient
                key={surface}
                id={`surface-${surface}-${uid}`}
                href={`#body-material-${uid}`}
                gradientUnits="userSpaceOnUse"
                {...coords}
              />
            ))}
            <radialGradient id={`body-head-${uid}`} cx="34%" cy="29%" r="73%">
              <stop offset="0%" stopColor="#F7E1C9" />
              <stop offset="59%" stopColor="#D5A991" />
              <stop offset="100%" stopColor="#956858" />
            </radialGradient>
            <linearGradient id={`body-rear-${uid}`} x2="100%" y2="70%">
              <stop offset="0%" stopColor={geometry.isFrontal ? '#C99881' : '#AE8270'} />
              <stop offset="50%" stopColor={geometry.isFrontal ? '#DDB8A0' : '#906B5E'} />
              <stop offset="100%" stopColor="#60433E" />
            </linearGradient>
            <linearGradient id={`equipment-${uid}`} x2="0%" y2="100%">
              <stop offset="0%" stopColor="#818B98" />
              <stop offset="36%" stopColor="#39414E" />
              <stop offset="100%" stopColor="#141821" />
            </linearGradient>
            <linearGradient id={`shorts-${uid}`} x2="90%" y2="30%">
              <stop offset="0%" stopColor="#293449" />
              <stop offset="45%" stopColor="#475978" />
              <stop offset="100%" stopColor="#233047" />
            </linearGradient>
            {spec.highlightZones.map((zone) => {
              const state = heatmapByZone.get(zone);
              const colors = state?.colors;
              if (!colors) return null;
              return (
                <radialGradient
                  key={zone}
                  id={`heat-zone-${zone}-${uid}`}
                  cx="46%"
                  cy="42%"
                  r="72%"
                >
                  <stop offset="0%" stopColor={colors.highlight} />
                  <stop offset="52%" stopColor={colors.mid} />
                  <stop offset="100%" stopColor={colors.edge} />
                </radialGradient>
              );
            })}
            <filter id={`heat-glow-${uid}`} x="-40%" y="-40%" width="180%" height="180%">
              <feGaussianBlur stdDeviation="2.6" />
            </filter>
            <radialGradient id={`floor-shadow-${uid}`}>
              <stop offset="0%" stopColor="#000" stopOpacity="0.9" />
              <stop offset="100%" stopColor="#000" stopOpacity="0" />
            </radialGradient>
            <pattern id={`stage-grid-${uid}`} width="16" height="16" patternUnits="userSpaceOnUse">
              <path d="M16 0H0V16" fill="none" stroke="#27272A" strokeWidth="0.45" />
            </pattern>
          </defs>

          {/* Subtle arena floor & studio spotlight */}
          <rect x="0" y="0" width="320" height="180" fill={`url(#stage-spot-${uid})`} />
          <rect x="0" y="0" width="320" height="152" opacity="0.45" fill={`url(#stage-grid-${uid})`} />
          <line x1="20" y1="152" x2="300" y2="152" stroke="#27272A" strokeWidth="1.5" />
          <line
            x1="48"
            y1="156"
            x2="272"
            y2="156"
            stroke="#18181B"
            strokeWidth="1"
            strokeDasharray="4 4"
          />
          <ellipse
            cx={supportFoot.x + 2}
            cy="154"
            rx="22"
            ry="3.6"
            fill={`url(#floor-shadow-${uid})`}
            opacity={Math.max(0.14, Math.min(1, (supportFoot.y - 120) / 27))}
          />

          {/* Equipment behind/supporting athlete */}
          {spec.equipmentProp === 'parallel_bars' && (
            <g stroke="#52525B" strokeWidth="3.5" strokeLinecap="round">
              <line x1="126" y1="92" x2="194" y2="92" stroke="#F97316" strokeWidth="4" />
              <line x1="130" y1="92" x2="130" y2="152" />
              <line x1="190" y1="92" x2="190" y2="152" />
            </g>
          )}

          {spec.equipmentProp === 'bench_step' && spec.archetype === 'bulgarian_squat' && (
            <g>
              <rect
                x="96"
                y="118"
                width="34"
                height="8"
                rx="2.5"
                fill="#18181B"
                stroke="#52525B"
                strokeWidth="1.5"
              />
              <line x1="104" y1="126" x2="104" y2="152" stroke="#3F3F46" strokeWidth="3" />
              <line x1="122" y1="126" x2="122" y2="152" stroke="#3F3F46" strokeWidth="3" />
            </g>
          )}

          {spec.equipmentProp === 'bench_step' && spec.archetype === 'calf_raise' && (
            <rect
              x="146"
              y="144"
              width="34"
              height="8"
              rx="2"
              fill="#18181B"
              stroke="#F97316"
              strokeWidth="1.5"
            />
          )}

          {/* Rear limbs (depth silhouette) */}
          {geometry.backThighPath && geometry.backShinPath && geometry.backFootPath && (
            <g fill={rearFill} stroke={rearStroke} strokeWidth="0.8">
              <path d={geometry.backThighPath} />
              <path d={geometry.backShinPath} />
              <path d={geometry.backFootPath} />
              {geometry.backShoeSolePath && (
                <path d={geometry.backShoeSolePath} fill="none" stroke="#94A3B8" strokeWidth="0.9" strokeLinecap="round" opacity="0.7" />
              )}
              {geometry.backShortsPath && <path d={geometry.backShortsPath} fill="#293143" stroke="#3C465B" />}
            </g>
          )}

          {geometry.backUpperArmPath && geometry.backForearmPath && (
            <g fill={rearFill} stroke={rearStroke} strokeWidth="0.8">
              <path d={geometry.backUpperArmPath} />
              <path d={geometry.backForearmPath} />
              {geometry.backHandPath && <path d={geometry.backHandPath} />}
            </g>
          )}

          {/* Torso & Neck */}
          <path
            d={geometry.neckPath}
            fill={surfaceFill('torso')}
            stroke="#3F3F46"
            strokeWidth="0.6"
          />
          <path
            d={geometry.torsoPath}
            fill={surfaceFill('torso')}
            stroke="#52525B"
            strokeWidth="0.8"
          />
          <path
            d={geometry.torsoContourPath}
            fill="none"
            stroke="#80594D"
            strokeWidth="0.75"
            strokeLinecap="round"
            opacity="0.4"
          />

          {/* Sculpted Head */}
          <path
            d={geometry.headPath}
            fill={`url(#body-head-${uid})`}
            stroke="#52525B"
            strokeWidth="0.8"
          />
          <path d={geometry.hairPath} fill="#302820" />
          <path
            d={geometry.facePath}
            fill="none"
            stroke="#614238"
            strokeWidth="0.85"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d={geometry.headHighlightPath}
            fill="none"
            stroke="#FFFFFF"
            strokeWidth="1"
            strokeLinecap="round"
            opacity="0.27"
          />

          {/* Foreground Leg & Athletic Shoe */}
          <g stroke="#525D6B" strokeWidth="0.65" strokeLinejoin="round">
            <path d={geometry.frontThighPath} fill={surfaceFill('thigh')} />
            <path d={geometry.frontShinPath} fill={surfaceFill('shin')} />
          </g>
          <path d={geometry.frontShortsPath} fill={`url(#shorts-${uid})`} stroke="#65748D" strokeWidth="0.55" />
          <path
            d={geometry.shortsWaistbandPath}
            fill="none"
            stroke="#94A3B8"
            strokeWidth="1"
            strokeLinecap="round"
            opacity="0.48"
          />
          <path
            d={geometry.frontFootPath}
            fill={`url(#equipment-${uid})`}
            stroke="#BCC7D8"
            strokeWidth="0.9"
          />
          <path
            d={geometry.frontShoeSolePath}
            fill="none"
            stroke="#E2E8F0"
            strokeWidth="1.05"
            strokeLinecap="round"
            opacity="0.8"
          />

          {/* Anatomical Contour Seams */}
          <g fill="none" stroke="#785245" strokeWidth="0.65" strokeLinecap="round" opacity="0.32" pointerEvents="none">
            {geometry.anatomicalDetailPaths.map((d, index) => (
              <path key={index} d={d} />
            ))}
          </g>

          {/* Torso & Leg Heatmap Layer */}
          {renderMuscleOverlayLayer(['torso', 'leg'])}

          {/* Foreground Arm */}
          <g stroke="#525D6B" strokeWidth="0.65" strokeLinejoin="round">
            <path d={geometry.frontUpperArmPath} fill={surfaceFill('upperArm')} />
            <path d={geometry.frontForearmPath} fill={surfaceFill('forearm')} />
            <path d={geometry.frontHandPath} fill={`url(#body-head-${uid})`} />
          </g>

          {/* Upper-limb Heatmap Layer (Shoulders / Biceps / Triceps) */}
          {renderMuscleOverlayLayer(['arm'])}

          {/* Foreground Weight / Barbell / Goblet Props */}
          {pose.barCenter &&
            (spec.equipmentProp === 'barbell_floor' ||
              spec.equipmentProp === 'barbell_rack') && (
              <g>
                <line
                  x1={pose.barCenter.x - 16}
                  y1={pose.barCenter.y}
                  x2={pose.barCenter.x + 16}
                  y2={pose.barCenter.y}
                  stroke="#A1A1AA"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                />
                <circle
                  cx={pose.barCenter.x}
                  cy={pose.barCenter.y}
                  r="8.5"
                  fill={`url(#equipment-${uid})`}
                  stroke="#F97316"
                  strokeWidth="2"
                />
                <circle cx={pose.barCenter.x} cy={pose.barCenter.y} r="2.2" fill="#FAFAFA" />
              </g>
            )}

          {pose.barCenter && spec.equipmentProp === 'goblet_weight' && (
            <g>
              <rect
                x={pose.barCenter.x - 3}
                y={pose.barCenter.y - 7}
                width="6"
                height="14"
                rx="1.5"
                fill={`url(#body-head-${uid})`}
              />
              <rect
                x={pose.barCenter.x - 6.5}
                y={pose.barCenter.y - 10}
                width="13"
                height="4.5"
                rx="1.5"
                fill={`url(#equipment-${uid})`}
                stroke="#F97316"
                strokeWidth="1.6"
              />
              <rect
                x={pose.barCenter.x - 5.5}
                y={pose.barCenter.y + 5.5}
                width="11"
                height="4"
                rx="1.5"
                fill={`url(#equipment-${uid})`}
                stroke="#F97316"
                strokeWidth="1.6"
              />
            </g>
          )}

          {pose.barCenter &&
            (spec.equipmentProp === 'short_bar' ||
              (spec.equipmentProp === 'bench_step' && spec.archetype !== 'hip_thrust')) && (
              <g>
                <rect
                  x={pose.barCenter.x - 5.5}
                  y={pose.barCenter.y - 5.5}
                  width="11"
                  height="11"
                  rx="2.5"
                  fill="#18181B"
                  stroke="#F97316"
                  strokeWidth="1.8"
                />
              </g>
            )}

          {pose.barCenter && spec.equipmentProp === 'hip_plate' && (
            <ellipse
              cx={pose.barCenter.x}
              cy={pose.barCenter.y}
              rx="10"
              ry="5"
              fill="#18181B"
              stroke="#F97316"
              strokeWidth="2"
            />
          )}
        </svg>
        <button
          type="button"
          aria-label={isPlaying ? 'Pausar animação na área da demonstração' : 'Reproduzir animação na área da demonstração'}
          onClick={() => setIsPlaying((prev) => !prev)}
          className="absolute inset-0 cursor-pointer focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-orange-400"
        />
      </div>

      {/* Interactive Muscular Heatmap Controls & Thermal Scale */}
      {spec.highlightZones.length > 0 && activeFocusState && (
        <div className="space-y-2 border-t border-zinc-800 bg-[#111113] px-3.5 py-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <p className="min-w-0 text-zinc-300">
              {selectedMuscle === 'all' ? (
                <>
                  <span className="font-medium text-zinc-200">Mapa de calor</span>
                  <span aria-hidden="true"> · </span>
                  <span>{BODY_ZONE_LABELS[activeFocusState.zone]}</span>
                  <span aria-hidden="true"> · </span>
                  <span className={`font-semibold font-mono-tabular tabular-nums ${activeLevelStyles.text}`}>
                    {activeFocusState.colors.levelLabel} ({activeFocusState.percent}%)
                  </span>
                </>
              ) : (
                <>
                  <span className="font-semibold text-white">
                    {BODY_ZONE_LABELS[activeFocusState.zone]}
                  </span>
                  <span aria-hidden="true"> · </span>
                  <span className="text-zinc-400">{activeFocusState.role}</span>
                  <span aria-hidden="true"> · </span>
                  <span className={`font-semibold font-mono-tabular tabular-nums ${activeLevelStyles.text}`}>
                    {activeFocusState.colors.levelLabel} ({activeFocusState.percent}%)
                  </span>
                </>
              )}
            </p>

            <div className="flex items-center gap-1.5 shrink-0 text-[11px] text-zinc-400" aria-label="Escala térmica de intensidade muscular: baixa até máxima">
              <span>Baixa</span>
              <span
                aria-hidden="true"
                className="h-1.5 w-16 rounded-full bg-gradient-to-r from-sky-400 via-amber-400 to-red-500"
              />
              <span>Máxima</span>
            </div>
          </div>

          <div
            className="flex flex-wrap items-center gap-1.5"
            role="group"
            aria-label="Selecionar músculo no mapa de calor"
          >
            {spec.highlightZones.length > 1 && (
              <button
                type="button"
                aria-pressed={selectedMuscle === 'all'}
                onClick={() => setSelectedMuscle('all')}
                className={`min-h-[44px] px-3 py-1.5 rounded-md border text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-orange-400 ${
                  selectedMuscle === 'all'
                    ? 'bg-zinc-800 border-zinc-500 text-white'
                    : 'bg-[#09090B] border-[#27272A] text-zinc-400 hover:text-zinc-200'
                }`}
              >
                Todos
              </button>
            )}

            {spec.highlightZones.map((zone) => {
              const state = heatmapByZone.get(zone);
              if (!state) return null;
              const isSelected =
                spec.highlightZones.length === 1 || selectedMuscle === zone;
              const levelStyle = HEATMAP_LEVEL_CLASSES[state.colors.levelLabel];

              return (
                <button
                  key={zone}
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => handleToggleMuscle(zone)}
                  className={`min-h-[44px] px-3 py-1.5 rounded-md border text-xs font-semibold flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-orange-400 ${
                    isSelected
                      ? 'bg-zinc-800/90 border-zinc-400 text-white'
                      : 'bg-[#09090B] border-[#27272A] text-zinc-300 hover:border-zinc-600 hover:text-white'
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className={`h-3 w-1.5 rounded-xs shrink-0 ${levelStyle.swatch}`}
                  />
                  <span>{BODY_ZONE_LABELS[zone]}</span>
                  <span className={`font-mono-tabular tabular-nums ${levelStyle.text}`}>
                    {state.percent}%
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="space-y-3 border-t border-zinc-800 bg-[#111113] px-3.5 pb-3">
        <div>
          <div
            ref={scrubberRef}
            role="slider"
            tabIndex={0}
            aria-label="Progresso do ciclo do movimento"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progressPercent}
            aria-valuetext={`${progressPercent}% · ${phaseName}`}
            onPointerDown={handleScrubberPointerDown}
            onPointerMove={handleScrubberPointerMove}
            onPointerUp={handleScrubberPointerEnd}
            onPointerCancel={handleScrubberPointerEnd}
            onLostPointerCapture={() => { draggingRef.current = false; }}
            onKeyDown={handleScrubberKeyDown}
            className="relative min-h-11 flex items-center cursor-pointer touch-none focus-visible:outline-2 focus-visible:outline-orange-400 rounded"
          >
            <div className="relative h-2 w-full overflow-hidden rounded-full bg-zinc-800">
              <div
                className="h-full origin-left rounded-full bg-gradient-to-r from-orange-600 to-orange-400"
                style={{ transform: `scaleX(${progress})` }}
              />
              {CYCLE_PHASE_BOUNDARIES.map((boundary) => (
                <span
                  key={boundary}
                  aria-hidden="true"
                  className="absolute inset-y-0 w-0.5 bg-[#09090B]"
                  style={{ left: `${boundary * 100}%` }}
                />
              ))}
            </div>
            <span
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-orange-500 bg-white"
              style={{ left: `${progress * 100}%` }}
            />
          </div>

          {/* Phase jump tabs */}
          <div className="grid grid-cols-3 gap-1.5" role="group" aria-label="Fases do ciclo">
            {([0, 1, 2] as const).map((idx) => {
              const active = phaseIndex === idx;
              return (
                <button
                  key={idx}
                  type="button"
                  aria-pressed={active}
                  onClick={() => jumpToPhase(idx)}
                  className={`min-h-11 min-w-0 rounded-lg border px-1.5 py-1.5 text-xs font-semibold leading-tight transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-orange-400 ${
                    active
                      ? 'bg-orange-500/12 border-orange-500/45 text-orange-300'
                      : 'bg-[#09090B] border-[#27272A] text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  <span aria-hidden="true" className="mr-1 text-[10px] tabular-nums opacity-80">
                    0{idx + 1}
                  </span>
                  <span>{getShortPhaseName(spec.phaseLabels[idx])}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Playback Controls Bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-zinc-800 pt-3">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setIsPlaying((prev) => !prev)}
              aria-label={isPlaying ? 'Pausar demonstração' : 'Reproduzir demonstração'}
              className="min-h-[44px] px-3.5 rounded-md bg-[#F97316] hover:bg-orange-400 text-zinc-950 font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {isPlaying ? (
                <>
                  <Pause size={16} strokeWidth={2} weight="fill" />
                  Pausar
                </>
              ) : (
                <>
                  <Play size={16} strokeWidth={2} weight="fill" />
                  Reproduzir
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => {
                setProgress(0);
                setIsPlaying(true);
              }}
              aria-label="Reiniciar loop"
              title="Reiniciar ciclo"
              className="min-h-[44px] min-w-[44px] rounded-md bg-[#18181B] hover:bg-zinc-800 border border-[#27272A] text-zinc-300 hover:text-white flex items-center justify-center transition-colors shrink-0 cursor-pointer"
            >
              <ArrowCounterClockwise size={18} strokeWidth={1.75} weight="regular" />
            </button>
          </div>

          <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              onClick={() => setPlaybackRate((prev) => (prev === 1 ? 0.5 : 1))}
              aria-label="Alternar velocidade da demonstração"
              className={`min-h-[44px] px-3 rounded-md border text-xs font-semibold font-mono-tabular tabular-nums flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                playbackRate === 0.5
                  ? 'bg-orange-500/12 border-orange-500/45 text-orange-300'
                  : 'bg-[#18181B] border-[#27272A] text-zinc-300 hover:text-white'
              }`}
            >
              <Gauge size={16} strokeWidth={1.75} weight="regular" />
              {playbackRate === 0.5 ? '0,5x' : '1x'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
