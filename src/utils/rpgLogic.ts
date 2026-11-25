import type {
  AchievementDefinition,
  AchievementId,
  AutoQuestEvaluation,
  DailyHealthMetric,
  DailyVow,
  EquipmentItem,
  EquipmentRarity,
  EquipmentRarityKey,
  EquipmentSetDefinition,
  EquipmentSetId,
  EquipmentSlot,
  EquippedGear,
  ExerciseInsight,
  ExerciseItem,
  ExercisePrRecord,
  GameStats,
  GearActiveSetStatus,
  GearBonusSummary,
  GearLoadoutPreset,
  HealthActivity,
  HeroClass,
  HeroProfile,
  HrZoneSummary,
  HunterRankDefinition,
  HunterRankLetter,
  HunterRankProgress,
  MurimRealmDefinition,
  MurimRealmProgress,
  PerformedExerciseRecord,
  PerformedSetEntry,
  RecoveryAssessment,
  StagnationAssessment,
  StagnationCandidateWorkout,
  StagnationSignalKind,
  TrainingProgram,
  UserAchievement,
  WeeklyAutoQuestEvaluation,
  WeeklyAutoQuestId,
  WeeklyRaidBossState,
  WeeklyScheduleDay,
  WeeklyTrendPoint,
  WeightLog,
  WorkoutLog,
  WorkoutTemplate,
  WorkoutType,
} from '../types/fitness.ts';
import {
  BASE_HUNTER_RANK,
  DAYS_PER_RANK_BASELINE,
  HUNTER_RANK_TIERS,
  LEVEL_THRESHOLDS,
  MURIM_REALM_TIERS,
  MURIM_XP_CURVE_POINTS,
  THIRTY_DAY_CONSISTENCY_CURVE,
  VALID_WORKOUT_RANKS,
  WEEKLY_PACE_BASELINE_LABEL,
  WEEKLY_WORKOUT_PACE_TARGET,
  calculateHeroRankByXp,
  calculateLevel,
  calculateMurimQiByXp,
  calculateMurimRealmByXp,
  getHunterRankDefinition,
  getHunterRankForLevel,
  getHunterRankStartXp,
  getLevelProgress,
  recalculateHeroProgressionByXp,
} from './progressionCurves.ts';

export {
  BASE_HUNTER_RANK,
  DAYS_PER_RANK_BASELINE,
  HUNTER_RANK_TIERS,
  LEVEL_THRESHOLDS,
  MURIM_REALM_TIERS,
  MURIM_XP_CURVE_POINTS,
  THIRTY_DAY_CONSISTENCY_CURVE,
  VALID_WORKOUT_RANKS,
  WEEKLY_PACE_BASELINE_LABEL,
  WEEKLY_WORKOUT_PACE_TARGET,
  calculateHeroRankByXp,
  calculateLevel,
  calculateMurimQiByXp,
  calculateMurimRealmByXp,
  getHunterRankDefinition,
  getHunterRankForLevel,
  getHunterRankStartXp,
  getLevelProgress,
  recalculateHeroProgressionByXp,
};

export const HUNTER_RANK_HIERARCHY: readonly HunterRankLetter[] = [
  'F',
  'E',
  'D',
  'C',
  'B',
  'A',
  'S',
] as const;

export function isValidHunterRank(value: unknown): value is HunterRankLetter {
  return (
    typeof value === 'string' &&
    (value === 'F' || HUNTER_RANK_HIERARCHY.includes(value as HunterRankLetter))
  );
}

export function normalizeHunterRank(
  value: unknown,
  fallback: HunterRankLetter = BASE_HUNTER_RANK
): HunterRankLetter {
  const safeFallback: HunterRankLetter = isValidHunterRank(fallback)
    ? fallback
    : 'F';

  if (typeof value === 'string') {
    const upper = value.trim().toUpperCase();
    const candidate = upper.startsWith('RANK ')
      ? upper.slice(5).trim()
      : upper;

    if (candidate === 'F' || HUNTER_RANK_HIERARCHY.includes(candidate as HunterRankLetter)) {
      return candidate as HunterRankLetter;
    }
  }

  return safeFallback;
}

export function getHunterRankOrder(rank: unknown): number {
  const safeRank = normalizeHunterRank(rank, 'F');
  return HUNTER_RANK_HIERARCHY.indexOf(safeRank);
}

export function isRankAppropriateForHero(
  workoutRank: unknown,
  heroRank: HunterRankLetter
): boolean {
  return getHunterRankOrder(workoutRank) <= getHunterRankOrder(heroRank) + 1;
}

export function getHunterRankBadgeClass(rank: unknown): string {
  switch (normalizeHunterRank(rank, 'F')) {
    case 'F':
      return 'bg-slate-400/15 border-slate-300/35 text-slate-200';
    case 'E':
      return 'bg-sky-500/15 border-sky-400/35 text-sky-300';
    case 'D':
      return 'bg-emerald-500/15 border-emerald-400/35 text-emerald-300';
    case 'C':
      return 'bg-amber-500/15 border-amber-400/35 text-amber-300';
    case 'B':
      return 'bg-purple-500/15 border-purple-400/35 text-purple-300';
    case 'A':
      return 'bg-rose-500/15 border-rose-400/35 text-rose-300';
    case 'S':
      return 'bg-yellow-500/20 border-yellow-400/45 text-yellow-200';
  }
}

export const HERO_AVATARS: readonly { id: string; emoji: string; label: string }[] = [
  { id: 'blade', emoji: '⚔️', label: 'Lâmina Rubra' },
  { id: 'ranger', emoji: '🏹', label: 'Sentinela' },
  { id: 'arcane', emoji: '🔮', label: 'Arcanista' },
  { id: 'phoenix', emoji: '🔥', label: 'Fênix' },
  { id: 'titan', emoji: '🛡️', label: 'Guardião' },
  { id: 'crown', emoji: '👑', label: 'Soberano' },
];

export const CLASS_CONFIG: Record<
  HeroClass,
  { emoji: string; title: string; specialty: string; quote: string }
> = {
  Guerreiro: {
    emoji: '⚔️',
    title: 'Guerreiro',
    specialty: 'Força Bruta e Resistência',
    quote: 'Cada repetição forja uma armadura inquebrável.',
  },
  Arqueiro: {
    emoji: '🏹',
    title: 'Arqueiro',
    specialty: 'Agilidade, Fôlego e Precisão',
    quote: 'Velocidade e constância vencem qualquer batalha.',
  },
  Mago: {
    emoji: '🔮',
    title: 'Mago',
    specialty: 'Disciplina, Controle e Mobilidade',
    quote: 'O domínio da mente governa a evolução do corpo.',
  },
};

export const WORKOUT_TYPE_LABELS: Record<
  WorkoutType,
  { label: string; emoji: string; colorClass: string }
> = {
  cardio: {
    label: 'Cardio',
    emoji: '🏃',
    colorClass: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
  },
  forca: {
    label: 'Força',
    emoji: '🏋️',
    colorClass: 'bg-orange-500/15 text-orange-300 border-orange-500/30',
  },
  hiit: {
    label: 'HIIT',
    emoji: '⚡',
    colorClass: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  },
  core: {
    label: 'Abdômen',
    emoji: '🛡️',
    colorClass: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  },
  mobilidade: {
    label: 'Mobilidade',
    emoji: '🧘',
    colorClass: 'bg-teal-500/15 text-teal-300 border-teal-500/30',
  },
  corpo_inteiro: {
    label: 'Corpo Inteiro',
    emoji: '🔥',
    colorClass: 'bg-purple-500/15 text-purple-300 border-purple-500/30',
  },
};

export const ACHIEVEMENT_DEFINITIONS: readonly AchievementDefinition[] = [
  {
    id: 'first_blood',
    title: 'Primeiro Sangue',
    description: 'Complete o seu primeiro treino na jornada.',
    icon: '🩸',
    bonusXp: 25,
    targetValue: 1,
    metricLabel: 'treinos totais',
  },
  {
    id: 'week_warrior',
    title: 'Guerreiro da Semana',
    description: 'Mantenha um streak de 7 dias seguidos treinando.',
    icon: '🔥',
    bonusXp: 50,
    targetValue: 7,
    metricLabel: 'dias seguidos',
  },
  {
    id: 'month_master',
    title: 'Mestre do Mês',
    description: 'Alcance um streak lendário de 30 dias seguidos.',
    icon: '👑',
    bonusXp: 150,
    targetValue: 30,
    metricLabel: 'dias seguidos',
  },
  {
    id: 'fat_burner',
    title: 'Queimador de Gordura',
    description: 'Conclua 10 missões de treino do tipo Cardio.',
    icon: '💨',
    bonusXp: 75,
    targetValue: 10,
    metricLabel: 'treinos de cardio',
  },
  {
    id: 'iron_will',
    title: 'Vontade de Ferro',
    description: 'Conclua 10 missões de treino do tipo Força.',
    icon: '⚒️',
    bonusXp: 75,
    targetValue: 10,
    metricLabel: 'treinos de força',
  },
  {
    id: 'veteran',
    title: 'Veterano',
    description: 'Acumule 10 treinos concluídos no total.',
    icon: '🛡️',
    bonusXp: 60,
    targetValue: 10,
    metricLabel: 'treinos totais',
  },
  {
    id: 'elite',
    title: 'Elite',
    description: 'Conquiste a marca de 50 treinos concluídos.',
    icon: '⚔️',
    bonusXp: 200,
    targetValue: 50,
    metricLabel: 'treinos totais',
  },
  {
    id: 'legendary',
    title: 'Lendário',
    description: 'Alcance o Nível 5 e conquiste o título de Mestre.',
    icon: '🌟',
    bonusXp: 0,
    targetValue: 5,
    metricLabel: 'nível alcançado',
  },
  {
    id: 'first_pr',
    title: 'Quebra de Limite',
    description: 'Registre o primeiro Recorde Pessoal (PR) em um exercício.',
    icon: '🏅',
    bonusXp: 40,
    targetValue: 1,
    metricLabel: 'recordes pessoais',
  },
  {
    id: 'pr_collector_10',
    title: 'Mestre da Sobrecarga',
    description: 'Acumule 10 exercícios com Recorde Pessoal registrado.',
    icon: '🏆',
    bonusXp: 120,
    targetValue: 10,
    metricLabel: 'exercícios com PR',
  },
  {
    id: 'weekly_raid_clear',
    title: 'Caçador de Raid',
    description: 'Derrote o Chefe da Raid Semanal acumulando treinos e volume.',
    icon: '💀',
    bonusXp: 100,
    targetValue: 1,
    metricLabel: 'raids vencidas',
  },
];

export const WARRIOR_AWAKENING_WORKOUT_IDS = [
  'w-despertar-guerreiro-a',
  'w-despertar-guerreiro-b',
] as const;

export const WARRIOR_AWAKENING_PROGRAM: TrainingProgram = {
  id: 'despertar-guerreiro-rank-f',
  name: 'Despertar do Guerreiro · Trilha Inicial (A / B)',
  shortLabel: 'Trilha Rank F',
  rankLabel: 'F',
  baseXpPerSession: 120,
  weeklyFrequency: 4,
  equipments: ['Barra 150 cm', 'Barra 50 cm', 'Anilhas 5 kg'],
  workoutAId: 'w-despertar-guerreiro-a',
  workoutBId: 'w-despertar-guerreiro-b',
  trainAButtonLabel: 'Treino A · Pernas/Empurrar',
  trainBButtonLabel: 'Treino B · Puxar/Posterior',
  weeklySchedule: [
    {
      dayIndex: 1,
      dayName: 'Segunda-feira',
      shortDay: 'Seg',
      sessionCode: 'A1',
      focus: 'Treino A · Pernas e empurrar',
      shortFocus: 'Pernas e empurrar',
      workoutId: 'w-despertar-guerreiro-a',
    },
    {
      dayIndex: 2,
      dayName: 'Terça-feira',
      shortDay: 'Ter',
      sessionCode: 'B1',
      focus: 'Treino B · Puxar e posterior',
      shortFocus: 'Puxar e posterior',
      workoutId: 'w-despertar-guerreiro-b',
    },
    {
      dayIndex: 3,
      dayName: 'Quarta-feira',
      shortDay: 'Qua',
      sessionCode: 'DESCANSO',
      focus: 'Recuperação ativa ou descanso',
      shortFocus: 'Descanso',
      workoutId: null,
    },
    {
      dayIndex: 4,
      dayName: 'Quinta-feira',
      shortDay: 'Qui',
      sessionCode: 'A2',
      focus: 'Treino A · Pernas e empurrar',
      shortFocus: 'Pernas e empurrar',
      workoutId: 'w-despertar-guerreiro-a',
    },
    {
      dayIndex: 5,
      dayName: 'Sexta-feira',
      shortDay: 'Sex',
      sessionCode: 'B2',
      focus: 'Treino B · Puxar e posterior',
      shortFocus: 'Puxar e posterior',
      workoutId: 'w-despertar-guerreiro-b',
    },
    {
      dayIndex: 6,
      dayName: 'Sábado',
      shortDay: 'Sáb',
      sessionCode: 'DESCANSO',
      focus: 'Recuperação',
      shortFocus: 'Descanso',
      workoutId: null,
    },
    {
      dayIndex: 0,
      dayName: 'Domingo',
      shortDay: 'Dom',
      sessionCode: 'DESCANSO',
      focus: 'Recuperação',
      shortFocus: 'Descanso',
      workoutId: null,
    },
  ],
};

export const HYBRID_CALISTHENICS_PROGRAM: TrainingProgram = {
  id: 'calistenia-hibrida-upper-lower',
  name: 'Calistenia Híbrida Upper/Lower',
  shortLabel: 'Trilha Intermediária',
  rankLabel: 'B',
  baseXpPerSession: 220,
  weeklyFrequency: 4,
  equipments: [
    'Paralelas de parede',
    'Barra reta 150cm',
    'Barra curta 30cm',
    '4 anilhas de 5kg (20kg total)',
  ],
  workoutAId: 'w-calistenia-upper-a',
  workoutBId: 'w-calistenia-lower-b',
  trainAButtonLabel: 'Treinar A',
  trainBButtonLabel: 'Treinar B',
  weeklySchedule: [
    {
      dayIndex: 1,
      dayName: 'Segunda-feira',
      shortDay: 'Seg',
      sessionCode: 'A1',
      focus: 'Superior (Empurrar, Puxar e Core)',
      shortFocus: 'Superior',
      workoutId: 'w-calistenia-upper-a',
    },
    {
      dayIndex: 2,
      dayName: 'Terça-feira',
      shortDay: 'Ter',
      sessionCode: 'B1',
      focus: 'Inferior (Pernas e Estabilidade)',
      shortFocus: 'Inferior',
      workoutId: 'w-calistenia-lower-b',
    },
    {
      dayIndex: 3,
      dayName: 'Quarta-feira',
      shortDay: 'Qua',
      sessionCode: 'DESCANSO',
      focus: 'Recuperação ativa ou descanso',
      shortFocus: 'Descanso',
      workoutId: null,
    },
    {
      dayIndex: 4,
      dayName: 'Quinta-feira',
      shortDay: 'Qui',
      sessionCode: 'A2',
      focus: 'Superior (Empurrar, Puxar e Core)',
      shortFocus: 'Superior',
      workoutId: 'w-calistenia-upper-a',
    },
    {
      dayIndex: 5,
      dayName: 'Sexta-feira',
      shortDay: 'Sex',
      sessionCode: 'B2',
      focus: 'Inferior (Pernas e Estabilidade)',
      shortFocus: 'Inferior',
      workoutId: 'w-calistenia-lower-b',
    },
    {
      dayIndex: 6,
      dayName: 'Sábado',
      shortDay: 'Sáb',
      sessionCode: 'DESCANSO',
      focus: 'Recuperação',
      shortFocus: 'Descanso',
      workoutId: null,
    },
    {
      dayIndex: 0,
      dayName: 'Domingo',
      shortDay: 'Dom',
      sessionCode: 'DESCANSO',
      focus: 'Recuperação',
      shortFocus: 'Descanso',
      workoutId: null,
    },
  ],
};

