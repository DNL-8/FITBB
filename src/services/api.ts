import type { User as FirebaseUser } from 'firebase/auth';
import { auth } from '../firebaseApp';
import type { HealthConnectDay } from '../utils/healthConnect';
import type {
  AnyAutoQuestId,
  AutoQuestEvaluation,
  DailyHealthMetric,
  DailyVow,
  EquipmentItem,
  EquipmentSetDefinition,
  EquipmentSlot,
  EquippedGear,
  ExercisePrRecord,
  GameStats,
  GearBonusSummary,
  GearLoadoutPreset,
  HealthActivity,
  HealthSource,
  HeroClass,
  HeroExperience,
  HeroObjective,
  HeroProfile,
  HrZoneSummary,
  HunterRankProgress,
  MurimRealmProgress,
  PerformedExerciseRecord,
  RecoveryAssessment,
  SessionRewardSummary,
  UserAchievement,
  WeeklyAutoQuestEvaluation,
  WeeklyRaidBossState,
  WeightLog,
  WorkoutLog,
  WorkoutTemplate,
  WorkoutType,
} from '../types/fitness';
import type { ProgressLedgerPage } from '../types/progressLedger';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export type ApiDomainGroup =
  | 'global'
  | 'hero'
  | 'workouts'
  | 'arsenal'
  | 'vows'
  | 'health'
  | 'oracle';

export interface ApiRouteDefinition {
  id: string;
  domain: ApiDomainGroup;
  method: HttpMethod;
  path: string;
  requiresAuth: boolean;
  firestorePaths: readonly string[];
  description: string;
}

export class ApiServiceError extends Error {
  status: number;
  code: string;

  constructor(status: number, message: string, code: string = 'api_error') {
    super(message);
    this.name = 'ApiServiceError';
    this.status = status;
    this.code = code;
  }
}

const VALID_ID_REGEX = /^[a-zA-Z0-9_-]{1,128}$/;
const VALID_DATE_KEY_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Definições centralizadas das rotas REST da API v1.
 * Todas as rotas autenticadas exigem Firebase ID Token válido no cabeçalho Bearer
 * e operam no Firestore do usuário (ai-studio-b580bba9-8332-481d-ad1f-ef820c1125bb)
 * respeitando integralmente as regras de segurança de firestore.rules.
 */
export const API_ROUTES = {
  global: {
    health: '/api/v1/health',
    openApi: '/api/v1/openapi.json',
    state: '/api/v1/state',
    command: '/api/v1/command',
  },
  hero: {
    profile: '/api/v1/hero',
    stats: '/api/v1/stats',
    ledger: '/api/v1/stats/ledger',
    grantStats: '/api/v1/stats/grant',
  },
  workouts: {
    list: '/api/v1/workouts',
    create: '/api/v1/workouts',
    logs: '/api/v1/workouts/logs',
    byId: (workoutId: string) => `/api/v1/workouts/${encodeValidId(workoutId, 'workoutId')}`,
    complete: (workoutId: string) =>
      `/api/v1/workouts/${encodeValidId(workoutId, 'workoutId')}/complete`,
  },
  arsenal: {
    catalog: '/api/v1/armory/catalog',
    state: '/api/v1/armory/state',
    purchase: '/api/v1/armory/purchase',
    equip: '/api/v1/armory/equip',
    loadouts: '/api/v1/armory/loadouts',
    applyLoadout: (loadoutId: string) =>
      `/api/v1/armory/loadouts/${encodeValidId(loadoutId, 'loadoutId')}/apply`,
    deleteLoadout: (loadoutId: string) =>
      `/api/v1/armory/loadouts/${encodeValidId(loadoutId, 'loadoutId')}`,
  },
  vows: {
    list: '/api/v1/vows',
    create: '/api/v1/vows',
    byId: (vowId: string) => `/api/v1/vows/${encodeValidId(vowId, 'vowId')}`,
    complete: (vowId: string) => `/api/v1/vows/${encodeValidId(vowId, 'vowId')}/complete`,
    violate: (vowId: string) => `/api/v1/vows/${encodeValidId(vowId, 'vowId')}/violate`,
    dailyQuests: '/api/v1/quests/daily',
    claimDailyQuest: (questId: AnyAutoQuestId) =>
      `/api/v1/quests/daily/${encodeValidId(questId, 'questId')}/claim`,
  },
  health: {
    summary: '/api/v1/health-data/summary',
    weight: '/api/v1/health-data/weight',
    metrics: '/api/v1/health-data/metrics',
    activities: '/api/v1/health-data/activities',
  },
  oracle: {
    ask: '/api/v1/oracle/ask',
  },
} as const;

