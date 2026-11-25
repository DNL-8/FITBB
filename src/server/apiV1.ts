import { Hono, type Context, type MiddlewareHandler } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { GoogleGenAI } from '@google/genai';
import {
  ApiHttpError,
  type VerifiedFirebaseUser,
  firestoreRest,
  getFirebaseAppletConfig,
} from './firebaseRest.ts';
import {
  type AiRateLimiter,
  type AppEnv,
  createAiRateLimiter,
  getAppBaseUrl,
  requireFirebaseAuth,
  respondToApiError,
} from './shared.ts';
import { buildOpenApiSpec } from './apiV1/openapi.ts';
import { readProgressLedger } from './apiV1/progressLedger.ts';
import { documentId, input, parseInput, readJsonInput, singleQuery } from './input.ts';
import {
  handleApplyLoadout,
  handleAskOracle,
  handleClaimDailyQuest,
  handleCompleteWorkout,
  handleCreateVow,
  handleCreateWorkout,
  handleDeleteLoadout,
  handleDeleteVow,
  handleDeleteWorkout,
  handleEquipGear,
  handleGetArmoryState,
  handleGetDailyQuests,
  handleGetFullState,
  handleGetHealthSummary,
  handleGrantStats,
  handleLogHealthActivity,
  handleLogHealthMetrics,
  handleLogWeight,
  handlePatchHero,
  handlePurchaseGear,
  handleResolveVow,
  handleSaveLoadout,
  handleUpdateWorkout,
  getServerDateKey,
  loadGameStatsOrInit,
  requireHeroProfile,
} from './apiV1/domain.ts';
import {
  ARSENAL_CONFIG,
  EQUIPMENT_CATALOG,
  EQUIPMENT_SETS,
  EXAMPLE_LOADOUT_PRESETS,
  calculateDerivedAttributes,
  calculateGearBonusSummary,
  computeBmiSummary,
  getDualProgressionStatus,
  getLevelProgress,
  mergeWithInitialWorkouts,
} from '../utils/rpgLogic.ts';
import type {
  DailyVow,
  HeroProfile,
  WorkoutLog,
  WorkoutTemplate,
} from '../types/fitness.ts';

export interface ApiV1Deps {
  getGeminiClient: () => GoogleGenAI | null;
  aiRateLimiter?: AiRateLimiter;
}

export type ApiV1Env = AppEnv;

const PUBLIC_V1_GET_PATHS = new Set(['/health', '/openapi.json', '/armory/catalog']);

function getUserFromCtx(c: Context<AppEnv>): VerifiedFirebaseUser {
  const firebaseUser = c.get('firebaseUser');
  if (!firebaseUser) {
    throw new ApiHttpError(401, 'Usuário Firebase não autenticado.', 'unauthenticated');
  }
  return firebaseUser;
}