export const INITIAL_WORKOUTS: readonly WorkoutTemplate[] = [
  {
    id: 'w-despertar-guerreiro-a',
    name: 'Despertar do Guerreiro — Treino A',
    description:
      'Foco: Pernas e empurrar · Equipamentos: Barra 150 cm, Barra 50 cm e Anilhas 5 kg. Trilha inicial Rank F para construir base de força e estabilidade.',
    type: 'forca',
    difficulty: 'Iniciante',
    durationMinutes: 40,
    baseXp: 120,
    rank: 'F',
    exercises: [
      {
        id: 'ex-dg-a-1',
        name: 'Agachamento goblet',
        prescription: '3 séries x 12 repetições',
        restSeconds: 60,
        muscleGroups: ['Quadríceps', 'Glúteos', 'Core'],
        executionTip:
          'Segure a barra curta verticalmente ou a anilha junto ao peito, desça com joelhos alinhados aos pés e suba empurrando o chão.',
        equipment: 'Barra 50 cm + 2 anilhas de 5 kg',
        loadKg: 10,
        loadNote: 'Sugestão leve (5–10 kg) segurando junto ao peito · Editável',
        unilateral: false,
      },
      {
        id: 'ex-dg-a-2',
        name: 'Flexão inclinada',
        prescription: '3 séries x 8-10 repetições',
        restSeconds: 60,
        muscleGroups: ['Peitoral', 'Tríceps', 'Ombros'],
        executionTip:
          'Apoie as mãos em banco, mesa firme ou parede; mantenha cotovelos a ~45° e tronco alinhado da cabeça aos tornozelos.',
        equipment: 'Peso corporal',
        loadKg: 0,
        loadNote: 'Peso corporal com apoio inclinado para progressão segura',
        unilateral: false,
      },
      {
        id: 'ex-dg-a-3',
        name: 'Desenvolvimento em pé',
        prescription: '3 séries x 8 repetições',
        restSeconds: 60,
        muscleGroups: ['Ombros', 'Tríceps', 'Core'],
        executionTip:
          'Trave abdômen e glúteos para não arquear a lombar; empurre a barra acima da cabeça alinhando orelhas e braços no topo.',
        equipment: 'Barra 150 cm + anilhas de 5 kg',
        loadKg: 10,
        loadNote: 'Carga inicial leve (5–10 kg) · Ajuste conforme conforto nos ombros',
        unilateral: false,
      },
      {
        id: 'ex-dg-a-4',
        name: 'Afundo alternado',
        prescription: '3 séries x 8 por perna',
        restSeconds: 60,
        muscleGroups: ['Quadríceps', 'Glúteos'],
        executionTip:
          'Dê um passo controlado à frente ou atrás até ambos os joelhos formarem ~90° e empurre pelo calcanhar da perna da frente.',
        equipment: 'Barra 50 cm + anilha de 5 kg',
        loadKg: 5,
        loadNote: 'Carga leve (5–10 kg) ou apenas peso corporal · 8 reps por perna',
        unilateral: true,
      },
      {
        id: 'ex-dg-a-5',
        name: 'Prancha',
        prescription: '3 séries x 20-30 s',
        restSeconds: 45,
        muscleGroups: ['Core', 'Ombros'],
        executionTip:
          'Apoie os antebraços abaixo dos ombros, contraia abdômen e glúteos mantendo coluna neutra e respiração contínua.',
        equipment: 'Peso corporal',
        loadKg: 0,
        loadNote: 'Isometria controlada · Foque na estabilidade lombar',
        unilateral: false,
      },
    ],
  },
  {
    id: 'w-despertar-guerreiro-b',
    name: 'Despertar do Guerreiro — Treino B',
    description:
      'Foco: Puxar e posterior · Equipamentos: Barra 150 cm, Barra 50 cm e Anilhas 5 kg. Trilha inicial Rank F para fortalecer costas, posteriores e glúteos.',
    type: 'forca',
    difficulty: 'Iniciante',
    durationMinutes: 40,
    baseXp: 120,
    rank: 'F',
    exercises: [
      {
        id: 'ex-dg-b-1',
        name: 'Levantamento terra romeno',
        prescription: '3 séries x 10 repetições',
        restSeconds: 75,
        muscleGroups: ['Posteriores', 'Glúteos', 'Lombar'],
        executionTip:
          'Com joelhos levemente flexionados, empurre o quadril para trás deslizando a barra rente às coxas até alongar os posteriores.',
        equipment: 'Barra 150 cm + 2 anilhas de 5 kg',
        loadKg: 10,
        loadNote: 'Carga inicial leve (5–10 kg) com coluna neutra e peito aberto',
        unilateral: false,
      },
      {
        id: 'ex-dg-b-2',
        name: 'Remada curvada',
        prescription: '3 séries x 10 repetições',
        restSeconds: 60,
        muscleGroups: ['Costas', 'Bíceps', 'Core'],
        executionTip:
          'Incline o tronco a ~45° com abdômen firme e puxe a barra em direção ao umbigo aproximando as escápulas sem dar tranco.',
        equipment: 'Barra 150 cm + 2 anilhas de 5 kg',
        loadKg: 10,
        loadNote: 'Carga inicial leve (5–10 kg) · Controle a descida',
        unilateral: false,
      },
      {
        id: 'ex-dg-b-3',
        name: 'Ponte de glúteos',
        prescription: '3 séries x 15 repetições',
        restSeconds: 60,
        muscleGroups: ['Glúteos', 'Posteriores'],
        executionTip:
          'Deitado com joelhos flexionados, empurre os calcanhares no chão elevando o quadril até alinhar ombros, quadril e joelhos.',
        equipment: 'Anilha de 5 kg ou Barra 50 cm',
        loadKg: 5,
        loadNote: 'Sugestão de 5–10 kg apoiada no quadril · Pause 1s no topo',
        unilateral: false,
      },
      {
        id: 'ex-dg-b-4',
        name: 'Rosca direta',
        prescription: '3 séries x 10 repetições',
        restSeconds: 45,
        muscleGroups: ['Bíceps', 'Antebraços'],
        executionTip:
          'Fixe os cotovelos junto ao tronco e flexione os braços controladamente evitando balançar a lombar na subida.',
        equipment: 'Barra 150 cm ou Barra 50 cm + anilha 5 kg',
        loadKg: 5,
        loadNote: 'Carga leve (5–10 kg) · Amplitude completa sem impulso',
        unilateral: false,
      },
      {
        id: 'ex-dg-b-5',
        name: 'Superman',
        prescription: '3 séries x 12 repetições',
        restSeconds: 45,
        muscleGroups: ['Lombar', 'Glúteos', 'Ombros'],
        executionTip:
          'Deitado de bruços, eleve suavemente braços e pernas contraindo glúteos e costas por 1s sem estender demais o pescoço.',
        equipment: 'Peso corporal',
        loadKg: 0,
        loadNote: 'Peso corporal no solo · Movimento lento e controlado',
        unilateral: false,
      },
    ],
  },
  {
    id: 'w-cardio-iniciante',
    name: 'Cardio Iniciante: Trilha do Explorador',
    description:
      'Desperte seu sistema cardiovascular com movimentos dinâmicos de baixo impacto para ganhar fôlego e queimar calorias.',
    type: 'cardio',
    difficulty: 'Iniciante',
    durationMinutes: 20,
    baseXp: 110,
    rank: 'E',
    exercises: [
      {
        id: 'ex-ci-1',
        name: 'Marcha Estacionária com Elevação de Joelhos',
        prescription: '3 séries x 45 segundos',
        restSeconds: 30,
        muscleGroups: ['Quadríceps', 'Core', 'Cardiovascular'],
        executionTip:
          'Mantenha o tronco ereto, contraia o abdômen e coordene o balanço natural dos braços.',
      },
      {
        id: 'ex-ci-2',
        name: 'Polichinelo Controlado (Step Jack)',
        prescription: '3 séries x 40 segundos',
        restSeconds: 30,
        muscleGroups: ['Ombros', 'Panturrilhas', 'Cardiovascular'],
        executionTip:
          'Aterrisse suavemente na ponta dos pés e mantenha os ombros longe das orelhas.',
      },
      {
        id: 'ex-ci-3',
        name: 'Deslocamento Lateral com Toque no Joelho',
        prescription: '3 séries x 45 segundos',
        restSeconds: 30,
        muscleGroups: ['Glúteos', 'Adutores', 'Cardiovascular'],
        executionTip:
          'Dê dois passos largos para cada lado mantendo os joelhos levemente flexionados.',
      },
      {
        id: 'ex-ci-4',
        name: 'Corrida Leve no Lugar (Trote)',
        prescription: '3 séries x 60 segundos',
        restSeconds: 40,
        muscleGroups: ['Pernas', 'Panturrilhas', 'Cardiovascular'],
        executionTip:
          'Mantenha uma respiração ritmada pelo nariz e boca sem tensionar o pescoço.',
      },
    ],
  },
  {
    id: 'w-forca-iniciante',
    name: 'Força Iniciante: Forja do Escudeiro',
    description:
      'Construa base muscular sólida dominando os padrões fundamentais de empurrar, agachar e estabilizar.',
    type: 'forca',
    difficulty: 'Iniciante',
    durationMinutes: 25,
    baseXp: 125,
    rank: 'E',
    exercises: [
      {
        id: 'ex-fi-1',
        name: 'Agachamento Livre Peso Corporal',
        prescription: '3 séries x 12 repetições',
        restSeconds: 45,
        muscleGroups: ['Quadríceps', 'Glúteos', 'Posteriores'],
        executionTip:
          'Empurre o quadril para trás como se fosse sentar em uma cadeira, mantendo os calcanhares firmes no chão.',
      },
      {
        id: 'ex-fi-2',
        name: 'Flexão de Braços Inclinada ou com Joelhos',
        prescription: '3 séries x 10 repetições',
        restSeconds: 45,
        muscleGroups: ['Peitoral', 'Tríceps', 'Deltoide Anterior'],
        executionTip:
          'Mantenha o corpo alinhado da cabeça ao quadril e desça o peito controladamente.',
      },
      {
        id: 'ex-fi-3',
        name: 'Ponte de Glúteos no Solo',
        prescription: '3 séries x 15 repetições',
        restSeconds: 40,
        muscleGroups: ['Glúteos', 'Posteriores de Coxa', 'Lombar'],
        executionTip:
          'Contraia fortemente os glúteos no topo do movimento por 1 segundo sem hiperestender a lombar.',
      },
      {
        id: 'ex-fi-4',
        name: 'Remada Curvada Isométrica / Superman',
        prescription: '3 séries x 12 repetições',
        restSeconds: 45,
        muscleGroups: ['Dorsais', 'Trapézio', 'Eretores da Espinha'],
        executionTip:
          'Puxe os cotovelos para trás fechando as escápulas e olhe para o chão para alinhar a cervical.',
      },
    ],
  },
  {
    id: 'w-hiit-intermediario',
    name: 'HIIT Intermediário: Fúria do Relâmpago',
    description:
      'Rajadas curtas de alta intensidade para acelerar o metabolismo e elevar sua capacidade anaeróbica ao limite.',
    type: 'hiit',
    difficulty: 'Intermediário',
    durationMinutes: 25,
    baseXp: 165,
    rank: 'C',
    exercises: [
      {
        id: 'ex-hi-1',
        name: 'Burpee Sem Flexão (Sprawl Explosivo)',
        prescription: '4 séries x 35 segundos',
        restSeconds: 25,
        muscleGroups: ['Corpo Inteiro', 'Core', 'Cardiovascular'],
        executionTip:
          'Estenda as pernas para trás em prancha firme, sem deixar o quadril cair, e salte com energia.',
      },
      {
        id: 'ex-hi-2',
        name: 'Escalador Rápido (Mountain Climber)',
        prescription: '4 séries x 40 segundos',
        restSeconds: 20,
        muscleGroups: ['Abdômen', 'Ombros', 'Flexores de Quadril'],
        executionTip:
          'Mantenha as mãos exatamente abaixo dos ombros e traga os joelhos em direção ao peito em ritmo veloz.',
      },
      {
        id: 'ex-hi-3',
        name: 'Agachamento com Salto',
        prescription: '4 séries x 12 repetições',
        restSeconds: 30,
        muscleGroups: ['Quadríceps', 'Glúteos', 'Panturrilhas'],
        executionTip:
          'Amorteça cada queda flexionando imediatamente os joelhos para proteger as articulações.',
      },
      {
        id: 'ex-hi-4',
        name: 'Corrida Alta (High Knees)',
        prescription: '4 séries x 35 segundos',
        restSeconds: 25,
        muscleGroups: ['Core', 'Quadríceps', 'Cardiovascular'],
        executionTip:
          'Eleve os joelhos até a linha do quadril mantendo a postura firme e olhar à frente.',
      },
    ],
  },
  {
    id: 'w-abdomen',
    name: 'Abdômen: Muralha de Aço',
    description:
      'Fortaleça o núcleo do seu herói para estabilidade total, postura blindada e resistência central.',
    type: 'core',
    difficulty: 'Intermediário',
    durationMinutes: 20,
    baseXp: 135,
    rank: 'D',
    exercises: [
      {
        id: 'ex-ab-1',
        name: 'Prancha Isométrica Frontal',
        prescription: '3 séries x 45 segundos',
        restSeconds: 30,
        muscleGroups: ['Transverso do Abdômen', 'Reto Abdominal', 'Ombros'],
        executionTip:
          'Empurre os antebraços contra o chão, contraia glúteos e abdômen como se esperasse um impacto.',
      },
      {
        id: 'ex-ab-2',
        name: 'Abdominal Bicicleta Controlado',
        prescription: '3 séries x 20 repetições (10/lado)',
        restSeconds: 35,
        muscleGroups: ['Oblíquos', 'Reto Abdominal'],
        executionTip:
          'Gire o tronco levando o ombro em direção ao joelho oposto sem puxar o pescoço com as mãos.',
      },
      {
        id: 'ex-ab-3',
        name: 'Elevação de Pernas Deitado',
        prescription: '3 séries x 12 repetições',
        restSeconds: 40,
        muscleGroups: ['Infra-abdominal', 'Flexores de Quadril'],
        executionTip:
          'Mantenha a lombar colada no colchonete durante toda a descida das pernas.',
      },
      {
        id: 'ex-ab-4',
        name: 'Prancha Lateral Alternada',
        prescription: '3 séries x 30 segundos por lado',
        restSeconds: 30,
        muscleGroups: ['Oblíquos', 'Quadrado Lombar', 'Glúteo Médio'],
        executionTip:
          'Mantenha o quadril elevado formando uma linha reta dos pés até a cabeça.',
      },
    ],
  },
  {
    id: 'w-pernas',
    name: 'Pernas: Passos do Titã',
    description:
      'Desenvolva potência, equilíbrio e força nos membros inferiores para sustentar qualquer missão.',
    type: 'forca',
    difficulty: 'Intermediário',
    durationMinutes: 35,
    baseXp: 180,
    rank: 'C',
    exercises: [
      {
        id: 'ex-pe-1',
        name: 'Afundo Alternado (Lunge)',
        prescription: '4 séries x 10 repetições por perna',
        restSeconds: 50,
        muscleGroups: ['Quadríceps', 'Glúteos', 'Posteriores'],
        executionTip:
          'Dê um passo firme e desça até ambos os joelhos formarem ângulos próximos a 90 graus.',
      },
      {
        id: 'ex-pe-2',
        name: 'Agachamento Sumô com Pausa',
        prescription: '4 séries x 14 repetições',
        restSeconds: 50,
        muscleGroups: ['Adutores', 'Glúteos', 'Quadríceps'],
        executionTip:
          'Afaste bem os pés com pontas levemente para fora e segure 2 segundos no ponto mais baixo.',
      },
      {
        id: 'ex-pe-3',
        name: 'Agachamento Búlgaro (Pé Elevado)',
        prescription: '3 séries x 10 repetições por perna',
        restSeconds: 60,
        muscleGroups: ['Quadríceps', 'Glúteo Máximo', 'Estabilizadores'],
        executionTip:
          'Concentre 80% do peso na perna da frente e mantenha o tronco levemente inclinado à frente.',
      },
      {
        id: 'ex-pe-4',
        name: 'Elevação de Panturrilha Unilateral',
        prescription: '4 séries x 15 repetições por perna',
        restSeconds: 30,
        muscleGroups: ['Gastrocnêmio', 'Sóleo'],
        executionTip:
          'Suba o máximo possível na ponta dos pés e desça lentamente em 3 segundos.',
      },
    ],
  },
  {
    id: 'w-bracos-ombros',
    name: 'Braços e Ombros: Punhos de Trovão',
    description:
      'Esculpa força superior e resistência muscular com foco em peitoral, ombros, bíceps e tríceps.',
    type: 'forca',
    difficulty: 'Intermediário',
    durationMinutes: 30,
    baseXp: 170,
    rank: 'C',
    exercises: [
      {
        id: 'ex-bo-1',
        name: 'Flexão de Braços Tradicional',
        prescription: '4 séries x 12 repetições',
        restSeconds: 50,
        muscleGroups: ['Peitoral', 'Tríceps', 'Ombros'],
        executionTip:
          'Posicione os cotovelos a cerca de 45 graus do tronco para proteger os ombros e maximizar a força.',
      },
      {
        id: 'ex-bo-2',
        name: 'Flexão Pike (Foco em Ombros)',
        prescription: '3 séries x 10 repetições',
        restSeconds: 50,
        muscleGroups: ['Deltoides', 'Tríceps', 'Trapézio Superior'],
        executionTip:
          'Eleve o quadril formando um V invertido e leve o topo da cabeça em direção ao chão entre as mãos.',
      },
      {
        id: 'ex-bo-3',
        name: 'Mergulho no Banco ou Cadeira (Tríceps)',
        prescription: '3 séries x 14 repetições',
        restSeconds: 45,
        muscleGroups: ['Tríceps Braquial', 'Deltoide Anterior'],
        executionTip:
          'Mantenha as costas próximas à borda do apoio e evite deixar os ombros subirem.',
      },
      {
        id: 'ex-bo-4',
        name: 'Prancha Toca-Ombros (Shoulder Taps)',
        prescription: '3 séries x 20 toques alternados',
        restSeconds: 40,
        muscleGroups: ['Ombros', 'Core', 'Serrátil'],
        executionTip:
          'Afaste levemente os pés para evitar que o quadril balance ao tirar uma das mãos do solo.',
      },
    ],
  },
  {
    id: 'w-mobilidade',
    name: 'Mobilidade: Ritual de Restauração',
    description:
      'Recupere a amplitude articular, alivie tensões acumuladas e previna lesões com fluidez e controle.',
    type: 'mobilidade',
    difficulty: 'Iniciante',
    durationMinutes: 15,
    baseXp: 95,
    rank: 'E',
    exercises: [
      {
        id: 'ex-mo-1',
        name: 'Gato-Camelo (Mobilidade Torácica e Lombar)',
        prescription: '3 séries x 10 ciclos lentos',
        restSeconds: 20,
        muscleGroups: ['Coluna Vertebral', 'Core', 'Ombros'],
        executionTip:
          'Inspire arqueando suavemente a coluna e expire arredondando as costas vértebra por vértebra.',
      },
      {
        id: 'ex-mo-2',
        name: 'Maior Alongamento do Mundo',
        prescription: '3 séries x 6 repetições por lado',
        restSeconds: 25,
        muscleGroups: ['Quadril', 'Coluna Torácica', 'Posteriores'],
        executionTip:
          'Avance um pé ao lado da mão, desça o cotovelo ao solo e depois gire o braço abrindo o peito para o teto.',
      },
      {
        id: 'ex-mo-3',
        name: 'Agachamento Profundo com Rotação',
        prescription: '3 séries x 30 segundos',
        restSeconds: 25,
        muscleGroups: ['Tornozelos', 'Quadril', 'Torácica'],
        executionTip:
          'Use os cotovelos para empurrar suavemente os joelhos para fora enquanto respira fundo.',
      },
      {
        id: 'ex-mo-4',
        name: 'Postura da Criança com Alcance Lateral',
        prescription: '2 séries x 30 segundos por lado',
        restSeconds: 20,
        muscleGroups: ['Dorsais', 'Ombros', 'Lombar'],
        executionTip:
          'Sente sobre os calcanhares e caminhe com as mãos para a diagonal sentindo o alongamento lateral.',
      },
    ],
  },
  {
    id: 'w-corpo-inteiro',
    name: 'Corpo Inteiro: Ascensão do Soberano',
    description:
      'Uma masmorra completa de alta exigência que testa força, fôlego e determinação de todo o corpo.',
    type: 'corpo_inteiro',
    difficulty: 'Avançado',
    durationMinutes: 40,
    baseXp: 240,
    rank: 'S',
    exercises: [
      {
        id: 'ex-ci-adv-1',
        name: 'Burpee Completo com Salto Vertical',
        prescription: '4 séries x 12 repetições',
        restSeconds: 45,
        muscleGroups: ['Corpo Inteiro', 'Peitoral', 'Quadríceps'],
        executionTip:
          'Toque o peito no solo com controle, suba em bloco único e salte estendendo os braços acima da cabeça.',
      },
      {
        id: 'ex-ci-adv-2',
        name: 'Flexão Arqueiro (Archer Push-Up)',
        prescription: '4 séries x 8 repetições (4/lado)',
        restSeconds: 60,
        muscleGroups: ['Peitoral', 'Tríceps', 'Ombros', 'Core'],
        executionTip:
          'Mantenha um braço estendido lateralmente enquanto o outro realiza o trabalho principal de flexão.',
      },
      {
        id: 'ex-ci-adv-3',
        name: 'Agachamento Pistol Assistido ou Salto Lunge',
        prescription: '4 séries x 12 repetições alternadas',
        restSeconds: 50,
        muscleGroups: ['Quadríceps', 'Glúteos', 'Equilíbrio'],
        executionTip:
          'Mantenha o tronco vertical e controle a descida sem deixar o joelho colapsar para dentro.',
      },
      {
        id: 'ex-ci-adv-4',
        name: 'Prancha Comando (Sobe e Desce)',
        prescription: '4 séries x 12 repetições',
        restSeconds: 45,
        muscleGroups: ['Core', 'Tríceps', 'Ombros'],
        executionTip:
          'Alterne o braço que inicia a subida a cada série mantendo o quadril o mais estável possível.',
      },
      {
        id: 'ex-ci-adv-5',
        name: 'Sprint Estacionário Final (All-Out)',
        prescription: '4 séries x 30 segundos',
        restSeconds: 30,
        muscleGroups: ['Cardiovascular', 'Pernas', 'Core'],
        executionTip:
          'Dê sua velocidade máxima nos últimos 30 segundos mantendo a técnica limpa.',
      },
    ],
  },
  {
    id: 'w-calistenia-upper-a',
    name: 'Calistenia Híbrida — Dia A: Superior',
    description:
      'Empurrar, puxar e estabilizar o core combinando paralelas de parede com cargas progressivas em barra e anilhas.',
    type: 'forca',
    difficulty: 'Intermediário',
    durationMinutes: 45,
    baseXp: 220,
    rank: 'B',
    exercises: [
      {
        id: 'ex-ch-a-1',
        name: 'Paralelas (Dips)',
        prescription: '4 séries x 6-12 repetições',
        restSeconds: 90,
        muscleGroups: ['Peito', 'Tríceps', 'Ombros'],
        executionTip:
          'Peso corporal (adicione anilhas na mochila para progredir). Desça com controle até os ombros alinharem com os cotovelos.',
        equipment: 'Paralelas de parede',
        loadKg: 0,
        loadNote: 'Peso corporal (adicione anilhas na mochila para progredir)',
        unilateral: false,
      },
      {
        id: 'ex-ch-a-2',
        name: 'Remada Curvada',
        prescription: '4 séries x 10-12 repetições',
        restSeconds: 90,
        muscleGroups: ['Costas', 'Bíceps', 'Core'],
        executionTip:
          'Carga das anilhas (somar peso da barra). Mantenha a coluna neutra e puxe a barra em direção ao abdômen fechando as escápulas.',
        equipment: 'Barra 150cm + 4 anilhas de 5kg',
        loadKg: 20,
        loadNote: 'Carga das anilhas (somar peso da barra)',
        unilateral: false,
      },
      {
        id: 'ex-ch-a-3',
        name: 'Flexão de Braço (Declinada ou Padrão)',
        prescription: '3 séries x 10-15 repetições',
        restSeconds: 60,
        muscleGroups: ['Peito', 'Ombros', 'Tríceps'],
        executionTip:
          'Eleve os pés para aumentar a dificuldade. Mantenha glúteos e abdômen firmes em linha reta.',
        equipment: 'Peso corporal',
        loadKg: 0,
        loadNote: 'Eleve os pés para aumentar a dificuldade',
        unilateral: false,
      },
      {
        id: 'ex-ch-a-4',
        name: 'Desenvolvimento Militar (Overhead Press)',
        prescription: '3 séries x 8-12 repetições',
        restSeconds: 90,
        muscleGroups: ['Ombros', 'Tríceps', 'Core'],
        executionTip:
          'Carga das anilhas (somar peso da barra). Trave o abdômen para não hiperestender a lombar ao empurrar acima da cabeça.',
        equipment: 'Barra 150cm + 2 anilhas de 5kg',
        loadKg: 10,
        loadNote: 'Carga das anilhas (somar peso da barra)',
        unilateral: false,
      },
      {
        id: 'ex-ch-a-5',
        name: 'Remada Unilateral (Serrote)',
        prescription: '3 séries x 10-12 repetições',
        restSeconds: 60,
        muscleGroups: ['Costas', 'Bíceps'],
        executionTip:
          '10kg a 15kg em anilhas. Evite girar o tronco; puxe o cotovelo próximo ao corpo com pausa breve no topo.',
        equipment: 'Barra 30cm + 2 a 3 anilhas de 5kg',
        loadKg: 15,
        loadNote: '10kg a 15kg em anilhas',
        unilateral: true,
      },
      {
        id: 'ex-ch-a-6',
        name: 'Rosca Direta + Tríceps Testa (Bi-set)',
        prescription: '3 séries x 10-12 cada',
        restSeconds: 60,
        muscleGroups: ['Bíceps', 'Tríceps'],
        executionTip:
          'Executar um exercício imediatamente após o outro, mantendo os cotovelos fixos durante toda a amplitude.',
        equipment: 'Barra 150cm + 2 anilhas de 5kg',
        loadKg: 10,
        loadNote: 'Executar um exercício imediatamente após o outro',
        unilateral: false,
      },
      {
        id: 'ex-ch-a-7',
        name: 'Elevação de Pernas / L-Sit Hold',
        prescription: '3 séries x 10-15 repetições',
        restSeconds: 60,
        muscleGroups: ['Core'],
        executionTip:
          '10-15 reps ou isometria de 15-30s. Empurre os ombros para baixo nas paralelas evitando balançar o tronco.',
        equipment: 'Paralelas de parede',
        loadKg: 0,
        loadNote: '10-15 reps ou isometria de 15-30s',
        unilateral: false,
      },
    ],
  },
  {
    id: 'w-calistenia-lower-b',
    name: 'Calistenia Híbrida — Dia B: Inferior',
    description:
      'Força de pernas, cadeia posterior, estabilidade unilateral e core anti-rotação com barras e anilhas.',
    type: 'forca',
    difficulty: 'Intermediário',
    durationMinutes: 40,
    baseXp: 220,
    rank: 'B',
    exercises: [
      {
        id: 'ex-ch-b-1',
        name: 'Agachamento Búlgaro',
        prescription: '4 séries x 8-12 repetições',
        restSeconds: 90,
        muscleGroups: ['Quadríceps', 'Glúteos'],
        executionTip:
          '10kg a 20kg em anilhas segurando à frente (Goblet) ou ao lado. Desça controlando o alinhamento do joelho.',
        equipment: 'Barra 30cm + 2 a 4 anilhas de 5kg',
        loadKg: 15,
        loadNote: '10kg a 20kg em anilhas segurando à frente (Goblet) ou ao lado',
        unilateral: true,
      },
      {
        id: 'ex-ch-b-2',
        name: 'Levantamento Terra Romeno (Stiff)',
        prescription: '4 séries x 10-15 repetições',
        restSeconds: 90,
        muscleGroups: ['Posteriores', 'Glúteos', 'Core'],
        executionTip:
          'Carga das anilhas (somar peso da barra). Empurre o quadril para trás mantendo a barra rente às coxas e coluna firme.',
        equipment: 'Barra 150cm + 4 anilhas de 5kg',
        loadKg: 20,
        loadNote: 'Carga das anilhas (somar peso da barra)',
        unilateral: false,
      },
      {
        id: 'ex-ch-b-3',
        name: 'Agachamento Frontal (Front Squat)',
        prescription: '3 séries x 10-15 repetições',
        restSeconds: 90,
        muscleGroups: ['Quadríceps', 'Glúteos', 'Core'],
        executionTip:
          'Barra apoiada nos deltoides anteriores. Mantenha os cotovelos apontados para frente e o tronco vertical.',
        equipment: 'Barra 150cm + 4 anilhas de 5kg',
        loadKg: 20,
        loadNote: 'Barra apoiada nos deltoides anteriores',
        unilateral: false,
      },
      {
        id: 'ex-ch-b-4',
        name: 'Elevação Pélvica Unilateral',
        prescription: '3 séries x 12-15 repetições',
        restSeconds: 60,
        muscleGroups: ['Glúteos', 'Posteriores'],
        executionTip:
          'Anilhas apoiadas diretamente no quadril. Estenda totalmente o quadril segurando 1s no topo sem arquear a lombar.',
        equipment: '1 ou 2 anilhas de 5kg',
        loadKg: 10,
        loadNote: 'Anilhas apoiadas diretamente no quadril',
        unilateral: true,
      },
      {
        id: 'ex-ch-b-5',
        name: 'Panturrilha em Pé Unilateral',
        prescription: '4 séries x 15-20 repetições',
        restSeconds: 45,
        muscleGroups: ['Panturrilhas'],
        executionTip:
          'Usar degrau para maior amplitude. Pause 1s em alongamento máximo no fundo antes de subir.',
        equipment: 'Barra 30cm + 2 anilhas de 5kg',
        loadKg: 10,
        loadNote: 'Usar degrau para maior amplitude',
        unilateral: true,
      },
      {
        id: 'ex-ch-b-6',
        name: 'Prancha Abdominal com Toque no Ombro',
        prescription: '3 séries x 40-60s',
        restSeconds: 45,
        muscleGroups: ['Core'],
        executionTip:
          'Manter o quadril estável durante a troca de mãos; afaste levemente os pés para maior base.',
        equipment: 'Peso corporal',
        loadKg: 0,
        loadNote: 'Manter o quadril estável durante a troca de mãos',
        unilateral: false,
      },
    ],
  },
];

