import { z } from 'zod';
import { input } from '../input.ts';

type Schema = {
  type?: 'object' | 'array' | 'string' | 'integer' | 'number' | 'boolean';
  [keyword: string]: unknown;
};

function object(properties: Record<string, Schema>, required = Object.keys(properties)): Schema {
  return { type: 'object', properties, ...(required.length ? { required } : {}) };
}

const string: Schema = { type: 'string' };
const number: Schema = { type: 'number' };
const integer: Schema = { type: 'integer' };
const boolean: Schema = { type: 'boolean' };
const record: Schema = { type: 'object', additionalProperties: true };
const array = (items: Schema): Schema => ({ type: 'array', items });
const nullable = (schema: Schema): Schema => ({ ...schema, nullable: true });
const ref = (name: string): Schema => ({ $ref: `#/components/schemas/${name}` });
const enumString = (...values: string[]): Schema => ({ type: 'string', enum: values });
const id: Schema = { ...string, pattern: '^[A-Za-z0-9_-]{1,128}$' };
const date: Schema = { ...string, format: 'date' };
const time: Schema = { ...string, format: 'date-time' };
const healthConnectStatus = enumString('available', 'partial', 'unavailable');
const workoutType = enumString('cardio', 'forca', 'hiit', 'core', 'mobilidade', 'corpo_inteiro');
const difficulty = enumString('Iniciante', 'Intermediário', 'Avançado');
const gear = object({
  elmo: nullable(id), armadura: nullable(id), capa: nullable(id), arma: nullable(id),
}, []);
const bmi = nullable(object({ bmi: number, label: string }));

const workoutFields = {
  id, name: string, description: string, type: workoutType, difficulty, durationMinutes: integer,
  baseXp: integer, rank: enumString('F', 'E', 'D', 'C', 'B', 'A', 'S'),
  exercises: array(object({
    id, name: string, prescription: string, restSeconds: integer, muscleGroups: array(string),
    executionTip: string, equipment: string, loadKg: number, loadNote: string, unilateral: boolean,
  }, ['name'])),
};
const stats = {
  stats: record, levelProgress: record, dualProgression: record,
  gearBonuses: record, derivedAttributes: nullable(record),
};
const request = (schema: z.ZodType): Schema =>
  z.toJSONSchema(schema, { target: 'openapi-3.0', io: 'input' }) as Schema;

const errorDescriptions = {
  400: 'Parâmetros ou corpo inválidos.',
  401: 'Firebase ID Token ausente, inválido ou expirado.',
  403: 'Operação negada pelas permissões ou pelas regras do Firestore.',
  404: 'Registro solicitado não encontrado.',
  409: 'Conflito de atualização ou de idempotência.',
  413: 'Corpo da requisição maior que 2 MB.',
  415: 'Corpo enviado com um formato diferente de JSON.',
  429: 'Limite de requisições atingido.',
  500: 'Erro interno ou falha no serviço de dados.',
  502: 'Resposta inválida de um serviço externo.',
  503: 'Integração ou serviço temporariamente indisponível.',
};

function jsonResponse(description: string, schema: Schema) {
  return { description, content: { 'application/json': { schema } } };
}

interface OperationOptions {
  public?: boolean;
  raw?: boolean;
  created?: boolean;
  body?: Schema;
  bodyRequired?: boolean;
  description?: string;
  parameters?: Record<string, unknown>[];
  errors?: Array<keyof typeof errorDescriptions>;
}

function operation(summary: string, data: Schema, options: OperationOptions = {}) {
  const errors = new Set<keyof typeof errorDescriptions>(options.errors);
  errors.add(500);
  if (!options.public) {
    errors.add(401);
    errors.add(403);
  }
  if (options.body) {
    errors.add(400);
    errors.add(413);
    errors.add(415);
  }
  return {
    summary,
    ...(options.public ? { security: [] } : {}),
    ...(options.description ? { description: options.description } : {}),
    ...(options.parameters ? { parameters: options.parameters } : {}),
    ...(options.body ? {
      requestBody: {
        required: options.bodyRequired ?? true,
        content: { 'application/json': { schema: options.body } },
      },
    } : {}),
    responses: {
      [options.created ? 201 : 200]: jsonResponse(
        options.created ? 'Registro criado.' : 'Operação concluída.',
        options.raw ? data : object({ ok: { ...boolean, enum: [true] }, data })
      ),
      ...Object.fromEntries(
        [...errors].map((status) => [status, jsonResponse(errorDescriptions[status], ref('Error'))])
      ),
    },
  };
}

