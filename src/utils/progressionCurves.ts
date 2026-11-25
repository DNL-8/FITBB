import type {
  HunterRankDefinition,
  HunterRankLetter,
  HunterRankProgress,
  MurimRealmDefinition,
} from '../types/fitness.ts';

export const DAYS_PER_RANK_BASELINE = 30;
export const WEEKLY_WORKOUT_PACE_TARGET = '4-5' as const;
export const WEEKLY_PACE_BASELINE_LABEL = '4–5 treinos/semana + missões';

export interface RankCurveMilestone {
  rank: HunterRankLetter;
  minLevel: number;
  maxLevel: number;
  startXp: number;
  xpToNextRank: number;
  estimatedMonthlyXpRate: number;
  estimatedDayStart: number;
}

export const LEVEL_THRESHOLDS: readonly { level: number; minXp: number; title: string }[] = [
  { level: 1, minXp: 0, title: 'Rank F' },
  { level: 2, minXp: 2000, title: 'Rank F II' },
  { level: 3, minXp: 4000, title: 'Rank E' },
  { level: 4, minXp: 6250, title: 'Rank E II' },
  { level: 5, minXp: 8500, title: 'Rank D' },
  { level: 6, minXp: 10150, title: 'Rank D II' },
  { level: 7, minXp: 11800, title: 'Rank D III' },
  { level: 8, minXp: 13500, title: 'Rank C' },
  { level: 9, minXp: 15300, title: 'Rank C II' },
  { level: 10, minXp: 17150, title: 'Rank C III' },
  { level: 11, minXp: 19000, title: 'Rank B' },
  { level: 12, minXp: 20500, title: 'Rank B II' },
  { level: 13, minXp: 22000, title: 'Rank B III' },
  { level: 14, minXp: 23500, title: 'Rank B IV' },
  { level: 15, minXp: 25000, title: 'Rank A' },
  { level: 16, minXp: 26300, title: 'Rank A II' },
  { level: 17, minXp: 27600, title: 'Rank A III' },
  { level: 18, minXp: 28900, title: 'Rank A IV' },
  { level: 19, minXp: 30200, title: 'Rank A Superior' },
  { level: 20, minXp: 31500, title: 'Rank S' },
  { level: 21, minXp: 32900, title: 'Rank S II' },
  { level: 22, minXp: 34300, title: 'Rank S III' },
  { level: 23, minXp: 35700, title: 'Rank S IV' },
  { level: 24, minXp: 37100, title: 'Rank S V' },
  { level: 25, minXp: 38500, title: 'Rank S Nacional' },
];

export const HUNTER_RANK_TIERS: readonly HunterRankDefinition[] = [
  {
    rank: 'F',
    label: 'Caçador Rank F',
    minLevel: 1,
    maxLevel: 2,
    description: 'Ponto de partida no mundo moderno (como Jin Taekyung no início). Sobrevive nas menores fendas.',
    accentHex: '#94a3b8',
  },
  {
    rank: 'E',
    label: 'Caçador Rank E',
    minLevel: 3,
    maxLevel: 4,
    description: 'Primeiro despertar físico concluído; resistência e força já superam um civil comum.',
    accentHex: '#38bdf8',
  },
  {
    rank: 'D',
    label: 'Caçador Rank D',
    minLevel: 5,
    maxLevel: 7,
    description: 'Combatente consistente capaz de liderar incursões regulares e suportar alta carga.',
    accentHex: '#22c55e',
  },
  {
    rank: 'C',
    label: 'Caçador Rank C',
    minLevel: 8,
    maxLevel: 10,
    description: 'Veterano respeitado pela Associação; condicionamento sólido em força e resistência.',
    accentHex: '#eab308',
  },
  {
    rank: 'B',
    label: 'Caçador Rank B',
    minLevel: 11,
    maxLevel: 14,
    description: 'Elite intermediária do mundo real; presença decisiva em portões de alto risco.',
    accentHex: '#a855f7',
  },
  {
    rank: 'A',
    label: 'Caçador Rank A',
    minLevel: 15,
    maxLevel: 19,
    description: 'Status conquistado ao retornar de Murim — poder muito acima de um Rank A comum.',
    accentHex: '#ef4444',
  },
  {
    rank: 'S',
    label: 'Caçador Rank S',
    minLevel: 20,
    maxLevel: 25,
    description: 'O ápice dos caçadores modernos. Poder equivalente a uma força nacional.',
    accentHex: '#f59e0b',
  },
];

export const VALID_WORKOUT_RANKS: readonly HunterRankLetter[] = [
  'F',
  'E',
  'D',
  'C',
  'B',
  'A',
  'S',
] as const;