export function getLocalDateKey(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function diffInCalendarDays(fromDateKey: string, toDateKey: string): number {
  const [fy, fm, fd] = fromDateKey.split('-').map(Number);
  const [ty, tm, td] = toDateKey.split('-').map(Number);
  const fromDate = new Date(fy, (fm || 1) - 1, fd || 1, 12, 0, 0);
  const toDate = new Date(ty, (tm || 1) - 1, td || 1, 12, 0, 0);
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round((toDate.getTime() - fromDate.getTime()) / msPerDay);
}

export function calculateMurimQiPoints(
  stats: Pick<
    GameStats,
    | 'totalWorkouts'
    | 'bossesDefeated'
    | 'currentStreak'
    | 'longestStreak'
    | 'totalMinutes'
    | 'lastWorkoutDate'
  > &
    Partial<Pick<GameStats, 'totalXp'>>,
  referenceDateKey: string = getLocalDateKey()
): {
  qiPoints: number;
  breakdown: {
    fromWorkouts: number;
    fromBosses: number;
    fromStreak: number;
    fromMinutes: number;
    fromXp: number;
  };
} {
  const effectiveStreak = getEffectiveCurrentStreak(
    stats.currentStreak,
    stats.lastWorkoutDate,
    referenceDateKey
  );
  const fromWorkouts = Math.max(0, Math.floor(stats.totalWorkouts)) * 25;
  const fromBosses = Math.max(0, Math.floor(stats.bossesDefeated ?? 0)) * 45;
  const fromStreak =
    Math.max(0, Math.floor(stats.longestStreak)) * 15 + effectiveStreak * 10;
  const fromMinutes = Math.floor(Math.max(0, stats.totalMinutes) / 10);
  const fromXp = calculateMurimQiByXp(stats.totalXp ?? 0);
  const activityQi = fromWorkouts + fromBosses + fromStreak + fromMinutes;
  const qiPoints = Math.max(activityQi, fromXp);

  return {
    qiPoints,
    breakdown: {
      fromWorkouts,
      fromBosses,
      fromStreak,
      fromMinutes,
      fromXp,
    },
  };
}

export function getMurimRealmProgress(
  stats: Pick<
    GameStats,
    | 'totalWorkouts'
    | 'bossesDefeated'
    | 'currentStreak'
    | 'longestStreak'
    | 'totalMinutes'
    | 'lastWorkoutDate'
  > &
    Partial<Pick<GameStats, 'totalXp'>>,
  referenceDateKey: string = getLocalDateKey()
): MurimRealmProgress {
  const { qiPoints, breakdown } = calculateMurimQiPoints(stats, referenceDateKey);
  let currentIndex = 0;
  for (let i = MURIM_REALM_TIERS.length - 1; i >= 0; i--) {
    if (qiPoints >= MURIM_REALM_TIERS[i].minQi) {
      currentIndex = i;
      break;
    }
  }
  const current = MURIM_REALM_TIERS[currentIndex];
  const next =
    currentIndex < MURIM_REALM_TIERS.length - 1
      ? MURIM_REALM_TIERS[currentIndex + 1]
      : null;

  if (!next) {
    return {
      qiPoints,
      current,
      next: null,
      qiIntoRealm: qiPoints - current.minQi,
      qiNeededForNext: 0,
      estimatedDaysToNextRealm: 0,
      progressPercent: 100,
      isMaxRealm: true,
      breakdown,
    };
  }

  const span = Math.max(1, next.minQi - current.minQi);
  const qiIntoRealm = Math.max(0, qiPoints - current.minQi);
  const qiNeededForNext = Math.max(0, next.minQi - qiPoints);
  const estimatedDaysToNextRealm =
    qiNeededForNext === 0
      ? 0
      : Math.max(
          1,
          Math.ceil((qiNeededForNext / span) * DAYS_PER_RANK_BASELINE)
        );
  const progressPercent = Math.min(100, Math.max(0, Math.round((qiIntoRealm / span) * 100)));

  return {
    qiPoints,
    current,
    next,
    qiIntoRealm,
    qiNeededForNext,
    estimatedDaysToNextRealm,
    progressPercent,
    isMaxRealm: false,
    breakdown,
  };
}

export function getDualProgressionStatus(
  stats: GameStats,
  referenceDateKey: string = getLocalDateKey()
): { hunter: HunterRankProgress; murim: MurimRealmProgress } {
  const level = calculateLevel(stats.totalXp);
  return {
    hunter: getHunterRankForLevel(level, stats.totalXp),
    murim: getMurimRealmProgress(stats, referenceDateKey),
  };
}

export function calculateProportionalXp(
  baseXp: number,
  completedExercises: number,
  totalExercises: number,
  xpBonusPercent: number = 0
): number {
  if (baseXp <= 0 || totalExercises <= 0 || completedExercises <= 0) {
    return 0;
  }
  const clampedCompleted = Math.min(totalExercises, Math.max(0, completedExercises));
  const multiplier = 1 + Math.max(0, xpBonusPercent) / 100;
  return Math.round(baseXp * (clampedCompleted / totalExercises) * multiplier);
}

export function getEffectiveCurrentStreak(
  storedStreak: number,
  lastWorkoutDate: string | null,
  todayKey: string = getLocalDateKey()
): number {
  if (!lastWorkoutDate || storedStreak <= 0) {
    return 0;
  }
  const diff = diffInCalendarDays(lastWorkoutDate, todayKey);
  if (diff <= 1) {
    return storedStreak;
  }
  return 0;
}

export function calculateNextStreak(
  currentStreak: number,
  longestStreak: number,
  lastWorkoutDate: string | null,
  todayKey: string = getLocalDateKey()
): { currentStreak: number; longestStreak: number } {
  if (!lastWorkoutDate) {
    return {
      currentStreak: 1,
      longestStreak: Math.max(longestStreak, 1),
    };
  }

  const diff = diffInCalendarDays(lastWorkoutDate, todayKey);

  if (diff <= 0) {
    const maintained = Math.max(1, currentStreak);
    return {
      currentStreak: maintained,
      longestStreak: Math.max(longestStreak, maintained),
    };
  }

  if (diff === 1) {
    const incremented = Math.max(0, currentStreak) + 1;
    return {
      currentStreak: incremented,
      longestStreak: Math.max(longestStreak, incremented),
    };
  }

  return {
    currentStreak: 1,
    longestStreak: Math.max(longestStreak, 1),
  };
}

export function evaluateAchievements(
  stats: GameStats,
  existingMap: Partial<Record<AchievementId, UserAchievement>>,
  nowIso: string = new Date().toISOString(),
  extra?: { prCountTotal?: number; weeklyRaidDefeated?: boolean }
): {
  updatedAchievements: UserAchievement[];
  newlyUnlocked: AchievementDefinition[];
  bonusXpTotal: number;
} {
  const effectiveStreak = Math.max(stats.currentStreak, stats.longestStreak);
  const prCountTotal = Math.max(0, extra?.prCountTotal ?? 0);
  const weeklyRaidDefeated = Boolean(extra?.weeklyRaidDefeated);

  const checkCondition = (id: AchievementId): boolean => {
    switch (id) {
      case 'first_blood':
        return stats.totalWorkouts >= 1;
      case 'week_warrior':
        return effectiveStreak >= 7;
      case 'month_master':
        return effectiveStreak >= 30;
      case 'fat_burner':
        return stats.cardioWorkouts >= 10;
      case 'iron_will':
        return stats.forcaWorkouts >= 10;
      case 'veteran':
        return stats.totalWorkouts >= 10;
      case 'elite':
        return stats.totalWorkouts >= 50;
      case 'legendary':
        return stats.level >= 5;
      case 'first_pr':
        return prCountTotal >= 1;
      case 'pr_collector_10':
        return prCountTotal >= 10;
      case 'weekly_raid_clear':
        return weeklyRaidDefeated;
    }
  };

  const updatedAchievements: UserAchievement[] = [];
  const newlyUnlocked: AchievementDefinition[] = [];
  let bonusXpTotal = 0;

  for (const def of ACHIEVEMENT_DEFINITIONS) {
    const prev = existingMap[def.id];
    const alreadyUnlocked = Boolean(prev?.unlocked);
    const meetsCriteria = checkCondition(def.id);

    if (alreadyUnlocked) {
      updatedAchievements.push({
        id: def.id,
        userId: stats.userId,
        unlocked: true,
        unlockedAt: prev?.unlockedAt ?? nowIso,
      });
    } else if (meetsCriteria) {
      updatedAchievements.push({
        id: def.id,
        userId: stats.userId,
        unlocked: true,
        unlockedAt: nowIso,
      });
      newlyUnlocked.push(def);
      bonusXpTotal += def.bonusXp;
    } else {
      updatedAchievements.push({
        id: def.id,
        userId: stats.userId,
        unlocked: false,
        unlockedAt: null,
      });
    }
  }

  return { updatedAchievements, newlyUnlocked, bonusXpTotal };
}

export function getAchievementCurrentProgress(
  id: AchievementId,
  stats: GameStats,
  extra?: { prCountTotal?: number; weeklyRaidDefeated?: boolean }
): number {
  const bestStreak = Math.max(
    getEffectiveCurrentStreak(stats.currentStreak, stats.lastWorkoutDate),
    stats.longestStreak
  );
  switch (id) {
    case 'first_blood':
    case 'veteran':
    case 'elite':
      return stats.totalWorkouts;
    case 'week_warrior':
    case 'month_master':
      return bestStreak;
    case 'fat_burner':
      return stats.cardioWorkouts;
    case 'iron_will':
      return stats.forcaWorkouts;
    case 'legendary':
      return stats.level;
    case 'first_pr':
    case 'pr_collector_10':
      return Math.max(0, extra?.prCountTotal ?? 0);
    case 'weekly_raid_clear':
      return extra?.weeklyRaidDefeated ? 1 : 0;
  }
}

export function calculateDerivedAttributes(
  stats: GameStats,
  heroClass: HeroClass
): {
  forca: number;
  resistencia: number;
  agilidade: number;
  disciplina: number;
} {
  const classBonus = {
    forca: heroClass === 'Guerreiro' ? 6 : 0,
    resistencia: heroClass === 'Guerreiro' ? 3 : heroClass === 'Arqueiro' ? 3 : 0,
    agilidade: heroClass === 'Arqueiro' ? 6 : 0,
    disciplina: heroClass === 'Mago' ? 8 : 0,
  };

  const clampStat = (val: number): number => Math.min(100, Math.max(10, Math.round(val)));

  const forca = clampStat(
    10 +
      classBonus.forca +
      stats.forcaWorkouts * 5 +
      stats.corpoInteiroWorkouts * 4 +
      stats.level * 2
  );

  const resistencia = clampStat(
    10 +
      classBonus.resistencia +
      stats.cardioWorkouts * 4 +
      stats.hiitWorkouts * 3 +
      Math.floor(stats.totalMinutes / 20)
  );

  const agilidade = clampStat(
    10 +
      classBonus.agilidade +
      stats.hiitWorkouts * 5 +
      stats.mobilidadeWorkouts * 4 +
      stats.cardioWorkouts * 2
  );

  const effectiveStreak = getEffectiveCurrentStreak(
    stats.currentStreak,
    stats.lastWorkoutDate
  );

  const disciplina = clampStat(
    10 +
      classBonus.disciplina +
      effectiveStreak * 3 +
      stats.longestStreak * 2 +
      stats.totalWorkouts * 2
  );

  return { forca, resistencia, agilidade, disciplina };
}

export const DEFAULT_EQUIPPED_GEAR: EquippedGear = {
  elmo: 'elmo_couro_novato',
  armadura: null,
  capa: null,
  arma: 'arma_bastao_treino',
};

export const MAX_TOTAL_XP = 10_000_000;
export const MAX_GOLD_COINS = 10_000_000;
export const MAX_TOTAL_COINS_EARNED = 100_000_000;
export const MAX_HUNTER_HP = 100;
export const MAX_BOSSES_DEFEATED = 100_000;
export const MAX_OWNED_EQUIPMENT_IDS = 64;
export const MAX_CLAIMED_AUTO_QUEST_KEYS = 90;
export const MAX_HR_SAMPLE_POINTS = 60;
export const MAX_IMPORT_ACTIVITIES_PER_ROUND = 200;

export const DEFAULT_OWNED_EQUIPMENT_IDS: readonly string[] = [
  'elmo_couro_novato',
  'arma_bastao_treino',
];

export function createInitialGameStats(userId: string): GameStats {
  return {
    userId,
    totalXp: 0,
    level: 1,
    hunterHp: 100,
    goldCoins: 50,
    totalCoinsEarned: 50,
    bossesDefeated: 0,
    ownedEquipmentIds: [...DEFAULT_OWNED_EQUIPMENT_IDS],
    equippedGear: { ...DEFAULT_EQUIPPED_GEAR },
    gearLoadouts: [],
    claimedAutoQuestKeys: [],
    currentStreak: 0,
    longestStreak: 0,
    lastWorkoutDate: null,
    totalWorkouts: 0,
    totalMinutes: 0,
    cardioWorkouts: 0,
    forcaWorkouts: 0,
    hiitWorkouts: 0,
    coreWorkouts: 0,
    mobilidadeWorkouts: 0,
    corpoInteiroWorkouts: 0,
    updatedAt: new Date().toISOString(),
  };
}

export function applyVowCompletion(
  currentXp: number,
  currentHp: number,
  xpReward: number = 15,
  hpRecovery: number = 5
): { newXp: number; newHp: number; newLevel: number } {
  const newXp = Math.max(0, Math.floor(currentXp + xpReward));
  const newHp = Math.min(100, Math.max(0, Math.round(currentHp + hpRecovery)));
  return {
    newXp,
    newHp,
    newLevel: calculateLevel(newXp),
  };
}

export function applyHabitPenalty(
  currentXp: number,
  currentHp: number,
  penaltyXp: number = 15,
  hpLoss: number = 15
): { newXp: number; newHp: number; newLevel: number } {
  const newXp = Math.max(0, Math.floor(currentXp - penaltyXp));
  const newHp = Math.min(100, Math.max(10, Math.round(currentHp - hpLoss)));
  return {
    newXp,
    newHp,
    newLevel: calculateLevel(newXp),
  };
}

export function isVowResolvedToday(vow: DailyVow, todayKey: string): boolean {
  return vow.completedDateKey === todayKey || vow.violatedDateKey === todayKey;
}

// ============================================================================
// TELEMETRIA DE SAÚDE, ZONAS CARDÍACAS E RECUPERAÇÃO
// ============================================================================

export function computeZoneMinutesFromHrStream(
  hrValues: number[],
  durationMinutes: number,
  maxHr: number = 190
): [number, number, number, number, number] {
  if (hrValues.length === 0 || durationMinutes <= 0) {
    return [0, 0, 0, 0, 0];
  }
  const counts = [0, 0, 0, 0, 0];
  for (const hr of hrValues) {
    const pct = hr / maxHr;
    if (pct < 0.6) counts[0] += 1;
    else if (pct < 0.7) counts[1] += 1;
    else if (pct < 0.8) counts[2] += 1;
    else if (pct < 0.9) counts[3] += 1;
    else counts[4] += 1;
  }
  const total = counts.reduce((a, b) => a + b, 0);
  if (total === 0) return [durationMinutes, 0, 0, 0, 0];
  return [
    Math.round((counts[0] / total) * durationMinutes),
    Math.round((counts[1] / total) * durationMinutes),
    Math.round((counts[2] / total) * durationMinutes),
    Math.round((counts[3] / total) * durationMinutes),
    Math.round((counts[4] / total) * durationMinutes),
  ];
}

export function estimateZoneMinutesFromAvgHr(
  avgHr: number | null,
  durationMinutes: number,
  maxHr: number = 190
): [number, number, number, number, number] {
  if (durationMinutes <= 0) return [0, 0, 0, 0, 0];
  if (!avgHr) {
    return [0, Math.round(durationMinutes * 0.65), Math.round(durationMinutes * 0.35), 0, 0];
  }
  const ratio = avgHr / maxHr;
  if (ratio < 0.6) return [durationMinutes, 0, 0, 0, 0];
  if (ratio < 0.7) {
    return [Math.round(durationMinutes * 0.2), Math.round(durationMinutes * 0.8), 0, 0, 0];
  }
  if (ratio < 0.8) {
    return [0, Math.round(durationMinutes * 0.25), Math.round(durationMinutes * 0.65), Math.round(durationMinutes * 0.1), 0];
  }
  if (ratio < 0.9) {
    return [0, 0, Math.round(durationMinutes * 0.3), Math.round(durationMinutes * 0.6), Math.round(durationMinutes * 0.1)];
  }
  return [0, 0, 0, Math.round(durationMinutes * 0.35), Math.round(durationMinutes * 0.65)];
}

export function downsampleArray(values: number[], maxPoints: number = 40): number[] {
  if (values.length <= maxPoints) return values.map((v) => Math.round(v));
  const out: number[] = [];
  const step = values.length / maxPoints;
  for (let i = 0; i < maxPoints; i++) {
    const idx = Math.min(values.length - 1, Math.floor(i * step));
    out.push(Math.round(values[idx]));
  }
  return out;
}

export function calculateActivityXp(
  durationMinutes: number,
  distanceKm: number,
  sportType: string
): number {
  const lower = sportType.toLowerCase();
  const multiplier =
    lower.includes('run') || lower.includes('corrida')
      ? 1.25
      : lower.includes('hiit') || lower.includes('cross')
      ? 1.3
      : lower.includes('walk') || lower.includes('caminhada') || lower.includes('yoga')
      ? 0.85
      : 1.0;

  return Math.min(500, Math.max(15, Math.round((durationMinutes * 3 + distanceKm * 6) * multiplier)));
}

export function mapSportToWorkoutType(sportType: string): WorkoutType {
  const s = sportType.toLowerCase();
  if (s.includes('strength') || s.includes('weight') || s.includes('força') || s.includes('muscul')) {
    return 'forca';
  }
  if (s.includes('hiit') || s.includes('interval') || s.includes('crossfit')) {
    return 'hiit';
  }
  if (s.includes('yoga') || s.includes('pilates') || s.includes('stretch') || s.includes('mobil')) {
    return 'mobilidade';
  }
  if (s.includes('core') || s.includes('abdom')) {
    return 'core';
  }
  if (s.includes('run') || s.includes('ride') || s.includes('swim') || s.includes('walk') || s.includes('cycl') || s.includes('cardio')) {
    return 'cardio';
  }
  return 'corpo_inteiro';
}

export function buildZoneTotals(
  activities: HealthActivity[],
  logs: WorkoutLog[],
  maxHr: number = 190
): HrZoneSummary[] {
  const totals: [number, number, number, number, number] = [0, 0, 0, 0, 0];

  for (const act of activities) {
    for (let i = 0; i < 5; i++) {
      totals[i] += act.zoneMinutes?.[i] ?? 0;
    }
  }

  for (const log of logs) {
    const m = log.durationMinutes;
    if (log.workoutType === 'mobilidade') {
      totals[0] += m;
    } else if (log.workoutType === 'cardio') {
      totals[1] += Math.round(m * 0.55);
      totals[2] += Math.round(m * 0.45);
    } else if (log.workoutType === 'hiit') {
      totals[2] += Math.round(m * 0.25);
      totals[3] += Math.round(m * 0.5);
      totals[4] += Math.round(m * 0.25);
    } else {
      totals[1] += Math.round(m * 0.4);
      totals[2] += Math.round(m * 0.45);
      totals[3] += Math.round(m * 0.15);
    }
  }

  const grandTotal = totals.reduce((a, b) => a + b, 0);

  const meta: Array<{
    zone: 1 | 2 | 3 | 4 | 5;
    label: string;
    minPct: number;
    maxPct: number;
    colorClass: string;
    barHex: string;
    benefit: string;
  }> = [
    {
      zone: 1,
      label: 'Z1 · Recuperação',
      minPct: 0.5,
      maxPct: 0.6,
      colorClass: 'text-sky-300',
      barHex: '#38BDF8',
      benefit: 'Circulação ativa e regeneração',
    },
    {
      zone: 2,
      label: 'Z2 · Base Aeróbica',
      minPct: 0.6,
      maxPct: 0.7,
      colorClass: 'text-emerald-300',
      barHex: '#10B981',
      benefit: 'Eficiência mitocondrial e resistência',
    },
    {
      zone: 3,
      label: 'Z3 · Ritmo / Tempo',
      minPct: 0.7,
      maxPct: 0.8,
      colorClass: 'text-amber-300',
      barHex: '#FBBF24',
      benefit: 'Capacidade cardiovascular sustentada',
    },
    {
      zone: 4,
      label: 'Z4 · Limiar Anaeróbico',
      minPct: 0.8,
      maxPct: 0.9,
      colorClass: 'text-orange-300',
      barHex: '#F97316',
      benefit: 'Tolerância ao lactato e velocidade',
    },
    {
      zone: 5,
      label: 'Z5 · Esforço Máximo',
      minPct: 0.9,
      maxPct: 1.0,
      colorClass: 'text-red-300',
      barHex: '#EF4444',
      benefit: 'Pico VO2máx e potência neuromuscular',
    },
  ];

  return meta.map((item, idx) => {
    const minutes = totals[idx];
    const percentage = grandTotal > 0 ? Math.round((minutes / grandTotal) * 100) : 0;
    const minBpm = Math.round(maxHr * item.minPct);
    const maxBpm = Math.round(maxHr * item.maxPct);
    return {
      zone: item.zone,
      label: item.label,
      rangeLabel: `${minBpm}–${maxBpm} bpm`,
      minutes,
      percentage,
      colorClass: item.colorClass,
      barHex: item.barHex,
      benefit: item.benefit,
    };
  });
}

export function buildWeeklyTrends(
  logs: WorkoutLog[],
  activities: HealthActivity[],
  dailyMetrics: DailyHealthMetric[],
  periodDays: 7 | 28 | 90,
  now: Date = new Date()
): WeeklyTrendPoint[] {
  const numWeeks = Math.ceil(periodDays / 7);
  const points: WeeklyTrendPoint[] = [];

  for (let w = numWeeks - 1; w >= 0; w--) {
    const endDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() - w * 7);
    const firstDayOffset = Math.min(periodDays - 1, w * 7 + 6);
    const startDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() - firstDayOffset);
    const startKey = getLocalDateKey(startDay);
    const endKey = getLocalDateKey(endDay);

    const weekLogs = logs.filter((l) => l.dateKey >= startKey && l.dateKey <= endKey);
    const weekActs = activities.filter((a) => a.dateKey >= startKey && a.dateKey <= endKey);
    const weekMetrics = dailyMetrics.filter((m) => m.dateKey >= startKey && m.dateKey <= endKey);

    const totalMinutes =
      weekLogs.reduce((acc, l) => acc + l.durationMinutes, 0) +
      weekActs.reduce((acc, a) => acc + a.durationMinutes, 0);

    const distanceKm = Number(
      weekActs.reduce((acc, a) => acc + a.distanceKm, 0).toFixed(1)
    );

    const calories =
      weekActs.reduce((acc, a) => acc + a.calories, 0) +
      weekLogs.reduce((acc, l) => acc + l.durationMinutes * 7, 0);

    const xpEarned =
      weekLogs.reduce((acc, l) => acc + l.xpEarned + l.bonusXpEarned, 0) +
      weekActs.reduce((acc, a) => acc + a.xpAwarded, 0);

    const stepsAvg =
      weekMetrics.length > 0
        ? Math.round(
            weekMetrics.reduce((acc, m) => acc + m.steps, 0) / weekMetrics.length
          )
        : 0;

    const totalVolumeKg = Number(
      weekLogs.reduce((acc, l) => acc + (l.totalVolumeKg ?? 0), 0).toFixed(1)
    );

    const labelDay = `${String(startDay.getDate()).padStart(2, '0')}/${String(
      startDay.getMonth() + 1
    ).padStart(2, '0')}`;

    points.push({
      weekLabel: labelDay,
      startDateKey: startKey,
      totalMinutes,
      distanceKm,
      stepsAvg,
      calories,
      sessionsCount: weekLogs.length + weekActs.length,
      xpEarned,
      totalVolumeKg,
    });
  }

  return points;
}

