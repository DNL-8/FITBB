import type { BodyZone, JointPoint, MotionArchetype, PoseFrame } from './exerciseMotion.ts';

export const BODY_ZONE_LABELS: Record<BodyZone, string> = {
  chest: 'Peitoral',
  back: 'Dorsais',
  shoulders: 'Ombros',
  arms: 'Braços',
  core: 'Core',
  quads: 'Quadríceps',
  glutes: 'Glúteos',
  hamstrings: 'Posteriores',
  calves: 'Panturrilhas',
};

export type HeatmapIntensityLevel = 'Baixa' | 'Moderada' | 'Alta' | 'Máxima';
export type MuscleRole = 'Motor primário' | 'Sinergista' | 'Estabilizador';

export interface HeatmapColorStops {
  highlight: string;
  mid: string;
  edge: string;
  stroke: string;
  glow: string;
  text: string;
  levelLabel: HeatmapIntensityLevel;
  percent: number;
}

export interface MuscleHeatmapState {
  zone: BodyZone;
  intensity: number;
  percent: number;
  role: MuscleRole;
  isFocused: boolean;
  isDimmed: boolean;
  colors: HeatmapColorStops;
}

export interface MuscleOverlayShape {
  zone: BodyZone;
  d: string;
  striationD: string;
  layer: 'torso' | 'leg' | 'arm';
}

type Surface = 'torso' | 'thigh' | 'shin' | 'upperArm' | 'forearm';