export const API_ROUTE_CATALOG: readonly ApiRouteDefinition[] = [
  {
    id: 'global.health',
    domain: 'global',
    method: 'GET',
    path: API_ROUTES.global.health,
    requiresAuth: false,
    firestorePaths: [],
    description: 'Verifica saúde da API v1 e status do Gemini server-side.',
  },
  {
    id: 'global.state',
    domain: 'global',
    method: 'GET',
    path: API_ROUTES.global.state,
    requiresAuth: true,
    firestorePaths: [
      '/users/{userId}/heroProfiles/main',
      '/users/{userId}/gameStats/main',
      '/users/{userId}/workouts',
      '/users/{userId}/workoutLogs',
      '/users/{userId}/dailyVows',
      '/users/{userId}/weightLogs',
      '/users/{userId}/dailyHealthMetrics',
      '/users/{userId}/healthActivities',
      '/users/{userId}/achievements',
    ],
    description: 'Retorna snapshot completo do jogador autenticado.',
  },
  {
    id: 'global.command',
    domain: 'global',
    method: 'POST',
    path: API_ROUTES.global.command,
    requiresAuth: true,
    firestorePaths: ['/users/{userId}/**'],
    description: 'Orquestrador único por action + payload.',
  },
  {
    id: 'hero.get',
    domain: 'hero',
    method: 'GET',
    path: API_ROUTES.hero.profile,
    requiresAuth: true,
    firestorePaths: ['/users/{userId}/heroProfiles/main'],
    description: 'Consulta ficha do herói e IMC atual.',
  },
  {
    id: 'hero.patch',
    domain: 'hero',
    method: 'PATCH',
    path: API_ROUTES.hero.profile,
    requiresAuth: true,
    firestorePaths: ['/users/{userId}/heroProfiles/main'],
    description: 'Atualiza atributos e medidas do herói.',
  },
  {
    id: 'hero.stats',
    domain: 'hero',
    method: 'GET',
    path: API_ROUTES.hero.stats,
    requiresAuth: true,
    firestorePaths: ['/users/{userId}/gameStats/main'],
    description: 'Lê XP, nível, moedas, HP, streak e atributos RPG.',
  },
  {
    id: 'hero.grantStats',
    domain: 'hero',
    method: 'POST',
    path: API_ROUTES.hero.grantStats,
    requiresAuth: true,
    firestorePaths: ['/users/{userId}/gameStats/main'],
    description: 'Concede ou ajusta XP, moedas, HP e chefes derrotados.',
  },
  {
    id: 'workouts.list',
    domain: 'workouts',
    method: 'GET',
    path: API_ROUTES.workouts.list,
    requiresAuth: true,
    firestorePaths: ['/users/{userId}/workouts'],
    description: 'Lista treinos do usuário.',
  },
  {
    id: 'workouts.create',
    domain: 'workouts',
    method: 'POST',
    path: API_ROUTES.workouts.create,
    requiresAuth: true,
    firestorePaths: ['/users/{userId}/workouts/{workoutId}'],
    description: 'Cria um novo template de treino.',
  },
  {
    id: 'workouts.logs',
    domain: 'workouts',
    method: 'GET',
    path: API_ROUTES.workouts.logs,
    requiresAuth: true,
    firestorePaths: ['/users/{userId}/workoutLogs'],
    description: 'Lista histórico de treinos concluídos.',
  },
  {
    id: 'workouts.update',
    domain: 'workouts',
    method: 'PATCH',
    path: '/api/v1/workouts/:id',
    requiresAuth: true,
    firestorePaths: ['/users/{userId}/workouts/{workoutId}'],
    description: 'Atualiza metadados ou cargas (loadKg) de um treino.',
  },
  {
    id: 'workouts.delete',
    domain: 'workouts',
    method: 'DELETE',
    path: '/api/v1/workouts/:id',
    requiresAuth: true,
    firestorePaths: ['/users/{userId}/workouts/{workoutId}'],
    description: 'Exclui um template de treino.',
  },
  {
    id: 'workouts.complete',
    domain: 'workouts',
    method: 'POST',
    path: '/api/v1/workouts/:id/complete',
    requiresAuth: true,
    firestorePaths: [
      '/users/{userId}/gameStats/main',
      '/users/{userId}/workoutLogs/{logId}',
      '/users/{userId}/achievements/{achievementId}',
    ],
    description: 'Conclui treino com bônus do Arsenal, chefe e conquistas.',
  },
  {
    id: 'arsenal.catalog',
    domain: 'arsenal',
    method: 'GET',
    path: API_ROUTES.arsenal.catalog,
    requiresAuth: false,
    firestorePaths: [],
    description: 'Catálogo público de equipamentos, conjuntos e presets.',
  },
  {
    id: 'arsenal.state',
    domain: 'arsenal',
    method: 'GET',
    path: API_ROUTES.arsenal.state,
    requiresAuth: true,
    firestorePaths: ['/users/{userId}/gameStats/main'],
    description: 'Estado atual do Arsenal, moedas e loadouts do usuário.',
  },
  {
    id: 'arsenal.purchase',
    domain: 'arsenal',
    method: 'POST',
    path: API_ROUTES.arsenal.purchase,
    requiresAuth: true,
    firestorePaths: ['/users/{userId}/gameStats/main'],
    description: 'Desbloqueia e opcionalmente equipa um item do Arsenal.',
  },
  {
    id: 'arsenal.equip',
    domain: 'arsenal',
    method: 'PUT',
    path: API_ROUTES.arsenal.equip,
    requiresAuth: true,
    firestorePaths: ['/users/{userId}/gameStats/main'],
    description: 'Equipa/desequipa um slot ou build completa.',
  },
  {
    id: 'arsenal.saveLoadout',
    domain: 'arsenal',
    method: 'POST',
    path: API_ROUTES.arsenal.loadouts,
    requiresAuth: true,
    firestorePaths: ['/users/{userId}/gameStats/main'],
    description: 'Salva preset de loadout (até 4 presets).',
  },
  {
    id: 'arsenal.applyLoadout',
    domain: 'arsenal',
    method: 'POST',
    path: '/api/v1/armory/loadouts/:id/apply',
    requiresAuth: true,
    firestorePaths: ['/users/{userId}/gameStats/main'],
    description: 'Aplica um preset de loadout.',
  },
  {
    id: 'arsenal.deleteLoadout',
    domain: 'arsenal',
    method: 'DELETE',
    path: '/api/v1/armory/loadouts/:id',
    requiresAuth: true,
    firestorePaths: ['/users/{userId}/gameStats/main'],
    description: 'Exclui um preset salvo.',
  },
  {
    id: 'vows.list',
    domain: 'vows',
    method: 'GET',
    path: API_ROUTES.vows.list,
    requiresAuth: true,
    firestorePaths: ['/users/{userId}/dailyVows'],
    description: 'Lista votos diários.',
  },
  {
    id: 'vows.create',
    domain: 'vows',
    method: 'POST',
    path: API_ROUTES.vows.create,
    requiresAuth: true,
    firestorePaths: ['/users/{userId}/dailyVows/{vowId}'],
    description: 'Cria um novo voto diário.',
  },
  {
    id: 'vows.complete',
    domain: 'vows',
    method: 'POST',
    path: '/api/v1/vows/:id/complete',
    requiresAuth: true,
    firestorePaths: ['/users/{userId}/dailyVows/{vowId}', '/users/{userId}/gameStats/main'],
    description: 'Cumpre voto diário (+XP, +HP, +Moedas).',
  },
  {
    id: 'vows.violate',
    domain: 'vows',
    method: 'POST',
    path: '/api/v1/vows/:id/violate',
    requiresAuth: true,
    firestorePaths: ['/users/{userId}/dailyVows/{vowId}', '/users/{userId}/gameStats/main'],
    description: 'Registra quebra de voto diário (-XP, -HP).',
  },
  {
    id: 'vows.delete',
    domain: 'vows',
    method: 'DELETE',
    path: '/api/v1/vows/:id',
    requiresAuth: true,
    firestorePaths: ['/users/{userId}/dailyVows/{vowId}'],
    description: 'Remove voto diário.',
  },
  {
    id: 'vows.dailyQuests',
    domain: 'vows',
    method: 'GET',
    path: API_ROUTES.vows.dailyQuests,
    requiresAuth: true,
    firestorePaths: [
      '/users/{userId}/gameStats/main',
      '/users/{userId}/dailyHealthMetrics',
      '/users/{userId}/workoutLogs',
      '/users/{userId}/healthActivities',
      '/users/{userId}/weightLogs',
    ],
    description: 'Avalia missões automáticas do dia.',
  },
  {
    id: 'vows.claimDailyQuest',
    domain: 'vows',
    method: 'POST',
    path: '/api/v1/quests/daily/:questId/claim',
    requiresAuth: true,
    firestorePaths: ['/users/{userId}/gameStats/main'],
    description: 'Resgata recompensa de missão automática cumprida.',
  },
  {
    id: 'health.summary',
    domain: 'health',
    method: 'GET',
    path: API_ROUTES.health.summary,
    requiresAuth: true,
    firestorePaths: [
      '/users/{userId}/weightLogs',
      '/users/{userId}/dailyHealthMetrics',
      '/users/{userId}/healthActivities',
    ],
    description: 'Retorna peso, IMC, recuperação ACWR e zonas cardíacas.',
  },
  {
    id: 'health.weight',
    domain: 'health',
    method: 'POST',
    path: API_ROUTES.health.weight,
    requiresAuth: true,
    firestorePaths: ['/users/{userId}/weightLogs/{dateKey}', '/users/{userId}/heroProfiles/main'],
    description: 'Registra ou atualiza peso diário e sincroniza o perfil do herói.',
  },
  {
    id: 'health.metrics',
    domain: 'health',
    method: 'POST',
    path: API_ROUTES.health.metrics,
    requiresAuth: true,
    firestorePaths: ['/users/{userId}/dailyHealthMetrics/{dateKey}'],
    description: 'Grava passos, calorias, sono, FC de repouso e HRV.',
  },
  {
    id: 'health.activities',
    domain: 'health',
    method: 'POST',
    path: API_ROUTES.health.activities,
    requiresAuth: true,
    firestorePaths: ['/users/{userId}/healthActivities/{activityId}', '/users/{userId}/gameStats/main'],
    description: 'Registra atividade de saúde externa e credita XP/moedas.',
  },
  {
    id: 'oracle.ask',
    domain: 'oracle',
    method: 'POST',
    path: API_ROUTES.oracle.ask,
    requiresAuth: true,
    firestorePaths: ['/users/{userId}/chatMessages/{messageId}'],
    description: 'Consulta o Oráculo Gemini com contexto do Firestore.',
  },
];