const idParameter = (name: string) => ({ name, in: 'path', required: true, schema: id });
const idempotencyHeader = {
  name: 'Idempotency-Key',
  in: 'header',
  description: 'Para concluir um treino, informe este cabeçalho ou idempotencyKey no JSON. Se ambos forem informados, os valores devem coincidir. Reutilize a chave e os mesmos dados ao repetir a mesma sessão.',
  schema: id,
};
const workoutResult = object({ workout: ref('Workout') });
const vowResult = object({ vow: record, stats: record });
const gearResult = { equippedGear: gear, gearBonuses: record };
const healthCheck = {
  ok: { ...boolean, enum: [true] }, service: string, geminiConfigured: boolean, timestamp: time,
};
const liveness = {
  public: true, raw: true,
  description: 'Verifica se o servidor responde. geminiConfigured indica a presença da configuração e não confirma acesso ao Gemini.',
};
const resolveVow = (summary: string) => operation(summary, vowResult, {
  body: request(input.date), bodyRequired: false, errors: [404, 409],
});

export function buildOpenApiSpec(serverUrl: string) {
  return {
    openapi: '3.0.3',
    info: {
      title: 'Fitness RPG & Saúde — API v1',
      version: '1.0.0',
      description: 'API REST para treinos, progressão, arsenal, votos, missões, saúde e Oráculo. As rotas privadas usam Firebase ID Token.',
    },
    servers: [{ url: serverUrl }],
    components: {
      securitySchemes: {
        FirebaseBearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Firebase ID Token obtido por auth.currentUser.getIdToken().',
        },
      },
      schemas: {
        Error: object({ ok: { ...boolean, enum: [false] }, error: string, code: string }),
        Workout: object({ ...workoutFields, userId: string }),
        WorkoutLog: object({
          id, userId: string, workoutId: id, workoutName: string, workoutType, difficulty,
          completedExercises: integer, totalExercises: integer, durationMinutes: integer,
          xpEarned: integer, bonusXpEarned: integer, performedExercises: array(record),
          totalVolumeKg: number, prCount: integer, dateKey: date, completedAt: time,
        }),
        WorkoutCompletion: object({
          log: ref('WorkoutLog'), stats: record,
          duplicate: { ...boolean, description: 'Indica que a sessão já existia e não recebeu recompensas de novo.' },
          rewardSummary: record,
        }),
        HealthConnect: object({
          status: {
            ...healthConnectStatus,
            description: 'available indica que as consultas foram lidas, mesmo sem registros. partial indica bloqueio de parte das consultas. unavailable indica bloqueio de todas as consultas.',
          },
          days: array(object({ dateKey: date, steps: integer, totalCalories: number }, ['dateKey'])),
          latestHeartRate: nullable(object({ time, beatsPerMinute: number })),
        }),
      },
    },
    security: [{ FirebaseBearerAuth: [] }],
    paths: {
      '/api/health': {
        get: operation('Verificar disponibilidade do servidor', object({
          ...healthCheck, version: string, runtime: enumString('vercel', 'node'), revision: nullable(string),
        }), liveness),
      },
      '/api/v1/health': {
        get: operation('Verificar disponibilidade da API v1', object({
          ...healthCheck, authMode: string, projectId: string,
        }), liveness),
      },
      '/api/v1/openapi.json': {
        get: operation('Obter este contrato OpenAPI', object({
          openapi: string, info: record, paths: record,
        }), { public: true, raw: true }),
      },
      '/api/v1/armory/catalog': {
        get: operation('Consultar catálogo do Arsenal', object({
          config: record, sets: array(record), items: array(record), exampleLoadouts: array(record),
        }), { public: true }),
      },
      '/api/v1/state': {
        get: operation('Consultar estado completo do usuário', object({
          uid: string, todayKey: date, hero: nullable(record), ...stats, recovery: record,
          autoQuests: array(record), weeklyAutoQuests: array(record), weeklyRaidBoss: record,
          workoutsCount: integer, workouts: array(ref('Workout')),
          workoutLogs: array(ref('WorkoutLog')), exercisePrs: array(record), dailyVows: array(record),
          weightLogs: array(record), dailyMetrics: array(record), healthActivities: array(record),
          achievements: array(record), healthConnectStatus,
        })),
      },
      '/api/v1/command': {
        post: operation('Executar uma ação da API', object({ action: string, result: record }), {
          description: 'O formato de payload e result depende da ação. Para complete_workout, informe payload.workoutId e a chave no cabeçalho ou em payload.idempotencyKey.',
          body: request(input.command),
          parameters: [idempotencyHeader],
          errors: [404, 409, 429, 502, 503],
        }),
      },
      '/api/v1/hero': {
        get: operation('Consultar ficha do herói e IMC', object({ hero: record, bmi }), { errors: [404] }),
        patch: operation('Atualizar ficha do herói', object({ hero: record, bmi }), {
          body: request(input.hero),
          errors: [404, 409],
        }),
      },
      '/api/v1/stats': {
        get: operation('Consultar XP, nível, moedas, HP e atributos', object(stats)),
      },
      '/api/v1/stats/ledger': {
        get: operation('Consultar lançamentos de XP e moedas', object({
          available: boolean,
          entries: array(object({
            id, userId: string, title: string, createdAt: time,
            kind: enumString('workout', 'health_activity', 'armory_purchase', 'daily_quest', 'vow_completed', 'vow_broken', 'adjustment'),
            xpDelta: integer, coinDelta: integer, totalXp: integer, goldCoins: integer,
          })),
          nextCursor: nullable(id),
        }), {
          description: 'Retorna até 30 lançamentos da conta. A disponibilidade depende das regras publicadas no Firestore.',
          parameters: [{ name: 'cursor', in: 'query', schema: id, description: 'Valor de nextCursor da página anterior.' }],
          errors: [400],
        }),
      },
      '/api/v1/stats/grant': {
        post: operation('Ajustar atributos com autorização administrativa', object({
          previousLevel: integer, newLevel: integer, leveledUp: boolean,
          stats: record, levelProgress: record, dualProgression: record,
        }), {
          body: request(input.statsGrant),
          errors: [409],
        }),
      },
      '/api/v1/workouts': {
        get: operation('Listar treinos', object({ workouts: array(ref('Workout')) })),
        post: operation('Criar treino personalizado', workoutResult, {
          body: request(input.workout), created: true, errors: [409],
        }),
      },
      '/api/v1/workouts/logs': {
        get: operation('Paginar sessões concluídas', object({
          logs: array(ref('WorkoutLog')), nextCursor: nullable(string),
          order: enumString('completedAt', 'documentId'),
        }), {
          description: 'Use nextCursor na página seguinte até receber null. A ordem é decrescente por data de conclusão e ID. Se o índice de data não estiver disponível, a paginação usa a ordem decrescente por ID.',
          parameters: [
            { name: 'limit', in: 'query', schema: { ...integer, default: 50, minimum: 1, maximum: 200 } },
            { name: 'cursor', in: 'query', description: 'Valor de nextCursor da página anterior.', schema: string },
          ],
          errors: [400, 409, 502],
        }),
      },
      '/api/v1/workouts/{id}': {
        parameters: [idParameter('id')],
        patch: operation('Atualizar treino ou cargas', workoutResult, {
          body: request(input.workoutPatch),
          errors: [404, 409],
        }),
        delete: operation('Remover treino personalizado', object({ deleted: boolean, workoutId: id }), {
          errors: [400, 404, 409],
        }),
      },
      '/api/v1/workouts/{id}/complete': {
        parameters: [idParameter('id')],
        post: operation('Concluir treino e aplicar recompensas', ref('WorkoutCompletion'), {
          description: 'Envie a mesma chave e os mesmos dados se precisar repetir o envio. Um reenvio compatível retorna o registro existente e duplicate=true. Uma chave reutilizada com outros dados retorna 409.',
          parameters: [idempotencyHeader],
          body: request(input.workoutCompletion), bodyRequired: false, errors: [404, 409],
        }),
      },
      '/api/v1/armory/state': {
        get: operation('Consultar saldo, equipamentos e loadouts', object({
          goldCoins: integer, totalCoinsEarned: integer, ownedEquipmentIds: array(id),
          equippedGear: gear, gearLoadouts: array(record), exampleLoadouts: array(record), gearBonuses: record,
        })),
      },
      '/api/v1/armory/purchase': {
        post: operation('Comprar item do Arsenal', object({
          purchasedItem: record, equipped: boolean, goldCoins: integer, ownedEquipmentIds: array(id), updatedAt: string, ...gearResult,
        }), { body: request(input.purchase), errors: [404, 409] }),
      },
      '/api/v1/armory/equip': {
        put: operation('Equipar item, remover item ou aplicar conjunto', object({ ...gearResult, updatedAt: string }), {
          body: request(input.equip),
          errors: [404, 409],
        }),
      },
      '/api/v1/armory/loadouts': {
        post: operation('Salvar preset de equipamento', object({ preset: record, gearLoadouts: array(record) }), {
          body: request(input.loadout), errors: [409],
        }),
      },
      '/api/v1/armory/loadouts/{id}/apply': {
        parameters: [idParameter('id')],
        post: operation('Aplicar preset de equipamento', object({ appliedLoadout: string, ...gearResult }), {
          errors: [400, 404, 409],
        }),
      },
      '/api/v1/armory/loadouts/{id}': {
        parameters: [idParameter('id')],
        delete: operation('Excluir preset salvo', object({
          deleted: boolean, loadoutId: id, gearLoadouts: array(record),
        }), { errors: [400, 404, 409] }),
      },
      '/api/v1/vows': {
        get: operation('Listar votos diários', object({ vows: array(record) })),
        post: operation('Criar voto diário', object({ vow: record }), {
          body: request(input.vow),
          created: true, errors: [409],
        }),
      },
      '/api/v1/vows/{id}/complete': {
        parameters: [idParameter('id')],
        post: resolveVow('Cumprir voto diário'),
      },
      '/api/v1/vows/{id}/violate': {
        parameters: [idParameter('id')],
        post: resolveVow('Registrar quebra de voto diário'),
      },
      '/api/v1/vows/{id}': {
        parameters: [idParameter('id')],
        delete: operation('Excluir voto diário', object({ deleted: boolean, vowId: id }), {
          errors: [400, 404, 409],
        }),
      },
      '/api/v1/quests/daily': {
        get: operation('Consultar progresso das missões diárias', object({
          dateKey: date, quests: array(record),
        }), { parameters: [{ name: 'dateKey', in: 'query', schema: date }], errors: [400] }),
      },
      '/api/v1/quests/daily/{questId}/claim': {
        parameters: [idParameter('questId')],
        post: operation('Resgatar recompensa de missão', object({ claimedQuest: record, stats: record }), {
          body: request(input.date), bodyRequired: false, errors: [404, 409],
        }),
      },
      '/api/v1/health-data/summary': {
        get: operation('Consultar peso, IMC, recuperação e atividades', object({
          latestWeight: nullable(record), bmi, recovery: record, hrZones: array(record),
          healthConnect: ref('HealthConnect'), weightLogs: array(record),
          dailyMetrics: array(record), activities: array(record),
        })),
      },
      '/api/v1/health-data/weight': {
        post: operation('Registrar peso diário', object({ weightLog: record, bmi }), {
          body: request(input.weight),
          errors: [409],
        }),
      },
      '/api/v1/health-data/metrics': {
        post: operation('Registrar métricas diárias', object({ dailyMetric: record }), {
          body: request(input.metrics),
          errors: [409],
        }),
      },
      '/api/v1/health-data/activities': {
        post: operation('Registrar atividade de saúde', object({
          activity: record, stats: record, coinsAdded: integer, duplicate: boolean,
        }), {
          body: request(input.activity),
          created: true, errors: [409],
        }),
      },
      '/api/v1/oracle/ask': {
        post: operation('Consultar o Oráculo Gemini', object({
          question: string, reply: string, persisted: boolean, recoveryScore: number,
        }), {
          body: request(input.oracle),
          errors: [404, 429, 502, 503],
        }),
      },
    },
  };
}
