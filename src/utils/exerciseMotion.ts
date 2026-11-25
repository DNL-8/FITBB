import { ExerciseItem } from '../types/fitness';

export type MotionArchetype =
  | 'dips'
  | 'bent_row'
  | 'pushup'
  | 'overhead_press'
  | 'one_arm_row'
  | 'arm_biset'
  | 'leg_raise_lsit'
  | 'bulgarian_squat'
  | 'rdl_stiff'
  | 'front_squat'
  | 'goblet_squat'
  | 'hip_thrust'
  | 'calf_raise'
  | 'plank_taps'
  | 'lunge'
  | 'burpee'
  | 'jumping_jack'
  | 'high_knees'
  | 'superman'
  | 'mobility_crunch';

export type MotionEquipmentProp =
  | 'none'
  | 'parallel_bars'
  | 'barbell_rack'
  | 'barbell_floor'
  | 'short_bar'
  | 'goblet_weight'
  | 'bench_step'
  | 'hip_plate';

export type BodyZone =
  | 'chest'
  | 'back'
  | 'shoulders'
  | 'arms'
  | 'core'
  | 'quads'
  | 'glutes'
  | 'hamstrings'
  | 'calves';

export interface JointPoint {
  x: number;
  y: number;
}

export interface PoseFrame {
  head: JointPoint;
  shoulder: JointPoint;
  hip: JointPoint;
  elbow: JointPoint;
  hand: JointPoint;
  elbow2?: JointPoint;
  hand2?: JointPoint;
  knee: JointPoint;
  foot: JointPoint;
  knee2?: JointPoint;
  foot2?: JointPoint;
  barCenter?: JointPoint;
  barAngleDeg?: number;
}

export interface ExerciseMotionSpec {
  archetype: MotionArchetype;
  equipmentProp: MotionEquipmentProp;
  cycleSeconds: number;
  highlightZones: BodyZone[];
  phaseLabels: [string, string, string];
  keyFrames: [PoseFrame, PoseFrame, PoseFrame];
}

export const CYCLE_PHASE_BOUNDARIES = [0.42, 0.58] as const;

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpPoint(a: JointPoint, b: JointPoint, t: number): JointPoint {
  return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) };
}

function easeInOutSine(t: number): number {
  return -(Math.cos(Math.PI * t) - 1) / 2;
}

export function interpolatePose(
  frames: [PoseFrame, PoseFrame, PoseFrame],
  cycleProgress: number
): { pose: PoseFrame; phaseIndex: 0 | 1 | 2; contractionIntensity: number } {
  const p = ((cycleProgress % 1) + 1) % 1;
  let from: PoseFrame;
  let to: PoseFrame;
  let localT: number;
  let phaseIndex: 0 | 1 | 2;
  let contractionIntensity: number;

  const [holdStart, holdEnd] = CYCLE_PHASE_BOUNDARIES;
  if (p < holdStart) {
    from = frames[0];
    to = frames[1];
    localT = easeInOutSine(p / holdStart);
    phaseIndex = 0;
    contractionIntensity = 0.35 + localT * 0.65;
  } else if (p < holdEnd) {
    from = frames[1];
    to = frames[1];
    localT = 0;
    phaseIndex = 1;
    contractionIntensity = 1.0;
  } else {
    from = frames[1];
    to = frames[2];
    localT = easeInOutSine((p - holdEnd) / (1 - holdEnd));
    phaseIndex = 2;
    contractionIntensity = 1.0 - localT * 0.65;
  }

  const pose: PoseFrame = {
    head: lerpPoint(from.head, to.head, localT),
    shoulder: lerpPoint(from.shoulder, to.shoulder, localT),
    hip: lerpPoint(from.hip, to.hip, localT),
    elbow: lerpPoint(from.elbow, to.elbow, localT),
    hand: lerpPoint(from.hand, to.hand, localT),
    knee: lerpPoint(from.knee, to.knee, localT),
    foot: lerpPoint(from.foot, to.foot, localT),
  };

  if (from.elbow2 && to.elbow2) pose.elbow2 = lerpPoint(from.elbow2, to.elbow2, localT);
  if (from.hand2 && to.hand2) pose.hand2 = lerpPoint(from.hand2, to.hand2, localT);
  if (from.knee2 && to.knee2) pose.knee2 = lerpPoint(from.knee2, to.knee2, localT);
  if (from.foot2 && to.foot2) pose.foot2 = lerpPoint(from.foot2, to.foot2, localT);
  if (from.barCenter && to.barCenter) {
    pose.barCenter = lerpPoint(from.barCenter, to.barCenter, localT);
  }
  if (from.barAngleDeg !== undefined && to.barAngleDeg !== undefined) {
    pose.barAngleDeg = lerp(from.barAngleDeg, to.barAngleDeg, localT);
  }

  return { pose, phaseIndex, contractionIntensity };
}