export function createApiV1Router(deps: ApiV1Deps): Hono<AppEnv> {
  const router = new Hono<AppEnv>();
  const aiRateLimiter = deps.aiRateLimiter ?? createAiRateLimiter();

  const wrap =
    (handler: (c: Context<AppEnv>) => Promise<unknown>, status: ContentfulStatusCode = 200) =>
    async (c: Context<AppEnv>): Promise<Response> => {
      const result = await handler(c);
      return c.json({ ok: true, data: result }, status);
    };

  const requireAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
    const normalizedPath = c.req.path.replace(/^\/api\/v1(?=\/|$)/, '') || '/';
    if (c.req.method === 'GET' && PUBLIC_V1_GET_PATHS.has(normalizedPath)) {
      return next();
    }
    return requireFirebaseAuth(c, next);
  };

  router.onError(respondToApiError);

  // Middleware de autenticação Firebase Bearer Token para todas as rotas privadas
  router.use('*', requireAuth);

  // Rotas Públicas
  router.get('/health', (c) => {
    const cfg = getFirebaseAppletConfig();
    return c.json({
      ok: true,
      service: 'fitness-rpg-api-v1',
      authMode: 'firebase_id_token_starter_tier',
      projectId: cfg.projectId,
      geminiConfigured: Boolean(deps.getGeminiClient()),
      timestamp: new Date().toISOString(),
    });
  });

  router.get('/openapi.json', (c) => c.json(buildOpenApiSpec(getAppBaseUrl())));

  router.get('/armory/catalog', (c) => {
    return c.json({
      ok: true,
      data: {
        config: ARSENAL_CONFIG,
        sets: EQUIPMENT_SETS,
        items: EQUIPMENT_CATALOG,
        exampleLoadouts: EXAMPLE_LOADOUT_PRESETS,
      },
    });
  });

  // Estado global & Orquestrador único
  router.get(
    '/state',
    wrap(async (c) => handleGetFullState(getUserFromCtx(c)))
  );

  router.post('/command', async (c) => {
    const user = getUserFromCtx(c);
    const { action, payload = {} } = await readJsonInput(c, input.command);
    const getId = (field: string) => parseInput(documentId, payload[field] ?? payload.id);

    let result: unknown;
    switch (action) {
      case 'get_state':
        result = await handleGetFullState(user);
        break;
      case 'update_hero':
        result = await handlePatchHero(user, parseInput(input.hero, payload));
        break;
      case 'grant_stats':
        result = await handleGrantStats(user, parseInput(input.statsGrant, payload));
        break;
      case 'create_workout':
        result = await handleCreateWorkout(user, parseInput(input.workout, payload));
        break;
      case 'update_workout':
        result = await handleUpdateWorkout(
          user,
          getId('workoutId'),
          parseInput(input.workoutPatch, payload)
        );
        break;
      case 'delete_workout':
        result = await handleDeleteWorkout(user, getId('workoutId'));
        break;
      case 'complete_workout':
        result = await handleCompleteWorkout(
          user,
          getId('workoutId'),
          parseInput(input.workoutCompletion, payload),
          c.req.header('Idempotency-Key')
        );
        break;
      case 'purchase_gear':
        result = await handlePurchaseGear(user, parseInput(input.purchase, payload));
        break;
      case 'equip_gear':
        result = await handleEquipGear(user, parseInput(input.equip, payload));
        break;
      case 'save_loadout':
        result = await handleSaveLoadout(user, parseInput(input.loadout, payload));
        break;
      case 'apply_loadout':
        result = await handleApplyLoadout(user, getId('loadoutId'));
        break;
      case 'delete_loadout':
        result = await handleDeleteLoadout(user, getId('loadoutId'));
        break;
      case 'create_vow':
        result = await handleCreateVow(user, parseInput(input.vow, payload));
        break;
      case 'complete_vow':
        result = await handleResolveVow(
          user,
          getId('vowId'),
          'complete',
          parseInput(input.date, payload).dateKey
        );
        break;
      case 'violate_vow':
        result = await handleResolveVow(
          user,
          getId('vowId'),
          'violate',
          parseInput(input.date, payload).dateKey
        );
        break;
      case 'delete_vow':
        result = await handleDeleteVow(user, getId('vowId'));
        break;
      case 'claim_daily_quest':
        result = await handleClaimDailyQuest(
          user,
          parseInput(documentId, payload.questId),
          parseInput(input.date, payload).dateKey
        );
        break;
      case 'log_weight':
        result = await handleLogWeight(user, parseInput(input.weight, payload));
        break;
      case 'log_health_metric':
        result = await handleLogHealthMetrics(user, parseInput(input.metrics, payload));
        break;
      case 'log_health_activity':
        result = await handleLogHealthActivity(user, parseInput(input.activity, payload));
        break;
      case 'ask_oracle': {
        const oracle = parseInput(input.oracle, payload);
        const limited = await aiRateLimiter.consume(c);
        if (limited) return limited;
        result = await handleAskOracle(user, oracle, deps);
        break;
      }
      default:
        throw new ApiHttpError(
          400,
          'Ação desconhecida no orquestrador /api/v1/command.',
          'unknown_command_action'
        );
    }

    return c.json({ ok: true, data: { action, result } });
  });

  // Herói & Stats
  router.get(
    '/hero',
    wrap(async (c) => {
      const user = getUserFromCtx(c);
      const hero = await requireHeroProfile(user);
      return { hero, bmi: computeBmiSummary(hero.heightCm, hero.weightKg) };
    })
  );

  router.patch(
    '/hero',
    wrap(async (c) => handlePatchHero(getUserFromCtx(c), await readJsonInput(c, input.hero)))
  );

  router.get(
    '/stats',
    wrap(async (c) => {
      const user = getUserFromCtx(c);
      const [stats, hero] = await Promise.all([
        loadGameStatsOrInit(user),
        firestoreRest.getDoc<HeroProfile>(user.token, `users/${user.uid}/heroProfiles/main`),
      ]);
      return {
        stats,
        levelProgress: getLevelProgress(stats.totalXp),
        dualProgression: getDualProgressionStatus(stats, getServerDateKey()),
        gearBonuses: calculateGearBonusSummary(stats.equippedGear),
        derivedAttributes: hero ? calculateDerivedAttributes(stats, hero.heroClass) : null,
      };
    })
  );

  router.get('/stats/ledger', wrap(async (c) => readProgressLedger(getUserFromCtx(c), singleQuery(c, 'cursor'))));

  router.post(
    '/stats/grant',
    wrap(async (c) => handleGrantStats(getUserFromCtx(c), await readJsonInput(c, input.statsGrant)))
  );

  // Treinos & Logs (Nota: /workouts/logs antes de /workouts/:id)
  router.get(
    '/workouts',
    wrap(async (c) => {
      const user = getUserFromCtx(c);
      const list = await firestoreRest.queryByUser<WorkoutTemplate>(
        user.token,
        user.uid,
        'workouts'
      );
      return {
        workouts: mergeWithInitialWorkouts(list, user.uid),
      };
    })
  );

  router.post(
    '/workouts',
    wrap(async (c) => handleCreateWorkout(getUserFromCtx(c), await readJsonInput(c, input.workout)), 201)
  );

  router.get(
    '/workouts/logs',
    wrap(async (c) => {
      const user = getUserFromCtx(c);
      const rawLimit = singleQuery(c, 'limit') ?? '50';
      const limit = Number(rawLimit);
      if (!/^\d+$/.test(rawLimit) || !Number.isInteger(limit) || limit < 1 || limit > 200) {
        throw new ApiHttpError(400, 'O limite deve ser um inteiro entre 1 e 200.', 'invalid_workout_log_limit');
      }
      return firestoreRest.queryWorkoutLogsPage<WorkoutLog>(user.token, user.uid, limit, singleQuery(c, 'cursor'));
    })
  );

  router.patch(
    '/workouts/:id',
    wrap(async (c) =>
      handleUpdateWorkout(getUserFromCtx(c), parseInput(documentId, c.req.param('id')), await readJsonInput(c, input.workoutPatch))
    )
  );

  router.delete(
    '/workouts/:id',
    wrap(async (c) => handleDeleteWorkout(getUserFromCtx(c), parseInput(documentId, c.req.param('id'))))
  );

  router.post(
    '/workouts/:id/complete',
    wrap(async (c) =>
      handleCompleteWorkout(
        getUserFromCtx(c), parseInput(documentId, c.req.param('id')), await readJsonInput(c, input.workoutCompletion), c.req.header('Idempotency-Key')
      )
    )
  );

  // Arsenal & Loadouts
  router.get(
    '/armory/state',
    wrap(async (c) => handleGetArmoryState(getUserFromCtx(c)))
  );

  router.post(
    '/armory/purchase',
    wrap(async (c) => handlePurchaseGear(getUserFromCtx(c), await readJsonInput(c, input.purchase)))
  );

  router.put(
    '/armory/equip',
    wrap(async (c) => handleEquipGear(getUserFromCtx(c), await readJsonInput(c, input.equip)))
  );

  router.post(
    '/armory/loadouts',
    wrap(async (c) => handleSaveLoadout(getUserFromCtx(c), await readJsonInput(c, input.loadout)))
  );

  router.post(
    '/armory/loadouts/:id/apply',
    wrap(async (c) => handleApplyLoadout(getUserFromCtx(c), parseInput(documentId, c.req.param('id'))))
  );

  router.delete(
    '/armory/loadouts/:id',
    wrap(async (c) => handleDeleteLoadout(getUserFromCtx(c), parseInput(documentId, c.req.param('id'))))
  );

  // Votos Diários & Missões Automáticas
  router.get(
    '/vows',
    wrap(async (c) => {
      const user = getUserFromCtx(c);
      const vows = await firestoreRest.queryByUser<DailyVow>(user.token, user.uid, 'dailyVows');
      vows.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      return { vows };
    })
  );

  router.post(
    '/vows',
    wrap(async (c) => handleCreateVow(getUserFromCtx(c), await readJsonInput(c, input.vow)), 201)
  );

  router.post(
    '/vows/:id/complete',
    wrap(async (c) => {
      const body = await readJsonInput(c, input.date);
      return handleResolveVow(getUserFromCtx(c), parseInput(documentId, c.req.param('id')), 'complete', body.dateKey);
    })
  );

  router.post(
    '/vows/:id/violate',
    wrap(async (c) => {
      const body = await readJsonInput(c, input.date);
      return handleResolveVow(getUserFromCtx(c), parseInput(documentId, c.req.param('id')), 'violate', body.dateKey);
    })
  );

  router.delete(
    '/vows/:id',
    wrap(async (c) => handleDeleteVow(getUserFromCtx(c), parseInput(documentId, c.req.param('id'))))
  );

  router.get(
    '/quests/daily',
    wrap(async (c) => handleGetDailyQuests(getUserFromCtx(c), singleQuery(c, 'dateKey')))
  );

  router.post(
    '/quests/daily/:questId/claim',
    wrap(async (c) => {
      const body = await readJsonInput(c, input.date);
      return handleClaimDailyQuest(
        getUserFromCtx(c),
        parseInput(documentId, c.req.param('questId')),
        body.dateKey
      );
    })
  );

  // Saúde, Peso e Métricas
  router.get(
    '/health-data/summary',
    wrap(async (c) => handleGetHealthSummary(getUserFromCtx(c)))
  );

  router.post(
    '/health-data/weight',
    wrap(async (c) => handleLogWeight(getUserFromCtx(c), await readJsonInput(c, input.weight)))
  );

  router.post(
    '/health-data/metrics',
    wrap(async (c) => handleLogHealthMetrics(getUserFromCtx(c), await readJsonInput(c, input.metrics)))
  );

  router.post(
    '/health-data/activities',
    wrap(async (c) => handleLogHealthActivity(getUserFromCtx(c), await readJsonInput(c, input.activity)), 201)
  );

  // Oráculo Gemini integrado ao contexto do Firestore (com rate limiter de IA)
  router.post(
    '/oracle/ask',
    async (c) => {
      const body = await readJsonInput(c, input.oracle);
      const limited = await aiRateLimiter.consume(c);
      if (limited) return limited;
      const result = await handleAskOracle(getUserFromCtx(c), body, deps);
      return c.json({ ok: true, data: result });
    }
  );

  // Fallback 404 JSON dentro de /api/v1 (inclusive quando montado via app.route)
  const handleApiV1NotFound = (c: Context<AppEnv>) =>
    c.json(
      {
        ok: false,
        error: 'Rota não encontrada em /api/v1.',
        code: 'route_not_found',
      },
      404
    );

  router.all('*', handleApiV1NotFound);
  router.notFound(handleApiV1NotFound);

  return router;
}