// ============================================================================
// VALIDAÇÃO DE IDs, DATAS E TOKEN FIREBASE DO USUÁRIO
// ============================================================================

function encodeValidId(value: string, fieldName: string): string {
  const clean = value.trim();
  if (!VALID_ID_REGEX.test(clean)) {
    throw new ApiServiceError(
      400,
      `Identificador "${fieldName}" inválido. Use apenas letras, números, "_" ou "-".`,
      'invalid_id'
    );
  }
  return encodeURIComponent(clean);
}

function assertValidDateKey(dateKey: string): string {
  const clean = dateKey.trim();
  if (!VALID_DATE_KEY_REGEX.test(clean)) {
    throw new ApiServiceError(
      400,
      'Data inválida. Utilize o formato YYYY-MM-DD.',
      'invalid_date_key'
    );
  }
  return clean;
}

export interface ValidatedUserSession {
  user: FirebaseUser;
  uid: string;
  token: string;
}

/**
 * Garante que existe usuário autenticado com e-mail verificado no Firebase Auth
 * e retorna um ID Token JWT válido (renovando automaticamente se solicitado).
 */
export async function validateAndGetFirebaseToken(
  options: { user?: FirebaseUser | null; forceRefresh?: boolean } = {}
): Promise<ValidatedUserSession> {
  const activeUser = options.user === undefined ? auth.currentUser : options.user;
  if (!activeUser || auth.currentUser?.uid !== activeUser.uid) {
    throw new ApiServiceError(
      401,
      'Usuário não autenticado. Faça login no Firebase antes de enviar comandos para a API.',
      'unauthenticated'
    );
  }

  if (activeUser.emailVerified !== true) {
    throw new ApiServiceError(
      403,
      'Sua conta precisa estar com o e-mail verificado para acessar e gravar dados no Firestore.',
      'email_not_verified'
    );
  }

  const token = await activeUser.getIdToken(Boolean(options.forceRefresh));
  if (auth.currentUser?.uid !== activeUser.uid) {
    throw new ApiServiceError(401, 'A conta ativa mudou. Repita a operação.', 'session_changed');
  }
  if (!token || token.split('.').length !== 3) {
    throw new ApiServiceError(
      401,
      'Não foi possível obter um Firebase ID Token válido para esta sessão.',
      'invalid_token'
    );
  }

  return {
    user: activeUser,
    uid: activeUser.uid,
    token,
  };
}