export function resolveMotionArchetype(exercise: ExerciseItem): MotionArchetype {
  const id = exercise.id;
  const name = exercise.name.toLowerCase();

  if (id === 'ex-ch-a-1' || name.includes('paralela') || name.includes('dips') || name.includes('mergulho')) {
    return 'dips';
  }
  if (id === 'ex-ch-a-2' || (name.includes('remada') && !name.includes('unilateral'))) {
    return 'bent_row';
  }
  if (id === 'ex-ch-a-4' || name.includes('desenvolvimento') || name.includes('overhead')) {
    return 'overhead_press';
  }
  if (id === 'ex-ch-a-5' || name.includes('serrote') || name.includes('remada unilateral')) {
    return 'one_arm_row';
  }
  if (id === 'ex-ch-a-6' || name.includes('rosca') || name.includes('tríceps testa')) {
    return 'arm_biset';
  }
  if (id === 'ex-ch-a-7' || name.includes('l-sit') || name.includes('elevação de pernas')) {
    return 'leg_raise_lsit';
  }
  if (id === 'ex-ch-b-1' || name.includes('búlgaro')) {
    return 'bulgarian_squat';
  }
  if (id === 'ex-ch-b-2' || name.includes('stiff') || name.includes('terra romeno')) {
    return 'rdl_stiff';
  }
  if (id === 'ex-ch-b-3' || name.includes('frontal') || name.includes('front squat')) {
    return 'front_squat';
  }
  if (id === 'ex-ch-b-4' || name.includes('elevação pélvica') || name.includes('ponte')) {
    return 'hip_thrust';
  }
  if (id === 'ex-ch-b-5' || name.includes('panturrilha')) {
    return 'calf_raise';
  }
  if (id === 'ex-ch-b-6' || name.includes('toca-ombros') || name.includes('toque no ombro') || name.includes('prancha')) {
    return 'plank_taps';
  }
  if (name.includes('flexão')) {
    return 'pushup';
  }
  if (name.includes('afundo') || name.includes('lunge') || name.includes('pistol')) {
    return 'lunge';
  }
  if (name.includes('burpee') || name.includes('sprawl')) {
    return 'burpee';
  }
  if (name.includes('goblet')) {
    return 'goblet_squat';
  }
  if (name.includes('polichinelo')) {
    return 'jumping_jack';
  }
  if (name.includes('agachamento')) {
    return 'front_squat';
  }
  if (name.includes('superman')) {
    return 'superman';
  }
  if (name.includes('marcha') || name.includes('corrida') || name.includes('escalador') || name.includes('deslocamento') || name.includes('sprint')) {
    return 'high_knees';
  }
  return 'mobility_crunch';
}