export function computeRecoveryAssessment(
  logs: WorkoutLog[],
  activities: HealthActivity[],
  dailyMetrics: DailyHealthMetric[],
  stats: GameStats,
  baselineRestingHr: number = 60,
  todayKey: string = getLocalDateKey()
): RecoveryAssessment {

  const calcLoadForSession = (
    durationMinutes: number,
    zoneMinutes?: [number, number, number, number, number]
  ): number => {
    if (!zoneMinutes?.some((minutes) => minutes > 0)) return durationMinutes * 2;
    return (
      zoneMinutes[0] * 1 +
      zoneMinutes[1] * 2 +
      zoneMinutes[2] * 3 +
      zoneMinutes[3] * 4 +
      zoneMinutes[4] * 5
    );
  };

  let acuteLoad7d = 0;
  let chronicLoad28d = 0;

  for (const log of logs) {
    const daysAgo = diffInCalendarDays(log.dateKey, todayKey);
    if (daysAgo >= 0 && daysAgo < 28) {
      const load = calcLoadForSession(log.durationMinutes);
      chronicLoad28d += load;
      if (daysAgo < 7) acuteLoad7d += load;
    }
  }

  for (const act of activities) {
    const daysAgo = diffInCalendarDays(act.dateKey, todayKey);
    if (daysAgo >= 0 && daysAgo < 28) {
      const load = calcLoadForSession(act.durationMinutes, act.zoneMinutes);
      chronicLoad28d += load;
      if (daysAgo < 7) acuteLoad7d += load;
    }
  }

  const chronicWeeklyAvg28d = Math.round(chronicLoad28d / 4);
  const acwrRatio =
    chronicWeeklyAvg28d > 0
      ? Number((acuteLoad7d / chronicWeeklyAvg28d).toFixed(2))
      : acuteLoad7d > 0
      ? 1.0
      : 0.8;

  const recentMetrics = [...dailyMetrics]
    .filter((m) => diffInCalendarDays(m.dateKey, todayKey) >= 0 && diffInCalendarDays(m.dateKey, todayKey) < 7)
    .sort((a, b) => b.dateKey.localeCompare(a.dateKey));

  const sleepSamples = recentMetrics.filter((m) => m.sleepHours > 0);
  const avgSleepHours =
    sleepSamples.length > 0
      ? Number(
          (
            sleepSamples.reduce((acc, m) => acc + m.sleepHours, 0) / sleepSamples.length
          ).toFixed(1)
        )
      : null;

  const rhrSamples = recentMetrics.filter((m) => m.restingHeartRate !== null && m.restingHeartRate > 0);
  const latestRestingHr = rhrSamples.length > 0 ? rhrSamples[0].restingHeartRate : null;

  const hrvSamples = recentMetrics.filter((m) => m.hrvMs !== null && m.hrvMs > 0);
  const avgHrvMs =
    hrvSamples.length > 0
      ? Math.round(hrvSamples.reduce((acc, m) => acc + (m.hrvMs ?? 0), 0) / hrvSamples.length)
      : null;

  let score = stats.hunterHp ?? 85;

  if (acwrRatio > 1.5) score -= 22;
  else if (acwrRatio > 1.3) score -= 12;
  else if (acwrRatio >= 0.8 && acwrRatio <= 1.25) score += 6;

  if (avgSleepHours !== null) {
    if (avgSleepHours >= 7.5) score += 8;
    else if (avgSleepHours < 6) score -= 15;
    else if (avgSleepHours < 7) score -= 6;
  }

  if (latestRestingHr !== null) {
    const deltaRhr = latestRestingHr - baselineRestingHr;
    if (deltaRhr >= 6) score -= 12;
    else if (deltaRhr <= -2) score += 5;
  }

  score = Math.min(100, Math.max(15, Math.round(score)));

  let statusLabel: RecoveryAssessment['statusLabel'] = 'Ótima';
  let recommendation =
    'Prontidão elevada! Você pode realizar treinos de Força ou HIIT (Zonas 3–5) com boa margem de recuperação.';

  if (score < 45 || acwrRatio > 1.5) {
    statusLabel = 'Sobrecarga';
    recommendation =
      'Carga aguda elevada ou recuperação baixa. Priorize hoje Mobilidade, caminhada leve em Zona 1 e sono reparador.';
  } else if (score < 68 || acwrRatio > 1.3) {
    statusLabel = 'Atenção';
    recommendation =
      'Sinais moderados de fadiga acumulada. Prefira sessões técnicas ou cardio aeróbico leve em Zona 2.';
  } else if (score < 82) {
    statusLabel = 'Moderada';
    recommendation =
      'Bom equilíbrio entre esforço e descanso. Mantenha volume controlado entre Zonas 2 e 4.';
  }

  return {
    score,
    statusLabel,
    acwrRatio,
    acuteLoad7d,
    chronicWeeklyAvg28d,
    avgSleepHours,
    latestRestingHr,
    avgHrvMs,
    recommendation,
  };
}

// ============================================================================
// DETECÇÃO DE ESTAGNAÇÃO DE DESEMPENHO (WORKOUT LOGS)
// ============================================================================

export function detectWorkoutStagnation(
  logs: WorkoutLog[],
  workouts: WorkoutTemplate[],
  referenceDate: Date = new Date()
): StagnationAssessment {
  const buildEmpty = (
    recentSessionsCount: number = 0,
    avgCompletionPercent: number = 0,
    daysSinceLastSession: number | null = null
  ): StagnationAssessment => ({
    isStagnant: false,
    signalKind: 'none',
    reason: '',
    recentSessionsCount,
    avgCompletionPercent,
    daysSinceLastSession,
    candidateWorkouts: [],
  });

  if (!logs || logs.length < 2) {
    return buildEmpty(logs?.length ?? 0, 100, null);
  }

  const sortedLogs = [...logs].sort((a, b) => {
    const timeDiff =
      new Date(b.completedAt || b.dateKey).getTime() -
      new Date(a.completedAt || a.dateKey).getTime();
    if (Number.isFinite(timeDiff) && timeDiff !== 0) return timeDiff;
    return b.dateKey.localeCompare(a.dateKey);
  });

  const todayKey = getLocalDateKey(referenceDate);
  const daysSinceLastSession = Math.max(
    0,
    diffInCalendarDays(sortedLogs[0].dateKey, todayKey)
  );

  const recent21Days = sortedLogs.filter(
    (log) => diffInCalendarDays(log.dateKey, todayKey) <= 21
  );
  const inspectionLogs = (recent21Days.length >= 2 ? recent21Days : sortedLogs).slice(0, 6);

  const completionRatios = inspectionLogs.map((l) =>
    l.totalExercises > 0 ? Math.min(1, Math.max(0, l.completedExercises / l.totalExercises)) : 1
  );
  const avgCompletionPercent = Math.round(
    (completionRatios.reduce((acc, v) => acc + v, 0) / Math.max(1, completionRatios.length)) * 100
  );

  const lastFourLogs = inspectionLogs.slice(0, 4);
  const incompleteInLastFour = lastFourLogs.filter(
    (l) => l.totalExercises > 0 && l.completedExercises < l.totalExercises
  ).length;

  const recentCountByWorkout = new Map<string, { count: number; ratios: number[] }>();
  for (const log of inspectionLogs) {
    const entry = recentCountByWorkout.get(log.workoutId) ?? { count: 0, ratios: [] };
    entry.count += 1;
    entry.ratios.push(
      log.totalExercises > 0 ? Math.min(1, log.completedExercises / log.totalExercises) : 1
    );
    recentCountByWorkout.set(log.workoutId, entry);
  }

  const candidateWorkouts: StagnationCandidateWorkout[] = [];
  for (const workout of workouts) {
    const loadExercises = workout.exercises.filter(
      (ex) => typeof ex.loadKg === 'number' || workout.type === 'forca'
    );
    if (loadExercises.length === 0) continue;

    const stats = recentCountByWorkout.get(workout.id);
    const wAvgCompletion = stats
      ? Math.round(
          (stats.ratios.reduce((a, b) => a + b, 0) / Math.max(1, stats.ratios.length)) * 100
        )
      : avgCompletionPercent;

    candidateWorkouts.push({
      workoutId: workout.id,
      workoutName: workout.name,
      recentCount: stats?.count ?? 0,
      avgCompletionPercent: wAvgCompletion,
      exercises: loadExercises.map((ex) => ({
        exerciseId: ex.id,
        name: ex.name,
        equipment: ex.equipment,
        currentLoadKg: typeof ex.loadKg === 'number' ? ex.loadKg : 0,
        prescription: ex.prescription,
        unilateral: ex.unilateral,
        loadNote: ex.loadNote,
      })),
    });
  }
  candidateWorkouts.sort((a, b) => b.recentCount - a.recentCount);

  if (candidateWorkouts.length === 0) {
    return buildEmpty(inspectionLogs.length, avgCompletionPercent, daysSinceLastSession);
  }

  let signalKind: StagnationSignalKind = 'none';
  let reason = '';

  if (avgCompletionPercent < 85 || incompleteInLastFour >= 2) {
    signalKind = 'repeated_incomplete';
    reason = `Média de ${avgCompletionPercent}% dos exercícios concluídos nas últimas ${lastFourLogs.length} sessões — possível fadiga ou sobrecarga.`;
  } else if (daysSinceLastSession >= 5) {
    signalKind = 'frequency_drop';
    reason = `Faz ${daysSinceLastSession} dias desde o último treino registrado — ajuste conservador de retorno recomendado.`;
  } else if (inspectionLogs.length >= 3) {
    const plateauWindow = inspectionLogs.slice(0, 4);
    const xpValues = plateauWindow.map((l) => l.xpEarned);
    const maxXp = Math.max(...xpValues);
    const minXp = Math.min(...xpValues);
    const hasRepeatedWorkout = Array.from(recentCountByWorkout.values()).some((s) => s.count >= 2);
    const durations = plateauWindow.map((l) => l.durationMinutes);
    const durationSpread = Math.max(...durations) - Math.min(...durations);

    if (maxXp - minXp <= 15 && (hasRepeatedWorkout || durationSpread <= 5)) {
      signalKind = 'stalled_xp';
      reason = `Últimas ${plateauWindow.length} sessões mantiveram estímulo plano (~${Math.round(
        xpValues.reduce((a, b) => a + b, 0) / plateauWindow.length
      )} XP) com ${avgCompletionPercent}% de conclusão — momento ideal para progressão de carga.`;
    }
  }

  if (signalKind === 'none') {
    return buildEmpty(inspectionLogs.length, avgCompletionPercent, daysSinceLastSession);
  }

  return {
    isStagnant: true,
    signalKind,
    reason,
    recentSessionsCount: inspectionLogs.length,
    avgCompletionPercent,
    daysSinceLastSession,
    candidateWorkouts,
  };
}

export { getFriendlyErrorMessage } from './errors.ts';