export async function fetchStrava(
  route: 'auth-url' | 'status' | 'sync' | 'disconnect',
  options: RequestInit = {}
): Promise<Response> {
  return fetchAuthenticatedApi(`/api/strava/${route}`, options);
}

export async function fetchAuthenticatedApi(
  path: string,
  options: RequestInit = {},
  user: FirebaseUser | null = auth.currentUser
): Promise<Response> {
  const url = new URL(path, window.location.origin);
  if (url.origin !== window.location.origin || !url.pathname.startsWith('/api/')) {
    throw new ApiServiceError(400, 'Endereço de API inválido.', 'invalid_api_url');
  }
  const signal = options.signal ?? AbortSignal.timeout(30_000);
  const headers = new Headers(options.headers);
  const send = async (forceRefresh: boolean) => {
    const { token } = await validateAndGetFirebaseToken({ user, forceRefresh });
    signal.throwIfAborted();
    headers.set('Authorization', `Bearer ${token}`);
    return fetch(url, { ...options, headers, signal, redirect: 'error' });
  };
  const response = await send(false);
  if (response.status !== 401) return response;
  await response.body?.cancel();
  return send(true);
}

interface RequestOptions {
  signal?: AbortSignal;
  method?: HttpMethod;
  body?: unknown;
  requiresAuth?: boolean;
  user?: FirebaseUser | null;
}

interface ApiEnvelope<T> {
  ok: boolean;
  data?: T;
  error?: string;
  code?: string;
}

/**
 * Cliente HTTP centralizado: valida sessão + Firebase ID Token em toda rota protegida,
 * injeta `Authorization: Bearer <token>`, trata renovação automática em caso de 401
 * e normaliza erros estruturados da API v1.
 */
export async function apiRequest<T>(
  path: string,
  options: RequestOptions = {}
): Promise<T> {
  const method: HttpMethod = options.method ?? 'GET';
  const requiresAuth = options.requiresAuth ?? true;

  const request = {
    method,
    signal: options.signal ?? AbortSignal.timeout(30_000),
    headers: options.body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  };
  const response = requiresAuth
    ? await fetchAuthenticatedApi(path, request, options.user ?? auth.currentUser)
    : await fetch(path, request);

  const rawText = await response.text();
  let parsed: unknown = null;
  if (rawText) {
    try {
      parsed = JSON.parse(rawText);
    } catch {
      parsed = null;
    }
  }

  if (!response.ok) {
    const errPayload = (parsed && typeof parsed === 'object' ? parsed : {}) as {
      error?: string;
      code?: string;
    };
    throw new ApiServiceError(
      response.status,
      errPayload.error || `Erro HTTP ${response.status} ao acessar ${path}.`,
      errPayload.code || 'http_error'
    );
  }

  if (
    parsed &&
    typeof parsed === 'object' &&
    'ok' in parsed &&
    'data' in parsed &&
    (parsed as ApiEnvelope<T>).data !== undefined
  ) {
    return (parsed as ApiEnvelope<T>).data as T;
  }

  return parsed as T;
}