export const BASE_HUNTER_RANK: HunterRankLetter = VALID_WORKOUT_RANKS[0];

export function getHunterRankDefinition(rank: unknown): HunterRankDefinition {
  const candidate =
    typeof rank === 'string' ? rank.trim().toUpperCase() : BASE_HUNTER_RANK;
  return (
    HUNTER_RANK_TIERS.find((tier) => tier.rank === candidate) ??
    HUNTER_RANK_TIERS[0]
  );
}

export function getHunterRankStartXp(rank: HunterRankLetter): number {
  const tier = HUNTER_RANK_TIERS.find((t) => t.rank === rank);
  if (!tier) return 0;
  return LEVEL_THRESHOLDS.find((t) => t.level === tier.minLevel)?.minXp ?? 0;
}

export const THIRTY_DAY_CONSISTENCY_CURVE: readonly RankCurveMilestone[] =
  HUNTER_RANK_TIERS.map((tier, index) => {
    const startXp = getHunterRankStartXp(tier.rank);
    const nextTier = HUNTER_RANK_TIERS[index + 1];
    const nextStartXp = nextTier
      ? getHunterRankStartXp(nextTier.rank)
      : LEVEL_THRESHOLDS[LEVEL_THRESHOLDS.length - 1].minXp;
    const xpToNextRank = Math.max(0, nextStartXp - startXp);
    return {
      rank: tier.rank,
      minLevel: tier.minLevel,
      maxLevel: tier.maxLevel,
      startXp,
      xpToNextRank,
      estimatedMonthlyXpRate: xpToNextRank,
      estimatedDayStart: index === 0 ? 1 : index * DAYS_PER_RANK_BASELINE,
    };
  });

export const MURIM_REALM_TIERS: readonly MurimRealmDefinition[] = [
  {
    id: 'third_rate',
    order: 1,
    name: 'Artista Marcial de 3ª Classe',
    englishName: '3rd Rate',
    minQi: 0,
    qiTechnique: 'Acúmulo Inicial de Qi',
    description: 'O nível iniciante. Começou a acumular energia interna, mas o corpo ainda está em forja.',
    accentHex: '#94a3b8',
  },
  {
    id: 'second_rate',
    order: 2,
    name: 'Artista Marcial de 2ª Classe',
    englishName: '2nd Rate',
    minQi: 1350,
    qiTechnique: 'Circulação Básica de Qi',
    description: 'Possui experiência prática (~30 dias) e já compreende os fundamentos da energia interna.',
    accentHex: '#38bdf8',
  },
  {
    id: 'first_rate',
    order: 3,
    name: 'Artista Marcial de 1ª Classe',
    englishName: '1st Rate',
    minQi: 2700,
    qiTechnique: 'Imbuição de Qi na Arma',
    description: 'Nível de elite marcial (~60 dias). Consegue canalizar Qi para fortalecer sua arma em combate.',
    accentHex: '#22c55e',
  },
  {
    id: 'peak',
    order: 4,
    name: 'Pico',
    englishName: 'Peak',
    minQi: 4100,
    qiTechnique: 'Qi da Espada (Sword Qi)',
    description: 'Especialista completo (~90 dias) que alcança a união entre corpo e espada, manifestando o Qi da Espada.',
    accentHex: '#eab308',
  },
  {
    id: 'supreme_peak',
    order: 5,
    name: 'Pico Supremo',
    englishName: 'Supreme Peak / Transcendent',
    minQi: 5600,
    qiTechnique: 'Força da Arma (Weapon Force)',
    description: 'Mestre no controle de Qi (~120 dias), capaz de projetar Força da Arma visível e colorida. Líderes de seitas e clãs.',
    accentHex: '#f97316',
  },
  {
    id: 'unrestrained',
    order: 6,
    name: 'Reino Sem Restrições',
    englishName: 'Unrestrained Realm',
    minQi: 7200,
    qiTechnique: 'Supremacia dos 100 do Murim',
    description: 'A elite absoluta dos mestres (~150 dias), entre os 100 mais fortes de todo o Murim (nível do Rei do Fogo).',
    accentHex: '#ef4444',
  },
  {
    id: 'profound',
    order: 7,
    name: 'Reino Profundo',
    englishName: 'Profound Realm',
    minQi: 8900,
    qiTechnique: 'Espada do Ar',
    description: 'Estágio raríssimo (~180 dias), alcançado por menos de 20 artistas marciais, dominando a Espada do Ar.',
    accentHex: '#a855f7',
  },
  {
    id: 'life_and_death',
    order: 8,
    name: 'Reino da Vida e da Morte',
    englishName: 'Life and Death Realm',
    minQi: 10800,
    qiTechnique: 'Espada Invisível',
    description: 'O ápice lendário de Murim (~210 dias). Apenas os maiores mestres da história produzem a Espada Invisível.',
    accentHex: '#f59e0b',
  },
];