export function formatSecondsMMSS(totalSeconds: number): string {
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function formatBrazilianDate(isoOrDateKey: string): string {
  const datePart = isoOrDateKey.includes('T')
    ? isoOrDateKey.split('T')[0]
    : isoOrDateKey;
  const [y, m, d] = datePart.split('-');
  if (!y || !m || !d) return isoOrDateKey;
  return `${d}/${m}/${y}`;
}

export function computeBmiSummary(
  heightCm?: number | null,
  weightKg?: number | null
): { bmi: number; label: string } | null {
  if (
    typeof heightCm !== 'number' ||
    typeof weightKg !== 'number' ||
    !Number.isFinite(heightCm) ||
    !Number.isFinite(weightKg) ||
    heightCm < 100 ||
    heightCm > 250 ||
    weightKg < 25 ||
    weightKg > 350
  ) {
    return null;
  }
  const heightM = heightCm / 100;
  const bmi = Number((weightKg / (heightM * heightM)).toFixed(1));
  let label = 'Peso adequado';
  if (bmi < 18.5) label = 'Abaixo do peso';
  else if (bmi < 25) label = 'Peso adequado';
  else if (bmi < 30) label = 'Sobrepeso';
  else if (bmi < 35) label = 'Obesidade Grau I';
  else if (bmi < 40) label = 'Obesidade Grau II';
  else label = 'Obesidade Grau III';
  return { bmi, label };
}

// ============================================================================
// ARSENAL, MOEDAS DE OURO, CHEFES DE TREINO & MISSÕES AUTO-CHECK
// ============================================================================

export const ARSENAL_CONFIG = {
  maxPresets: 4,
  slots: [
    { id: 'elmo' as EquipmentSlot, nome: 'Elmo', icone: 'Crown' as const },
    { id: 'armadura' as EquipmentSlot, nome: 'Armadura', icone: 'Shield' as const },
    { id: 'capa' as EquipmentSlot, nome: 'Capa', icone: 'Wind' as const },
    { id: 'arma' as EquipmentSlot, nome: 'Arma', icone: 'Sword' as const },
  ],
  raridades: {
    comum: { nome: 'Comum' as EquipmentRarity, cor: '#9ca3af', multiplicador_aura: 1.0 },
    raro: { nome: 'Raro' as EquipmentRarity, cor: '#3b82f6', multiplicador_aura: 1.25 },
    epico: { nome: 'Épico' as EquipmentRarity, cor: '#a855f7', multiplicador_aura: 1.5 },
    lendario: { nome: 'Lendário' as EquipmentRarity, cor: '#f59e0b', multiplicador_aura: 2.0 },
  },
} as const;

export const EQUIPMENT_SETS: readonly EquipmentSetDefinition[] = [
  {
    id: 'viajante',
    name: 'Conjunto do Viajante',
    themeColorHex: '#fbbf24',
    description: 'Peças de treino e couro para os primeiros portais.',
    twoPieceBonus: {
      xpBonusPercent: 2,
      coinBonusPercent: 3,
      bossDamageBonusPercent: 2,
      label: '+2% XP · +3% Moedas · +2% Chefe',
    },
    fourPieceBonus: {
      xpBonusPercent: 6,
      coinBonusPercent: 8,
      bossDamageBonusPercent: 5,
      label: '+6% XP · +8% Moedas · +5% Chefe',
    },
  },
  {
    id: 'guarda_aco',
    name: 'Conjunto da Guarda de Aço',
    themeColorHex: '#a5b4fc',
    description: 'A bandana de Murim e a placa reforçada aumentam o dano contra chefes.',
    twoPieceBonus: {
      xpBonusPercent: 3,
      coinBonusPercent: 2,
      bossDamageBonusPercent: 9,
      label: '+3% XP · +2% Moedas · +9% Chefe',
    },
  },
  {
    id: 'presa_carmesim',
    name: 'Conjunto Presa Carmesim',
    themeColorHex: '#ef4444',
    description: 'Dano em Chefes e Força Bruta.',
    twoPieceBonus: {
      xpBonusPercent: 4,
      coinBonusPercent: 4,
      bossDamageBonusPercent: 12,
      label: '+4% XP · +4% Moedas · +12% Chefe',
    },
    fourPieceBonus: {
      xpBonusPercent: 10,
      coinBonusPercent: 8,
      bossDamageBonusPercent: 28,
      label: '+10% XP · +8% Moedas · +28% Chefe',
    },
  },
  {
    id: 'manto_mercador',
    name: 'Conjunto do Mercador Sombrio',
    themeColorHex: '#eab308',
    description: 'Farm de Moedas e Recompensas.',
    twoPieceBonus: {
      xpBonusPercent: 3,
      coinBonusPercent: 12,
      bossDamageBonusPercent: 2,
      label: '+3% XP · +12% Moedas · +2% Chefe',
    },
    fourPieceBonus: {
      xpBonusPercent: 8,
      coinBonusPercent: 30,
      bossDamageBonusPercent: 6,
      label: '+8% XP · +30% Moedas · +6% Chefe',
    },
  },
  {
    id: 'sabio_abissal',
    name: 'Conjunto do Sábio Abissal',
    themeColorHex: '#38bdf8',
    description: 'Aceleração de XP e Evolução Rápida.',
    twoPieceBonus: {
      xpBonusPercent: 12,
      coinBonusPercent: 3,
      bossDamageBonusPercent: 3,
      label: '+12% XP · +3% Moedas · +3% Chefe',
    },
    fourPieceBonus: {
      xpBonusPercent: 28,
      coinBonusPercent: 8,
      bossDamageBonusPercent: 8,
      label: '+28% XP · +8% Moedas · +8% Chefe',
    },
  },
  {
    id: 'monarca_eternidade',
    name: 'Conjunto do Monarca da Eternidade',
    themeColorHex: '#f97316',
    description: 'Híbrido Supremo End-Game.',
    twoPieceBonus: {
      xpBonusPercent: 8,
      coinBonusPercent: 8,
      bossDamageBonusPercent: 10,
      label: '+8% XP · +8% Moedas · +10% Chefe',
    },
    fourPieceBonus: {
      xpBonusPercent: 20,
      coinBonusPercent: 20,
      bossDamageBonusPercent: 25,
      label: '+20% XP · +20% Moedas · +25% Chefe',
    },
  },
  {
    id: 'familia_jin',
    name: 'Conjunto da Família Jin de Taiyuan',
    themeColorHex: '#64748b',
    description: 'Fundamentos de Murim: Disciplina Inicial e Ganho de XP.',
    twoPieceBonus: {
      xpBonusPercent: 5,
      coinBonusPercent: 4,
      bossDamageBonusPercent: 3,
      label: '+5% XP · +4% Moedas · +3% Chefe',
    },
    fourPieceBonus: {
      xpBonusPercent: 14,
      coinBonusPercent: 10,
      bossDamageBonusPercent: 8,
      label: '+14% XP · +10% Moedas · +8% Chefe',
    },
  },
  {
    id: 'seita_rei_fogo',
    name: 'Conjunto da Seita do Rei do Fogo',
    themeColorHex: '#f97316',
    description: 'Chama do Sul e Poder Destrutivo contra Chefes.',
    twoPieceBonus: {
      xpBonusPercent: 6,
      coinBonusPercent: 5,
      bossDamageBonusPercent: 14,
      label: '+6% XP · +5% Moedas · +14% Chefe',
    },
    fourPieceBonus: {
      xpBonusPercent: 16,
      coinBonusPercent: 12,
      bossDamageBonusPercent: 32,
      label: '+16% XP · +12% Moedas · +32% Chefe',
    },
  },
  {
    id: 'associacao_cacadores',
    name: 'Conjunto Força-Tarefa da Associação',
    themeColorHex: '#3b82f6',
    description: 'Equipamento Tático de Incursão do Mundo Real.',
    twoPieceBonus: {
      xpBonusPercent: 5,
      coinBonusPercent: 9,
      bossDamageBonusPercent: 6,
      label: '+5% XP · +9% Moedas · +6% Chefe',
    },
    fourPieceBonus: {
      xpBonusPercent: 14,
      coinBonusPercent: 24,
      bossDamageBonusPercent: 16,
      label: '+14% XP · +24% Moedas · +16% Chefe',
    },
  },
  {
    id: 'espada_invisivel',
    name: 'Conjunto da Espada Invisível',
    themeColorHex: '#06b6d4',
    description: 'Ápice do Qi em Murim: Vida e Morte.',
    twoPieceBonus: {
      xpBonusPercent: 11,
      coinBonusPercent: 8,
      bossDamageBonusPercent: 12,
      label: '+11% XP · +8% Moedas · +12% Chefe',
    },
    fourPieceBonus: {
      xpBonusPercent: 26,
      coinBonusPercent: 20,
      bossDamageBonusPercent: 30,
      label: '+26% XP · +20% Moedas · +30% Chefe',
    },
  },
];

function formatReqLabel(
  tipo: EquipmentItem['requirement']['tipo'],
  valor: number,
  custoMoedas: number
): string {
  const coinText = custoMoedas > 0 ? `${custoMoedas.toLocaleString('pt-BR')} Moedas` : 'Gratuito';
  switch (tipo) {
    case 'inicial':
      return custoMoedas > 0 ? coinText : 'Equipamento inicial';
    case 'moedas_acumuladas':
      return `${valor.toLocaleString('pt-BR')} Moedas acumuladas · ${coinText}`;
    case 'streak_dias':
      return `Streak ${valor} dias · ${coinText}`;
    case 'chefes_derrotados':
      return `Derrotar ${valor} Chefes · ${coinText}`;
    case 'nivel':
      return `Nível ${valor} · ${coinText}`;
    case 'treinos_concluidos':
      return `${valor} treinos concluídos · ${coinText}`;
    case 'rank_cacador': {
      const targetTier =
        HUNTER_RANK_TIERS[Math.max(0, Math.min(HUNTER_RANK_TIERS.length - 1, valor - 1))];
      return `${targetTier.label} · ${coinText}`;
    }
    case 'reino_murim': {
      const targetRealm =
        MURIM_REALM_TIERS[Math.max(0, Math.min(MURIM_REALM_TIERS.length - 1, valor - 1))];
      return `${targetRealm.name} (${targetRealm.minQi.toLocaleString('pt-BR')} Qi) · ${coinText}`;
    }
  }
}

export const EQUIPMENT_CATALOG: readonly EquipmentItem[] = [
  // =========================================================================
  // ELMOS (13 — 4 Comuns, 3 Raros, 3 Épicos, 3 Lendários)
  // =========================================================================
  {
    id: 'elmo_couro_novato',
    slot: 'elmo',
    name: 'Capuz de Treino',
    rarity: 'Comum',
    rarityKey: 'comum',
    auraMultiplier: 1.0,
    iconName: 'Crown',
    priceCoins: 0,
    requirement: { tipo: 'inicial', valor: 0 },
    unlockRequirementLabel: formatReqLabel('inicial', 0, 0),
    description: 'Capuz inicial de couro leve para manter o foco durante a sessão.',
    accentHex: '#64748B',
    secondaryHex: '#9CA3AF',
    powerBonusLabel: '+1% XP · +1% Moedas · +1% Chefe',
    xpBonusPercent: 1,
    coinBonusPercent: 1,
    bossDamageBonusPercent: 1,
    powerScore: 8,
    setId: 'viajante',
  },
  {
    id: 'elmo_faixa_taiyuan',
    slot: 'elmo',
    name: 'Faixa de Treino da Família Jin',
    rarity: 'Comum',
    rarityKey: 'comum',
    auraMultiplier: 1.0,
    iconName: 'Wind',
    priceCoins: 15,
    requirement: { tipo: 'reino_murim', valor: 1 },
    unlockRequirementLabel: formatReqLabel('reino_murim', 1, 15),
    description: 'Faixa tradicional dos discípulos de Taiyuan para disciplinar a respiração.',
    accentHex: '#475569',
    secondaryHex: '#94A3B8',
    powerBonusLabel: '+2% XP · +1% Moedas · +1% Chefe',
    xpBonusPercent: 2,
    coinBonusPercent: 1,
    bossDamageBonusPercent: 1,
    powerScore: 10,
    setId: 'familia_jin',
  },
  {
    id: 'elmo_visor_rank_f',
    slot: 'elmo',
    name: 'Visor da Associação Rank F',
    rarity: 'Comum',
    rarityKey: 'comum',
    auraMultiplier: 1.0,
    iconName: 'Eye',
    priceCoins: 30,
    requirement: { tipo: 'rank_cacador', valor: 1 },
    unlockRequirementLabel: formatReqLabel('rank_cacador', 1, 30),
    description: 'Visor padrão emitido pela Associação para leitura básica de portões.',
    accentHex: '#334155',
    secondaryHex: '#60A5FA',
    powerBonusLabel: '+1% XP · +3% Moedas · +1% Chefe',
    xpBonusPercent: 1,
    coinBonusPercent: 3,
    bossDamageBonusPercent: 1,
    powerScore: 11,
    setId: 'associacao_cacadores',
  },
  {
    id: 'elmo_bandana_novico',
    slot: 'elmo',
    name: 'Bandana do Noviço de Murim',
    rarity: 'Comum',
    rarityKey: 'comum',
    auraMultiplier: 1.0,
    iconName: 'Flame',
    priceCoins: 35,
    requirement: { tipo: 'reino_murim', valor: 1 },
    unlockRequirementLabel: formatReqLabel('reino_murim', 1, 35),
    description: 'Tecido amarrado na testa dos praticantes iniciantes de 3ª Classe para conter o suor.',
    accentHex: '#64748B',
    secondaryHex: '#38BDF8',
    powerBonusLabel: '+2% XP · +1% Moedas · +2% Chefe',
    xpBonusPercent: 2,
    coinBonusPercent: 1,
    bossDamageBonusPercent: 2,
    powerScore: 12,
    setId: 'guarda_aco',
  },
  {
    id: 'elmo_mercador_vidente',
    slot: 'elmo',
    name: 'Monóculo do Mercador',
    rarity: 'Raro',
    rarityKey: 'raro',
    auraMultiplier: 1.25,
    iconName: 'Eye',
    priceCoins: 120,
    requirement: { tipo: 'rank_cacador', valor: 2 },
    unlockRequirementLabel: formatReqLabel('rank_cacador', 2, 120),
    description: 'Lente encantada para enxergar tesouros ocultos ao final de cada incursão.',
    accentHex: '#2563EB',
    secondaryHex: '#EAB308',
    powerBonusLabel: '+2% XP · +8% Moedas · +2% Chefe',
    xpBonusPercent: 2,
    coinBonusPercent: 8,
    bossDamageBonusPercent: 2,
    powerScore: 24,
    setId: 'manto_mercador',
  },
  {
    id: 'elmo_tiara_qi_basico',
    slot: 'elmo',
    name: 'Tiara de Circulação de Qi',
    rarity: 'Raro',
    rarityKey: 'raro',
    auraMultiplier: 1.25,
    iconName: 'Flame',
    priceCoins: 140,
    requirement: { tipo: 'reino_murim', valor: 2 },
    unlockRequirementLabel: formatReqLabel('reino_murim', 2, 140),
    description: 'Tiara metálica de 2ª Classe que estabiliza o fluxo de Qi durante golpes.',
    accentHex: '#EA580C',
    secondaryHex: '#FDBA74',
    powerBonusLabel: '+3% XP · +3% Moedas · +7% Chefe',
    xpBonusPercent: 3,
    coinBonusPercent: 3,
    bossDamageBonusPercent: 7,
    powerScore: 29,
    setId: 'seita_rei_fogo',
  },
  {
    id: 'elmo_capacete_rank_d',
    slot: 'elmo',
    name: 'Capacete Tático Rank D',
    rarity: 'Raro',
    rarityKey: 'raro',
    auraMultiplier: 1.25,
    iconName: 'Shield',
    priceCoins: 175,
    requirement: { tipo: 'rank_cacador', valor: 3 },
    unlockRequirementLabel: formatReqLabel('rank_cacador', 3, 175),
    description: 'Proteção reforçada usada por líderes de esquadrões Rank D em fendas.',
    accentHex: '#1D4ED8',
    secondaryHex: '#93C5FD',
    powerBonusLabel: '+4% XP · +6% Moedas · +4% Chefe',
    xpBonusPercent: 4,
    coinBonusPercent: 6,
    bossDamageBonusPercent: 4,
    powerScore: 32,
    setId: 'associacao_cacadores',
  },
  {
    id: 'elmo_sabio_abissal',
    slot: 'elmo',
    name: 'Diadema do Sábio Abissal',
    rarity: 'Épico',
    rarityKey: 'epico',
    auraMultiplier: 1.5,
    iconName: 'Sparkles',
    priceCoins: 350,
    requirement: { tipo: 'rank_cacador', valor: 5 },
    unlockRequirementLabel: formatReqLabel('rank_cacador', 5, 350),
    description: 'Diadema rúnica dos Caçadores Rank B que converte foco em ganho acelerado de XP.',
    accentHex: '#7E22CE',
    secondaryHex: '#38BDF8',
    powerBonusLabel: '+10% XP · +3% Moedas · +4% Chefe',
    xpBonusPercent: 10,
    coinBonusPercent: 3,
    bossDamageBonusPercent: 4,
    powerScore: 52,
    setId: 'sabio_abissal',
  },
  {
    id: 'elmo_presa_carmesim',
    slot: 'elmo',
    name: 'Elmo Chifrudo Carmesim',
    rarity: 'Épico',
    rarityKey: 'epico',
    auraMultiplier: 1.5,
    iconName: 'Flame',
    priceCoins: 400,
    requirement: { tipo: 'reino_murim', valor: 4 },
    unlockRequirementLabel: formatReqLabel('reino_murim', 4, 400),
    description: 'Elmo feroz com chifres flamejantes forjado para especialistas no reino Pico.',
    accentHex: '#DC2626',
    secondaryHex: '#FCA5A5',
    powerBonusLabel: '+4% XP · +2% Moedas · +11% Chefe',
    xpBonusPercent: 4,
    coinBonusPercent: 2,
    bossDamageBonusPercent: 11,
    powerScore: 58,
    setId: 'presa_carmesim',
  },
  {
    id: 'elmo_mascara_pico',
    slot: 'elmo',
    name: 'Máscara do Especialista do Pico',
    rarity: 'Épico',
    rarityKey: 'epico',
    auraMultiplier: 1.5,
    iconName: 'Flame',
    priceCoins: 440,
    requirement: { tipo: 'reino_murim', valor: 4 },
    unlockRequirementLabel: formatReqLabel('reino_murim', 4, 440),
    description: 'Máscara ritual de mestres no reino Pico que amplifica o Qi da Espada.',
    accentHex: '#C2410C',
    secondaryHex: '#FB923C',
    powerBonusLabel: '+6% XP · +4% Moedas · +12% Chefe',
    xpBonusPercent: 6,
    coinBonusPercent: 4,
    bossDamageBonusPercent: 12,
    powerScore: 62,
    setId: 'seita_rei_fogo',
  },
  {
    id: 'elmo_monarca',
    slot: 'elmo',
    name: 'Coroa do Monarca das Sombras',
    rarity: 'Lendário',
    rarityKey: 'lendario',
    auraMultiplier: 2.0,
    iconName: 'Crown',
    priceCoins: 950,
    requirement: { tipo: 'rank_cacador', valor: 7 },
    unlockRequirementLabel: formatReqLabel('rank_cacador', 7, 950),
    description: 'Coroa suprema da eternidade concedida aos guerreiros do Rank S.',
    accentHex: '#F59E0B',
    secondaryHex: '#F97316',
    powerBonusLabel: '+14% XP · +12% Moedas · +16% Chefe',
    xpBonusPercent: 14,
    coinBonusPercent: 12,
    bossDamageBonusPercent: 16,
    powerScore: 110,
    setId: 'monarca_eternidade',
  },
  {
    id: 'elmo_coroa_rei_fogo',
    slot: 'elmo',
    name: 'Diadema Solar do Rei do Fogo',
    rarity: 'Lendário',
    rarityKey: 'lendario',
    auraMultiplier: 2.0,
    iconName: 'Flame',
    priceCoins: 980,
    requirement: { tipo: 'reino_murim', valor: 6 },
    unlockRequirementLabel: formatReqLabel('reino_murim', 6, 980),
    description: 'Relíquia do Reino Sem Restrições inspirada no mestre Jeok Cheon-gang.',
    accentHex: '#EA580C',
    secondaryHex: '#FDE047',
    powerBonusLabel: '+12% XP · +10% Moedas · +22% Chefe',
    xpBonusPercent: 12,
    coinBonusPercent: 10,
    bossDamageBonusPercent: 22,
    powerScore: 118,
    setId: 'seita_rei_fogo',
  },
  {
    id: 'elmo_diadema_vida_morte',
    slot: 'elmo',
    name: 'Auréola da Vida e da Morte',
    rarity: 'Lendário',
    rarityKey: 'lendario',
    auraMultiplier: 2.0,
    iconName: 'Sparkles',
    priceCoins: 1180,
    requirement: { tipo: 'reino_murim', valor: 7 },
    unlockRequirementLabel: formatReqLabel('reino_murim', 7, 1180),
    description: 'Coroa etérea de um mestre do Reino Profundo, onde mente e Qi são um só.',
    accentHex: '#06B6D4',
    secondaryHex: '#E0F2FE',
    powerBonusLabel: '+18% XP · +12% Moedas · +18% Chefe',
    xpBonusPercent: 18,
    coinBonusPercent: 12,
    bossDamageBonusPercent: 18,
    powerScore: 126,
    setId: 'espada_invisivel',
  },

  // =========================================================================
  // ARMADURAS (13 — 3 Comuns, 4 Raros, 3 Épicos, 3 Lendários)
  // =========================================================================
  {
    id: 'armadura_tunica_couro',
    slot: 'armadura',
    name: 'Túnica de Couro',
    rarity: 'Comum',
    rarityKey: 'comum',
    auraMultiplier: 1.0,
    iconName: 'Shield',
    priceCoins: 25,
    requirement: { tipo: 'rank_cacador', valor: 1 },
    unlockRequirementLabel: formatReqLabel('rank_cacador', 1, 25),
    description: 'Proteção leve e flexível emitida para Caçadores iniciantes de Rank F.',
    accentHex: '#78716C',
    secondaryHex: '#D6D3D1',
    powerBonusLabel: '+2% XP · +1% Moedas · +2% Chefe',
    xpBonusPercent: 2,
    coinBonusPercent: 1,
    bossDamageBonusPercent: 2,
    powerScore: 12,
    setId: 'viajante',
  },
  {
    id: 'armadura_dobok_jin',
    slot: 'armadura',
    name: 'Dobok de Linho de Taiyuan',
    rarity: 'Comum',
    rarityKey: 'comum',
    auraMultiplier: 1.0,
    iconName: 'Shield',
    priceCoins: 40,
    requirement: { tipo: 'reino_murim', valor: 1 },
    unlockRequirementLabel: formatReqLabel('reino_murim', 1, 40),
    description: 'Uniforme clássico da família Jin para artistas marciais iniciantes de 3ª Classe.',
    accentHex: '#475569',
    secondaryHex: '#CBD5E1',
    powerBonusLabel: '+3% XP · +2% Moedas · +1% Chefe',
    xpBonusPercent: 3,
    coinBonusPercent: 2,
    bossDamageBonusPercent: 1,
    powerScore: 14,
    setId: 'familia_jin',
  },
  {
    id: 'armadura_colete_rank_e',
    slot: 'armadura',
    name: 'Colete Tático Rank E',
    rarity: 'Comum',
    rarityKey: 'comum',
    auraMultiplier: 1.0,
    iconName: 'ShieldCheck',
    priceCoins: 55,
    requirement: { tipo: 'rank_cacador', valor: 2 },
    unlockRequirementLabel: formatReqLabel('rank_cacador', 2, 55),
    description: 'Colete reforçado distribuído a Caçadores que superaram o Rank F.',
    accentHex: '#1E40AF',
    secondaryHex: '#93C5FD',
    powerBonusLabel: '+2% XP · +4% Moedas · +2% Chefe',
    xpBonusPercent: 2,
    coinBonusPercent: 4,
    bossDamageBonusPercent: 2,
    powerScore: 16,
    setId: 'associacao_cacadores',
  },
  {
    id: 'armadura_placa_aco',
    slot: 'armadura',
    name: 'Placa de Aço',
    rarity: 'Raro',
    rarityKey: 'raro',
    auraMultiplier: 1.25,
    iconName: 'Shield',
    priceCoins: 150,
    requirement: { tipo: 'rank_cacador', valor: 3 },
    unlockRequirementLabel: formatReqLabel('rank_cacador', 3, 150),
    description: 'Couraça temperada usada por vanguardas de incursão a partir do Rank D.',
    accentHex: '#3B82F6',
    secondaryHex: '#CBD5E1',
    powerBonusLabel: '+4% XP · +3% Moedas · +6% Chefe',
    xpBonusPercent: 4,
    coinBonusPercent: 3,
    bossDamageBonusPercent: 6,
    powerScore: 30,
    setId: 'guarda_aco',
  },
  {
    id: 'armadura_traje_2_classe',
    slot: 'armadura',
    name: 'Traje Marcial de 2ª Classe',
    rarity: 'Raro',
    rarityKey: 'raro',
    auraMultiplier: 1.25,
    iconName: 'Flame',
    priceCoins: 165,
    requirement: { tipo: 'reino_murim', valor: 2 },
    unlockRequirementLabel: formatReqLabel('reino_murim', 2, 165),
    description: 'Veste bordada da Chama do Sul tecida para resistir ao calor do Qi interno.',
    accentHex: '#C2410C',
    secondaryHex: '#FDBA74',
    powerBonusLabel: '+4% XP · +3% Moedas · +8% Chefe',
    xpBonusPercent: 4,
    coinBonusPercent: 3,
    bossDamageBonusPercent: 8,
    powerScore: 33,
    setId: 'seita_rei_fogo',
  },
  {
    id: 'armadura_guarda_taiyuan',
    slot: 'armadura',
    name: 'Peitoral da Guarda de Taiyuan',
    rarity: 'Raro',
    rarityKey: 'raro',
    auraMultiplier: 1.25,
    iconName: 'ShieldCheck',
    priceCoins: 190,
    requirement: { tipo: 'reino_murim', valor: 3 },
    unlockRequirementLabel: formatReqLabel('reino_murim', 3, 190),
    description: 'Armadura da escolta de elite de Taiyuan para mestres de 1ª Classe.',
    accentHex: '#334155',
    secondaryHex: '#E2E8F0',
    powerBonusLabel: '+7% XP · +4% Moedas · +4% Chefe',
    xpBonusPercent: 7,
    coinBonusPercent: 4,
    bossDamageBonusPercent: 4,
    powerScore: 34,
    setId: 'familia_jin',
  },
  {
    id: 'armadura_liga_cacador_c',
    slot: 'armadura',
    name: 'Armadura de Liga Rank C',
    rarity: 'Raro',
    rarityKey: 'raro',
    auraMultiplier: 1.25,
    iconName: 'ShieldAlert',
    priceCoins: 210,
    requirement: { tipo: 'rank_cacador', valor: 4 },
    unlockRequirementLabel: formatReqLabel('rank_cacador', 4, 210),
    description: 'Liga metálica derivada de minério de masmorra para veteranos Rank C.',
    accentHex: '#2563EB',
    secondaryHex: '#60A5FA',
    powerBonusLabel: '+5% XP · +7% Moedas · +5% Chefe',
    xpBonusPercent: 5,
    coinBonusPercent: 7,
    bossDamageBonusPercent: 5,
    powerScore: 36,
    setId: 'associacao_cacadores',
  },
  {
    id: 'armadura_couraca_rubra',
    slot: 'armadura',
    name: 'Couraça Rubra de Guerra',
    rarity: 'Épico',
    rarityKey: 'epico',
    auraMultiplier: 1.5,
    iconName: 'ShieldAlert',
    priceCoins: 420,
    requirement: { tipo: 'rank_cacador', valor: 5 },
    unlockRequirementLabel: formatReqLabel('rank_cacador', 5, 420),
    description: 'Armadura escarlate de elite Rank B que transforma esforço em dano em chefes.',
    accentHex: '#BE123C',
    secondaryHex: '#FB7185',
    powerBonusLabel: '+7% XP · +5% Moedas · +12% Chefe',
    xpBonusPercent: 7,
    coinBonusPercent: 5,
    bossDamageBonusPercent: 12,
    powerScore: 56,
    setId: 'presa_carmesim',
  },
  {
    id: 'armadura_manto_alquimista',
    slot: 'armadura',
    name: 'Veste Dourada do Mercador',
    rarity: 'Épico',
    rarityKey: 'epico',
    auraMultiplier: 1.5,
    iconName: 'Coins',
    priceCoins: 380,
    requirement: { tipo: 'reino_murim', valor: 4 },
    unlockRequirementLabel: formatReqLabel('reino_murim', 4, 380),
    description: 'Traje bordado a ouro de guildas do Pico que multiplica recompensas de treino.',
    accentHex: '#A855F7',
    secondaryHex: '#EAB308',
    powerBonusLabel: '+4% XP · +14% Moedas · +4% Chefe',
    xpBonusPercent: 4,
    coinBonusPercent: 14,
    bossDamageBonusPercent: 4,
    powerScore: 50,
    setId: 'manto_mercador',
  },
  {
    id: 'armadura_manto_pico_supremo',
    slot: 'armadura',
    name: 'Manto do Pico Supremo',
    rarity: 'Épico',
    rarityKey: 'epico',
    auraMultiplier: 1.5,
    iconName: 'Sparkles',
    priceCoins: 520,
    requirement: { tipo: 'reino_murim', valor: 5 },
    unlockRequirementLabel: formatReqLabel('reino_murim', 5, 520),
    description: 'Veste dos líderes de seita no Pico Supremo, imbuída com Força da Arma.',
    accentHex: '#0891B2',
    secondaryHex: '#67E8F9',
    powerBonusLabel: '+11% XP · +6% Moedas · +11% Chefe',
    xpBonusPercent: 11,
    coinBonusPercent: 6,
    bossDamageBonusPercent: 11,
    powerScore: 68,
    setId: 'espada_invisivel',
  },
  {
    id: 'armadura_monarca',
    slot: 'armadura',
    name: 'Armadura Negra da Eternidade',
    rarity: 'Lendário',
    rarityKey: 'lendario',
    auraMultiplier: 2.0,
    iconName: 'ShieldCheck',
    priceCoins: 1100,
    requirement: { tipo: 'rank_cacador', valor: 6 },
    unlockRequirementLabel: formatReqLabel('rank_cacador', 6, 1100),
    description: 'Couraça abissal digna de um Caçador Rank A de poder incomparável.',
    accentHex: '#EA580C',
    secondaryHex: '#FBBF24',
    powerBonusLabel: '+15% XP · +15% Moedas · +20% Chefe',
    xpBonusPercent: 15,
    coinBonusPercent: 15,
    bossDamageBonusPercent: 20,
    powerScore: 125,
    setId: 'monarca_eternidade',
  },
  {
    id: 'armadura_dragao_rank_s',
    slot: 'armadura',
    name: 'Armadura Nacional Rank S',
    rarity: 'Lendário',
    rarityKey: 'lendario',
    auraMultiplier: 2.0,
    iconName: 'ShieldCheck',
    priceCoins: 1120,
    requirement: { tipo: 'rank_cacador', valor: 7 },
    unlockRequirementLabel: formatReqLabel('rank_cacador', 7, 1120),
    description: 'Conjunto blindado exclusivo dos Caçadores Rank S de poder nacional.',
    accentHex: '#1D4ED8',
    secondaryHex: '#FDE047',
    powerBonusLabel: '+16% XP · +18% Moedas · +16% Chefe',
    xpBonusPercent: 16,
    coinBonusPercent: 18,
    bossDamageBonusPercent: 16,
    powerScore: 128,
    setId: 'associacao_cacadores',
  },
  {
    id: 'armadura_celestial_vida_morte',
    slot: 'armadura',
    name: 'Veste Imortal do Reino Profundo',
    rarity: 'Lendário',
    rarityKey: 'lendario',
    auraMultiplier: 2.0,
    iconName: 'Crown',
    priceCoins: 1240,
    requirement: { tipo: 'reino_murim', valor: 7 },
    unlockRequirementLabel: formatReqLabel('reino_murim', 7, 1240),
    description: 'Traje lendário tecido com fios de Qi puro para mestres além das restrições.',
    accentHex: '#0E7490',
    secondaryHex: '#A5F3FC',
    powerBonusLabel: '+20% XP · +14% Moedas · +20% Chefe',
    xpBonusPercent: 20,
    coinBonusPercent: 14,
    bossDamageBonusPercent: 20,
    powerScore: 136,
    setId: 'espada_invisivel',
  },

  // =========================================================================
  // CAPAS (13 — 3 Comuns, 3 Raros, 4 Épicos, 3 Lendários)
  // =========================================================================
  {
    id: 'capa_pano_simples',
    slot: 'capa',
    name: 'Manto do Viajante',
    rarity: 'Comum',
    rarityKey: 'comum',
    auraMultiplier: 1.0,
    iconName: 'Wind',
    priceCoins: 20,
    requirement: { tipo: 'rank_cacador', valor: 1 },
    unlockRequirementLabel: formatReqLabel('rank_cacador', 1, 20),
    description: 'Manto simples de tecido leve usado por Caçadores Rank F em sua primeira fenda.',
    accentHex: '#6B7280',
    secondaryHex: '#D1D5DB',
    powerBonusLabel: '+2% XP · +2% Moedas',
    xpBonusPercent: 2,
    coinBonusPercent: 2,
    bossDamageBonusPercent: 0,
    powerScore: 9,
    setId: 'viajante',
  },
  {
    id: 'capa_manto_taiyuan',
    slot: 'capa',
    name: 'Manto de Pano de Taiyuan',
    rarity: 'Comum',
    rarityKey: 'comum',
    auraMultiplier: 1.0,
    iconName: 'Wind',
    priceCoins: 35,
    requirement: { tipo: 'reino_murim', valor: 1 },
    unlockRequirementLabel: formatReqLabel('reino_murim', 1, 35),
    description: 'Capa leve usada pelos iniciantes de 3ª Classe nos pátios da família Jin.',
    accentHex: '#475569',
    secondaryHex: '#CBD5E1',
    powerBonusLabel: '+3% XP · +1% Moedas · +1% Chefe',
    xpBonusPercent: 3,
    coinBonusPercent: 1,
    bossDamageBonusPercent: 1,
    powerScore: 13,
    setId: 'familia_jin',
  },
  {
    id: 'capa_sobretudo_cacador',
    slot: 'capa',
    name: 'Sobretudo de Campo Rank E',
    rarity: 'Comum',
    rarityKey: 'comum',
    auraMultiplier: 1.0,
    iconName: 'Feather',
    priceCoins: 50,
    requirement: { tipo: 'rank_cacador', valor: 2 },
    unlockRequirementLabel: formatReqLabel('rank_cacador', 2, 50),
    description: 'Casaco tático impermeável para incursões em portões instáveis.',
    accentHex: '#1E3A8A',
    secondaryHex: '#93C5FD',
    powerBonusLabel: '+2% XP · +3% Moedas · +2% Chefe',
    xpBonusPercent: 2,
    coinBonusPercent: 3,
    bossDamageBonusPercent: 2,
    powerScore: 15,
    setId: 'associacao_cacadores',
  },
  {
    id: 'capa_sabio_astral',
    slot: 'capa',
    name: 'Manto das Runas Azuis',
    rarity: 'Raro',
    rarityKey: 'raro',
    auraMultiplier: 1.25,
    iconName: 'BookOpen',
    priceCoins: 160,
    requirement: { tipo: 'rank_cacador', valor: 3 },
    unlockRequirementLabel: formatReqLabel('rank_cacador', 3, 160),
    description: 'Capa inscrita com runas azuis de Rank D que aceleram a absorção de XP.',
    accentHex: '#0284C7',
    secondaryHex: '#38BDF8',
    powerBonusLabel: '+8% XP · +2% Moedas · +2% Chefe',
    xpBonusPercent: 8,
    coinBonusPercent: 2,
    bossDamageBonusPercent: 2,
    powerScore: 28,
    setId: 'sabio_abissal',
  },
  {
    id: 'capa_estandarte_rank_d',
    slot: 'capa',
    name: 'Capa da Força-Tarefa Rank D',
    rarity: 'Raro',
    rarityKey: 'raro',
    auraMultiplier: 1.25,
    iconName: 'Shield',
    priceCoins: 170,
    requirement: { tipo: 'rank_cacador', valor: 3 },
    unlockRequirementLabel: formatReqLabel('rank_cacador', 3, 170),
    description: 'Capa com insígnia oficial de resposta rápida da Associação de Caçadores.',
    accentHex: '#2563EB',
    secondaryHex: '#DBEAFE',
    powerBonusLabel: '+4% XP · +6% Moedas · +4% Chefe',
    xpBonusPercent: 4,
    coinBonusPercent: 6,
    bossDamageBonusPercent: 4,
    powerScore: 31,
    setId: 'associacao_cacadores',
  },
  {
    id: 'capa_flama_iniciante',
    slot: 'capa',
    name: 'Manto das Brasas de Monte Hua',
    rarity: 'Raro',
    rarityKey: 'raro',
    auraMultiplier: 1.25,
    iconName: 'Flame',
    priceCoins: 195,
    requirement: { tipo: 'reino_murim', valor: 3 },
    unlockRequirementLabel: formatReqLabel('reino_murim', 3, 195),
    description: 'Capa escarlate de 1ª Classe aquecida pelo fluxo constante de Qi.',
    accentHex: '#DC2626',
    secondaryHex: '#FDBA74',
    powerBonusLabel: '+4% XP · +4% Moedas · +8% Chefe',
    xpBonusPercent: 4,
    coinBonusPercent: 4,
    bossDamageBonusPercent: 8,
    powerScore: 35,
    setId: 'seita_rei_fogo',
  },
  {
    id: 'capa_mercador_sombrio',
    slot: 'capa',
    name: 'Capa Forrada de Ouro',
    rarity: 'Épico',
    rarityKey: 'epico',
    auraMultiplier: 1.5,
    iconName: 'Gem',
    priceCoins: 360,
    requirement: { tipo: 'rank_cacador', valor: 5 },
    unlockRequirementLabel: formatReqLabel('rank_cacador', 5, 360),
    description: 'Manto nobre de Caçador Rank B com forro dourado de alta recompensa.',
    accentHex: '#9333EA',
    secondaryHex: '#FACC15',
    powerBonusLabel: '+3% XP · +13% Moedas · +3% Chefe',
    xpBonusPercent: 3,
    coinBonusPercent: 13,
    bossDamageBonusPercent: 3,
    powerScore: 48,
    setId: 'manto_mercador',
  },
  {
    id: 'capa_asa_carmesim',
    slot: 'capa',
    name: 'Asas Esfarrapadas de Sangue',
    rarity: 'Épico',
    rarityKey: 'epico',
    auraMultiplier: 1.5,
    iconName: 'Feather',
    priceCoins: 410,
    requirement: { tipo: 'reino_murim', valor: 5 },
    unlockRequirementLabel: formatReqLabel('reino_murim', 5, 410),
    description: 'Asas escarlates de mestres do Pico Supremo que intensificam golpes em chefes.',
    accentHex: '#B91C1C',
    secondaryHex: '#F87171',
    powerBonusLabel: '+5% XP · +3% Moedas · +11% Chefe',
    xpBonusPercent: 5,
    coinBonusPercent: 3,
    bossDamageBonusPercent: 11,
    powerScore: 54,
    setId: 'presa_carmesim',
  },
  {
    id: 'capa_elite_rank_b',
    slot: 'capa',
    name: 'Capa de Elite Rank B',
    rarity: 'Épico',
    rarityKey: 'epico',
    auraMultiplier: 1.5,
    iconName: 'Wind',
    priceCoins: 430,
    requirement: { tipo: 'rank_cacador', valor: 5 },
    unlockRequirementLabel: formatReqLabel('rank_cacador', 5, 430),
    description: 'Manto de comando usado por Caçadores Rank B em portões de alto risco.',
    accentHex: '#7C3AED',
    secondaryHex: '#93C5FD',
    powerBonusLabel: '+8% XP · +9% Moedas · +7% Chefe',
    xpBonusPercent: 8,
    coinBonusPercent: 9,
    bossDamageBonusPercent: 7,
    powerScore: 60,
    setId: 'associacao_cacadores',
  },
  {
    id: 'capa_chama_sul',
    slot: 'capa',
    name: 'Manto Ardente do Rei do Fogo',
    rarity: 'Épico',
    rarityKey: 'epico',
    auraMultiplier: 1.5,
    iconName: 'Flame',
    priceCoins: 460,
    requirement: { tipo: 'reino_murim', valor: 4 },
    unlockRequirementLabel: formatReqLabel('reino_murim', 4, 460),
    description: 'Capa flamejante tecida para artistas marciais no reino Pico.',
    accentHex: '#EA580C',
    secondaryHex: '#FDE047',
    powerBonusLabel: '+6% XP · +5% Moedas · +13% Chefe',
    xpBonusPercent: 6,
    coinBonusPercent: 5,
    bossDamageBonusPercent: 13,
    powerScore: 64,
    setId: 'seita_rei_fogo',
  },
  {
    id: 'capa_monarca',
    slot: 'capa',
    name: 'Manto Soberano do Vazio',
    rarity: 'Lendário',
    rarityKey: 'lendario',
    auraMultiplier: 2.0,
    iconName: 'Ghost',
    priceCoins: 980,
    requirement: { tipo: 'rank_cacador', valor: 6 },
    unlockRequirementLabel: formatReqLabel('rank_cacador', 6, 980),
    description: 'Manto etéreo dos Caçadores Rank A forjado após dominar o retorno de Murim.',
    accentHex: '#F59E0B',
    secondaryHex: '#FB923C',
    powerBonusLabel: '+16% XP · +14% Moedas · +15% Chefe',
    xpBonusPercent: 16,
    coinBonusPercent: 14,
    bossDamageBonusPercent: 15,
    powerScore: 115,
    setId: 'monarca_eternidade',
  },
  {
    id: 'capa_asas_chama_eterna',
    slot: 'capa',
    name: 'Asas Incandescentes do Rei do Fogo',
    rarity: 'Lendário',
    rarityKey: 'lendario',
    auraMultiplier: 2.0,
    iconName: 'Flame',
    priceCoins: 1040,
    requirement: { tipo: 'reino_murim', valor: 6 },
    unlockRequirementLabel: formatReqLabel('reino_murim', 6, 1040),
    description: 'Asas de fogo vivo erguidas pelos cem guerreiros do Reino Sem Restrições.',
    accentHex: '#DC2626',
    secondaryHex: '#FACC15',
    powerBonusLabel: '+13% XP · +11% Moedas · +23% Chefe',
    xpBonusPercent: 13,
    coinBonusPercent: 11,
    bossDamageBonusPercent: 23,
    powerScore: 124,
    setId: 'seita_rei_fogo',
  },
  {
    id: 'capa_veu_espada_invisivel',
    slot: 'capa',
    name: 'Véu Transcendente do Ar',
    rarity: 'Lendário',
    rarityKey: 'lendario',
    auraMultiplier: 2.0,
    iconName: 'Ghost',
    priceCoins: 1320,
    requirement: { tipo: 'reino_murim', valor: 8 },
    unlockRequirementLabel: formatReqLabel('reino_murim', 8, 1320),
    description: 'Manto silencioso do Reino da Vida e da Morte que acompanha a Espada Invisível.',
    accentHex: '#0891B2',
    secondaryHex: '#E0F2FE',
    powerBonusLabel: '+21% XP · +15% Moedas · +22% Chefe',
    xpBonusPercent: 21,
    coinBonusPercent: 15,
    bossDamageBonusPercent: 22,
    powerScore: 142,
    setId: 'espada_invisivel',
  },

  // =========================================================================
  // ARMAS (13 — 3 Comuns, 3 Raros, 3 Épicos, 4 Lendários)
  // =========================================================================
  {
    id: 'arma_bastao_treino',
    slot: 'arma',
    name: 'Espada de Treino',
    rarity: 'Comum',
    rarityKey: 'comum',
    auraMultiplier: 1.0,
    iconName: 'Sword',
    priceCoins: 0,
    requirement: { tipo: 'inicial', valor: 0 },
    unlockRequirementLabel: formatReqLabel('inicial', 0, 0),
    description: 'Espada de madeira do recruta das sombras para os primeiros combates.',
    accentHex: '#B45309',
    secondaryHex: '#FCD39F',
    powerBonusLabel: '+2% Chefe',
    xpBonusPercent: 0,
    coinBonusPercent: 0,
    bossDamageBonusPercent: 2,
    powerScore: 10,
    setId: 'viajante',
  },
  {
    id: 'arma_faca_incursao_f',
    slot: 'arma',
    name: 'Lâmina de Incursão Rank F',
    rarity: 'Comum',
    rarityKey: 'comum',
    auraMultiplier: 1.0,
    iconName: 'Sword',
    priceCoins: 25,
    requirement: { tipo: 'rank_cacador', valor: 1 },
    unlockRequirementLabel: formatReqLabel('rank_cacador', 1, 25),
    description: 'Adaga de aço simples que Taekyung carregava nos primeiros portões Rank F.',
    accentHex: '#475569',
    secondaryHex: '#93C5FD',
    powerBonusLabel: '+1% XP · +2% Moedas · +3% Chefe',
    xpBonusPercent: 1,
    coinBonusPercent: 2,
    bossDamageBonusPercent: 3,
    powerScore: 12,
    setId: 'associacao_cacadores',
  },
  {
    id: 'arma_espada_ferro_jin',
    slot: 'arma',
    name: 'Espada de Ferro de Taiyuan',
    rarity: 'Comum',
    rarityKey: 'comum',
    auraMultiplier: 1.0,
    iconName: 'Swords',
    priceCoins: 45,
    requirement: { tipo: 'reino_murim', valor: 1 },
    unlockRequirementLabel: formatReqLabel('reino_murim', 1, 45),
    description: 'Lâmina pesada de treinamento para praticantes iniciantes de 3ª Classe da família Jin.',
    accentHex: '#64748B',
    secondaryHex: '#E2E8F0',
    powerBonusLabel: '+3% XP · +1% Moedas · +3% Chefe',
    xpBonusPercent: 3,
    coinBonusPercent: 1,
    bossDamageBonusPercent: 3,
    powerScore: 15,
    setId: 'familia_jin',
  },
  {
    id: 'arma_adaga_mercador',
    slot: 'arma',
    name: 'Adaga Corta-Bolsa',
    rarity: 'Raro',
    rarityKey: 'raro',
    auraMultiplier: 1.25,
    iconName: 'Swords',
    priceCoins: 180,
    requirement: { tipo: 'reino_murim', valor: 2 },
    unlockRequirementLabel: formatReqLabel('reino_murim', 2, 180),
    description: 'Lâmina ágil de 2ª Classe que extrai moedas extras de cada missão concluída.',
    accentHex: '#3B82F6',
    secondaryHex: '#FACC15',
    powerBonusLabel: '+3% XP · +10% Moedas · +5% Chefe',
    xpBonusPercent: 3,
    coinBonusPercent: 10,
    bossDamageBonusPercent: 5,
    powerScore: 34,
    setId: 'manto_mercador',
  },
  {
    id: 'arma_lanca_1_classe',
    slot: 'arma',
    name: 'Lança Imbuída de Qi',
    rarity: 'Raro',
    rarityKey: 'raro',
    auraMultiplier: 1.25,
    iconName: 'Zap',
    priceCoins: 220,
    requirement: { tipo: 'reino_murim', valor: 3 },
    unlockRequirementLabel: formatReqLabel('reino_murim', 3, 220),
    description: 'Lança de 1ª Classe cuja haste conduz Qi direto para a ponta de aço.',
    accentHex: '#EA580C',
    secondaryHex: '#FDE047',
    powerBonusLabel: '+4% XP · +3% Moedas · +10% Chefe',
    xpBonusPercent: 4,
    coinBonusPercent: 3,
    bossDamageBonusPercent: 10,
    powerScore: 38,
    setId: 'seita_rei_fogo',
  },
  {
    id: 'arma_katana_rank_c',
    slot: 'arma',
    name: 'Espada de Mana Rank C',
    rarity: 'Raro',
    rarityKey: 'raro',
    auraMultiplier: 1.25,
    iconName: 'Sword',
    priceCoins: 230,
    requirement: { tipo: 'rank_cacador', valor: 4 },
    unlockRequirementLabel: formatReqLabel('rank_cacador', 4, 230),
    description: 'Lâmina com núcleo de mana usada pela linha de frente da Associação.',
    accentHex: '#2563EB',
    secondaryHex: '#38BDF8',
    powerBonusLabel: '+5% XP · +8% Moedas · +6% Chefe',
    xpBonusPercent: 5,
    coinBonusPercent: 8,
    bossDamageBonusPercent: 6,
    powerScore: 40,
    setId: 'associacao_cacadores',
  },
  {
    id: 'arma_cajado_abissal',
    slot: 'arma',
    name: 'Cajado do Conhecimento',
    rarity: 'Épico',
    rarityKey: 'epico',
    auraMultiplier: 1.5,
    iconName: 'Wand2',
    priceCoins: 430,
    requirement: { tipo: 'rank_cacador', valor: 5 },
    unlockRequirementLabel: formatReqLabel('rank_cacador', 5, 430),
    description: 'Cajado arcano de Caçador Rank B que amplia fortemente todo XP conquistado.',
    accentHex: '#7C3AED',
    secondaryHex: '#38BDF8',
    powerBonusLabel: '+12% XP · +4% Moedas · +7% Chefe',
    xpBonusPercent: 12,
    coinBonusPercent: 4,
    bossDamageBonusPercent: 7,
    powerScore: 60,
    setId: 'sabio_abissal',
  },
  {
    id: 'arma_espada_carmesim',
    slot: 'arma',
    name: 'Lâmina Voraz Carmesim',
    rarity: 'Épico',
    rarityKey: 'epico',
    auraMultiplier: 1.5,
    iconName: 'Flame',
    priceCoins: 480,
    requirement: { tipo: 'reino_murim', valor: 5 },
    unlockRequirementLabel: formatReqLabel('reino_murim', 5, 480),
    description: 'Espada rubra de mestres do Pico Supremo forjada para romper defesas de chefes.',
    accentHex: '#EF4444',
    secondaryHex: '#FCA5A5',
    powerBonusLabel: '+5% XP · +4% Moedas · +16% Chefe',
    xpBonusPercent: 5,
    coinBonusPercent: 4,
    bossDamageBonusPercent: 16,
    powerScore: 68,
    setId: 'presa_carmesim',
  },
  {
    id: 'arma_espada_qi_pico',
    slot: 'arma',
    name: 'Espada de Qi do Dragão Adormecido',
    rarity: 'Épico',
    rarityKey: 'epico',
    auraMultiplier: 1.5,
    iconName: 'Swords',
    priceCoins: 490,
    requirement: { tipo: 'reino_murim', valor: 4 },
    unlockRequirementLabel: formatReqLabel('reino_murim', 4, 490),
    description: 'Sabre do reino Pico capaz de projetar lâminas de Qi da Espada à distância.',
    accentHex: '#0284C7',
    secondaryHex: '#67E8F9',
    powerBonusLabel: '+11% XP · +6% Moedas · +13% Chefe',
    xpBonusPercent: 11,
    coinBonusPercent: 6,
    bossDamageBonusPercent: 13,
    powerScore: 72,
    setId: 'espada_invisivel',
  },
  {
    id: 'arma_espada_rank_a_taekyung',
    slot: 'arma',
    name: 'Lâmina Executora Rank A+',
    rarity: 'Lendário',
    rarityKey: 'lendario',
    auraMultiplier: 2.0,
    iconName: 'Swords',
    priceCoins: 920,
    requirement: { tipo: 'rank_cacador', valor: 6 },
    unlockRequirementLabel: formatReqLabel('rank_cacador', 6, 920),
    description: 'Arma da categoria Rank A+ usada quando Taekyung retorna do Murim.',
    accentHex: '#2563EB',
    secondaryHex: '#FDE047',
    powerBonusLabel: '+15% XP · +16% Moedas · +19% Chefe',
    xpBonusPercent: 15,
    coinBonusPercent: 16,
    bossDamageBonusPercent: 19,
    powerScore: 122,
    setId: 'associacao_cacadores',
  },
  {
    id: 'arma_lanca_rei_fogo',
    slot: 'arma',
    name: 'Lança Divina da Chama do Sul',
    rarity: 'Lendário',
    rarityKey: 'lendario',
    auraMultiplier: 2.0,
    iconName: 'Flame',
    priceCoins: 1200,
    requirement: { tipo: 'reino_murim', valor: 6 },
    unlockRequirementLabel: formatReqLabel('reino_murim', 6, 1200),
    description: 'Lança lendária que canaliza a técnica secreta das Dez Mil Chamas do Rei do Fogo.',
    accentHex: '#DC2626',
    secondaryHex: '#FDE047',
    powerBonusLabel: '+14% XP · +12% Moedas · +28% Chefe',
    xpBonusPercent: 14,
    coinBonusPercent: 12,
    bossDamageBonusPercent: 28,
    powerScore: 138,
    setId: 'seita_rei_fogo',
  },
  {
    id: 'arma_presas_monarca',
    slot: 'arma',
    name: 'Presas de Kasaka Sombrias',
    rarity: 'Lendário',
    rarityKey: 'lendario',
    auraMultiplier: 2.0,
    iconName: 'Zap',
    priceCoins: 1250,
    requirement: { tipo: 'rank_cacador', valor: 7 },
    unlockRequirementLabel: formatReqLabel('rank_cacador', 7, 1250),
    description: 'Relíquia suprema dupla dos Caçadores Rank S com dano abissal máximo em chefes.',
    accentHex: '#F97316',
    secondaryHex: '#FDE047',
    powerBonusLabel: '+18% XP · +16% Moedas · +25% Chefe',
    xpBonusPercent: 18,
    coinBonusPercent: 16,
    bossDamageBonusPercent: 25,
    powerScore: 140,
    setId: 'monarca_eternidade',
  },
  {
    id: 'arma_espada_invisivel',
    slot: 'arma',
    name: 'Espada Invisível da Vida e da Morte',
    rarity: 'Lendário',
    rarityKey: 'lendario',
    auraMultiplier: 2.0,
    iconName: 'Sparkles',
    priceCoins: 1480,
    requirement: { tipo: 'reino_murim', valor: 8 },
    unlockRequirementLabel: formatReqLabel('reino_murim', 8, 1480),
    description: 'Manifestação pura de Qi sem forma física: o pináculo absoluto da arte marcial.',
    accentHex: '#06B6D4',
    secondaryHex: '#FFFFFF',
    powerBonusLabel: '+22% XP · +18% Moedas · +28% Chefe',
    xpBonusPercent: 22,
    coinBonusPercent: 18,
    bossDamageBonusPercent: 28,
    powerScore: 158,
    setId: 'espada_invisivel',
  },
];

export const EXAMPLE_LOADOUT_PRESETS: readonly GearLoadoutPreset[] = [
  {
    id: 'preset_1',
    name: 'Seita do Rei do Fogo',
    isExample: true,
    gear: {
      elmo: 'elmo_coroa_rei_fogo',
      armadura: 'armadura_traje_2_classe',
      capa: 'capa_asas_chama_eterna',
      arma: 'arma_lanca_rei_fogo',
    },
  },
  {
    id: 'preset_2',
    name: 'Associação Rank S',
    isExample: true,
    gear: {
      elmo: 'elmo_capacete_rank_d',
      armadura: 'armadura_dragao_rank_s',
      capa: 'capa_elite_rank_b',
      arma: 'arma_espada_rank_a_taekyung',
    },
  },
  {
    id: 'preset_3',
    name: 'Espada Invisível (Qi)',
    isExample: true,
    gear: {
      elmo: 'elmo_diadema_vida_morte',
      armadura: 'armadura_celestial_vida_morte',
      capa: 'capa_veu_espada_invisivel',
      arma: 'arma_espada_invisivel',
    },
  },
];

const LEGACY_EQUIPMENT_ID_MAP: Record<string, string> = {
  'wp-wooden-blade': 'arma_bastao_treino',
  'wp-azure-katana': 'arma_adaga_mercador',
  'wp-crimson-fang': 'arma_espada_carmesim',
  'wp-obsidian-halberd': 'arma_cajado_abissal',
  'wp-sovereign-greatsword': 'arma_presas_monarca',
  'ar-leather-tunic': 'armadura_tunica_couro',
  'ar-steel-plate': 'armadura_placa_aco',
  'ar-crimson-cuirass': 'armadura_couraca_rubra',
  'ar-abyss-warden-mail': 'armadura_manto_alquimista',
  'ar-shadow-plate': 'armadura_monarca',
  'hm-scout-hood': 'elmo_couro_novato',
  'hm-knight-visor': 'elmo_mercador_vidente',
  'hm-crimson-oni': 'elmo_presa_carmesim',
  'hm-astral-helm': 'elmo_sabio_abissal',
  'hm-monarch-crown': 'elmo_monarca',
  'cp-cobalt-mantle': 'capa_pano_simples',
  'cp-crimson-shroud': 'capa_asa_carmesim',
  'cp-storm-cloak': 'capa_sabio_astral',
  'cp-eclipse-cape': 'capa_mercador_sombrio',
  'cp-abyssal-wings': 'capa_monarca',
};

const CATALOG_BY_ID = new Map(EQUIPMENT_CATALOG.map((item) => [item.id, item]));

export function migrateEquipmentId(rawId: string | null | undefined): string | null {
  if (typeof rawId !== 'string' || !rawId) return null;
  const mapped = LEGACY_EQUIPMENT_ID_MAP[rawId] ?? rawId;
  return CATALOG_BY_ID.has(mapped) ? mapped : null;
}

function migrateGearSlot(rawId: unknown, slot: EquipmentSlot): string | null {
  const id = typeof rawId === 'string' ? migrateEquipmentId(rawId) : null;
  return id && CATALOG_BY_ID.get(id)?.slot === slot ? id : null;
}

export function migrateEquippedGear(rawGear: unknown): EquippedGear {
  if (!rawGear || typeof rawGear !== 'object') {
    return { ...DEFAULT_EQUIPPED_GEAR };
  }
  const obj = rawGear as Record<string, unknown>;
  return {
    elmo: migrateGearSlot(obj.elmo ?? obj.helm, 'elmo'),
    armadura: migrateGearSlot(obj.armadura ?? obj.armor, 'armadura'),
    capa: migrateGearSlot(obj.capa ?? obj.cape, 'capa'),
    arma: migrateGearSlot(obj.arma ?? obj.weapon, 'arma'),
  };
}

export function migrateOwnedEquipmentIds(rawIds?: readonly string[]): string[] {
  const migrated = new Set<string>(DEFAULT_OWNED_EQUIPMENT_IDS);
  if (Array.isArray(rawIds)) {
    for (const id of rawIds) {
      const next = migrateEquipmentId(id);
      if (next) migrated.add(next);
    }
  }
  return Array.from(migrated).slice(0, MAX_OWNED_EQUIPMENT_IDS);
}

const RARITY_ORDER: Record<EquipmentRarity, number> = {
  Comum: 1,
  Raro: 2,
  Épico: 3,
  Lendário: 4,
};

export function getEquipmentSetById(
  setId?: EquipmentSetId | null
): EquipmentSetDefinition | null {
  if (!setId) return null;
  return EQUIPMENT_SETS.find((s) => s.id === setId) ?? null;
}

export function calculateGearBonusSummary(
  gear: EquippedGear = DEFAULT_EQUIPPED_GEAR
): GearBonusSummary {
  const safeGear = migrateEquippedGear(gear);
  const slotIds = [
    safeGear.elmo,
    safeGear.armadura,
    safeGear.capa,
    safeGear.arma,
  ].filter((id): id is string => Boolean(id));
  const equippedItems = slotIds
    .map((id) => CATALOG_BY_ID.get(id))
    .filter((item): item is EquipmentItem => Boolean(item));

  let xpBonusPercent = 0;
  let coinBonusPercent = 0;
  let bossDamageBonusPercent = 0;
  let totalPowerScore = 0;
  let dominantRarity: EquipmentRarity = 'Comum';
  let dominantRarityKey: EquipmentRarityKey = 'comum';
  let auraMultiplier: number = ARSENAL_CONFIG.raridades.comum.multiplicador_aura;

  const setCounts = new Map<EquipmentSetId, number>();

  for (const item of equippedItems) {
    xpBonusPercent += item.xpBonusPercent;
    coinBonusPercent += item.coinBonusPercent;
    bossDamageBonusPercent += item.bossDamageBonusPercent;
    totalPowerScore += item.powerScore;

    if (RARITY_ORDER[item.rarity] > RARITY_ORDER[dominantRarity]) {
      dominantRarity = item.rarity;
      dominantRarityKey = item.rarityKey;
      auraMultiplier = item.auraMultiplier;
    }

    if (item.setId) {
      setCounts.set(item.setId, (setCounts.get(item.setId) ?? 0) + 1);
    }
  }

  const activeSets: GearActiveSetStatus[] = [];

  for (const setDef of EQUIPMENT_SETS) {
    const count = setCounts.get(setDef.id) ?? 0;
    if (count <= 0) continue;

    const twoPieceActive = count >= 2;
    const fourPieceBonus = count >= 4 ? setDef.fourPieceBonus : undefined;
    const fourPieceActive = Boolean(fourPieceBonus);

    if (fourPieceBonus) {
      xpBonusPercent += fourPieceBonus.xpBonusPercent;
      coinBonusPercent += fourPieceBonus.coinBonusPercent;
      bossDamageBonusPercent += fourPieceBonus.bossDamageBonusPercent;
      totalPowerScore += 45;
    } else if (twoPieceActive) {
      xpBonusPercent += setDef.twoPieceBonus.xpBonusPercent;
      coinBonusPercent += setDef.twoPieceBonus.coinBonusPercent;
      bossDamageBonusPercent += setDef.twoPieceBonus.bossDamageBonusPercent;
      totalPowerScore += 18;
    }

    activeSets.push({
      set: setDef,
      equippedCount: count,
      twoPieceActive,
      fourPieceActive,
    });
  }

  activeSets.sort((a, b) => b.equippedCount - a.equippedCount);

  return {
    xpBonusPercent,
    coinBonusPercent,
    bossDamageBonusPercent,
    totalPowerScore,
    dominantRarity,
    dominantRarityKey,
    auraMultiplier,
    activeSets,
  };
}

export function compareGearSummaries(
  currentGear: EquippedGear,
  candidateOrGear: EquipmentItem | EquippedGear
): {
  current: GearBonusSummary;
  preview: GearBonusSummary;
  deltaXpPercent: number;
  deltaCoinPercent: number;
  deltaBossDamagePercent: number;
  deltaPowerScore: number;
} {
  const previewGear: EquippedGear =
    'slot' in candidateOrGear
      ? {
          ...migrateEquippedGear(currentGear),
          [candidateOrGear.slot]: candidateOrGear.id,
        }
      : migrateEquippedGear(candidateOrGear);
  const current = calculateGearBonusSummary(currentGear);
  const preview = calculateGearBonusSummary(previewGear);

  return {
    current,
    preview,
    deltaXpPercent: preview.xpBonusPercent - current.xpBonusPercent,
    deltaCoinPercent: preview.coinBonusPercent - current.coinBonusPercent,
    deltaBossDamagePercent:
      preview.bossDamageBonusPercent - current.bossDamageBonusPercent,
    deltaPowerScore: preview.totalPowerScore - current.totalPowerScore,
  };
}

export function calculateWorkoutBossState(
  bossMaxHp: number,
  completedCount: number,
  totalExercises: number,
  elapsedSeconds: number,
  targetDurationSeconds: number,
  bossDamageBonusPercent: number = 0,
  setProgress?: {
    completedSets: number;
    totalSets: number;
    criticalHits?: number;
  }
): {
  currentHp: number;
  hpPercent: number;
  bossDefeated: boolean;
  damageMultiplier: number;
} {
  const safeMaxHp = Math.max(1, bossMaxHp);
  const safeTotal = Math.max(1, totalExercises);
  const safeCompleted = Math.min(safeTotal, Math.max(0, completedCount));
  const critBonus = Math.min(0.35, Math.max(0, setProgress?.criticalHits ?? 0) * 0.08);
  const multiplier = (1 + Math.max(0, bossDamageBonusPercent) / 100) * (1 + critBonus);

  const hasSetDamage = Boolean(setProgress && setProgress.completedSets > 0 && setProgress.totalSets > 0);

  if (safeCompleted === 0 && !hasSetDamage) {
    const passiveDrain = Math.min(
      Math.round(safeMaxHp * 0.15),
      Math.floor(
        (Math.max(0, elapsedSeconds) / Math.max(1, targetDurationSeconds)) *
          safeMaxHp *
          0.15 *
          multiplier
      )
    );
    const currentHp = Math.max(1, safeMaxHp - passiveDrain);
    return {
      currentHp,
      hpPercent: Math.round((currentHp / safeMaxHp) * 100),
      bossDefeated: false,
      damageMultiplier: Number(multiplier.toFixed(2)),
    };
  }

  if (safeCompleted === safeTotal) {
    return {
      currentHp: 0,
      hpPercent: 0,
      bossDefeated: true,
      damageMultiplier: Number(multiplier.toFixed(2)),
    };
  }

  const exerciseRatio = safeCompleted / safeTotal;
  const setRatio =
    hasSetDamage && setProgress
      ? Math.min(0.95, setProgress.completedSets / Math.max(1, setProgress.totalSets))
      : 0;
  const effectiveRatio = Math.max(exerciseRatio, setRatio);

  const exerciseDamage = Math.round(effectiveRatio * safeMaxHp * 0.85 * multiplier);
  const timeDrain = Math.min(
    Math.round(safeMaxHp * 0.15 * multiplier),
    Math.floor(
      (Math.max(0, elapsedSeconds) / Math.max(1, targetDurationSeconds)) *
        safeMaxHp *
        0.15 *
        multiplier
    )
  );
  const currentHp = Math.max(0, safeMaxHp - exerciseDamage - timeDrain);
  return {
    currentHp,
    hpPercent: Math.round((currentHp / safeMaxHp) * 100),
    bossDefeated: currentHp === 0,
    damageMultiplier: Number(multiplier.toFixed(2)),
  };
}

export function normalizeGameStats(stats: GameStats): GameStats & {
  goldCoins: number;
  totalCoinsEarned: number;
  bossesDefeated: number;
  ownedEquipmentIds: string[];
  equippedGear: EquippedGear;
  gearLoadouts: GearLoadoutPreset[];
  claimedAutoQuestKeys: string[];
} {
  const ownedEquipmentIds = migrateOwnedEquipmentIds(stats.ownedEquipmentIds);
  const equippedGear = migrateEquippedGear(stats.equippedGear);
  const spentEstimate = ownedEquipmentIds.reduce((acc, id) => {
    const item = EQUIPMENT_CATALOG.find((e) => e.id === id);
    return acc + (item?.priceCoins ?? 0);
  }, 0);
  const goldCoins = Math.max(0, stats.goldCoins ?? 50);
  const totalCoinsEarned = Math.max(
    stats.totalCoinsEarned ?? 0,
    goldCoins + spentEstimate
  );

  const gearLoadouts: GearLoadoutPreset[] = Array.isArray(stats.gearLoadouts)
    ? stats.gearLoadouts.slice(0, 4).map((preset, idx) => ({
        id: preset?.id || `preset_${idx + 1}`,
        name: String(preset?.name || `Loadout ${idx + 1}`).slice(0, 28),
        gear: migrateEquippedGear(preset?.gear),
      }))
    : [];

  return {
    ...stats,
    level: calculateLevel(stats.totalXp ?? 0),
    hunterHp: stats.hunterHp ?? 100,
    goldCoins,
    totalCoinsEarned,
    bossesDefeated: stats.bossesDefeated ?? 0,
    ownedEquipmentIds,
    equippedGear,
    gearLoadouts,
    claimedAutoQuestKeys: Array.isArray(stats.claimedAutoQuestKeys)
      ? stats.claimedAutoQuestKeys.slice(-MAX_CLAIMED_AUTO_QUEST_KEYS)
      : [],
  };
}

export function getEquipmentRequirementProgress(
  item: EquipmentItem,
  stats: GameStats
): { met: boolean; current: number; target: number; progressText: string } {
  const normalized = normalizeGameStats(stats);
  const bestStreak = Math.max(normalized.currentStreak, normalized.longestStreak);
  const { tipo, valor } = item.requirement;

  switch (tipo) {
    case 'inicial':
      return { met: true, current: 1, target: 1, progressText: 'Requisito liberado' };
    case 'moedas_acumuladas': {
      const current = normalized.totalCoinsEarned;
      return {
        met: current >= valor,
        current,
        target: valor,
        progressText: `${Math.min(current, valor).toLocaleString('pt-BR')}/${valor.toLocaleString('pt-BR')} moedas acumuladas`,
      };
    }
    case 'streak_dias':
      return {
        met: bestStreak >= valor,
        current: bestStreak,
        target: valor,
        progressText: `${Math.min(bestStreak, valor)}/${valor} dias de streak`,
      };
    case 'chefes_derrotados': {
      const current = normalized.bossesDefeated;
      return {
        met: current >= valor,
        current,
        target: valor,
        progressText: `${Math.min(current, valor)}/${valor} chefes derrotados`,
      };
    }
    case 'nivel': {
      const current = normalized.level;
      return {
        met: current >= valor,
        current,
        target: valor,
        progressText: `Nível ${current}/${valor}`,
      };
    }
    case 'treinos_concluidos': {
      const current = normalized.totalWorkouts;
      return {
        met: current >= valor,
        current,
        target: valor,
        progressText: `${Math.min(current, valor)}/${valor} treinos concluídos`,
      };
    }
    case 'rank_cacador': {
      const targetIndex = Math.max(0, Math.min(HUNTER_RANK_TIERS.length - 1, valor - 1));
      const targetTier = HUNTER_RANK_TIERS[targetIndex];
      const currentProgress = getHunterRankForLevel(normalized.level, normalized.totalXp);
      const currentIndex = HUNTER_RANK_TIERS.findIndex(
        (t) => t.rank === currentProgress.current.rank
      );
      return {
        met: currentIndex >= targetIndex,
        current: currentIndex + 1,
        target: targetIndex + 1,
        progressText: `Atual: Rank ${currentProgress.current.rank} · Requer: Rank ${targetTier.rank}`,
      };
    }
    case 'reino_murim': {
      const targetRealm =
        MURIM_REALM_TIERS[Math.max(0, Math.min(MURIM_REALM_TIERS.length - 1, valor - 1))];
      const murim = getMurimRealmProgress(normalized);
      return {
        met: murim.qiPoints >= targetRealm.minQi,
        current: murim.qiPoints,
        target: targetRealm.minQi,
        progressText: `${murim.current.name} · ${Math.min(murim.qiPoints, targetRealm.minQi).toLocaleString('pt-BR')}/${targetRealm.minQi.toLocaleString('pt-BR')} Qi`,
      };
    }
  }
}

export function isEquipmentMilestoneUnlocked(
  item: EquipmentItem,
  stats: GameStats
): boolean {
  return getEquipmentRequirementProgress(item, stats).met;
}

export function getBossForWorkout(workout: WorkoutTemplate): {
  name: string;
  subtitle: string;
  maxHp: number;
  variant: 'golem' | 'hydra' | 'sentinel' | 'dragon';
  coinReward: number;
  bossRank: HunterRankLetter;
} {
  const effectiveRank = normalizeHunterRank(workout.rank, 'F');

  if (workout.id === 'w-despertar-guerreiro-a') {
    return {
      name: 'Vigia de Pedra Rank F',
      subtitle: 'Supere a barreira de pernas e empurrar do Despertar',
      maxHp: 35,
      variant: 'golem',
      coinReward: Math.round(workout.baseXp * 0.35),
      bossRank: 'F',
    };
  }
  if (workout.id === 'w-despertar-guerreiro-b') {
    return {
      name: 'Sombra da Forja Rank F',
      subtitle: 'Vença o desafio de puxada e cadeia posterior',
      maxHp: 35,
      variant: 'sentinel',
      coinReward: Math.round(workout.baseXp * 0.35),
      bossRank: 'F',
    };
  }
  if (workout.id === 'w-calistenia-upper-a') {
    return {
      name: 'Colosso das Paralelas',
      subtitle: 'Drene o guardião com volume superior e controle',
      maxHp: 90,
      variant: 'golem',
      coinReward: Math.round(workout.baseXp * 0.38),
      bossRank: effectiveRank,
    };
  }
  if (workout.id === 'w-calistenia-lower-b') {
    return {
      name: 'Titã da Base Férrea',
      subtitle: 'Vença a força unilateral de pernas e estabilidade',
      maxHp: 90,
      variant: 'sentinel',
      coinReward: Math.round(workout.baseXp * 0.38),
      bossRank: effectiveRank,
    };
  }

  const rankFactor =
    effectiveRank === 'S'
      ? 140
      : effectiveRank === 'A'
      ? 110
      : effectiveRank === 'B'
      ? 90
      : effectiveRank === 'C'
      ? 75
      : effectiveRank === 'D'
      ? 55
      : effectiveRank === 'F'
      ? 35
      : 45;

  if (workout.type === 'forca') {
    return {
      name:
        effectiveRank === 'F'
          ? 'Guardião de Pedra Rank F'
          : 'Fragmento do Golem de Ferro',
      subtitle: 'Drena enquanto você treina · Derrote para bônus',
      maxHp: rankFactor,
      variant: 'golem',
      coinReward: Math.round(workout.baseXp * 0.35),
      bossRank: effectiveRank,
    };
  }
  if (workout.type === 'cardio' || workout.type === 'hiit') {
    return {
      name:
        effectiveRank === 'F'
          ? 'Serpe da Fenda Rank F'
          : 'Hidra da Fadiga',
      subtitle: 'Corte todas as cabeças mantendo o ritmo',
      maxHp: rankFactor,
      variant: 'hydra',
      coinReward: Math.round(workout.baseXp * 0.35),
      bossRank: effectiveRank,
    };
  }
  if (workout.type === 'corpo_inteiro') {
    return {
      name:
        effectiveRank === 'F'
          ? 'Drake Iniciante Rank F'
          : 'Dragão Abissal Rank S',
      subtitle:
        effectiveRank === 'F'
          ? 'Desafio inicial de corpo inteiro'
          : 'Desafio supremo de corpo inteiro',
      maxHp: rankFactor,
      variant: 'dragon',
      coinReward: Math.round(workout.baseXp * 0.45),
      bossRank: effectiveRank,
    };
  }
  return {
    name:
      effectiveRank === 'F'
        ? 'Sentinela da Entrada Rank F'
        : 'Sentinela de Obsidiana',
    subtitle: 'Vença com técnica e estabilidade',
    maxHp: rankFactor,
    variant: 'sentinel',
    coinReward: Math.round(workout.baseXp * 0.32),
    bossRank: effectiveRank,
  };
}

export function getRecommendedProgramForHero(
  hero: HeroProfile,
  stats: GameStats
): TrainingProgram {
  const normalized = normalizeGameStats(stats);
  const hunterRank = getHunterRankForLevel(normalized.level, normalized.totalXp).current.rank;
  if (hunterRank === 'F' || hero.experience === 'Iniciante') {
    return WARRIOR_AWAKENING_PROGRAM;
  }
  return HYBRID_CALISTHENICS_PROGRAM;
}

export function getTodayScheduleEntry(
  date: Date = new Date(),
  program: TrainingProgram = HYBRID_CALISTHENICS_PROGRAM
): WeeklyScheduleDay {
  const jsDay = date.getDay();
  return (
    program.weeklySchedule.find((d) => d.dayIndex === jsDay) ??
    program.weeklySchedule[0]
  );
}

export function resolveWorkoutForSchedule(
  entry: WeeklyScheduleDay,
  workouts: WorkoutTemplate[]
): WorkoutTemplate | null {
  if (!entry.workoutId) return null;
  return (
    workouts.find((w) => w.id === entry.workoutId) ??
    INITIAL_WORKOUTS.find((w) => w.id === entry.workoutId) ??
    null
  );
}

export function getCurrentWeekScheduleDates(
  referenceDate: Date = new Date()
): Map<number, string> {
  const result = new Map<number, string>();
  const jsDay = referenceDate.getDay();
  const mondayOffset = jsDay === 0 ? -6 : 1 - jsDay;
  const monday = new Date(
    referenceDate.getFullYear(),
    referenceDate.getMonth(),
    referenceDate.getDate() + mondayOffset
  );

  for (let i = 0; i < 7; i++) {
    const d = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i);
    result.set(d.getDay(), getLocalDateKey(d));
  }
  return result;
}