// ============================================================================
// TIPOS DE PAYLOAD & RESPOSTA POR DOMÍNIO
// ============================================================================

export interface FullSystemStateResponse {
  uid: string;
  todayKey: string;
  hero: HeroProfile | null;
  stats: GameStats;
  levelProgress: {
    level: number;
    isMaster: boolean;
    isMaxLevel: boolean;
    levelTitle: string;
    currentLevelMinXp: number;
    nextLevelXp: number;
    xpIntoLevel: number;
    xpNeededForNext: number;
    progressPercent: number;
  };
  dualProgression?: {
    hunter: HunterRankProgress;
    murim: MurimRealmProgress;
  };
  gearBonuses: GearBonusSummary;
  derivedAttributes: {
    forca: number;
    resistencia: number;
    agilidade: number;
    disciplina: number;
  } | null;
  recovery: RecoveryAssessment;
  autoQuests: AutoQuestEvaluation[];
  weeklyAutoQuests?: WeeklyAutoQuestEvaluation[];
  weeklyRaidBoss?: WeeklyRaidBossState;
  workoutsCount: number;
  workouts: WorkoutTemplate[];
  workoutLogs: WorkoutLog[];
  exercisePrs?: ExercisePrRecord[];
  dailyVows: DailyVow[];
  weightLogs: WeightLog[];
  dailyMetrics: DailyHealthMetric[];
  healthActivities: HealthActivity[];
  achievements: UserAchievement[];
  healthConnectStatus: HealthConnectReadStatus;
}

export type HealthConnectReadStatus = 'available' | 'partial' | 'unavailable';

export interface UpdateHeroPayload {
  name?: string;
  avatar?: string;
  heroClass?: HeroClass;
  objective?: HeroObjective;
  experience?: HeroExperience;
  heightCm?: number | null;
  weightKg?: number | null;
  restingHrBaseline?: number;
  maxHrEstimated?: number;
}

export interface GrantStatsPayload {
  xpDelta?: number;
  coinsDelta?: number;
  hpDelta?: number;
  bossesDelta?: number;
}

export interface CreateWorkoutPayload {
  id?: string;
  name: string;
  description?: string;
  type: WorkoutType;
  difficulty?: HeroExperience;
  durationMinutes?: number;
  baseXp?: number;
  rank?: WorkoutTemplate['rank'];
  exercises: Array<{
    id?: string;
    name: string;
    prescription?: string;
    restSeconds?: number;
    muscleGroups?: string[];
    executionTip?: string;
    equipment?: string;
    loadKg?: number;
    loadNote?: string;
    unilateral?: boolean;
  }>;
}

export interface UpdateWorkoutPayload extends Partial<CreateWorkoutPayload> {
  exerciseLoadUpdates?: Array<{ exerciseId: string; loadKg: number }>;
}

export interface CompleteWorkoutPayload {
  idempotencyKey: string;
  completedExerciseIds?: string[];
  completedExercises?: number;
  durationMinutes?: number;
  elapsedSeconds?: number;
  bossDefeated?: boolean;
  performedExercises?: PerformedExerciseRecord[];
  dateKey?: string;
}

export interface LogWeightPayload {
  weightKg: number;
  dateKey?: string;
  note?: string | null;
}

export interface LogHealthMetricsPayload {
  dateKey?: string;
  steps?: number;
  activeCalories?: number;
  sleepHours?: number;
  restingHeartRate?: number | null;
  hrvMs?: number | null;
  trainingLoadScore?: number;
  recoveryScore?: number;
  sources?: string[];
}

export interface LogHealthActivityPayload {
  id?: string;
  externalId?: string;
  title: string;
  source?: HealthSource;
  sportType?: string;
  dateKey?: string;
  startedAt?: string;
  durationMinutes?: number;
  distanceKm?: number;
  calories?: number;
  elevationGainM?: number;
  avgHeartRate?: number | null;
  maxHeartRate?: number | null;
  zoneMinutes?: [number, number, number, number, number];
  hrSamplePoints?: number[];
}

// ============================================================================
// CLIENTE REST UNIFICADO (hero, workouts, arsenal, vows, health, oracle)
// ============================================================================