function sanitizeXpValue(totalXp: number): number {
  if (!Number.isFinite(totalXp)) return 0;
  return Math.max(0, Math.floor(totalXp));
}

export function calculateLevel(totalXp: number): number {
  const safeXp = sanitizeXpValue(totalXp);
  for (let i = LEVEL_THRESHOLDS.length - 1; i >= 0; i--) {
    if (safeXp >= LEVEL_THRESHOLDS[i].minXp) {
      return LEVEL_THRESHOLDS[i].level;
    }
  }
  return 1;
}

export function calculateHeroRankByXp(totalXp: number): HunterRankLetter {
  const recalculatedLevel = calculateLevel(totalXp);
  const matchedTier =
    HUNTER_RANK_TIERS.find(
      (tier) =>
        recalculatedLevel >= tier.minLevel &&
        recalculatedLevel <= tier.maxLevel
    ) ?? HUNTER_RANK_TIERS[HUNTER_RANK_TIERS.length - 1];
  return matchedTier.rank;
}

export function getLevelProgress(totalXp: number): {
  level: number;
  isMaster: boolean;
  isMaxLevel: boolean;
  levelTitle: string;
  currentLevelMinXp: number;
  nextLevelXp: number;
  xpIntoLevel: number;
  xpNeededForNext: number;
  progressPercent: number;
} {
  const safeXp = sanitizeXpValue(totalXp);
  const level = calculateLevel(safeXp);
  const isMaster = level >= 5;
  const currentThreshold =
    LEVEL_THRESHOLDS.find((t) => t.level === level) ?? LEVEL_THRESHOLDS[0];
  const nextThreshold = LEVEL_THRESHOLDS.find((t) => t.level === level + 1);

  if (!nextThreshold) {
    return {
      level,
      isMaster,
      isMaxLevel: true,
      levelTitle: currentThreshold.title,
      currentLevelMinXp: currentThreshold.minXp,
      nextLevelXp: currentThreshold.minXp,
      xpIntoLevel: safeXp - currentThreshold.minXp,
      xpNeededForNext: 0,
      progressPercent: 100,
    };
  }

  const span = Math.max(1, nextThreshold.minXp - currentThreshold.minXp);
  const xpIntoLevel = safeXp - currentThreshold.minXp;
  const xpNeededForNext = Math.max(0, nextThreshold.minXp - safeXp);
  const progressPercent = Math.min(100, Math.max(0, Math.round((xpIntoLevel / span) * 100)));

  return {
    level,
    isMaster,
    isMaxLevel: false,
    levelTitle: currentThreshold.title,
    currentLevelMinXp: currentThreshold.minXp,
    nextLevelXp: nextThreshold.minXp,
    xpIntoLevel,
    xpNeededForNext,
    progressPercent,
  };
}

export function getHunterRankForLevel(
  level: number,
  totalXp?: number
): HunterRankProgress {
  const safeLevel =
    totalXp !== undefined
      ? calculateLevel(totalXp)
      : Math.max(1, Math.floor(Number.isFinite(level) ? level : 1));
  const currentIndex = Math.max(
    0,
    HUNTER_RANK_TIERS.findIndex(
      (tier) => safeLevel >= tier.minLevel && safeLevel <= tier.maxLevel
    )
  );
  const resolvedIndex =
    safeLevel > HUNTER_RANK_TIERS[HUNTER_RANK_TIERS.length - 1].maxLevel
      ? HUNTER_RANK_TIERS.length - 1
      : currentIndex;
  const current = HUNTER_RANK_TIERS[resolvedIndex];
  const next =
    resolvedIndex < HUNTER_RANK_TIERS.length - 1
      ? HUNTER_RANK_TIERS[resolvedIndex + 1]
      : null;

  if (!next) {
    return {
      current,
      next: null,
      level: safeLevel,
      isMaxRank: true,
      levelsNeededForNext: 0,
      xpNeededForNextRank: 0,
      estimatedDaysToNextRank: 0,
      progressPercent: 100,
    };
  }

  const currentRankMinXp =
    LEVEL_THRESHOLDS.find((t) => t.level === current.minLevel)?.minXp ?? 0;
  const nextRankMinXp =
    LEVEL_THRESHOLDS.find((t) => t.level === next.minLevel)?.minXp ?? currentRankMinXp;

  const effectiveXp =
    totalXp !== undefined
      ? sanitizeXpValue(totalXp)
      : LEVEL_THRESHOLDS.find((t) => t.level === safeLevel)?.minXp ?? currentRankMinXp;
  const spanXp = Math.max(1, nextRankMinXp - currentRankMinXp);
  const xpNeededForNextRank = Math.max(0, nextRankMinXp - effectiveXp);
  const estimatedDaysToNextRank =
    xpNeededForNextRank === 0
      ? 0
      : Math.max(
          1,
          Math.ceil((xpNeededForNextRank / spanXp) * DAYS_PER_RANK_BASELINE)
        );
  const progressPercent = Math.min(
    100,
    Math.max(0, Math.round(((effectiveXp - currentRankMinXp) / spanXp) * 100))
  );

  return {
    current,
    next,
    level: safeLevel,
    isMaxRank: false,
    levelsNeededForNext: Math.max(1, next.minLevel - safeLevel),
    xpNeededForNextRank,
    estimatedDaysToNextRank,
    progressPercent,
  };
}