interface SurfaceLighting {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface AthleticBodyGeometry {
  torsoPath: string;
  torsoContourPath: string;
  anatomicalDetailPaths: string[];
  neckPath: string;
  headPath: string;
  headHighlightPath: string;
  hairPath: string;
  facePath: string;
  frontThighPath: string;
  frontShortsPath: string;
  shortsWaistbandPath: string;
  frontShinPath: string;
  frontFootPath: string;
  frontShoeSolePath: string;
  frontUpperArmPath: string;
  frontForearmPath: string;
  frontHandPath: string;
  backThighPath: string | null;
  backShortsPath: string | null;
  backShinPath: string | null;
  backFootPath: string | null;
  backShoeSolePath: string | null;
  backUpperArmPath: string | null;
  backForearmPath: string | null;
  backHandPath: string | null;
  muscleOverlays: MuscleOverlayShape[];
  surfaceLighting: Record<Surface, SurfaceLighting>;
  isFrontal: boolean;
}

interface ThermalAnchor {
  t: number;
  highlight: string;
  mid: string;
  edge: string;
  stroke: string;
  glow: string;
  text: string;
}

const THERMAL_ANCHORS: ThermalAnchor[] = [
  {
    t: 0.0,
    highlight: '#93C5FD',
    mid: '#38BDF8',
    edge: '#0369A1',
    stroke: '#7DD3FC',
    glow: '#0EA5E9',
    text: '#7DD3FC',
  },
  {
    t: 0.38,
    highlight: '#FEF08A',
    mid: '#FACC15',
    edge: '#CA8A04',
    stroke: '#FDE047',
    glow: '#EAB308',
    text: '#FDE047',
  },
  {
    t: 0.68,
    highlight: '#FDBA74',
    mid: '#F97316',
    edge: '#C2410C',
    stroke: '#FB923C',
    glow: '#F97316',
    text: '#FB923C',
  },
  {
    t: 1.0,
    highlight: '#FEF08A',
    mid: '#EF4444',
    edge: '#991B1B',
    stroke: '#FCA5A5',
    glow: '#EF4444',
    text: '#FCA5A5',
  },
];

function parseHex(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const r = Number.parseInt(clean.slice(0, 2), 16);
  const g = Number.parseInt(clean.slice(2, 4), 16);
  const b = Number.parseInt(clean.slice(4, 6), 16);
  return [r, g, b];
}

function toHex(n: number): string {
  return Math.max(0, Math.min(255, Math.round(n)))
    .toString(16)
    .padStart(2, '0')
    .toUpperCase();
}

function lerpHex(hexA: string, hexB: string, t: number): string {
  const [r1, g1, b1] = parseHex(hexA);
  const [r2, g2, b2] = parseHex(hexB);
  return `#${toHex(r1 + (r2 - r1) * t)}${toHex(g1 + (g2 - g1) * t)}${toHex(b1 + (b2 - b1) * t)}`;
}

export function getHeatmapColorStops(intensity: number): HeatmapColorStops {
  const t = Number.isFinite(intensity) ? Math.max(0, Math.min(1, intensity)) : 0;

  let lower = THERMAL_ANCHORS[0];
  let upper = THERMAL_ANCHORS[THERMAL_ANCHORS.length - 1];
  for (let i = 0; i < THERMAL_ANCHORS.length - 1; i++) {
    if (t >= THERMAL_ANCHORS[i].t && t <= THERMAL_ANCHORS[i + 1].t) {
      lower = THERMAL_ANCHORS[i];
      upper = THERMAL_ANCHORS[i + 1];
      break;
    }
  }

  const span = upper.t - lower.t;
  const localT = span > 0 ? (t - lower.t) / span : 0;

  const levelLabel: HeatmapIntensityLevel =
    t < 0.35
      ? 'Baixa'
      : t < 0.62
      ? 'Moderada'
      : t < 0.84
      ? 'Alta'
      : 'Máxima';

  return {
    highlight: lerpHex(lower.highlight, upper.highlight, localT),
    mid: lerpHex(lower.mid, upper.mid, localT),
    edge: lerpHex(lower.edge, upper.edge, localT),
    stroke: lerpHex(lower.stroke, upper.stroke, localT),
    glow: lerpHex(lower.glow, upper.glow, localT),
    text: lerpHex(lower.text, upper.text, localT),
    levelLabel,
    percent: Math.round(t * 100),
  };
}

export function computeMuscleHeatmapLevel(
  highlightZones: BodyZone[],
  zone: BodyZone,
  selectedZone: BodyZone | 'all',
  contractionIntensity: number,
  phaseIndex: 0 | 1 | 2
): MuscleHeatmapState {
  const idx = highlightZones.indexOf(zone);
  const role: MuscleRole =
    idx <= 0 ? 'Motor primário' : idx === 1 ? 'Sinergista' : 'Estabilizador';

  const normalizedContraction = Number.isFinite(contractionIntensity)
    ? Math.max(0, Math.min(1, (contractionIntensity - 0.35) / 0.65))
    : 0.5;

  let rawIntensity: number;
  if (idx <= 0) {
    rawIntensity =
      0.24 +
      normalizedContraction * 0.74 +
      (phaseIndex === 2 ? 0.04 * (1 - normalizedContraction) : 0);
  } else if (idx === 1) {
    rawIntensity =
      0.2 +
      normalizedContraction * 0.58 +
      (phaseIndex === 1 ? 0.04 : 0);
  } else {
    rawIntensity =
      0.26 +
      normalizedContraction * 0.34 +
      (phaseIndex === 0 ? 0.04 * normalizedContraction : 0);
  }

  const intensity = Math.max(0.15, Math.min(1, rawIntensity));
  const isFocused = selectedZone === 'all' || selectedZone === zone;
  const isDimmed = selectedZone !== 'all' && selectedZone !== zone;

  return {
    zone,
    intensity,
    percent: Math.round(intensity * 100),
    role,
    isFocused,
    isDimmed,
    colors: getHeatmapColorStops(intensity),
  };
}

function fmt(n: number): string {
  return Number.isFinite(n) ? n.toFixed(1) : '0';
}

function pt(p: JointPoint): string {
  return `${fmt(p.x)} ${fmt(p.y)}`;
}

function sub(a: JointPoint, b: JointPoint): JointPoint {
  return { x: a.x - b.x, y: a.y - b.y };
}

function add(a: JointPoint, b: JointPoint): JointPoint {
  return { x: a.x + b.x, y: a.y + b.y };
}

function scale(v: JointPoint, s: number): JointPoint {
  return { x: v.x * s, y: v.y * s };
}

function lerp(a: JointPoint, b: JointPoint, t: number): JointPoint {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

function length(v: JointPoint): number {
  return Math.hypot(v.x, v.y);
}

function unit(v: JointPoint, fallback: JointPoint = { x: 0, y: -1 }): JointPoint {
  const l = length(v);
  if (l < 0.001) return fallback;
  return { x: v.x / l, y: v.y / l };
}

function anteriorNormal(u: JointPoint): JointPoint {
  return { x: -u.y, y: u.x };
}

function lightAcrossSurface(start: JointPoint, end: JointPoint, radius: number): SurfaceLighting {
  const center = lerp(start, end, 0.45);
  const normal = anteriorNormal(unit(sub(end, start)));
  const side = scale(normal, radius);
  const light = sub(center, side);
  const shadow = add(center, side);
  return { x1: light.x, y1: light.y, x2: shadow.x, y2: shadow.y };
}

function buildTaperedLimbPath(
  start: JointPoint,
  end: JointPoint,
  rStart: number,
  rEnd: number,
  anteriorDir: JointPoint,
  anteriorBulge: number,
  posteriorBulge: number,
  bellyT = 0.42
): string {
  const dir = sub(end, start);
  const segLen = length(dir);
  if (segLen < 1.5) {
    const r = Math.max(rStart, rEnd);
    return `M ${fmt(start.x - r)} ${fmt(start.y)} a ${fmt(r)} ${fmt(r)} 0 1 0 ${fmt(r * 2)} 0 a ${fmt(r)} ${fmt(r)} 0 1 0 ${fmt(-r * 2)} 0 Z`;
  }

  const u = { x: dir.x / segLen, y: dir.y / segLen };
  const rawN = { x: -u.y, y: u.x };
  const dot = rawN.x * anteriorDir.x + rawN.y * anteriorDir.y;
  const n = dot >= 0 ? rawN : { x: -rawN.x, y: -rawN.y };

  const sA = add(start, scale(n, rStart));
  const sB = add(start, scale(n, -rStart));
  const sCap = add(start, scale(u, -rStart * 0.85));

  const eA = add(end, scale(n, rEnd));
  const eB = add(end, scale(n, -rEnd));
  const eCap = add(end, scale(u, rEnd * 0.85));

  const bellyPoint = lerp(start, end, bellyT);
  const baseRadius = rStart + (rEnd - rStart) * bellyT;
  const ctrlA = add(bellyPoint, scale(n, baseRadius + anteriorBulge));
  const ctrlB = add(bellyPoint, scale(n, -(baseRadius + posteriorBulge)));

  const sCtrlA = add(start, add(scale(n, rStart * 0.95), scale(u, -rStart * 0.55)));
  const sCtrlB = add(start, add(scale(n, -rStart * 0.95), scale(u, -rStart * 0.55)));
  const eCtrlA = add(end, add(scale(n, rEnd * 0.95), scale(u, rEnd * 0.55)));
  const eCtrlB = add(end, add(scale(n, -rEnd * 0.95), scale(u, rEnd * 0.55)));

  return [
    `M ${pt(sCap)}`,
    `Q ${pt(sCtrlA)} ${pt(sA)}`,
    `Q ${pt(ctrlA)} ${pt(eA)}`,
    `Q ${pt(eCtrlA)} ${pt(eCap)}`,
    `Q ${pt(eCtrlB)} ${pt(eB)}`,
    `Q ${pt(ctrlB)} ${pt(sB)}`,
    `Q ${pt(sCtrlB)} ${pt(sCap)}`,
    'Z',
  ].join(' ');
}

function buildLimbStriationPath(
  start: JointPoint,
  end: JointPoint,
  nDir: JointPoint,
  offset: number
): string {
  const dir = sub(end, start);
  const segLen = length(dir);
  if (segLen < 4) {
    return `M ${pt(start)} L ${pt(end)}`;
  }
  const u = { x: dir.x / segLen, y: dir.y / segLen };
  const rawN = { x: -u.y, y: u.x };
  const n = rawN.x * nDir.x + rawN.y * nDir.y >= 0 ? rawN : { x: -rawN.x, y: -rawN.y };
  const p1 = add(lerp(start, end, 0.2), scale(n, offset * 0.4));
  const ctrl = add(lerp(start, end, 0.5), scale(n, offset));
  const p2 = add(lerp(start, end, 0.8), scale(n, offset * 0.3));
  const p3 = add(lerp(start, end, 0.26), scale(n, -offset * 0.35));
  const ctrl2 = add(lerp(start, end, 0.52), scale(n, -offset * 0.1));
  const p4 = add(lerp(start, end, 0.76), scale(n, -offset * 0.25));
  return `M ${pt(p1)} Q ${pt(ctrl)} ${pt(p2)} M ${pt(p3)} Q ${pt(ctrl2)} ${pt(p4)}`;
}

function buildAthleticTorsoPath(
  shoulder: JointPoint,
  hip: JointPoint,
  nAnterior: JointPoint,
  isFrontal: boolean
): string {
  const spine = sub(shoulder, hip);
  const u = unit(spine, { x: 0, y: -1 });
  const n = isFrontal ? { x: 1, y: 0 } : nAnterior;

  if (isFrontal) {
    const shR = add(shoulder, scale(n, 11.2));
    const shL = add(shoulder, scale(n, -11.2));
    const chestR = add(lerp(hip, shoulder, 0.72), scale(n, 10.0));
    const chestL = add(lerp(hip, shoulder, 0.72), scale(n, -10.0));
    const waistR = add(lerp(hip, shoulder, 0.34), scale(n, 6.7));
    const waistL = add(lerp(hip, shoulder, 0.34), scale(n, -6.7));
    const hipR = add(hip, scale(n, 8.2));
    const hipL = add(hip, scale(n, -8.2));
    const topMid = add(shoulder, scale(u, 4.4));
    const pelvisMid = add(hip, scale(u, -5.5));

    return [
      `M ${pt(topMid)}`,
      `Q ${pt(add(shR, scale(u, 3.6)))} ${pt(shR)}`,
      `C ${pt(chestR)} ${pt(waistR)} ${pt(hipR)}`,
      `Q ${pt(add(hipR, scale(u, -4.5)))} ${pt(pelvisMid)}`,
      `Q ${pt(add(hipL, scale(u, -4.5)))} ${pt(hipL)}`,
      `C ${pt(waistL)} ${pt(chestL)} ${pt(shL)}`,
      `Q ${pt(add(shL, scale(u, 3.6)))} ${pt(topMid)}`,
      'Z',
    ].join(' ');
  }

  const shoulderCap = add(shoulder, scale(u, 4.6));
  const upperChest = add(lerp(hip, shoulder, 0.84), scale(n, 7.4));
  const pecApex = add(lerp(hip, shoulder, 0.68), scale(n, 8.8));
  const midAbs = add(lerp(hip, shoulder, 0.36), scale(n, 5.3));
  const frontHip = add(hip, scale(n, 6.1));
  const pelvisBottom = add(hip, add(scale(u, -5.8), scale(n, -0.5)));
  const gluteCurve = add(lerp(hip, shoulder, 0.08), scale(n, -8.1));
  const lumbarCurve = add(lerp(hip, shoulder, 0.38), scale(n, -4.9));
  const latFlare = add(lerp(hip, shoulder, 0.72), scale(n, -7.7));
  const upperBack = add(lerp(hip, shoulder, 0.92), scale(n, -5.7));

  return [
    `M ${pt(shoulderCap)}`,
    `Q ${pt(add(upperChest, scale(u, 2.5)))} ${pt(pecApex)}`,
    `C ${pt(add(pecApex, scale(u, -5)))} ${pt(midAbs)} ${pt(frontHip)}`,
    `Q ${pt(add(frontHip, scale(u, -4.8)))} ${pt(pelvisBottom)}`,
    `Q ${pt(add(gluteCurve, scale(u, -4.2)))} ${pt(gluteCurve)}`,
    `C ${pt(lumbarCurve)} ${pt(latFlare)} ${pt(upperBack)}`,
    `Q ${pt(add(shoulderCap, scale(n, -2.5)))} ${pt(shoulderCap)}`,
    'Z',
  ].join(' ');
}

function buildAnatomicalDetailPaths(
  pose: PoseFrame,
  nAnterior: JointPoint,
  isFrontal: boolean
): string[] {
  const spine = sub(pose.shoulder, pose.hip);
  const uSpine = unit(spine, { x: 0, y: -1 });
  const n = isFrontal ? { x: 1, y: 0 } : nAnterior;
  const details: string[] = [];

  if (isFrontal) {
    // Clavicle, pectoral fold, linea alba & abdominal ribs
    const clavL = add(lerp(pose.hip, pose.shoulder, 0.92), scale(n, -7.2));
    const clavM = add(lerp(pose.hip, pose.shoulder, 0.89), scale(n, 0));
    const clavR = add(lerp(pose.hip, pose.shoulder, 0.92), scale(n, 7.2));
    details.push(`M ${pt(clavL)} Q ${pt(clavM)} ${pt(clavR)}`);

    const pecL = add(lerp(pose.hip, pose.shoulder, 0.65), scale(n, -7.4));
    const pecC = add(lerp(pose.hip, pose.shoulder, 0.63), scale(n, 0));
    const pecR = add(lerp(pose.hip, pose.shoulder, 0.65), scale(n, 7.4));
    details.push(`M ${pt(pecL)} Q ${pt(add(pecC, scale(uSpine, -1.6)))} ${pt(pecC)} Q ${pt(add(pecC, scale(uSpine, -1.6)))} ${pt(pecR)}`);

    const absTop = lerp(pose.hip, pose.shoulder, 0.56);
    const absBot = lerp(pose.hip, pose.shoulder, 0.18);
    details.push(`M ${pt(absTop)} L ${pt(absBot)}`);
  } else {
    // Clavicle/pec contour, serratus rib line, lumbar crease & patella/calf contour
    const pecStart = add(lerp(pose.hip, pose.shoulder, 0.82), scale(n, 1.4));
    const pecCtrl = add(lerp(pose.hip, pose.shoulder, 0.66), scale(n, 5.2));
    const pecEnd = add(lerp(pose.hip, pose.shoulder, 0.60), scale(n, 7.2));
    details.push(`M ${pt(pecStart)} Q ${pt(pecCtrl)} ${pt(pecEnd)}`);

    const ribA = add(lerp(pose.hip, pose.shoulder, 0.50), scale(n, 2.8));
    const ribB = add(lerp(pose.hip, pose.shoulder, 0.25), scale(n, 3.6));
    details.push(`M ${pt(ribA)} Q ${pt(lerp(ribA, ribB, 0.5))} ${pt(ribB)}`);

    const spineA = add(lerp(pose.hip, pose.shoulder, 0.78), scale(n, -4.4));
    const spineB = add(lerp(pose.hip, pose.shoulder, 0.22), scale(n, -3.5));
    details.push(`M ${pt(spineA)} Q ${pt(add(lerp(spineA, spineB, 0.5), scale(n, 1.5)))} ${pt(spineB)}`);

    // Knee patella subtle arc
    const legDir = unit(sub(pose.foot, pose.knee), { x: 0, y: 1 });
    const patellaTop = add(pose.knee, add(scale(legDir, -3.2), scale(n, 3.1)));
    const patellaMid = add(pose.knee, scale(n, 4.3));
    const patellaBot = add(pose.knee, add(scale(legDir, 3.2), scale(n, 3.0)));
    details.push(`M ${pt(patellaTop)} Q ${pt(patellaMid)} ${pt(patellaBot)}`);
  }

  return details;
}

function buildHeadAndNeck(
  head: JointPoint,
  shoulder: JointPoint,
  nAnterior: JointPoint,
  isFrontal: boolean
): Pick<AthleticBodyGeometry, 'neckPath' | 'headPath' | 'headHighlightPath' | 'hairPath' | 'facePath'> {
  const neckDir = unit(sub(head, shoulder), { x: 0, y: -1 });
  const neckStart = add(shoulder, scale(neckDir, 1.5));
  const neckEnd = add(head, scale(neckDir, -5.5));
  const neckPath = buildTaperedLimbPath(
    neckStart,
    neckEnd,
    4.3,
    3.5,
    nAnterior,
    0.4,
    0.6,
    0.45
  );

  if (isFrontal) {
    const point = (x: number, y: number) => pt(add(head, { x, y }));
    const headPath = [
      `M ${point(0, -9)}`,
      `C ${point(6.5, -9)} ${point(8.2, -5.5)} ${point(7.3, 0)}`,
      `Q ${point(8.5, -0.7)} ${point(7.2, 3.1)} Q ${point(6.4, 3.9)} ${point(5.8, 3.2)}`,
      `Q ${point(4.4, 8.3)} ${point(0, 8.7)} Q ${point(-4.4, 8.3)} ${point(-5.8, 3.2)}`,
      `Q ${point(-6.4, 3.9)} ${point(-7.2, 3.1)} Q ${point(-8.5, -0.7)} ${point(-7.3, 0)}`,
      `C ${point(-8.2, -5.5)} ${point(-6.5, -9)} ${point(0, -9)}`,
      'Z',
    ].join(' ');
    const hairPath = `M ${point(-7.3, 0)} C ${point(-9.1, -7.4)} ${point(-5.7, -10)} ${point(0, -9.8)} C ${point(6.9, -10)} ${point(9, -6.3)} ${point(7.3, 0)} Q ${point(6.1, -4.2)} ${point(4.1, -5.3)} Q ${point(0, -3.1)} ${point(-4.5, -5.2)} Q ${point(-6.8, -4.4)} ${point(-7.3, 0)} Z`;
    const facePath = `M ${point(-4.7, -0.8)} Q ${point(-3.3, -1.7)} ${point(-1.8, -0.8)} M ${point(1.8, -0.8)} Q ${point(3.3, -1.7)} ${point(4.7, -0.8)} M ${point(0.2, 0.2)} L ${point(-0.7, 2.9)} L ${point(0.9, 2.9)} M ${point(-2, 5)} Q ${point(0, 5.5)} ${point(2, 5)}`;
    const headHighlightPath = `M ${point(-5.2, -6.9)} Q ${point(-1.4, -9.4)} ${point(3.4, -7.8)}`;
    return { neckPath, headPath, headHighlightPath, hairPath, facePath };
  }

  const across = anteriorNormal(neckDir);
  const fwd = across.x * nAnterior.x + across.y * nAnterior.y >= 0 ? across : scale(across, -1);
  const point = (forward: number, up: number) => pt(add(head, add(scale(fwd, forward), scale(neckDir, up))));
  const headPath = [
    `M ${point(-0.5, 9)}`,
    `C ${point(4.8, 9.2)} ${point(7.6, 5.6)} ${point(7, 2.6)}`,
    `Q ${point(6.6, 1.1)} ${point(9.2, -0.7)} Q ${point(9.4, -1.9)} ${point(7, -2)}`,
    `Q ${point(6.6, -2.5)} ${point(7.3, -3.8)} Q ${point(6.7, -4.6)} ${point(7, -5.7)}`,
    `Q ${point(6.9, -8.6)} ${point(2.4, -8.3)} Q ${point(-2.6, -7.6)} ${point(-5.4, -4.1)}`,
    `C ${point(-10, -0.4)} ${point(-8.4, 9)} ${point(-0.5, 9)}`,
    'Z',
  ].join(' ');

  const hairPath = `M ${point(-6.2, -3)} C ${point(-11, 1.2)} ${point(-7.9, 10.2)} ${point(-0.5, 9.9)} Q ${point(6.7, 10.2)} ${point(7.4, 4.2)} Q ${point(3.4, 6.2)} ${point(0.7, 3.3)} L ${point(-0.7, 0.3)} Q ${point(-3, 2)} ${point(-4.1, -0.3)} L ${point(-4.9, -3.9)} Z`;
  const facePath = `M ${point(3.7, 1.6)} Q ${point(4.8, 2.2)} ${point(6.2, 1.5)} M ${point(4.9, -4.4)} L ${point(6.9, -4.1)} M ${point(-3.4, -0.4)} Q ${point(-1.7, 1.4)} ${point(-1, -0.1)} Q ${point(-0.7, -2.8)} ${point(-2.3, -3.1)}`;
  const headHighlightPath = `M ${point(-6.2, 5.4)} Q ${point(-1.6, 9.8)} ${point(3.9, 7.9)}`;

  return { neckPath, headPath, headHighlightPath, hairPath, facePath };
}

function buildHandPath(hand: JointPoint, elbow: JointPoint, forward: JointPoint, gripping: boolean): string {
  const arm = unit(sub(hand, elbow), forward);
  const direction = hand.y >= 143 && !gripping ? { x: forward.x < 0 ? -1 : 1, y: 0 } : arm;
  const across = anteriorNormal(direction);
  const point = (along: number, side: number) => pt(add(hand, add(scale(direction, along), scale(across, side))));
  const reach = gripping ? 2.8 : 4.6;
  return [
    `M ${point(-2.1, -1.6)}`,
    `Q ${point(-0.3, -2.5)} ${point(1, -2.7)}`,
    `Q ${point(2, -3.3)} ${point(2.6, -2.4)}`,
    `C ${point(reach, -1.8)} ${point(reach + 0.6, 1.7)} ${point(reach - 0.5, 2.3)}`,
    `Q ${point(1.9, 3)} ${point(-2.1, 1.5)} Z`,
  ].join(' ');
}

function buildShortsPath(hip: JointPoint, knee: JointPoint): string {
  const axis = unit(sub(knee, hip), { x: 0, y: 1 });
  const across = anteriorNormal(axis);
  const waist = add(hip, scale(axis, -4.8));
  const hem = lerp(hip, knee, 0.4);
  const side = (point: JointPoint, offset: number) => pt(add(point, scale(across, offset)));
  return [
    `M ${side(waist, -5.8)} Q ${side(hip, -8)} ${side(hem, -5.9)}`,
    `Q ${pt(add(hem, scale(axis, 1.8)))} ${side(hem, 5.9)}`,
    `Q ${side(hip, 8)} ${side(waist, 5.8)} Q ${pt(add(waist, scale(axis, -1.6)))} ${side(waist, -5.8)} Z`,
  ].join(' ');
}

function buildShortsWaistbandPath(hip: JointPoint, knee: JointPoint): string {
  const axis = unit(sub(knee, hip), { x: 0, y: 1 });
  const across = anteriorNormal(axis);
  const waist = add(hip, scale(axis, -4.2));
  return `M ${pt(add(waist, scale(across, -5.5)))} Q ${pt(add(waist, scale(axis, -1.1)))} ${pt(add(waist, scale(across, 5.5)))}`;
}

function buildFootAndSole(
  ankle: JointPoint,
  knee: JointPoint,
  nAnterior: JointPoint,
  isFrontal: boolean,
  sideSign = 1
): { shoePath: string; solePath: string } {
  if (isFrontal) {
    const dirX = sideSign >= 0 ? 1 : -1;
    const shoePath = [
      `M ${fmt(ankle.x - 3 * dirX)} ${fmt(ankle.y - 1)}`,
      `L ${fmt(ankle.x + 8.5 * dirX)} ${fmt(ankle.y + 1.5)}`,
      `Q ${fmt(ankle.x + 10 * dirX)} ${fmt(ankle.y + 4.5)} ${fmt(ankle.x + 6 * dirX)} ${fmt(ankle.y + 4.8)}`,
      `L ${fmt(ankle.x - 3.5 * dirX)} ${fmt(ankle.y + 4.2)}`,
      'Z',
    ].join(' ');
    const solePath = `M ${fmt(ankle.x - 3.3 * dirX)} ${fmt(ankle.y + 3.4)} L ${fmt(ankle.x + 8.6 * dirX)} ${fmt(ankle.y + 3.8)}`;
    return { shoePath, solePath };
  }

  const shinDir = unit(sub(ankle, knee), { x: 0, y: 1 });
  const nearFloor = ankle.y >= 140;
  const toeDir = nearFloor
    ? unit({ x: nAnterior.x >= 0 ? 1 : -1, y: 0.08 })
    : unit(add(scale(nAnterior, 0.85), scale(shinDir, 0.35)));
  const downDir = nearFloor
    ? { x: 0, y: 1 }
    : unit(add(scale(shinDir, 0.85), scale(nAnterior, -0.2)));

  const heelTop = add(ankle, scale(toeDir, -3.2));
  const heelBottom = add(heelTop, scale(downDir, 4.2));
  const toeBottom = add(ankle, add(scale(toeDir, 10.5), scale(downDir, 4.4)));
  const toeTip = add(ankle, add(scale(toeDir, 12.2), scale(downDir, 2.1)));
  const instep = add(ankle, add(scale(toeDir, 3.6), scale(downDir, -1.1)));

  const shoePath = [
    `M ${pt(heelTop)}`,
    `C ${pt(instep)} ${pt(add(toeTip, scale(downDir, -1.1)))} ${pt(toeTip)}`,
    `Q ${pt(add(toeTip, scale(downDir, 2.1)))} ${pt(toeBottom)} L ${pt(heelBottom)}`,
    `Q ${pt(add(heelBottom, scale(toeDir, -2)))} ${pt(heelTop)}`,
    'Z',
  ].join(' ');

  const soleHeel = add(heelBottom, scale(downDir, -0.7));
  const soleToe = add(toeBottom, scale(downDir, -0.6));
  const solePath = `M ${pt(soleHeel)} L ${pt(soleToe)}`;
  return { shoePath, solePath };
}

function buildMuscleOverlayPaths(
  pose: PoseFrame,
  nAnterior: JointPoint,
  zones: BodyZone[],
  isFrontal: boolean
): MuscleOverlayShape[] {
  const spine = sub(pose.shoulder, pose.hip);
  const uSpine = unit(spine, { x: 0, y: -1 });
  const n = isFrontal ? { x: 1, y: 0 } : nAnterior;
  const overlays: MuscleOverlayShape[] = [];

  const shoulderOrigin = isFrontal
    ? { x: pose.shoulder.x - 9.2, y: pose.shoulder.y + 1.5 }
    : pose.shoulder;
  const shoulderOrigin2 = isFrontal
    ? { x: pose.shoulder.x + 9.2, y: pose.shoulder.y + 1.5 }
    : pose.shoulder;
  const hipOrigin = isFrontal
    ? { x: pose.hip.x - 4.4, y: pose.hip.y + 2 }
    : pose.hip;
  const hipOrigin2 = isFrontal
    ? { x: pose.hip.x + 4.4, y: pose.hip.y + 2 }
    : pose.hip;

  for (const zone of zones) {
    if (zone === 'chest') {
      if (isFrontal) {
        const cTop = lerp(pose.hip, pose.shoulder, 0.86);
        const cBot = lerp(pose.hip, pose.shoulder, 0.60);
        const striationD = `M ${fmt(cTop.x - 7.5)} ${fmt(cTop.y + 2.2)} Q ${fmt(cTop.x - 3)} ${fmt(cBot.y + 1)} ${fmt(cBot.x - 0.8)} ${fmt(cBot.y - 0.5)} M ${fmt(cTop.x + 7.5)} ${fmt(cTop.y + 2.2)} Q ${fmt(cTop.x + 3)} ${fmt(cBot.y + 1)} ${fmt(cBot.x + 0.8)} ${fmt(cBot.y - 0.5)}`;
        overlays.push({
          zone,
          layer: 'torso',
          d: `M ${fmt(cTop.x - 8.8)} ${fmt(cTop.y)} Q ${fmt(cTop.x)} ${fmt(cTop.y - 2)} ${fmt(cTop.x + 8.8)} ${fmt(cTop.y)} L ${fmt(cBot.x + 7.2)} ${fmt(cBot.y)} Q ${fmt(cBot.x)} ${fmt(cBot.y + 2.2)} ${fmt(cBot.x - 7.2)} ${fmt(cBot.y)} Z`,
          striationD,
        });
      } else {
        const a = add(lerp(pose.hip, pose.shoulder, 0.84), scale(n, 2.0));
        const b = add(lerp(pose.hip, pose.shoulder, 0.72), scale(n, 7.6));
        const c = add(lerp(pose.hip, pose.shoulder, 0.56), scale(n, 5.4));
        const dPt = add(lerp(pose.hip, pose.shoulder, 0.62), scale(n, 0.4));
        const f1a = add(lerp(pose.hip, pose.shoulder, 0.77), scale(n, 1.9));
        const f1b = add(lerp(pose.hip, pose.shoulder, 0.66), scale(n, 5.9));
        const f2a = add(lerp(pose.hip, pose.shoulder, 0.70), scale(n, 1.4));
        const f2b = add(lerp(pose.hip, pose.shoulder, 0.60), scale(n, 5.1));
        overlays.push({
          zone,
          layer: 'torso',
          d: `M ${pt(a)} Q ${pt(b)} ${pt(c)} Q ${pt(dPt)} ${pt(a)} Z`,
          striationD: `M ${pt(f1a)} L ${pt(f1b)} M ${pt(f2a)} L ${pt(f2b)}`,
        });
      }
    }

    if (zone === 'back') {
      const a = add(lerp(pose.hip, pose.shoulder, 0.88), scale(n, -1.6));
      const b = add(lerp(pose.hip, pose.shoulder, 0.72), scale(n, -7.3));
      const c = add(lerp(pose.hip, pose.shoulder, 0.38), scale(n, -4.6));
      const dPt = add(lerp(pose.hip, pose.shoulder, 0.52), scale(n, -0.4));
      const f1a = add(lerp(pose.hip, pose.shoulder, 0.76), scale(n, -2.0));
      const f1b = add(lerp(pose.hip, pose.shoulder, 0.54), scale(n, -4.8));
      const f2a = add(lerp(pose.hip, pose.shoulder, 0.66), scale(n, -1.4));
      const f2b = add(lerp(pose.hip, pose.shoulder, 0.45), scale(n, -4.2));
      overlays.push({
        zone,
        layer: 'torso',
        d: `M ${pt(a)} Q ${pt(b)} ${pt(c)} Q ${pt(dPt)} ${pt(a)} Z`,
        striationD: `M ${pt(f1a)} Q ${pt(lerp(f1a, f1b, 0.5))} ${pt(f1b)} M ${pt(f2a)} L ${pt(f2b)}`,
      });
    }

    if (zone === 'core') {
      if (isFrontal) {
        const cTop = lerp(pose.hip, pose.shoulder, 0.54);
        const cBot = lerp(pose.hip, pose.shoulder, 0.14);
        const r1 = lerp(cBot, cTop, 0.68);
        const r2 = lerp(cBot, cTop, 0.36);
        overlays.push({
          zone,
          layer: 'torso',
          d: `M ${fmt(cTop.x - 5.2)} ${fmt(cTop.y)} L ${fmt(cTop.x + 5.2)} ${fmt(cTop.y)} L ${fmt(cBot.x + 4.8)} ${fmt(cBot.y)} L ${fmt(cBot.x - 4.8)} ${fmt(cBot.y)} Z`,
          striationD: `M ${pt(cTop)} L ${pt(cBot)} M ${fmt(r1.x - 3.8)} ${fmt(r1.y)} L ${fmt(r1.x + 3.8)} ${fmt(r1.y)} M ${fmt(r2.x - 3.6)} ${fmt(r2.y)} L ${fmt(r2.x + 3.6)} ${fmt(r2.y)}`,
        });
      } else {
        const a = add(lerp(pose.hip, pose.shoulder, 0.54), scale(n, 5.2));
        const b = add(lerp(pose.hip, pose.shoulder, 0.16), scale(n, 5.0));
        const c = add(lerp(pose.hip, pose.shoulder, 0.14), scale(n, 0.8));
        const dPt = add(lerp(pose.hip, pose.shoulder, 0.50), scale(n, 1.0));
        const s1a = add(lerp(pose.hip, pose.shoulder, 0.42), scale(n, 1.5));
        const s1b = add(lerp(pose.hip, pose.shoulder, 0.40), scale(n, 4.9));
        const s2a = add(lerp(pose.hip, pose.shoulder, 0.28), scale(n, 1.3));
        const s2b = add(lerp(pose.hip, pose.shoulder, 0.26), scale(n, 4.7));
        overlays.push({
          zone,
          layer: 'torso',
          d: `M ${pt(a)} Q ${pt(add(lerp(a, b, 0.5), scale(n, 1.1)))} ${pt(b)} L ${pt(c)} Q ${pt(dPt)} ${pt(a)} Z`,
          striationD: `M ${pt(s1a)} L ${pt(s1b)} M ${pt(s2a)} L ${pt(s2b)}`,
        });
      }
    }

    if (zone === 'shoulders') {
      if (isFrontal) {
        const makeDelt = (origin: JointPoint, dirX: number) => {
          const top = add(origin, scale(uSpine, 4.2));
          const outer = add(origin, { x: dirX * 5.2, y: 0.4 });
          const bot = add(origin, scale(uSpine, -4.8));
          const inner = add(origin, { x: -dirX * 3.4, y: 0.2 });
          return {
            zone,
            layer: 'arm' as const,
            d: `M ${pt(top)} Q ${pt(outer)} ${pt(bot)} Q ${pt(inner)} ${pt(top)} Z`,
            striationD: `M ${pt(add(origin, scale(uSpine, 2.3)))} Q ${pt(add(origin, { x: dirX * 2.5, y: 0 }))} ${pt(add(origin, scale(uSpine, -2.5)))}`,
          };
        };
        overlays.push(makeDelt(shoulderOrigin, -1));
        overlays.push(makeDelt(shoulderOrigin2, 1));
      } else {
        const top = add(pose.shoulder, scale(uSpine, 4.5));
        const fwd = add(pose.shoulder, scale(n, 6.2));
        const bot = add(pose.shoulder, scale(uSpine, -5.5));
        const back = add(pose.shoulder, scale(n, -5.8));
        const midTop = add(pose.shoulder, scale(uSpine, 2.2));
        const midBot = add(pose.shoulder, scale(uSpine, -3.0));
        overlays.push({
          zone,
          layer: 'arm',
          d: `M ${pt(top)} Q ${pt(fwd)} ${pt(bot)} Q ${pt(back)} ${pt(top)} Z`,
          striationD: `M ${pt(midTop)} Q ${pt(add(pose.shoulder, scale(n, 3.2)))} ${pt(midBot)} M ${pt(midTop)} Q ${pt(add(pose.shoulder, scale(n, -2.8)))} ${pt(midBot)}`,
        });
      }
    }

    if (zone === 'arms') {
      const armStart = lerp(shoulderOrigin, pose.elbow, 0.14);
      const armEnd = lerp(shoulderOrigin, pose.elbow, 0.84);
      overlays.push({
        zone,
        layer: 'arm',
        d: buildTaperedLimbPath(armStart, armEnd, 3.3, 2.7, n, 1.6, 1.2, 0.48),
        striationD: buildLimbStriationPath(armStart, armEnd, n, 1.2),
      });
      if (isFrontal && pose.elbow2) {
        const armStart2 = lerp(shoulderOrigin2, pose.elbow2, 0.14);
        const armEnd2 = lerp(shoulderOrigin2, pose.elbow2, 0.84);
        overlays.push({
          zone,
          layer: 'arm',
          d: buildTaperedLimbPath(armStart2, armEnd2, 3.3, 2.7, n, 1.6, 1.2, 0.48),
          striationD: buildLimbStriationPath(armStart2, armEnd2, n, 1.2),
        });
      }
    }

    if (zone === 'glutes') {
      if (isFrontal) {
        const gL = add(pose.hip, { x: -6.5, y: 1 });
        const gR = add(pose.hip, { x: 6.5, y: 1 });
        overlays.push({
          zone,
          layer: 'torso',
          d: `M ${fmt(gL.x - 2)} ${fmt(gL.y - 3)} Q ${fmt(gL.x - 3.6)} ${fmt(gL.y + 1)} ${fmt(gL.x)} ${fmt(gL.y + 4)} Q ${fmt(gL.x + 2.5)} ${fmt(gL.y)} ${fmt(gL.x - 2)} ${fmt(gL.y - 3)} Z M ${fmt(gR.x + 2)} ${fmt(gR.y - 3)} Q ${fmt(gR.x + 3.6)} ${fmt(gR.y + 1)} ${fmt(gR.x)} ${fmt(gR.y + 4)} Q ${fmt(gR.x - 2.5)} ${fmt(gR.y)} ${fmt(gR.x + 2)} ${fmt(gR.y - 3)} Z`,
          striationD: `M ${pt(gL)} L ${fmt(gL.x - 1)} ${fmt(gL.y + 2)} M ${pt(gR)} L ${fmt(gR.x + 1)} ${fmt(gR.y + 2)}`,
        });
      } else {
        const gTop = add(lerp(pose.hip, pose.shoulder, 0.16), scale(n, -3.5));
        const gBack = add(pose.hip, scale(n, -8.0));
        const gBot = add(lerp(pose.hip, pose.knee, 0.22), scale(n, -4.6));
        const gCore = add(pose.hip, scale(n, -1.0));
        overlays.push({
          zone,
          layer: 'torso',
          d: `M ${pt(gTop)} Q ${pt(gBack)} ${pt(gBot)} Q ${pt(gCore)} ${pt(gTop)} Z`,
          striationD: `M ${pt(lerp(gTop, gCore, 0.45))} Q ${pt(lerp(gBack, gCore, 0.35))} ${pt(lerp(gBot, gCore, 0.45))}`,
        });
      }
    }

    if (zone === 'quads') {
      const qStart = add(lerp(hipOrigin, pose.knee, 0.16), scale(n, isFrontal ? 0 : 2.2));
      const qEnd = add(lerp(hipOrigin, pose.knee, 0.82), scale(n, isFrontal ? 0 : 1.5));
      overlays.push({
        zone,
        layer: 'leg',
        d: buildTaperedLimbPath(qStart, qEnd, 3.6, 2.5, n, 2.2, isFrontal ? 1.8 : 0.1, 0.45),
        striationD: buildLimbStriationPath(qStart, qEnd, n, 1.3),
      });
      if (isFrontal && pose.knee2) {
        const qStart2 = lerp(hipOrigin2, pose.knee2, 0.16);
        const qEnd2 = lerp(hipOrigin2, pose.knee2, 0.82);
        overlays.push({
          zone,
          layer: 'leg',
          d: buildTaperedLimbPath(qStart2, qEnd2, 3.6, 2.5, n, 2.2, 1.8, 0.45),
          striationD: buildLimbStriationPath(qStart2, qEnd2, n, 1.3),
        });
      }
    }

    if (zone === 'hamstrings') {
      const hStart = add(lerp(hipOrigin, pose.knee, 0.18), scale(n, isFrontal ? 0 : -2.2));
      const hEnd = add(lerp(hipOrigin, pose.knee, 0.84), scale(n, isFrontal ? 0 : -1.5));
      overlays.push({
        zone,
        layer: 'leg',
        d: buildTaperedLimbPath(hStart, hEnd, 3.3, 2.2, n, 0.1, 2.0, 0.45),
        striationD: buildLimbStriationPath(hStart, hEnd, n, -1.2),
      });
      if (isFrontal && pose.knee2) {
        const hStart2 = lerp(hipOrigin2, pose.knee2, 0.18);
        const hEnd2 = lerp(hipOrigin2, pose.knee2, 0.84);
        overlays.push({
          zone,
          layer: 'leg',
          d: buildTaperedLimbPath(hStart2, hEnd2, 3.3, 2.2, n, 0.1, 2.0, 0.45),
          striationD: buildLimbStriationPath(hStart2, hEnd2, n, -1.2),
        });
      }
    }

    if (zone === 'calves') {
      const cStart = add(lerp(pose.knee, pose.foot, 0.16), scale(n, isFrontal ? -0.4 : -1.4));
      const cEnd = add(lerp(pose.knee, pose.foot, 0.68), scale(n, isFrontal ? -0.2 : -1.0));
      overlays.push({
        zone,
        layer: 'leg',
        d: buildTaperedLimbPath(cStart, cEnd, 2.6, 1.8, n, isFrontal ? 1.5 : 0.2, 2.4, 0.38),
        striationD: buildLimbStriationPath(cStart, cEnd, n, -1.1),
      });
      if (isFrontal && pose.knee2 && pose.foot2) {
        const cStart2 = add(lerp(pose.knee2, pose.foot2, 0.16), scale(n, 0.4));
        const cEnd2 = add(lerp(pose.knee2, pose.foot2, 0.68), scale(n, 0.2));
        overlays.push({
          zone,
          layer: 'leg',
          d: buildTaperedLimbPath(cStart2, cEnd2, 2.6, 1.8, n, 1.5, 2.4, 0.38),
          striationD: buildLimbStriationPath(cStart2, cEnd2, n, 1.1),
        });
      }
    }
  }

  return overlays;
}

export function buildAthleticBodyGeometry(
  pose: PoseFrame,
  archetype: MotionArchetype,
  highlightZones: BodyZone[]
): AthleticBodyGeometry {
  const isFrontal = archetype === 'jumping_jack';
  const spineU = unit(sub(pose.shoulder, pose.hip), { x: 0, y: -1 });
  const nAnterior = isFrontal ? { x: 1, y: 0 } : anteriorNormal(spineU);

  const torsoPath = buildAthleticTorsoPath(pose.shoulder, pose.hip, nAnterior, isFrontal);
  const torsoContourPath = `M ${pt(add(lerp(pose.hip, pose.shoulder, 0.75), scale(nAnterior, -3.6)))} Q ${pt(add(lerp(pose.hip, pose.shoulder, 0.52), scale(nAnterior, 2)))} ${pt(add(lerp(pose.hip, pose.shoulder, 0.43), scale(nAnterior, 4)))}`;
  const anatomicalDetailPaths = buildAnatomicalDetailPaths(pose, nAnterior, isFrontal);
  const headGeometry = buildHeadAndNeck(
    pose.head,
    pose.shoulder,
    nAnterior,
    isFrontal
  );

  const shoulderOrigin = isFrontal
    ? { x: pose.shoulder.x - 9.2, y: pose.shoulder.y + 1.5 }
    : pose.shoulder;
  const shoulderOrigin2 = isFrontal
    ? { x: pose.shoulder.x + 9.2, y: pose.shoulder.y + 1.5 }
    : pose.shoulder;

  const hipOrigin = isFrontal
    ? { x: pose.hip.x - 4.4, y: pose.hip.y + 2 }
    : pose.hip;
  const hipOrigin2 = isFrontal
    ? { x: pose.hip.x + 4.4, y: pose.hip.y + 2 }
    : pose.hip;

  const frontThighPath = buildTaperedLimbPath(
    hipOrigin,
    pose.knee,
    6.4,
    4.6,
    nAnterior,
    1.8,
    0.9,
    0.42
  );
  const frontShinPath = buildTaperedLimbPath(
    pose.knee,
    pose.foot,
    4.4,
    2.6,
    nAnterior,
    0.5,
    1.8,
    0.34
  );
  const frontFoot = buildFootAndSole(pose.foot, pose.knee, nAnterior, isFrontal, -1);

  const frontUpperArmPath = buildTaperedLimbPath(
    shoulderOrigin,
    pose.elbow,
    4.6,
    3.4,
    nAnterior,
    1.0,
    0.8,
    0.45
  );
  const frontForearmPath = buildTaperedLimbPath(
    pose.elbow,
    pose.hand,
    3.3,
    2.1,
    nAnterior,
    0.8,
    0.4,
    0.35
  );

  const hasExplicitBackLeg = Boolean(pose.knee2 && pose.foot2);
  const needsImplicitBackLeg =
    !isFrontal &&
    !hasExplicitBackLeg &&
    ['goblet_squat', 'front_squat', 'rdl_stiff', 'bent_row', 'pushup', 'dips', 'arm_biset', 'overhead_press', 'leg_raise_lsit', 'burpee', 'superman', 'mobility_crunch'].includes(
      archetype
    );

  const resolvedKnee2 =
    pose.knee2 ??
    (needsImplicitBackLeg ? { x: pose.knee.x - 5.5, y: pose.knee.y - 2.2 } : undefined);
  const resolvedFoot2 =
    pose.foot2 ??
    (needsImplicitBackLeg ? { x: pose.foot.x - 6.0, y: pose.foot.y - 2.2 } : undefined);

  const backThighPath =
    resolvedKnee2 && resolvedFoot2
      ? buildTaperedLimbPath(hipOrigin2, resolvedKnee2, 6.0, 4.4, nAnterior, 1.5, 0.8, 0.42)
      : null;
  const backShinPath =
    resolvedKnee2 && resolvedFoot2
      ? buildTaperedLimbPath(resolvedKnee2, resolvedFoot2, 4.2, 2.5, nAnterior, 0.5, 1.6, 0.34)
      : null;
  const backFoot =
    resolvedKnee2 && resolvedFoot2
      ? buildFootAndSole(resolvedFoot2, resolvedKnee2, nAnterior, isFrontal, 1)
      : null;

  const hasExplicitBackArm = Boolean(pose.elbow2 && pose.hand2);
  const needsImplicitBackArm =
    !isFrontal &&
    !hasExplicitBackArm &&
    ['front_squat', 'goblet_squat', 'rdl_stiff', 'bent_row', 'pushup', 'dips', 'arm_biset', 'overhead_press', 'leg_raise_lsit'].includes(
      archetype
    );

  const resolvedElbow2 =
    pose.elbow2 ??
    (needsImplicitBackArm ? { x: pose.elbow.x - 5.2, y: pose.elbow.y - 2.0 } : undefined);
  const resolvedHand2 =
    pose.hand2 ??
    (needsImplicitBackArm ? { x: pose.hand.x - 5.0, y: pose.hand.y - 2.0 } : undefined);

  const backUpperArmPath =
    resolvedElbow2 && resolvedHand2
      ? buildTaperedLimbPath(shoulderOrigin2, resolvedElbow2, 4.3, 3.2, nAnterior, 0.9, 0.7, 0.45)
      : null;
  const backForearmPath =
    resolvedElbow2 && resolvedHand2
      ? buildTaperedLimbPath(resolvedElbow2, resolvedHand2, 3.1, 2.0, nAnterior, 0.7, 0.3, 0.35)
      : null;

  const muscleOverlays = buildMuscleOverlayPaths(pose, nAnterior, highlightZones, isFrontal);
  const gripping = Boolean(pose.barCenter) || archetype === 'dips';

  return {
    torsoPath,
    torsoContourPath,
    anatomicalDetailPaths,
    surfaceLighting: {
      torso: lightAcrossSurface(pose.shoulder, pose.hip, isFrontal ? 11 : 8),
      thigh: lightAcrossSurface(hipOrigin, pose.knee, 7),
      shin: lightAcrossSurface(pose.knee, pose.foot, 5),
      upperArm: lightAcrossSurface(shoulderOrigin, pose.elbow, 5),
      forearm: lightAcrossSurface(pose.elbow, pose.hand, 4),
    },
    ...headGeometry,
    frontThighPath,
    frontShortsPath: buildShortsPath(hipOrigin, pose.knee),
    shortsWaistbandPath: buildShortsWaistbandPath(hipOrigin, pose.knee),
    frontShinPath,
    frontFootPath: frontFoot.shoePath,
    frontShoeSolePath: frontFoot.solePath,
    frontUpperArmPath,
    frontForearmPath,
    frontHandPath: buildHandPath(pose.hand, pose.elbow, nAnterior, gripping),
    backThighPath,
    backShortsPath: resolvedKnee2 && resolvedFoot2 ? buildShortsPath(hipOrigin2, resolvedKnee2) : null,
    backShinPath,
    backFootPath: backFoot?.shoePath ?? null,
    backShoeSolePath: backFoot?.solePath ?? null,
    backUpperArmPath,
    backForearmPath,
    backHandPath: resolvedHand2 && resolvedElbow2
      ? buildHandPath(resolvedHand2, resolvedElbow2, nAnterior, gripping)
      : null,
    muscleOverlays,
    isFrontal,
  };
}