export const api = {
  routes: API_ROUTES,
  catalog: API_ROUTE_CATALOG,

  global: {
    getHealthStatus: () =>
      apiRequest<{
        ok: boolean;
        service: string;
        authMode: string;
        projectId: string;
        geminiConfigured: boolean;
        timestamp: string;
      }>(API_ROUTES.global.health, { method: 'GET', requiresAuth: false }),

    getOpenApiSpec: () =>
      apiRequest<Record<string, unknown>>(API_ROUTES.global.openApi, {
        method: 'GET',
        requiresAuth: false,
      }),

    getFullState: (user?: FirebaseUser | null) =>
      apiRequest<FullSystemStateResponse>(API_ROUTES.global.state, {
        method: 'GET',
        requiresAuth: true,
        user,
      }),

    dispatchCommand: <TResult = unknown>(
      action: string,
      payload: Record<string, unknown> = {},
      user?: FirebaseUser | null
    ) =>
      apiRequest<{ action: string; result: TResult }>(API_ROUTES.global.command, {
        method: 'POST',
        body: { action, payload },
        requiresAuth: true,
        user,
      }),
  },

  hero: {
    getProfile: (user?: FirebaseUser | null) =>
      apiRequest<{ hero: HeroProfile; bmi: { bmi: number; label: string } | null }>(
        API_ROUTES.hero.profile,
        { method: 'GET', requiresAuth: true, user }
      ),

    updateProfile: (payload: UpdateHeroPayload, user?: FirebaseUser | null) => {
      if (payload.name !== undefined) {
        const cleanName = payload.name.trim();
        if (cleanName.length < 2 || cleanName.length > 24) {
          throw new ApiServiceError(
            400,
            'O nome do herói deve ter entre 2 e 24 caracteres.',
            'invalid_hero_name'
          );
        }
      }
      if (
        payload.heightCm !== undefined &&
        payload.heightCm !== null &&
        (payload.heightCm < 100 || payload.heightCm > 250)
      ) {
        throw new ApiServiceError(400, 'heightCm deve estar entre 100 e 250 cm.', 'invalid_height');
      }
      if (
        payload.weightKg !== undefined &&
        payload.weightKg !== null &&
        (payload.weightKg < 25 || payload.weightKg > 350)
      ) {
        throw new ApiServiceError(400, 'weightKg deve estar entre 25 e 350 kg.', 'invalid_weight');
      }
      return apiRequest<{ hero: HeroProfile; bmi: { bmi: number; label: string } | null }>(
        API_ROUTES.hero.profile,
        { method: 'PATCH', body: payload, requiresAuth: true, user }
      );
    },

    getStats: (user?: FirebaseUser | null) =>
      apiRequest<{
        stats: GameStats;
        levelProgress: FullSystemStateResponse['levelProgress'];
        dualProgression?: FullSystemStateResponse['dualProgression'];
        gearBonuses: GearBonusSummary;
        derivedAttributes: FullSystemStateResponse['derivedAttributes'];
      }>(API_ROUTES.hero.stats, { method: 'GET', requiresAuth: true, user }),

    getProgressLedger: (cursor?: string, signal?: AbortSignal) =>
      apiRequest<ProgressLedgerPage>(cursor ? `${API_ROUTES.hero.ledger}?cursor=${encodeURIComponent(cursor)}` : API_ROUTES.hero.ledger, { signal }),

    grantStats: (payload: GrantStatsPayload, user?: FirebaseUser | null) =>
      apiRequest<{
        previousLevel: number;
        newLevel: number;
        leveledUp: boolean;
        stats: GameStats;
        levelProgress: FullSystemStateResponse['levelProgress'];
      }>(API_ROUTES.hero.grantStats, {
        method: 'POST',
        body: payload,
        requiresAuth: true,
        user,
      }),
  },

  workouts: {
    list: (user?: FirebaseUser | null) =>
      apiRequest<{ workouts: WorkoutTemplate[] }>(API_ROUTES.workouts.list, {
        method: 'GET',
        requiresAuth: true,
        user,
      }),

    create: (payload: CreateWorkoutPayload, user?: FirebaseUser | null) => {
      if (!payload.name || payload.name.trim().length < 2 || payload.name.trim().length > 100) {
        throw new ApiServiceError(
          400,
          'O nome do treino deve ter entre 2 e 100 caracteres.',
          'invalid_workout_name'
        );
      }
      if (!Array.isArray(payload.exercises) || payload.exercises.length < 1 || payload.exercises.length > 20) {
        throw new ApiServiceError(
          400,
          'O treino deve conter entre 1 e 20 exercícios.',
          'invalid_exercises'
        );
      }
      return apiRequest<{ workout: WorkoutTemplate }>(API_ROUTES.workouts.create, {
        method: 'POST',
        body: payload,
        requiresAuth: true,
        user,
      });
    },

    update: (workoutId: string, payload: UpdateWorkoutPayload, user?: FirebaseUser | null) =>
      apiRequest<{ workout: WorkoutTemplate }>(API_ROUTES.workouts.byId(workoutId), {
        method: 'PATCH',
        body: payload,
        requiresAuth: true,
        user,
      }),

    remove: (workoutId: string, user?: FirebaseUser | null) =>
      apiRequest<{ deleted: boolean; workoutId: string }>(API_ROUTES.workouts.byId(workoutId), {
        method: 'DELETE',
        requiresAuth: true,
        user,
      }),

    complete: (
      workoutId: string,
      payload: CompleteWorkoutPayload,
      user?: FirebaseUser | null
    ) => {
      if (payload.dateKey !== undefined) {
        assertValidDateKey(payload.dateKey);
      }
      return apiRequest<{
        log: WorkoutLog;
        stats: GameStats;
        duplicate: boolean;
        updatedExercisePrs?: ExercisePrRecord[];
        rewardSummary: SessionRewardSummary;
      }>(API_ROUTES.workouts.complete(workoutId), {
        method: 'POST',
        body: payload,
        requiresAuth: true,
        user,
      });
    },

    listLogs: (limit = 50, user?: FirebaseUser | null, cursor?: string, signal?: AbortSignal) => {
      const query = new URLSearchParams({ limit: String(limit) });
      if (cursor !== undefined) query.set('cursor', cursor);
      return apiRequest<{
        logs: WorkoutLog[];
        nextCursor: string | null;
        order: 'completedAt' | 'documentId';
      }>(`${API_ROUTES.workouts.logs}?${query}`, {
        method: 'GET',
        requiresAuth: true,
        user,
        signal,
      });
    },
  },

  arsenal: {
    getCatalog: () =>
      apiRequest<{
        config: Record<string, unknown>;
        sets: EquipmentSetDefinition[];
        items: EquipmentItem[];
        exampleLoadouts: GearLoadoutPreset[];
      }>(API_ROUTES.arsenal.catalog, { method: 'GET', requiresAuth: false }),

    getState: (user?: FirebaseUser | null) =>
      apiRequest<{
        goldCoins: number;
        totalCoinsEarned: number;
        ownedEquipmentIds: string[];
        equippedGear: EquippedGear;
        gearLoadouts: GearLoadoutPreset[];
        exampleLoadouts: GearLoadoutPreset[];
        gearBonuses: GearBonusSummary;
      }>(API_ROUTES.arsenal.state, { method: 'GET', requiresAuth: true, user }),

    purchase: (itemId: string, equip: boolean = true, user?: FirebaseUser | null) => {
      const cleanItemId = itemId.trim();
      if (!cleanItemId || cleanItemId.length > 64) {
        throw new ApiServiceError(400, 'itemId inválido.', 'invalid_item_id');
      }
      return apiRequest<{
        purchasedItem: EquipmentItem;
        equipped: boolean;
        goldCoins: number;
        ownedEquipmentIds: string[];
        equippedGear: EquippedGear;
        updatedAt: string;
        gearBonuses: GearBonusSummary;
      }>(API_ROUTES.arsenal.purchase, {
        method: 'POST',
        body: { itemId: cleanItemId, equip },
        requiresAuth: true,
        user,
      });
    },

    equip: (
      payload: { slot: EquipmentSlot; itemId: string | null } | { gear: EquippedGear },
      user?: FirebaseUser | null
    ) =>
      apiRequest<{ equippedGear: EquippedGear; updatedAt: string; gearBonuses: GearBonusSummary }>(
        API_ROUTES.arsenal.equip,
        {
          method: 'PUT',
          body: payload,
          requiresAuth: true,
          user,
        }
      ),

    saveLoadout: (name: string, gear?: EquippedGear, user?: FirebaseUser | null) => {
      const cleanName = name.trim();
      if (cleanName.length < 2 || cleanName.length > 28) {
        throw new ApiServiceError(
          400,
          'O nome do loadout deve ter entre 2 e 28 caracteres.',
          'invalid_loadout_name'
        );
      }
      return apiRequest<{ preset: GearLoadoutPreset; gearLoadouts: GearLoadoutPreset[] }>(
        API_ROUTES.arsenal.loadouts,
        {
          method: 'POST',
          body: gear ? { name: cleanName, gear } : { name: cleanName },
          requiresAuth: true,
          user,
        }
      );
    },

    applyLoadout: (loadoutId: string, user?: FirebaseUser | null) =>
      apiRequest<{
        appliedLoadout: string;
        equippedGear: EquippedGear;
        gearBonuses: GearBonusSummary;
      }>(API_ROUTES.arsenal.applyLoadout(loadoutId), {
        method: 'POST',
        requiresAuth: true,
        user,
      }),

    deleteLoadout: (loadoutId: string, user?: FirebaseUser | null) =>
      apiRequest<{ deleted: boolean; loadoutId: string; gearLoadouts: GearLoadoutPreset[] }>(
        API_ROUTES.arsenal.deleteLoadout(loadoutId),
        {
          method: 'DELETE',
          requiresAuth: true,
          user,
        }
      ),
  },

  vows: {
    list: (user?: FirebaseUser | null) =>
      apiRequest<{ vows: DailyVow[] }>(API_ROUTES.vows.list, {
        method: 'GET',
        requiresAuth: true,
        user,
      }),

    create: (
      payload: { title: string; xpReward?: number; penaltyXp?: number },
      user?: FirebaseUser | null
    ) => {
      const cleanTitle = payload.title.trim();
      if (cleanTitle.length < 3 || cleanTitle.length > 80) {
        throw new ApiServiceError(
          400,
          'O título do voto deve ter entre 3 e 80 caracteres.',
          'invalid_vow_title'
        );
      }
      return apiRequest<{ vow: DailyVow }>(API_ROUTES.vows.create, {
        method: 'POST',
        body: {
          title: cleanTitle,
          xpReward: payload.xpReward ?? 15,
          penaltyXp: payload.penaltyXp ?? 15,
        },
        requiresAuth: true,
        user,
      });
    },

    complete: (vowId: string, dateKey?: string, user?: FirebaseUser | null) => {
      if (dateKey !== undefined) assertValidDateKey(dateKey);
      return apiRequest<{ vow: DailyVow; stats: GameStats }>(API_ROUTES.vows.complete(vowId), {
        method: 'POST',
        body: dateKey ? { dateKey } : {},
        requiresAuth: true,
        user,
      });
    },

    violate: (vowId: string, dateKey?: string, user?: FirebaseUser | null) => {
      if (dateKey !== undefined) assertValidDateKey(dateKey);
      return apiRequest<{ vow: DailyVow; stats: GameStats }>(API_ROUTES.vows.violate(vowId), {
        method: 'POST',
        body: dateKey ? { dateKey } : {},
        requiresAuth: true,
        user,
      });
    },

    remove: (vowId: string, user?: FirebaseUser | null) =>
      apiRequest<{ deleted: boolean; vowId: string }>(API_ROUTES.vows.byId(vowId), {
        method: 'DELETE',
        requiresAuth: true,
        user,
      }),

    getDailyQuests: (dateKey?: string, user?: FirebaseUser | null) => {
      const query = dateKey ? `?dateKey=${encodeURIComponent(assertValidDateKey(dateKey))}` : '';
      return apiRequest<{
        dateKey: string;
        quests: AutoQuestEvaluation[];
        weeklyQuests?: WeeklyAutoQuestEvaluation[];
        weeklyRaidBoss?: WeeklyRaidBossState;
      }>(
        `${API_ROUTES.vows.dailyQuests}${query}`,
        { method: 'GET', requiresAuth: true, user }
      );
    },

    claimDailyQuest: (questId: AnyAutoQuestId, dateKey?: string, user?: FirebaseUser | null) => {
      if (dateKey !== undefined) assertValidDateKey(dateKey);
      return apiRequest<{
        claimedQuest: AutoQuestEvaluation | WeeklyAutoQuestEvaluation;
        stats: GameStats;
      }>(
        API_ROUTES.vows.claimDailyQuest(questId),
        {
          method: 'POST',
          body: dateKey ? { dateKey } : {},
          requiresAuth: true,
          user,
        }
      );
    },
  },

  health: {
    getSummary: (user?: FirebaseUser | null) =>
      apiRequest<{
        latestWeight: WeightLog | null;
        bmi: { bmi: number; label: string } | null;
        recovery: RecoveryAssessment;
        hrZones: HrZoneSummary[];
        weightLogs: WeightLog[];
        dailyMetrics: DailyHealthMetric[];
        activities: HealthActivity[];
        healthConnect: {
          status: HealthConnectReadStatus;
          days: HealthConnectDay[];
          latestHeartRate: { time: string; beatsPerMinute: number } | null;
        };
      }>(API_ROUTES.health.summary, { method: 'GET', requiresAuth: true, user }),

    logWeight: (payload: LogWeightPayload, user?: FirebaseUser | null) => {
      if (!Number.isFinite(payload.weightKg) || payload.weightKg < 25 || payload.weightKg > 350) {
        throw new ApiServiceError(
          400,
          'weightKg deve estar entre 25 e 350 kg.',
          'invalid_weight'
        );
      }
      if (payload.dateKey !== undefined) assertValidDateKey(payload.dateKey);
      return apiRequest<{ weightLog: WeightLog; bmi: { bmi: number; label: string } | null }>(
        API_ROUTES.health.weight,
        {
          method: 'POST',
          body: {
            ...payload,
            note: payload.note ? payload.note.trim().slice(0, 140) : payload.note ?? null,
          },
          requiresAuth: true,
          user,
        }
      );
    },

    logMetrics: (payload: LogHealthMetricsPayload, user?: FirebaseUser | null) => {
      if (payload.dateKey !== undefined) assertValidDateKey(payload.dateKey);
      return apiRequest<{ dailyMetric: DailyHealthMetric }>(API_ROUTES.health.metrics, {
        method: 'POST',
        body: payload,
        requiresAuth: true,
        user,
      });
    },

    logActivity: (payload: LogHealthActivityPayload, user?: FirebaseUser | null) => {
      const cleanTitle = payload.title.trim();
      if (!cleanTitle || cleanTitle.length > 140) {
        throw new ApiServiceError(
          400,
          'O título da atividade deve ter entre 1 e 140 caracteres.',
          'invalid_activity_title'
        );
      }
      if (payload.dateKey !== undefined) assertValidDateKey(payload.dateKey);
      return apiRequest<{
        activity: HealthActivity;
        stats: GameStats;
        coinsAdded: number;
        duplicate?: boolean;
      }>(API_ROUTES.health.activities, {
        method: 'POST',
        body: { ...payload, title: cleanTitle },
        requiresAuth: true,
        user,
      });
    },
  },

  oracle: {
    ask: (question: string, persist: boolean = true, user?: FirebaseUser | null) => {
      const cleanQuestion = question.trim();
      if (!cleanQuestion || cleanQuestion.length > 400) {
        throw new ApiServiceError(
          400,
          'A pergunta ao Oráculo deve ter entre 1 e 400 caracteres.',
          'invalid_question'
        );
      }
      return apiRequest<{
        question: string;
        reply: string;
        persisted: boolean;
        recoveryScore: number;
      }>(API_ROUTES.oracle.ask, {
        method: 'POST',
        body: { question: cleanQuestion, persist },
        requiresAuth: true,
        user,
      });
    },
  },
} as const;