export interface MurimXpCurveMilestone {
  realmId: MurimRealmDefinition['id'];
  order: number;
  startXp: number;
  minQi: number;
  estimatedDayStart: number;
}

export const MURIM_XP_CURVE_POINTS: readonly MurimXpCurveMilestone[] = [
  { realmId: 'third_rate', order: 1, startXp: 0, minQi: 0, estimatedDayStart: 1 },
  { realmId: 'second_rate', order: 2, startXp: 4000, minQi: 1350, estimatedDayStart: 30 },
  { realmId: 'first_rate', order: 3, startXp: 8500, minQi: 2700, estimatedDayStart: 60 },
  { realmId: 'peak', order: 4, startXp: 13500, minQi: 4100, estimatedDayStart: 90 },
  { realmId: 'supreme_peak', order: 5, startXp: 19000, minQi: 5600, estimatedDayStart: 120 },
  { realmId: 'unrestrained', order: 6, startXp: 25000, minQi: 7200, estimatedDayStart: 150 },
  { realmId: 'profound', order: 7, startXp: 31500, minQi: 8900, estimatedDayStart: 180 },
  { realmId: 'life_and_death', order: 8, startXp: 38500, minQi: 10800, estimatedDayStart: 210 },
] as const;

export function calculateMurimQiByXp(totalXp: number): number {
  const safeXp = sanitizeXpValue(totalXp);
  if (safeXp <= 0) return 0;

  for (let i = MURIM_XP_CURVE_POINTS.length - 1; i >= 0; i--) {
    const point = MURIM_XP_CURVE_POINTS[i];
    if (safeXp >= point.startXp) {
      const next = MURIM_XP_CURVE_POINTS[i + 1];
      if (!next) {
        const lastSpanXp = Math.max(1, point.startXp - MURIM_XP_CURVE_POINTS[i - 1].startXp);
        const lastSpanQi = Math.max(1, point.minQi - MURIM_XP_CURVE_POINTS[i - 1].minQi);
        const extraQi = Math.floor(((safeXp - point.startXp) * lastSpanQi) / lastSpanXp);
        return point.minQi + extraQi;
      }
      const spanXp = Math.max(1, next.startXp - point.startXp);
      const spanQi = Math.max(0, next.minQi - point.minQi);
      const interpolated = Math.floor(((safeXp - point.startXp) * spanQi) / spanXp);
      return point.minQi + interpolated;
    }
  }

  return 0;
}

export function calculateMurimRealmByXp(totalXp: number): MurimRealmDefinition {
  const qiPoints = calculateMurimQiByXp(totalXp);
  for (let i = MURIM_REALM_TIERS.length - 1; i >= 0; i--) {
    if (qiPoints >= MURIM_REALM_TIERS[i].minQi) {
      return MURIM_REALM_TIERS[i];
    }
  }
  return MURIM_REALM_TIERS[0];
}

export function recalculateHeroProgressionByXp(totalXp: number): {
  totalXp: number;
  level: number;
  rank: HunterRankLetter;
  rankDefinition: HunterRankDefinition;
  levelProgress: ReturnType<typeof getLevelProgress>;
  rankProgress: HunterRankProgress;
  murimQi: number;
  murimRealm: MurimRealmDefinition;
} {
  const safeXp = sanitizeXpValue(totalXp);
  const level = calculateLevel(safeXp);
  const rank = calculateHeroRankByXp(safeXp);
  const rankDefinition = getHunterRankDefinition(rank);
  const levelProgress = getLevelProgress(safeXp);
  const rankProgress = getHunterRankForLevel(level, safeXp);
  const murimQi = calculateMurimQiByXp(safeXp);
  const murimRealm = calculateMurimRealmByXp(safeXp);
  return {
    totalXp: safeXp,
    level,
    rank,
    rankDefinition,
    levelProgress,
    rankProgress,
    murimQi,
    murimRealm,
  };
}