const ARCHETYPE_SPECS: Record<MotionArchetype, Omit<ExerciseMotionSpec, 'archetype'>> = {
  dips: {
    equipmentProp: 'parallel_bars',
    cycleSeconds: 3.6,
    highlightZones: ['chest', 'arms', 'shoulders'],
    phaseLabels: ['Descida · Controle 90°', 'Pausa · Fundo Estável', 'Subida · Empurrar Forte'],
    keyFrames: [
      {
        head: { x: 162, y: 34 },
        shoulder: { x: 160, y: 50 },
        hip: { x: 154, y: 92 },
        elbow: { x: 158, y: 72 },
        hand: { x: 160, y: 92 },
        knee: { x: 152, y: 118 },
        foot: { x: 146, y: 136 },
      },
      {
        head: { x: 168, y: 54 },
        shoulder: { x: 162, y: 70 },
        hip: { x: 146, y: 108 },
        elbow: { x: 140, y: 72 },
        hand: { x: 160, y: 92 },
        knee: { x: 144, y: 130 },
        foot: { x: 136, y: 144 },
      },
      {
        head: { x: 162, y: 34 },
        shoulder: { x: 160, y: 50 },
        hip: { x: 154, y: 92 },
        elbow: { x: 158, y: 72 },
        hand: { x: 160, y: 92 },
        knee: { x: 152, y: 118 },
        foot: { x: 146, y: 136 },
      },
    ],
  },
  bent_row: {
    equipmentProp: 'barbell_floor',
    cycleSeconds: 3.4,
    highlightZones: ['back', 'arms', 'core'],
    phaseLabels: ['Extensão · Escápulas Abertas', 'Pico · Barra no Abdômen', 'Descida · Controle Excêntrico'],
    keyFrames: [
      {
        head: { x: 196, y: 58 },
        shoulder: { x: 180, y: 70 },
        hip: { x: 136, y: 92 },
        elbow: { x: 182, y: 98 },
        hand: { x: 184, y: 124 },
        knee: { x: 148, y: 120 },
        foot: { x: 144, y: 150 },
        barCenter: { x: 184, y: 124 },
      },
      {
        head: { x: 196, y: 56 },
        shoulder: { x: 180, y: 68 },
        hip: { x: 136, y: 92 },
        elbow: { x: 152, y: 66 },
        hand: { x: 164, y: 92 },
        knee: { x: 148, y: 120 },
        foot: { x: 144, y: 150 },
        barCenter: { x: 164, y: 92 },
      },
      {
        head: { x: 196, y: 58 },
        shoulder: { x: 180, y: 70 },
        hip: { x: 136, y: 92 },
        elbow: { x: 182, y: 98 },
        hand: { x: 184, y: 124 },
        knee: { x: 148, y: 120 },
        foot: { x: 144, y: 150 },
        barCenter: { x: 184, y: 124 },
      },
    ],
  },
  pushup: {
    equipmentProp: 'none',
    cycleSeconds: 3.2,
    highlightZones: ['chest', 'arms', 'core'],
    phaseLabels: ['Descida · Cotovelos a 45°', 'Pausa · Peito Próximo ao Solo', 'Subida · Empurrar Firme'],
    keyFrames: [
      {
        head: { x: 224, y: 84 },
        shoulder: { x: 206, y: 94 },
        hip: { x: 148, y: 118 },
        elbow: { x: 206, y: 122 },
        hand: { x: 206, y: 150 },
        knee: { x: 112, y: 134 },
        foot: { x: 80, y: 150 },
      },
      {
        head: { x: 228, y: 118 },
        shoulder: { x: 208, y: 126 },
        hip: { x: 148, y: 136 },
        elbow: { x: 192, y: 124 },
        hand: { x: 206, y: 150 },
        knee: { x: 112, y: 144 },
        foot: { x: 80, y: 150 },
      },
      {
        head: { x: 224, y: 84 },
        shoulder: { x: 206, y: 94 },
        hip: { x: 148, y: 118 },
        elbow: { x: 206, y: 122 },
        hand: { x: 206, y: 150 },
        knee: { x: 112, y: 134 },
        foot: { x: 80, y: 150 },
      },
    ],
  },
  overhead_press: {
    equipmentProp: 'barbell_rack',
    cycleSeconds: 3.6,
    highlightZones: ['shoulders', 'arms', 'core'],
    phaseLabels: ['Subida · Empurrar Acima', 'Pico · Alinhamento Vertical', 'Descida · Controle na Clavícula'],
    keyFrames: [
      {
        head: { x: 158, y: 44 },
        shoulder: { x: 160, y: 62 },
        hip: { x: 160, y: 102 },
        elbow: { x: 174, y: 82 },
        hand: { x: 170, y: 58 },
        knee: { x: 160, y: 126 },
        foot: { x: 158, y: 150 },
        barCenter: { x: 170, y: 58 },
      },
      {
        head: { x: 162, y: 44 },
        shoulder: { x: 160, y: 62 },
        hip: { x: 160, y: 102 },
        elbow: { x: 162, y: 38 },
        hand: { x: 162, y: 20 },
        knee: { x: 160, y: 126 },
        foot: { x: 158, y: 150 },
        barCenter: { x: 162, y: 20 },
      },
      {
        head: { x: 158, y: 44 },
        shoulder: { x: 160, y: 62 },
        hip: { x: 160, y: 102 },
        elbow: { x: 174, y: 82 },
        hand: { x: 170, y: 58 },
        knee: { x: 160, y: 126 },
        foot: { x: 158, y: 150 },
        barCenter: { x: 170, y: 58 },
      },
    ],
  },
  one_arm_row: {
    equipmentProp: 'short_bar',
    cycleSeconds: 3.2,
    highlightZones: ['back', 'arms', 'core'],
    phaseLabels: ['Alongamento · Braço Estendido', 'Pico · Cotovelo no Quadril', 'Descida · Tronco Estável'],
    keyFrames: [
      {
        head: { x: 198, y: 64 },
        shoulder: { x: 180, y: 74 },
        hip: { x: 132, y: 92 },
        elbow: { x: 182, y: 104 },
        hand: { x: 182, y: 130 },
        elbow2: { x: 192, y: 96 },
        hand2: { x: 186, y: 118 },
        knee: { x: 164, y: 120 },
        foot: { x: 168, y: 150 },
        knee2: { x: 126, y: 122 },
        foot2: { x: 116, y: 150 },
        barCenter: { x: 182, y: 130 },
      },
      {
        head: { x: 198, y: 62 },
        shoulder: { x: 180, y: 72 },
        hip: { x: 132, y: 92 },
        elbow: { x: 148, y: 68 },
        hand: { x: 158, y: 94 },
        elbow2: { x: 192, y: 96 },
        hand2: { x: 186, y: 118 },
        knee: { x: 164, y: 120 },
        foot: { x: 168, y: 150 },
        knee2: { x: 126, y: 122 },
        foot2: { x: 116, y: 150 },
        barCenter: { x: 158, y: 94 },
      },
      {
        head: { x: 198, y: 64 },
        shoulder: { x: 180, y: 74 },
        hip: { x: 132, y: 92 },
        elbow: { x: 182, y: 104 },
        hand: { x: 182, y: 130 },
        elbow2: { x: 192, y: 96 },
        hand2: { x: 186, y: 118 },
        knee: { x: 164, y: 120 },
        foot: { x: 168, y: 150 },
        knee2: { x: 126, y: 122 },
        foot2: { x: 116, y: 150 },
        barCenter: { x: 182, y: 130 },
      },
    ],
  },
  arm_biset: {
    equipmentProp: 'barbell_rack',
    cycleSeconds: 3.4,
    highlightZones: ['arms'],
    phaseLabels: ['Subida · Cotovelos Fixos', 'Pico · Contração Máxima', 'Descida · Extensão Controlada'],
    keyFrames: [
      {
        head: { x: 158, y: 40 },
        shoulder: { x: 158, y: 58 },
        hip: { x: 158, y: 98 },
        elbow: { x: 160, y: 84 },
        hand: { x: 168, y: 106 },
        knee: { x: 158, y: 126 },
        foot: { x: 156, y: 150 },
        barCenter: { x: 168, y: 106 },
      },
      {
        head: { x: 158, y: 40 },
        shoulder: { x: 158, y: 58 },
        hip: { x: 158, y: 98 },
        elbow: { x: 162, y: 82 },
        hand: { x: 172, y: 62 },
        knee: { x: 158, y: 126 },
        foot: { x: 156, y: 150 },
        barCenter: { x: 172, y: 62 },
      },
      {
        head: { x: 158, y: 40 },
        shoulder: { x: 158, y: 58 },
        hip: { x: 158, y: 98 },
        elbow: { x: 160, y: 84 },
        hand: { x: 168, y: 106 },
        knee: { x: 158, y: 126 },
        foot: { x: 156, y: 150 },
        barCenter: { x: 168, y: 106 },
      },
    ],
  },
  leg_raise_lsit: {
    equipmentProp: 'parallel_bars',
    cycleSeconds: 3.6,
    highlightZones: ['core', 'shoulders'],
    phaseLabels: ['Elevação · Abdômen Contraído', 'Isometria · L-Sit Horizontal', 'Descida · Sem Balançar'],
    keyFrames: [
      {
        head: { x: 154, y: 34 },
        shoulder: { x: 154, y: 50 },
        hip: { x: 154, y: 92 },
        elbow: { x: 156, y: 72 },
        hand: { x: 160, y: 92 },
        knee: { x: 156, y: 118 },
        foot: { x: 156, y: 142 },
      },
      {
        head: { x: 154, y: 34 },
        shoulder: { x: 154, y: 50 },
        hip: { x: 154, y: 92 },
        elbow: { x: 156, y: 72 },
        hand: { x: 160, y: 92 },
        knee: { x: 184, y: 92 },
        foot: { x: 214, y: 90 },
      },
      {
        head: { x: 154, y: 34 },
        shoulder: { x: 154, y: 50 },
        hip: { x: 154, y: 92 },
        elbow: { x: 156, y: 72 },
        hand: { x: 160, y: 92 },
        knee: { x: 156, y: 118 },
        foot: { x: 156, y: 142 },
      },
    ],
  },
  bulgarian_squat: {
    equipmentProp: 'bench_step',
    cycleSeconds: 3.8,
    highlightZones: ['quads', 'glutes'],
    phaseLabels: ['Descida · Joelho Alinhado', 'Pausa · Coxa Paralela', 'Subida · Força no Calcanhar'],
    keyFrames: [
      {
        head: { x: 166, y: 36 },
        shoulder: { x: 164, y: 54 },
        hip: { x: 160, y: 94 },
        elbow: { x: 172, y: 74 },
        hand: { x: 180, y: 66 },
        knee: { x: 176, y: 122 },
        foot: { x: 176, y: 150 },
        knee2: { x: 138, y: 118 },
        foot2: { x: 116, y: 118 },
        barCenter: { x: 180, y: 66 },
      },
      {
        head: { x: 168, y: 58 },
        shoulder: { x: 162, y: 76 },
        hip: { x: 152, y: 116 },
        elbow: { x: 170, y: 94 },
        hand: { x: 178, y: 86 },
        knee: { x: 182, y: 122 },
        foot: { x: 176, y: 150 },
        knee2: { x: 138, y: 140 },
        foot2: { x: 116, y: 118 },
        barCenter: { x: 178, y: 86 },
      },
      {
        head: { x: 166, y: 36 },
        shoulder: { x: 164, y: 54 },
        hip: { x: 160, y: 94 },
        elbow: { x: 172, y: 74 },
        hand: { x: 180, y: 66 },
        knee: { x: 176, y: 122 },
        foot: { x: 176, y: 150 },
        knee2: { x: 138, y: 118 },
        foot2: { x: 116, y: 118 },
        barCenter: { x: 180, y: 66 },
      },
    ],
  },
  rdl_stiff: {
    equipmentProp: 'barbell_floor',
    cycleSeconds: 3.8,
    highlightZones: ['hamstrings', 'glutes', 'back'],
    phaseLabels: ['Descida · Quadril Para Trás', 'Alongamento · Coluna Neutra', 'Subida · Contrair Glúteos'],
    keyFrames: [
      {
        head: { x: 160, y: 34 },
        shoulder: { x: 160, y: 52 },
        hip: { x: 158, y: 94 },
        elbow: { x: 164, y: 74 },
        hand: { x: 168, y: 98 },
        knee: { x: 160, y: 124 },
        foot: { x: 158, y: 150 },
        barCenter: { x: 168, y: 98 },
      },
      {
        head: { x: 198, y: 68 },
        shoulder: { x: 182, y: 78 },
        hip: { x: 134, y: 94 },
        elbow: { x: 182, y: 106 },
        hand: { x: 180, y: 130 },
        knee: { x: 156, y: 124 },
        foot: { x: 158, y: 150 },
        barCenter: { x: 180, y: 130 },
      },
      {
        head: { x: 160, y: 34 },
        shoulder: { x: 160, y: 52 },
        hip: { x: 158, y: 94 },
        elbow: { x: 164, y: 74 },
        hand: { x: 168, y: 98 },
        knee: { x: 160, y: 124 },
        foot: { x: 158, y: 150 },
        barCenter: { x: 168, y: 98 },
      },
    ],
  },
  front_squat: {
    equipmentProp: 'barbell_rack',
    cycleSeconds: 3.6,
    highlightZones: ['quads', 'glutes', 'core'],
    phaseLabels: ['Descida · Cotovelos Altos', 'Fundo · Tronco Vertical', 'Subida · Empurrar o Chão'],
    keyFrames: [
      {
        head: { x: 160, y: 34 },
        shoulder: { x: 160, y: 52 },
        hip: { x: 158, y: 94 },
        elbow: { x: 184, y: 54 },
        hand: { x: 168, y: 52 },
        knee: { x: 164, y: 122 },
        foot: { x: 160, y: 150 },
        barCenter: { x: 168, y: 52 },
      },
      {
        head: { x: 160, y: 66 },
        shoulder: { x: 156, y: 84 },
        hip: { x: 136, y: 122 },
        elbow: { x: 182, y: 82 },
        hand: { x: 164, y: 82 },
        knee: { x: 176, y: 122 },
        foot: { x: 160, y: 150 },
        barCenter: { x: 164, y: 82 },
      },
      {
        head: { x: 160, y: 34 },
        shoulder: { x: 160, y: 52 },
        hip: { x: 158, y: 94 },
        elbow: { x: 184, y: 54 },
        hand: { x: 168, y: 52 },
        knee: { x: 164, y: 122 },
        foot: { x: 160, y: 150 },
        barCenter: { x: 168, y: 52 },
      },
    ],
  },
  goblet_squat: {
    equipmentProp: 'goblet_weight',
    cycleSeconds: 3.6,
    highlightZones: ['quads', 'glutes', 'core'],
    phaseLabels: ['Descida · Joelho para Fora', 'Fundo · Peso Junto ao Peito', 'Subida · Tronco Firme'],
    keyFrames: [
      {
        head: { x: 162, y: 34 },
        shoulder: { x: 158, y: 52 },
        hip: { x: 152, y: 94 },
        elbow: { x: 170, y: 74 },
        hand: { x: 178, y: 58 },
        elbow2: { x: 162, y: 72 },
        hand2: { x: 172, y: 56 },
        knee: { x: 164, y: 122 },
        foot: { x: 160, y: 150 },
        knee2: { x: 154, y: 120 },
        foot2: { x: 148, y: 147 },
        barCenter: { x: 180, y: 60 },
      },
      {
        head: { x: 164, y: 68 },
        shoulder: { x: 156, y: 84 },
        hip: { x: 132, y: 122 },
        elbow: { x: 172, y: 106 },
        hand: { x: 178, y: 88 },
        elbow2: { x: 164, y: 104 },
        hand2: { x: 172, y: 86 },
        knee: { x: 176, y: 122 },
        foot: { x: 160, y: 150 },
        knee2: { x: 166, y: 120 },
        foot2: { x: 148, y: 147 },
        barCenter: { x: 180, y: 90 },
      },
      {
        head: { x: 162, y: 34 },
        shoulder: { x: 158, y: 52 },
        hip: { x: 152, y: 94 },
        elbow: { x: 170, y: 74 },
        hand: { x: 178, y: 58 },
        elbow2: { x: 162, y: 72 },
        hand2: { x: 172, y: 56 },
        knee: { x: 164, y: 122 },
        foot: { x: 160, y: 150 },
        knee2: { x: 154, y: 120 },
        foot2: { x: 148, y: 147 },
        barCenter: { x: 180, y: 60 },
      },
    ],
  },
  hip_thrust: {
    equipmentProp: 'hip_plate',
    cycleSeconds: 3.4,
    highlightZones: ['glutes', 'hamstrings'],
    phaseLabels: ['Subida · Empurrar Pelo Calcanhar', 'Pico · Extensão Total de Quadril', 'Descida · Controle Lombar'],
    keyFrames: [
      {
        head: { x: 92, y: 136 },
        shoulder: { x: 112, y: 142 },
        hip: { x: 156, y: 146 },
        elbow: { x: 134, y: 148 },
        hand: { x: 154, y: 144 },
        knee: { x: 192, y: 116 },
        foot: { x: 206, y: 150 },
        knee2: { x: 192, y: 122 },
        foot2: { x: 224, y: 106 },
        barCenter: { x: 156, y: 138 },
      },
      {
        head: { x: 92, y: 134 },
        shoulder: { x: 112, y: 138 },
        hip: { x: 162, y: 112 },
        elbow: { x: 136, y: 146 },
        hand: { x: 162, y: 110 },
        knee: { x: 196, y: 112 },
        foot: { x: 206, y: 150 },
        knee2: { x: 198, y: 96 },
        foot2: { x: 230, y: 80 },
        barCenter: { x: 162, y: 104 },
      },
      {
        head: { x: 92, y: 136 },
        shoulder: { x: 112, y: 142 },
        hip: { x: 156, y: 146 },
        elbow: { x: 134, y: 148 },
        hand: { x: 154, y: 144 },
        knee: { x: 192, y: 116 },
        foot: { x: 206, y: 150 },
        knee2: { x: 192, y: 122 },
        foot2: { x: 224, y: 106 },
        barCenter: { x: 156, y: 138 },
      },
    ],
  },
  calf_raise: {
    equipmentProp: 'bench_step',
    cycleSeconds: 3.0,
    highlightZones: ['calves'],
    phaseLabels: ['Subida · Ponta dos Pés Máxima', 'Pico · Segurar 1 Segundo', 'Descida · Alongar no Degrau'],
    keyFrames: [
      {
        head: { x: 160, y: 36 },
        shoulder: { x: 160, y: 54 },
        hip: { x: 160, y: 94 },
        elbow: { x: 166, y: 74 },
        hand: { x: 168, y: 96 },
        knee: { x: 160, y: 122 },
        foot: { x: 164, y: 144 },
        knee2: { x: 152, y: 126 },
        foot2: { x: 144, y: 136 },
        barCenter: { x: 168, y: 96 },
      },
      {
        head: { x: 160, y: 24 },
        shoulder: { x: 160, y: 42 },
        hip: { x: 160, y: 82 },
        elbow: { x: 166, y: 62 },
        hand: { x: 168, y: 84 },
        knee: { x: 160, y: 110 },
        foot: { x: 164, y: 134 },
        knee2: { x: 152, y: 114 },
        foot2: { x: 144, y: 124 },
        barCenter: { x: 168, y: 84 },
      },
      {
        head: { x: 160, y: 36 },
        shoulder: { x: 160, y: 54 },
        hip: { x: 160, y: 94 },
        elbow: { x: 166, y: 74 },
        hand: { x: 168, y: 96 },
        knee: { x: 160, y: 122 },
        foot: { x: 164, y: 144 },
        knee2: { x: 152, y: 126 },
        foot2: { x: 144, y: 136 },
        barCenter: { x: 168, y: 96 },
      },
    ],
  },
  plank_taps: {
    equipmentProp: 'none',
    cycleSeconds: 2.8,
    highlightZones: ['core', 'shoulders'],
    phaseLabels: ['Base · Quadril Imóvel', 'Toque · Mão no Ombro Oposto', 'Retorno · Bracing Firme'],
    keyFrames: [
      {
        head: { x: 224, y: 88 },
        shoulder: { x: 206, y: 96 },
        hip: { x: 148, y: 118 },
        elbow: { x: 206, y: 124 },
        hand: { x: 206, y: 150 },
        elbow2: { x: 200, y: 124 },
        hand2: { x: 198, y: 150 },
        knee: { x: 112, y: 134 },
        foot: { x: 80, y: 150 },
      },
      {
        head: { x: 224, y: 88 },
        shoulder: { x: 206, y: 96 },
        hip: { x: 148, y: 118 },
        elbow: { x: 206, y: 124 },
        hand: { x: 206, y: 150 },
        elbow2: { x: 214, y: 114 },
        hand2: { x: 204, y: 98 },
        knee: { x: 112, y: 134 },
        foot: { x: 80, y: 150 },
      },
      {
        head: { x: 224, y: 88 },
        shoulder: { x: 206, y: 96 },
        hip: { x: 148, y: 118 },
        elbow: { x: 206, y: 124 },
        hand: { x: 206, y: 150 },
        elbow2: { x: 200, y: 124 },
        hand2: { x: 198, y: 150 },
        knee: { x: 112, y: 134 },
        foot: { x: 80, y: 150 },
      },
    ],
  },
  lunge: {
    equipmentProp: 'none',
    cycleSeconds: 3.4,
    highlightZones: ['quads', 'glutes'],
    phaseLabels: ['Descida · Ângulos de 90°', 'Base · Tronco Erguido', 'Subida · Retorno Estável'],
    keyFrames: [
      {
        head: { x: 160, y: 34 },
        shoulder: { x: 160, y: 52 },
        hip: { x: 160, y: 94 },
        elbow: { x: 154, y: 74 },
        hand: { x: 160, y: 92 },
        knee: { x: 162, y: 122 },
        foot: { x: 162, y: 150 },
        knee2: { x: 154, y: 122 },
        foot2: { x: 150, y: 150 },
      },
      {
        head: { x: 162, y: 56 },
        shoulder: { x: 160, y: 74 },
        hip: { x: 156, y: 114 },
        elbow: { x: 154, y: 94 },
        hand: { x: 162, y: 108 },
        knee: { x: 188, y: 118 },
        foot: { x: 188, y: 150 },
        knee2: { x: 142, y: 144 },
        foot2: { x: 120, y: 150 },
      },
      {
        head: { x: 160, y: 34 },
        shoulder: { x: 160, y: 52 },
        hip: { x: 160, y: 94 },
        elbow: { x: 154, y: 74 },
        hand: { x: 160, y: 92 },
        knee: { x: 162, y: 122 },
        foot: { x: 162, y: 150 },
        knee2: { x: 154, y: 122 },
        foot2: { x: 150, y: 150 },
      },
    ],
  },
  burpee: {
    equipmentProp: 'none',
    cycleSeconds: 3.0,
    highlightZones: ['core', 'chest', 'quads'],
    phaseLabels: ['Transição · Prancha Firme', 'Extensão · Salto Vertical', 'Aterrissagem · Joelho Suave'],
    keyFrames: [
      {
        head: { x: 160, y: 34 },
        shoulder: { x: 160, y: 52 },
        hip: { x: 158, y: 94 },
        elbow: { x: 162, y: 74 },
        hand: { x: 164, y: 94 },
        knee: { x: 160, y: 122 },
        foot: { x: 158, y: 150 },
      },
      {
        head: { x: 222, y: 92 },
        shoulder: { x: 204, y: 100 },
        hip: { x: 146, y: 120 },
        elbow: { x: 204, y: 126 },
        hand: { x: 204, y: 150 },
        knee: { x: 112, y: 136 },
        foot: { x: 80, y: 150 },
      },
      {
        head: { x: 160, y: 24 },
        shoulder: { x: 160, y: 42 },
        hip: { x: 158, y: 84 },
        elbow: { x: 162, y: 24 },
        hand: { x: 162, y: 10 },
        knee: { x: 160, y: 112 },
        foot: { x: 158, y: 138 },
      },
    ],
  },
  jumping_jack: {
    equipmentProp: 'none',
    cycleSeconds: 1.8,
    highlightZones: ['shoulders', 'calves', 'core'],
    phaseLabels: ['Abertura · Braços Acima', 'Pico · Base Aberta', 'Retorno · Ritmo Constante'],
    keyFrames: [
      {
        head: { x: 160, y: 36 },
        shoulder: { x: 160, y: 54 },
        hip: { x: 160, y: 94 },
        elbow: { x: 150, y: 74 },
        hand: { x: 148, y: 94 },
        elbow2: { x: 170, y: 74 },
        hand2: { x: 172, y: 94 },
        knee: { x: 156, y: 122 },
        foot: { x: 156, y: 150 },
        knee2: { x: 164, y: 122 },
        foot2: { x: 164, y: 150 },
      },
      {
        head: { x: 160, y: 30 },
        shoulder: { x: 160, y: 48 },
        hip: { x: 160, y: 88 },
        elbow: { x: 138, y: 32 },
        hand: { x: 148, y: 16 },
        elbow2: { x: 182, y: 32 },
        hand2: { x: 172, y: 16 },
        knee: { x: 144, y: 118 },
        foot: { x: 136, y: 146 },
        knee2: { x: 176, y: 118 },
        foot2: { x: 184, y: 146 },
      },
      {
        head: { x: 160, y: 36 },
        shoulder: { x: 160, y: 54 },
        hip: { x: 160, y: 94 },
        elbow: { x: 150, y: 74 },
        hand: { x: 148, y: 94 },
        elbow2: { x: 170, y: 74 },
        hand2: { x: 172, y: 94 },
        knee: { x: 156, y: 122 },
        foot: { x: 156, y: 150 },
        knee2: { x: 164, y: 122 },
        foot2: { x: 164, y: 150 },
      },
    ],
  },
  high_knees: {
    equipmentProp: 'none',
    cycleSeconds: 1.6,
    highlightZones: ['quads', 'core', 'calves'],
    phaseLabels: ['Passada · Joelho Esquerdo Alto', 'Troca · Tronco Ereto', 'Passada · Joelho Direito Alto'],
    keyFrames: [
      {
        head: { x: 160, y: 36 },
        shoulder: { x: 160, y: 54 },
        hip: { x: 158, y: 94 },
        elbow: { x: 172, y: 72 },
        hand: { x: 184, y: 66 },
        elbow2: { x: 144, y: 74 },
        hand2: { x: 136, y: 86 },
        knee: { x: 184, y: 96 },
        foot: { x: 184, y: 126 },
        knee2: { x: 156, y: 122 },
        foot2: { x: 154, y: 150 },
      },
      {
        head: { x: 160, y: 32 },
        shoulder: { x: 160, y: 50 },
        hip: { x: 158, y: 90 },
        elbow: { x: 156, y: 72 },
        hand: { x: 162, y: 82 },
        elbow2: { x: 160, y: 72 },
        hand2: { x: 158, y: 82 },
        knee: { x: 166, y: 114 },
        foot: { x: 162, y: 142 },
        knee2: { x: 154, y: 116 },
        foot2: { x: 152, y: 144 },
      },
      {
        head: { x: 160, y: 36 },
        shoulder: { x: 160, y: 54 },
        hip: { x: 158, y: 94 },
        elbow: { x: 144, y: 74 },
        hand: { x: 136, y: 86 },
        elbow2: { x: 172, y: 72 },
        hand2: { x: 184, y: 66 },
        knee: { x: 156, y: 122 },
        foot: { x: 154, y: 150 },
        knee2: { x: 184, y: 96 },
        foot2: { x: 184, y: 126 },
      },
    ],
  },
  superman: {
    equipmentProp: 'none',
    cycleSeconds: 3.4,
    highlightZones: ['back', 'glutes', 'shoulders'],
    phaseLabels: ['Repouso · Corpo Alinhado ao Solo', 'Pico · Extensão Dorsal e Glúteos', 'Descida · Controle Lento'],
    keyFrames: [
      {
        head: { x: 222, y: 142 },
        shoulder: { x: 202, y: 146 },
        hip: { x: 142, y: 148 },
        elbow: { x: 232, y: 146 },
        hand: { x: 262, y: 148 },
        knee: { x: 102, y: 148 },
        foot: { x: 64, y: 150 },
      },
      {
        head: { x: 220, y: 122 },
        shoulder: { x: 200, y: 132 },
        hip: { x: 142, y: 148 },
        elbow: { x: 228, y: 118 },
        hand: { x: 256, y: 106 },
        knee: { x: 102, y: 138 },
        foot: { x: 64, y: 122 },
      },
      {
        head: { x: 222, y: 142 },
        shoulder: { x: 202, y: 146 },
        hip: { x: 142, y: 148 },
        elbow: { x: 232, y: 146 },
        hand: { x: 262, y: 148 },
        knee: { x: 102, y: 148 },
        foot: { x: 64, y: 150 },
      },
    ],
  },
  mobility_crunch: {
    equipmentProp: 'none',
    cycleSeconds: 3.6,
    highlightZones: ['core', 'back', 'shoulders'],
    phaseLabels: ['Inspiração · Extensão Suave', 'Pico · Amplitude Confortável', 'Expiração · Retorno Controlado'],
    keyFrames: [
      {
        head: { x: 212, y: 102 },
        shoulder: { x: 194, y: 108 },
        hip: { x: 134, y: 108 },
        elbow: { x: 194, y: 128 },
        hand: { x: 194, y: 150 },
        knee: { x: 134, y: 146 },
        foot: { x: 106, y: 150 },
      },
      {
        head: { x: 212, y: 114 },
        shoulder: { x: 194, y: 96 },
        hip: { x: 134, y: 98 },
        elbow: { x: 194, y: 124 },
        hand: { x: 194, y: 150 },
        knee: { x: 134, y: 146 },
        foot: { x: 106, y: 150 },
      },
      {
        head: { x: 212, y: 102 },
        shoulder: { x: 194, y: 108 },
        hip: { x: 134, y: 108 },
        elbow: { x: 194, y: 128 },
        hand: { x: 194, y: 150 },
        knee: { x: 134, y: 146 },
        foot: { x: 106, y: 150 },
      },
    ],
  },
};

export function getExerciseMotionSpec(exercise: ExerciseItem): ExerciseMotionSpec {
  const archetype = resolveMotionArchetype(exercise);
  return {
    archetype,
    ...ARCHETYPE_SPECS[archetype],
  };
}