export function calculateCoinsForWorkout(
  baseXp: number,
  completedExercises: number,
  totalExercises: number,
  bossDefeated: boolean,
  coinBonusPercent: number = 0
): number {
  if (totalExercises <= 0 || completedExercises <= 0) return 0;
  const ratio = Math.min(1, Math.max(0, completedExercises / totalExercises));
  const baseCoins = Math.max(10, Math.round(baseXp * 0.28 * ratio));
  const rawTotal = bossDefeated ? baseCoins + 25 : baseCoins;
  const multiplier = 1 + Math.max(0, coinBonusPercent) / 100;
  return Math.round(rawTotal * multiplier);
}

export function evaluateDailyAutoQuests(
  todayKey: string,
  todayMetric: DailyHealthMetric | null,
  logs: WorkoutLog[],
  healthActivities: HealthActivity[],
  weightLogs: WeightLog[],
  claimedAutoQuestKeys: string[]
): AutoQuestEvaluation[] {
  const stepsToday = todayMetric?.steps ?? 0;
  const stepsTarget = 6000;
  const trainedToday =
    logs.some((l) => l.dateKey === todayKey) ||
    healthActivities.some((a) => a.dateKey === todayKey);
  const weighedToday = weightLogs.some((w) => w.dateKey === todayKey);

  return [
    {
      id: 'steps_6000',
      title: 'Passos: 6.000 hoje',
      subtitle: 'Sincronizado via Samsung Health, Apple Health ou CSV',
      xpReward: 25,
      coinsReward: 20,
      progressText: `${stepsToday.toLocaleString('pt-BR')} / ${stepsTarget.toLocaleString('pt-BR')} passos`,
      progressPercent: Math.min(100, Math.round((stepsToday / stepsTarget) * 100)),
      isFulfilled: stepsToday >= stepsTarget,
      isClaimedToday: claimedAutoQuestKeys.includes(`${todayKey}:steps_6000`),
    },
    {
      id: 'workout_today',
      title: 'Treino ou Atividade Diária',
      subtitle: 'Sessão guiada no app ou treino importado (Strava/Samsung/GPX)',
      xpReward: 30,
      coinsReward: 25,
      progressText: trainedToday ? '1 / 1 concluído' : '0 / 1 hoje',
      progressPercent: trainedToday ? 100 : 0,
      isFulfilled: trainedToday,
      isClaimedToday: claimedAutoQuestKeys.includes(`${todayKey}:workout_today`),
    },
    {
      id: 'weight_today',
      title: 'Check-in de Peso Corporal',
      subtitle: 'Registre seu peso no card de evolução física hoje',
      xpReward: 15,
      coinsReward: 15,
      progressText: weighedToday ? 'Registrado hoje' : 'Pendente hoje',
      progressPercent: weighedToday ? 100 : 0,
      isFulfilled: weighedToday,
      isClaimedToday: claimedAutoQuestKeys.includes(`${todayKey}:weight_today`),
    },
  ];
}

const HYBRID_EXERCISE_FOCUS_MAP: Record<
  string,
  { primaryFocus: string; activationCues: string[]; xpTip: string }
> = {
  'ex-ch-a-1': {
    primaryFocus: 'Peitoral inferior, tríceps e estabilidade escapular nas paralelas',
    activationCues: [
      'Mantenha os ombros deprimidos (longe das orelhas) antes de iniciar a descida.',
      'Incline levemente o tronco à frente para recrutar mais peitoral ou mantenha vertical para focar no tríceps.',
      'Desça em 2–3 segundos até ~90° nos cotovelos e suba sem travar com tranco.',
    ],
    xpTip:
      'Quando alcançar 4x12 limpas sem compensar com o ombro, adicione +2,5 kg na mochila usando o ajuste rápido.',
  },
  'ex-ch-a-2': {
    primaryFocus: 'Dorsais, romboides e controle isométrico lombar com barra',
    activationCues: [
      'Trave o quadril em dobradiça (~45°) mantendo o abdômen contraído para blindar a lombar.',
      'Inicie a puxada retraindo as escápulas e conduzindo os cotovelos junto ao tronco até o umbigo.',
      'Segure 1 segundo no topo de contração para maximizar o recrutamento das costas.',
    ],
    xpTip:
      'Séries completas sem impulso de tronco garantem base sólida para progredir além dos 20 kg em anilhas.',
  },
  'ex-ch-a-3': {
    primaryFocus: 'Peitoral medial/superior, deltoide anterior e anti-extensão de core',
    activationCues: [
      'Mantenha os cotovelos a ~45° do tronco formando uma seta, nunca abertos a 90°.',
      'Contraia glúteos e abdômen durante toda a série para evitar que o quadril ceda.',
      'Elevar os pés aumenta a tensão no peitoral superior sem precisar de carga externa.',
    ],
    xpTip:
      'Use o descanso de 60s para recuperar o fôlego e concluir todas as séries visando 100% do bônus de Chefe.',
  },
  'ex-ch-a-4': {
    primaryFocus: 'Deltoides anteriores/médios, tríceps e estabilização vertical do core',
    activationCues: [
      'Contraia glúteos e abdômen antes de empurrar a barra acima da cabeça, evitando hiperextensão lombar.',
      'Encaixe a cabeça levemente à frente assim que a barra passar da testa para alinhar barra, ombros e quadril.',
      'Controle a descida até a clavícula sem deixar os cotovelos caírem para trás.',
    ],
    xpTip:
      'Movimento técnico chave: priorize amplitude completa com 10 kg em anilhas antes de subir +2,5 kg.',
  },
  'ex-ch-a-5': {
    primaryFocus: 'Grande dorsal unilateral e correção de assimetrias tronco-ombro',
    activationCues: [
      'Puxe o peso da barra curta em arco em direção ao bolso lateral do quadril, não reto para o peito.',
      'Evite rodar o tronco na saída; deixe o core resistir à rotação durante todo o movimento.',
      'Conte o mesmo número de repetições em ambos os lados mantendo cadência idêntica.',
    ],
    xpTip:
      'Comece sempre pelo braço menos dominante para equiparar força e validar o exercício sem sobrecarga.',
  },
  'ex-ch-a-6': {
    primaryFocus: 'Hipertrofia combinada de bíceps e tríceps em tensão metabólica contínua',
    activationCues: [
      'Na Rosca Direta, fixe os cotovelos ao lado das costelas evitando balanço lombar.',
      'Passe imediatamente para o Tríceps Testa mantendo os cotovelos apontados para o teto.',
      'Estenda completamente os braços sem abrir os cotovelos nas últimas repetições.',
    ],
    xpTip:
      'Bi-set acelera a densidade metabólica do treino e reduz o tempo total mantendo o ritmo contra o relógio.',
  },
  'ex-ch-a-7': {
    primaryFocus: 'Reto abdominal inferior, flexores de quadril e força de ombros em sustentação',
    activationCues: [
      'Empurre as paralelas para baixo ativando o serrátil antes de elevar as pernas.',
      'Faça leve retroversão pélvica no topo para tirar a tensão apenas dos flexores e focar no abdômen.',
      'Na variação L-Sit, mantenha os joelhos estendidos e respiração contínua durante a isometria.',
    ],
    xpTip:
      'Finalizador do Dia A: concluir este último bloco derrota o Colosso das Paralelas e libera +25 Moedas bônus.',
  },
  'ex-ch-b-1': {
    primaryFocus: 'Quadríceps, glúteo máximo e estabilidade unilateral de joelho/quadril',
    activationCues: [
      'Concentre cerca de 80% do peso no calcanhar e médio-pé da perna da frente.',
      'Incline levemente o tronco à frente para aumentar a ativação de glúteos ou mantenha ereto para mais quadríceps.',
      'Desça controlando o joelho alinhado à ponta do pé sem deixar o valgo acontecer.',
    ],
    xpTip:
      'Exercício principal do Dia B: mantenha a carga atual registrada em kg para acompanhar a evolução semana a semana.',
  },
  'ex-ch-b-2': {
    primaryFocus: 'Posteriores de coxa (isquiotibiais), glúteos e eretores da espinha',
    activationCues: [
      'Mantenha os joelhos levemente destravados e empurre o quadril para trás como se quisesse tocar uma parede atrás.',
      'Deslize a barra reta bem rente às coxas e canelas mantendo as costas planas.',
      'Suba empurrando o chão e contraindo os glúteos até alinhar o tronco sem jogar a lombar para trás.',
    ],
    xpTip:
      'Mantenha a amplitude até sentir alongamento claro nos posteriores sem perder a curvatura neutra da coluna.',
  },
  'ex-ch-b-3': {
    primaryFocus: 'Quadríceps profundos, core torácico e postura vertical sob carga frontal',
    activationCues: [
      'Apoie a barra nos deltoides anteriores mantendo os cotovelos altos durante toda a descida.',
      'Respire fundo no abdômen (bracing) antes de agachar para sustentar o tronco ereto.',
      'Empurre os joelhos suavemente para fora acompanhando a linha dos pés.',
    ],
    xpTip:
      'Com 4 anilhas de 5kg (20 kg), controle 2s na descida para maximizar estímulo sem pressa.',
  },
  'ex-ch-b-4': {
    primaryFocus: 'Glúteo máximo e médio unilateral com proteção lombar',
    activationCues: [
      'Posicione o pé de apoio de forma que a canela fique vertical no topo da extensão.',
      'Mantenha o queixo levemente encaixado no peito e suba apenas pela extensão do quadril, sem arquear a lombar.',
      'Pause 1 segundo no pico de contração antes de descer controladamente.',
    ],
    xpTip:
      'Use anilhas apoiadas diretamente no quadril e ajuste facilmente a carga se sentir diferença entre os lados.',
  },
  'ex-ch-b-5': {
    primaryFocus: 'Gastrocnêmio, sóleo e estabilidade do tornozelo em amplitude máxima',
    activationCues: [
      'Use um degrau para descer o calcanhar abaixo da linha horizontal e alongar totalmente a panturrilha.',
      'Pause 1 segundo em baixo para eliminar o efeito elástico e suba firme até o pico na ponta dos pés.',
      'Mantenha o joelho quase estendido e foco total no controle da descida.',
    ],
    xpTip:
      'Descanso curto de 45s mantém o ritmo alto para chegar inteiro ao bloco final de core.',
  },
  'ex-ch-b-6': {
    primaryFocus: 'Core profundo (transverso e oblíquos) em resistência anti-rotacional',
    activationCues: [
      'Afaste os pés um pouco além da largura do quadril para criar base estável.',
      'Ao tocar o ombro oposto, evite que o quadril balance ou gire de um lado para o outro.',
      'Empurre o chão ativamente com a mão de apoio mantendo escápulas estáveis.',
    ],
    xpTip:
      'Último golpe do Dia B: completar esta série derruba o Titã da Base Férrea e garante os 220 XP integrais.',
  },
  'ex-dg-a-1': {
    primaryFocus: 'Quadríceps, glúteos e padrão postural de agachamento com carga frontal',
    activationCues: [
      'Segure a barra curta de 50 cm (ou anilha) bem próxima ao esterno com cotovelos apontados para baixo.',
      'Inicie sentando entre os quadris e empurre os joelhos suavemente na direção dos dedos dos pés.',
      'Mantenha os calcanhares firmes no solo durante toda a subida.',
    ],
    xpTip:
      'Sugestão inicial de 10 kg (barra 50 cm + anilhas de 5 kg); ajuste livremente entre 5 kg e 10 kg conforme domínio técnico.',
  },
  'ex-dg-a-2': {
    primaryFocus: 'Peitoral, deltoide anterior e tríceps em alavanca progressiva',
    activationCues: [
      'Escolha uma elevação firme (banco ou mesa) que permita 8 a 10 repetições limpas sem perder o alinhamento.',
      'Mantenha os cotovelos a ~45° em relação ao tronco e abdômen travado.',
      'Toque o peito próximo à borda do apoio e empurre com controle constante.',
    ],
    xpTip:
      'Quando atingir 3x10 confortavelmente, reduza a inclinação do apoio para aumentar a dificuldade sem precisar de carga extra.',
  },
  'ex-dg-a-3': {
    primaryFocus: 'Deltoides anteriores/médios, tríceps e estabilidade vertical do tronco',
    activationCues: [
      'Contraia glúteos e abdômen antes de empurrar a barra de 150 cm acima da cabeça.',
      'Evite compensar inclinando a lombar para trás; mantenha as costelas abaixadas.',
      'Desça controlando até a altura da clavícula entre cada repetição.',
    ],
    xpTip:
      'Comece leve entre 5 kg e 10 kg para adaptar ombros e punhos antes de progredir as anilhas.',
  },
  'ex-dg-a-4': {
    primaryFocus: 'Quadríceps, glúteos e equilíbrio unilateral de quadril e joelho',
    activationCues: [
      'Dê um passo firme mantendo os pés afastados na largura do quadril (não em linha reta) para maior equilíbrio.',
      'Desça verticalmente até o joelho de trás se aproximar do solo sem bater.',
      'Empurre pelo calcanhar da perna da frente para retornar à base.',
    ],
    xpTip:
      'Com 5 kg na barra 50 cm, execute 8 repetições controladas por perna buscando simetria entre ambos os lados.',
  },
  'ex-dg-a-5': {
    primaryFocus: 'Core profundo (transverso e reto abdominal) e estabilidade escapular',
    activationCues: [
      'Empurre o solo com os antebraços evitando que os ombros afundem entre as escápulas.',
      'Mantenha glúteos contraídos e pelve neutra por 20 a 30 segundos contínuos.',
      'Respire de forma calma e ritmada sem prender o ar.',
    ],
    xpTip:
      'Último golpe do Treino A: completar a prancha finaliza o Vigia de Pedra Rank F e libera bônus de moedas.',
  },
  'ex-dg-b-1': {
    primaryFocus: 'Isquiotibiais (posteriores de coxa), glúteos e dobradiça de quadril segura',
    activationCues: [
      'Destrave levemente os joelhos e mantenha-os nessa angulação fixa enquanto empurra o quadril para trás.',
      'Deslize a barra de 150 cm bem rente às coxas e canelas preservando as costas retas.',
      'Suba contraindo os glúteos até alinhar o tronco sem hiperextender a lombar.',
    ],
    xpTip:
      'Inicie com 10 kg leves para memorizar a dobradiça de quadril com coluna neutra e descanso completo de 75s.',
  },
  'ex-dg-b-2': {
    primaryFocus: 'Dorsais, romboides, deltoide posterior e controle postural',
    activationCues: [
      'Mantenha o tronco inclinado a ~45° com abdômen firme durante todas as 10 repetições.',
      'Puxe a barra 150 cm conduzindo os cotovelos para trás e junto ao corpo até tocar próximo ao umbigo.',
      'Evite usar impulso de quadril para subir o peso.',
    ],
    xpTip:
      'Com 10 kg iniciais, pause meio segundo no topo para sentir o fechamento das escápulas.',
  },
  'ex-dg-b-3': {
    primaryFocus: 'Glúteo máximo, posteriores e estabilização pélvica sem estresse lombar',
    activationCues: [
      'Apoie uma anilha de 5 kg confortavelmente sobre o quadril segurando-a com as mãos.',
      'Empurre os calcanhares no solo e contraia os glúteos no topo por 1 segundo.',
      'Evite empurrar com a lombar ou abrir excessivamente os joelhos.',
    ],
    xpTip:
      'Carga sugerida de 5 kg (editável de 5 a 10 kg); foque em 15 repetições contínuas de alta qualidade.',
  },
  'ex-dg-b-4': {
    primaryFocus: 'Bíceps braquial e braquiorradial com controle excêntrico',
    activationCues: [
      'Mantenha os cotovelos parados ao lado das costelas do início ao fim da série.',
      'Suba a barra até a contração total do bíceps e controle a descida em ~2 segundos.',
      'Evite jogar os ombros para frente ou balançar o tronco.',
    ],
    xpTip:
      'Descanso curto de 45s com 5 kg iniciais mantém ótimo estímulo metabólico nos braços.',
  },
  'ex-dg-b-5': {
    primaryFocus: 'Eretores da espinha, glúteos e cadeia extensora posterior',
    activationCues: [
      'Deitado de bruços, eleve braços e pernas em conjunto apenas alguns centímetros do chão.',
      'Olhe para o colchonete mantendo a cervical alinhada sem dobrar o pescoço para trás.',
      'Pause 1 segundo no alto respirando antes de descer suavemente.',
    ],
    xpTip:
      'Fechamento do Treino B: fortalece a lombar para as cargas futuras e derrota a Sombra da Forja Rank F.',
  },
};

export function getExerciseInsight(
  exercise: ExerciseItem,
  workout: WorkoutTemplate
): ExerciseInsight {
  const totalExercises = Math.max(1, workout.exercises.length);
  const xpPerExercise = Math.max(1, Math.round(workout.baseXp / totalExercises));
  const bossDamagePercent = Math.max(1, Math.round(85 / totalExercises));
  const custom = HYBRID_EXERCISE_FOCUS_MAP[exercise.id];

  if (custom) {
    return {
      primaryFocus: custom.primaryFocus,
      activationCues: custom.activationCues,
      xpPerExercise,
      bossDamagePercent,
      xpStrategyTip: `${custom.xpTip} Concluir todos os ${totalExercises} exercícios garante +${workout.baseXp} XP totais e +25 Moedas bônus pela derrota do Chefe.`,
    };
  }

  const primaryMuscles =
    exercise.muscleGroups.length > 0
      ? exercise.muscleGroups.join(', ')
      : 'Corpo inteiro';
  const activationCues: string[] = [
    `Direcione a atenção mecânica para ${primaryMuscles} em toda a amplitude do movimento.`,
    exercise.unilateral
      ? 'Controle a assimetria: execute o mesmo volume e cadência em ambos os lados sem girar o tronco.'
      : 'Controle a fase excêntrica (descida em 2–3s) mantendo respiração ritmada e bracing abdominal.',
    `Respeite o descanso de ${exercise.restSeconds}s entre séries para sustentar qualidade técnica e volume total.`,
  ];

  const loadGuidance =
    typeof exercise.loadKg === 'number' && exercise.loadKg > 0
      ? `Com ${exercise.loadKg} kg registrados, ajuste +2,5 kg apenas quando completar todas as repetições com técnica limpa.`
      : 'Mantenha o foco em amplitude completa e controle corporal para evitar perda de rendimento nas séries finais.';

  return {
    primaryFocus: `${primaryMuscles} · Controle articular e estabilidade`,
    activationCues,
    xpPerExercise,
    bossDamagePercent,
    xpStrategyTip: `${loadGuidance} Cada exercício concluído rende cerca de +${xpPerExercise} XP e causa ~${bossDamagePercent}% de dano no Chefe; completar 100% da sessão desbloqueia +25 Moedas bônus.`,
  };
}

export function mergeWithInitialWorkouts(
  loaded: WorkoutTemplate[],
  uid: string
): WorkoutTemplate[] {
  if (loaded.length === 0) {
    return INITIAL_WORKOUTS.map((w) => ({ ...w, userId: uid }));
  }
  const loadedIds = new Set(loaded.map((w) => w.id));
  const missing = INITIAL_WORKOUTS.filter((w) => !loadedIds.has(w.id)).map((w) => ({
    ...w,
    userId: uid,
  }));
  return missing.length > 0 ? [...loaded, ...missing] : loaded;
}

// ============================================================================
// REGISTRO DE SÉRIES REAIS, PRS, MISSÕES SEMANAIS & RAID SEMANAL
// ============================================================================

export const PR_XP_PER_RECORD = 20;
export const PR_COINS_PER_RECORD = 10;
export const MAX_PR_XP_PER_SESSION = 100;
export const MAX_PR_COINS_PER_SESSION = 50;

export function calculateSessionPrBonus(prCount: number): {
  prXpBonus: number;
  prCoinsBonus: number;
} {
  const safeCount = Math.max(0, Math.floor(prCount));
  return {
    prXpBonus: Math.min(MAX_PR_XP_PER_SESSION, safeCount * PR_XP_PER_RECORD),
    prCoinsBonus: Math.min(MAX_PR_COINS_PER_SESSION, safeCount * PR_COINS_PER_RECORD),
  };
}

export function parseExercisePrescription(prescription: string): {
  setsCount: number;
  targetReps: number;
  isTimeBased: boolean;
} {
  const text = String(prescription || '').toLowerCase();
  const isTimeBased =
    /\d+\s*(?:s|seg|segundos?|min|minutos?)(?=$|[^a-zà-ÿ])/i.test(text) ||
    text.includes('isometria');
  const setsMatch = text.match(/(\d+)\s*(?:s[ée]ries?|x\b)/i);
  const setsCount = setsMatch
    ? Math.min(12, Math.max(1, Number.parseInt(setsMatch[1], 10) || 3))
    : 3;

  const afterX = text.split(/x/i)[1] ?? text;
  const rangeMatch = afterX.match(/(\d+)\s*[-–a]\s*(\d+)/);
  let targetReps = 10;
  if (rangeMatch) {
    const low = Number.parseInt(rangeMatch[1], 10) || 8;
    const high = Number.parseInt(rangeMatch[2], 10) || low;
    targetReps = Math.max(1, Math.round((low + high) / 2));
  } else {
    const singleMatch = afterX.match(/(\d+)/);
    if (singleMatch) {
      targetReps = Math.max(1, Number.parseInt(singleMatch[1], 10) || 10);
    }
  }

  return {
    setsCount,
    targetReps: Math.min(500, targetReps),
    isTimeBased,
  };
}

export function calculateEstimated1RmKg(weightKg: number, reps: number): number {
  if (!Number.isFinite(weightKg) || !Number.isFinite(reps) || weightKg <= 0 || reps <= 0) {
    return 0;
  }
  const safeWeight = Math.max(0, weightKg);
  const safeReps = Math.max(1, Math.min(30, Math.round(reps)));
  if (safeReps === 1) {
    return Number(safeWeight.toFixed(1));
  }
  return Number((safeWeight * (1 + safeReps / 30)).toFixed(1));
}

export function evaluateExercisePrUpdate(
  sets: PerformedSetEntry[],
  existingPr?: Pick<
    ExercisePrRecord,
    'bestWeightKg' | 'bestReps' | 'bestVolumeKg' | 'estimated1RmKg'
  > | null
): {
  annotatedSets: PerformedSetEntry[];
  volumeKg: number;
  hasPr: boolean;
  bestWeightKg: number;
  bestReps: number;
  bestSetVolumeKg: number;
  bestEstimated1RmKg: number;
  nextBestWeightKg: number;
  nextBestReps: number;
  nextBestVolumeKg: number;
  nextEstimated1RmKg: number;
} {
  let volumeKg = 0;
  let sessionBestWeight = 0;
  let sessionBestReps = 0;
  let sessionBestSetVolume = 0;
  let sessionBest1Rm = 0;

  const prevWeight = Math.max(0, existingPr?.bestWeightKg ?? 0);
  const prevReps = Math.max(0, existingPr?.bestReps ?? 0);
  const prevSetVol = Math.max(0, existingPr?.bestVolumeKg ?? 0);
  const prev1Rm = Math.max(0, existingPr?.estimated1RmKg ?? 0);
  const hasHistory = Boolean(existingPr);

  const annotatedSets: PerformedSetEntry[] = sets.map((setItem, index) => {
    const cleanWeight = Number(Math.max(0, Math.min(500, Number(setItem.weightKg) || 0)).toFixed(1));
    const cleanReps = Math.max(0, Math.min(500, Math.round(Number(setItem.reps) || 0)));
    const completed = Boolean(setItem.completed);

    if (!completed || cleanReps <= 0) {
      return {
        setIndex: Number.isFinite(setItem.setIndex) ? setItem.setIndex : index + 1,
        weightKg: cleanWeight,
        reps: cleanReps,
        completed,
        isPr: false,
      };
    }

    const setVol = Number((cleanWeight * cleanReps).toFixed(1));
    const est1Rm = calculateEstimated1RmKg(cleanWeight, cleanReps);
    volumeKg += setVol;

    if (cleanWeight > sessionBestWeight) sessionBestWeight = cleanWeight;
    if (cleanReps > sessionBestReps) sessionBestReps = cleanReps;
    if (setVol > sessionBestSetVolume) sessionBestSetVolume = setVol;
    if (est1Rm > sessionBest1Rm) sessionBest1Rm = est1Rm;

    let setIsPr = false;
    if (cleanWeight > 0) {
      if (!hasHistory) {
        setIsPr = true;
      } else {
        setIsPr =
          est1Rm > prev1Rm ||
          cleanWeight > prevWeight ||
          setVol > prevSetVol;
      }
    } else if (!hasHistory) {
      setIsPr = true;
    } else {
      setIsPr = cleanReps > prevReps;
    }

    return {
      setIndex: Number.isFinite(setItem.setIndex) ? setItem.setIndex : index + 1,
      weightKg: cleanWeight,
      reps: cleanReps,
      completed: true,
      isPr: setIsPr,
    };
  });

  const hasPr = annotatedSets.some((s) => Boolean(s.isPr));

  return {
    annotatedSets,
    volumeKg: Number(volumeKg.toFixed(1)),
    hasPr,
    bestWeightKg: sessionBestWeight,
    bestReps: sessionBestReps,
    bestSetVolumeKg: sessionBestSetVolume,
    bestEstimated1RmKg: sessionBest1Rm,
    nextBestWeightKg: Math.max(prevWeight, sessionBestWeight),
    nextBestReps: Math.max(prevReps, sessionBestReps),
    nextBestVolumeKg: Math.max(prevSetVol, sessionBestSetVolume),
    nextEstimated1RmKg: Math.max(prev1Rm, sessionBest1Rm),
  };
}

function parseDateKeyLocalNoon(dateInput?: Date | string): Date {
  if (dateInput instanceof Date) {
    return new Date(
      dateInput.getFullYear(),
      dateInput.getMonth(),
      dateInput.getDate(),
      12,
      0,
      0
    );
  }
  if (typeof dateInput === 'string' && /^\d{4}-\d{2}-\d{2}/.test(dateInput)) {
    const [y, m, d] = dateInput.slice(0, 10).split('-').map(Number);
    return new Date(y, (m || 1) - 1, d || 1, 12, 0, 0);
  }
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0);
}

export function getIsoWeekKey(dateInput?: Date | string): string {
  const local = parseDateKeyLocalNoon(dateInput);
  const utc = new Date(Date.UTC(local.getFullYear(), local.getMonth(), local.getDate()));
  const dayNum = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((utc.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${utc.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

export function getIsoWeekDateRange(dateInput?: Date | string): {
  weekKey: string;
  startDateKey: string;
  endDateKey: string;
} {
  const local = parseDateKeyLocalNoon(dateInput);
  const jsDay = local.getDay();
  const mondayOffset = jsDay === 0 ? -6 : 1 - jsDay;
  const monday = new Date(
    local.getFullYear(),
    local.getMonth(),
    local.getDate() + mondayOffset,
    12,
    0,
    0
  );
  const sunday = new Date(
    monday.getFullYear(),
    monday.getMonth(),
    monday.getDate() + 6,
    12,
    0,
    0
  );
  return {
    weekKey: getIsoWeekKey(local),
    startDateKey: getLocalDateKey(monday),
    endDateKey: getLocalDateKey(sunday),
  };
}

export function isWeeklyAutoQuestId(value: unknown): value is WeeklyAutoQuestId {
  return (
    value === 'weekly_workouts_3' ||
    value === 'weekly_volume_4000' ||
    value === 'weekly_pr_1'
  );
}

export function evaluateWeeklyAutoQuests(
  referenceDateKey: string,
  logs: WorkoutLog[],
  healthActivities: HealthActivity[],
  claimedAutoQuestKeys: string[]
): WeeklyAutoQuestEvaluation[] {
  const { weekKey, startDateKey, endDateKey } = getIsoWeekDateRange(referenceDateKey);
  const weekLogs = logs.filter(
    (l) => l.dateKey >= startDateKey && l.dateKey <= endDateKey
  );
  const weekActs = healthActivities.filter(
    (a) => a.dateKey >= startDateKey && a.dateKey <= endDateKey
  );

  const workoutsCount = weekLogs.length + weekActs.length;
  const weeklyVolumeKg = Number(
    weekLogs.reduce((acc, l) => acc + (l.totalVolumeKg ?? 0), 0).toFixed(0)
  );
  const weeklyPrCount = weekLogs.reduce((acc, l) => acc + (l.prCount ?? 0), 0);

  const workoutsTarget = 3;
  const volumeTarget = 4000;
  const prTarget = 1;

  return [
    {
      id: 'weekly_workouts_3',
      weekKey,
      title: 'Consistência Semanal',
      subtitle: 'Complete 3 sessões de treino entre segunda e domingo',
      xpReward: 60,
      coinsReward: 40,
      raidDamage: 25,
      progressText: `${workoutsCount} / ${workoutsTarget} treinos`,
      progressPercent: Math.min(100, Math.round((workoutsCount / workoutsTarget) * 100)),
      isFulfilled: workoutsCount >= workoutsTarget,
      isClaimedThisWeek: claimedAutoQuestKeys.includes(`${weekKey}:weekly_workouts_3`),
    },
    {
      id: 'weekly_volume_4000',
      weekKey,
      title: 'Volume da Semana',
      subtitle: 'Movimente 4.000 kg somando carga × reps das séries concluídas',
      xpReward: 75,
      coinsReward: 50,
      raidDamage: 30,
      progressText: `${weeklyVolumeKg.toLocaleString('pt-BR')} / ${volumeTarget.toLocaleString('pt-BR')} kg`,
      progressPercent: Math.min(100, Math.round((weeklyVolumeKg / volumeTarget) * 100)),
      isFulfilled: weeklyVolumeKg >= volumeTarget,
      isClaimedThisWeek: claimedAutoQuestKeys.includes(`${weekKey}:weekly_volume_4000`),
    },
    {
      id: 'weekly_pr_1',
      weekKey,
      title: 'Caçador de Recordes',
      subtitle: 'Bata pelo menos 1 Novo PR de carga, reps ou 1RM na semana',
      xpReward: 50,
      coinsReward: 35,
      raidDamage: 25,
      progressText: `${weeklyPrCount} / ${prTarget} PR${weeklyPrCount === 1 ? '' : 's'}`,
      progressPercent: Math.min(100, Math.round((weeklyPrCount / prTarget) * 100)),
      isFulfilled: weeklyPrCount >= prTarget,
      isClaimedThisWeek: claimedAutoQuestKeys.includes(`${weekKey}:weekly_pr_1`),
    },
  ];
}

const WEEKLY_RAID_ROSTER: ReadonlyArray<{
  bossName: string;
  bossSubtitle: string;
  variant: 'golem' | 'hydra' | 'sentinel' | 'dragon';
}> = [
  {
    bossName: 'Hidra do Ferro Semanal',
    bossSubtitle: 'Drene o HP compartilhado concluindo treinos e volume de segunda a domingo',
    variant: 'hydra',
  },
  {
    bossName: 'Colosso de Basalto',
    bossSubtitle: 'Volume levantado e recordes pessoais causam dano massivo à armadura semanal',
    variant: 'golem',
  },
  {
    bossName: 'Sentinela da Torre Vermelha',
    bossSubtitle: 'Consistência de 3+ treinos na semana rompe o escudo da cidadela',
    variant: 'sentinel',
  },
  {
    bossName: 'Dragão do Monarca Semanal',
    bossSubtitle: 'Chefe supremo da semana: combine volume, PRs e missões semanais',
    variant: 'dragon',
  },
];

export function getWeeklyRaidBossState(
  referenceDateKey: string,
  logs: WorkoutLog[],
  healthActivities: HealthActivity[]
): WeeklyRaidBossState {
  const { weekKey, startDateKey, endDateKey } = getIsoWeekDateRange(referenceDateKey);
  const weekLogs = logs.filter(
    (l) => l.dateKey >= startDateKey && l.dateKey <= endDateKey
  );
  const weekActs = healthActivities.filter(
    (a) => a.dateKey >= startDateKey && a.dateKey <= endDateKey
  );

  const workoutsThisWeek = weekLogs.length + weekActs.length;
  const weeklyVolumeKg = Number(
    weekLogs.reduce((acc, l) => acc + (l.totalVolumeKg ?? 0), 0).toFixed(0)
  );
  const weeklyPrCount = weekLogs.reduce((acc, l) => acc + (l.prCount ?? 0), 0);

  const weekNumberMatch = weekKey.match(/W(\d{2})$/);
  const weekIndex = weekNumberMatch
    ? (Number.parseInt(weekNumberMatch[1], 10) || 1) % WEEKLY_RAID_ROSTER.length
    : 0;
  const bossMeta = WEEKLY_RAID_ROSTER[weekIndex];

  const maxHp = 120;
  const damageFromWorkouts = workoutsThisWeek * 25;
  const damageFromVolume = Math.floor(weeklyVolumeKg / 200) * 2;
  const damageFromPrs = weeklyPrCount * 15;
  const damageDealt = Math.min(maxHp, damageFromWorkouts + damageFromVolume + damageFromPrs);
  const currentHp = Math.max(0, maxHp - damageDealt);

  return {
    weekKey,
    bossName: bossMeta.bossName,
    bossSubtitle: bossMeta.bossSubtitle,
    variant: bossMeta.variant,
    maxHp,
    currentHp,
    damageDealt,
    hpPercent: Math.round((currentHp / maxHp) * 100),
    isDefeated: currentHp === 0,
    workoutsThisWeek,
    weeklyVolumeKg,
    weeklyPrCount,
  };
}
