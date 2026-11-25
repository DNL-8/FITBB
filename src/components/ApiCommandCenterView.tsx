import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { User as FirebaseUser } from 'firebase/auth';
import {
  ArrowsClockwise,
  BookOpen,
  BracketsCurly,
  Check,
  Code,
  Copy,
  Key,
  Lightning,
  MagnifyingGlass,
  PaperPlaneRight,
  Play,
  ShieldCheck,
  Terminal,
  Trash,
} from '@phosphor-icons/react';
import {
  DailyVow,
  GameStats,
  HeroProfile,
  WorkoutTemplate,
} from '../types/fitness';
import { getLocalDateKey } from '../utils/rpgLogic';
import { ApiServiceError, validateAndGetFirebaseToken } from '../services/api';

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
type ApiDomain =
  | 'Todos'
  | 'Global'
  | 'Herói & Stats'
  | 'Treinos'
  | 'Arsenal'
  | 'Votos & Missões'
  | 'Saúde'
  | 'Oráculo';

interface ApiEndpointDef {
  id: string;
  domain: Exclude<ApiDomain, 'Todos'>;
  method: HttpMethod;
  path: string;
  title: string;
  description: string;
  requiresAuth: boolean;
  pathParam?: {
    key: string;
    label: string;
    source: 'workout' | 'vow' | 'loadout' | 'quest';
  };
  defaultBody?: Record<string, unknown>;
}

interface ApiExecutionResult {
  status: number;
  ok: boolean;
  latencyMs: number;
  url: string;
  bodyText: string;
  executedAt: string;
}

interface ApiCommandCenterViewProps {
  user: FirebaseUser;
  hero: HeroProfile;
  stats: GameStats;
  workouts: WorkoutTemplate[];
  dailyVows: DailyVow[];
}

const DOMAIN_FILTERS: readonly ApiDomain[] = [
  'Todos',
  'Global',
  'Herói & Stats',
  'Treinos',
  'Arsenal',
  'Votos & Missões',
  'Saúde',
  'Oráculo',
];

const METHOD_BADGE_CLASS: Record<HttpMethod, string> = {
  GET: 'bg-[#111113] text-zinc-200 border-[#3F3F46]',
  POST: 'bg-[#111113] text-emerald-400 border-emerald-500/40',
  PUT: 'bg-[#111113] text-amber-400 border-amber-500/40',
  PATCH: 'bg-[#111113] text-orange-400 border-orange-500/40',
  DELETE: 'bg-[#111113] text-red-400 border-red-500/40',
};

const COMMAND_ACTION_PRESETS: ReadonlyArray<{
  label: string;
  action: string;
  buildPayload: (ctx: {
    workoutId: string;
    vowId: string;
    todayKey: string;
  }) => Record<string, unknown>;
}> = [
  {
    label: 'Estado Global',
    action: 'get_state',
    buildPayload: () => ({}),
  },
  {
    label: '+50 XP & +25 Moedas',
    action: 'grant_stats',
    buildPayload: () => ({ xpDelta: 50, coinsDelta: 25 }),
  },
  {
    label: 'Concluir Treino',
    action: 'complete_workout',
    buildPayload: ({ workoutId, todayKey }) => ({
      workoutId,
      idempotencyKey: crypto.randomUUID(),
      completedExercises: 4,
      durationMinutes: 30,
      bossDefeated: true,
      dateKey: todayKey,
    }),
  },
  {
    label: 'Equipar Arsenal',
    action: 'equip_gear',
    buildPayload: () => ({
      slot: 'arma',
      itemId: 'arma_bastao_treino',
    }),
  },
  {
    label: 'Criar Voto',
    action: 'create_vow',
    buildPayload: () => ({
      title: 'Beber 2.5L de água hoje',
      xpReward: 15,
      penaltyXp: 15,
    }),
  },
  {
    label: 'Registrar Peso',
    action: 'log_weight',
    buildPayload: ({ todayKey }) => ({
      weightKg: 76.5,
      dateKey: todayKey,
      note: 'Check-in via API Command',
    }),
  },
  {
    label: 'Perguntar ao Oráculo',
    action: 'ask_oracle',
    buildPayload: () => ({
      question: 'Qual intensidade de treino combina com minha recuperação de hoje?',
      persist: true,
    }),
  },
];

export function ApiCommandCenterView({
  user,
  hero,
  stats,
  workouts,
  dailyVows,
}: ApiCommandCenterViewProps): React.ReactElement {
  const todayKey = getLocalDateKey();
  const defaultWorkoutId = workouts[0]?.id || 'w-cardio-iniciante';
  const defaultVowId = dailyVows[0]?.id || 'vow-starter-1';
  const defaultLoadoutId = stats.gearLoadouts?.[0]?.id || 'preset_1';

  const endpoints = useMemo<ApiEndpointDef[]>(
    () => [
      {
        id: 'command_dispatch',
        domain: 'Global',
        method: 'POST',
        path: '/api/v1/command',
        title: 'Orquestrador Único de Comandos',
        description:
          'Dispara qualquer ação do app (herói, treinos, arsenal, votos, saúde ou Oráculo) via { action, payload }.',
        requiresAuth: true,
        defaultBody: {
          action: 'grant_stats',
          payload: {
            xpDelta: 50,
            coinsDelta: 25,
          },
        },
      },
      {
        id: 'full_state',
        domain: 'Global',
        method: 'GET',
        path: '/api/v1/state',
        title: 'Snapshot Completo do Sistema',
        description:
          'Retorna herói, stats, bônus do Arsenal, recuperação, missões automáticas, treinos, votos e logs.',
        requiresAuth: true,
      },
      {
        id: 'health_check',
        domain: 'Global',
        method: 'GET',
        path: '/api/v1/health',
        title: 'Status da API v1',
        description: 'Verifica disponibilidade da API v1, modo Starter Tier e Gemini server-side.',
        requiresAuth: false,
      },
      {
        id: 'openapi_spec',
        domain: 'Global',
        method: 'GET',
        path: '/api/v1/openapi.json',
        title: 'Especificação OpenAPI 3.0',
        description: 'Retorna o contrato OpenAPI 3.0 completo de todas as rotas /api/v1/*.',
        requiresAuth: false,
      },
      {
        id: 'get_hero',
        domain: 'Herói & Stats',
        method: 'GET',
        path: '/api/v1/hero',
        title: 'Ler Ficha do Herói',
        description: 'Retorna nome, classe, objetivo, medidas corporais, FC basal e IMC calculado.',
        requiresAuth: true,
      },
      {
        id: 'patch_hero',
        domain: 'Herói & Stats',
        method: 'PATCH',
        path: '/api/v1/hero',
        title: 'Atualizar Ficha do Herói',
        description:
          'Altera nome, classe (Guerreiro/Arqueiro/Mago), objetivo, experiência, altura, peso ou FC.',
        requiresAuth: true,
        defaultBody: {
          name: hero.name,
          heroClass: hero.heroClass,
          objective: hero.objective,
          experience: hero.experience,
        },
      },
      {
        id: 'get_stats',
        domain: 'Herói & Stats',
        method: 'GET',
        path: '/api/v1/stats',
        title: 'Ler Stats & Atributos RPG',
        description: 'Retorna XP, nível, moedas, HP, streak e atributos derivados da classe.',
        requiresAuth: true,
      },
      {
        id: 'grant_stats',
        domain: 'Herói & Stats',
        method: 'POST',
        path: '/api/v1/stats/grant',
        title: 'Conceder / Ajustar XP, Moedas e HP',
        description:
          'Aplica deltas positivos ou negativos em XP, moedas, HP ou chefes derrotados com recálculo de nível.',
        requiresAuth: true,
        defaultBody: {
          xpDelta: 50,
          coinsDelta: 25,
          hpDelta: 5,
        },
      },
      {
        id: 'list_workouts',
        domain: 'Treinos',
        method: 'GET',
        path: '/api/v1/workouts',
        title: 'Listar Treinos Disponíveis',
        description: 'Lista todos os templates de treino salvos e missões padrão do usuário.',
        requiresAuth: true,
      },
      {
        id: 'create_workout',
        domain: 'Treinos',
        method: 'POST',
        path: '/api/v1/workouts',
        title: 'Criar Novo Treino Personalizado',
        description: 'Cria um template completo de treino no Firestore respeitando as regras.',
        requiresAuth: true,
        defaultBody: {
          name: 'Força Express via API',
          description: 'Sessão curta focada em empurrar e puxar.',
          type: 'forca',
          difficulty: 'Intermediário',
          durationMinutes: 25,
          baseXp: 160,
          rank: 'B',
          exercises: [
            {
              id: 'ex-api-1',
              name: 'Flexão de Braços Controlada',
              prescription: '4 séries x 12 repetições',
              restSeconds: 60,
              muscleGroups: ['Peitoral', 'Tríceps'],
              executionTip: 'Controle 2 segundos na descida mantendo o core firme.',
            },
            {
              id: 'ex-api-2',
              name: 'Agachamento Livre',
              prescription: '4 séries x 15 repetições',
              restSeconds: 60,
              muscleGroups: ['Quadríceps', 'Glúteos'],
              executionTip: 'Mantenha os calcanhares firmes no solo.',
            },
          ],
        },
      },
      {
        id: 'complete_workout',
        domain: 'Treinos',
        method: 'POST',
        path: '/api/v1/workouts/:id/complete',
        title: 'Concluir Treino + Aplicar Bônus do Arsenal',
        description:
          'Registra a sessão e calcula recompensas. Reutilize a chave e os dados ao repetir o envio de uma sessão.',
        requiresAuth: true,
        pathParam: {
          key: 'id',
          label: 'ID do Treino',
          source: 'workout',
        },
        defaultBody: {
          completedExercises: 4,
          durationMinutes: 25,
          bossDefeated: true,
          dateKey: todayKey,
        },
      },
      {
        id: 'update_workout',
        domain: 'Treinos',
        method: 'PATCH',
        path: '/api/v1/workouts/:id',
        title: 'Atualizar Treino ou Cargas',
        description:
          'Atualiza metadados ou ajusta loadKg de exercícios específicos via exerciseLoadUpdates.',
        requiresAuth: true,
        pathParam: {
          key: 'id',
          label: 'ID do Treino',
          source: 'workout',
        },
        defaultBody: {
          durationMinutes: 30,
          baseXp: 180,
        },
      },
      {
        id: 'delete_workout',
        domain: 'Treinos',
        method: 'DELETE',
        path: '/api/v1/workouts/:id',
        title: 'Excluir Treino Customizado',
        description: 'Remove um template de treino da coleção do usuário.',
        requiresAuth: true,
        pathParam: {
          key: 'id',
          label: 'ID do Treino',
          source: 'workout',
        },
      },
      {
        id: 'workout_logs',
        domain: 'Treinos',
        method: 'GET',
        path: '/api/v1/workouts/logs',
        title: 'Histórico de Treinos Concluídos',
        description: 'Lista as sessões já executadas ordenadas da mais recente para a mais antiga.',
        requiresAuth: true,
      },
      {
        id: 'armory_catalog',
        domain: 'Arsenal',
        method: 'GET',
        path: '/api/v1/armory/catalog',
        title: 'Catálogo Completo do Arsenal',
        description:
          'Retorna os 20 equipamentos, raridades, multiplicadores de aura, conjuntos e presets exemplo.',
        requiresAuth: false,
      },
      {
        id: 'armory_state',
        domain: 'Arsenal',
        method: 'GET',
        path: '/api/v1/armory/state',
        title: 'Estado Atual do Arsenal & Bônus',
        description:
          'Retorna moedas disponíveis, itens desbloqueados, slots equipados, sinergias de conjunto e loadouts.',
        requiresAuth: true,
      },
      {
        id: 'armory_purchase',
        domain: 'Arsenal',
        method: 'POST',
        path: '/api/v1/armory/purchase',
        title: 'Comprar & Equipar Item',
        description:
          'Valida requisito de desbloqueio e moedas suficientes, registra posse e equipa opcionalmente.',
        requiresAuth: true,
        defaultBody: {
          itemId: 'armadura_tunica_couro',
          equip: true,
        },
      },
      {
        id: 'armory_equip',
        domain: 'Arsenal',
        method: 'PUT',
        path: '/api/v1/armory/equip',
        title: 'Equipar Slot ou Build Completa',
        description: 'Equipa ou desequipa um slot específico ou substitui os 4 slots de uma vez.',
        requiresAuth: true,
        defaultBody: {
          slot: 'arma',
          itemId: 'arma_bastao_treino',
        },
      },
      {
        id: 'armory_save_loadout',
        domain: 'Arsenal',
        method: 'POST',
        path: '/api/v1/armory/loadouts',
        title: 'Salvar Preset de Loadout',
        description: 'Salva a combinação atual ou customizada nos slots de preset (máx. 4).',
        requiresAuth: true,
        defaultBody: {
          name: 'Build Balanceada API',
          gear: stats.equippedGear,
        },
      },
      {
        id: 'armory_apply_loadout',
        domain: 'Arsenal',
        method: 'POST',
        path: '/api/v1/armory/loadouts/:id/apply',
        title: 'Aplicar Preset de Loadout',
        description: 'Aplica um preset salvo (ou preset_1/preset_2/preset_3) equipando peças possuídas.',
        requiresAuth: true,
        pathParam: {
          key: 'id',
          label: 'ID do Loadout',
          source: 'loadout',
        },
      },
      {
        id: 'armory_delete_loadout',
        domain: 'Arsenal',
        method: 'DELETE',
        path: '/api/v1/armory/loadouts/:id',
        title: 'Excluir Preset de Loadout',
        description: 'Remove um preset salvo do Arsenal.',
        requiresAuth: true,
        pathParam: {
          key: 'id',
          label: 'ID do Loadout',
          source: 'loadout',
        },
      },
      {
        id: 'list_vows',
        domain: 'Votos & Missões',
        method: 'GET',
        path: '/api/v1/vows',
        title: 'Listar Votos Diários',
        description: 'Retorna todos os votos e hábitos configurados pelo herói.',
        requiresAuth: true,
      },
      {
        id: 'create_vow',
        domain: 'Votos & Missões',
        method: 'POST',
        path: '/api/v1/vows',
        title: 'Criar Novo Voto Diário',
        description: 'Cria um novo voto de disciplina diária com recompensa e penalidade de XP.',
        requiresAuth: true,
        defaultBody: {
          title: 'Fazer 10 min de mobilidade ao acordar',
          xpReward: 15,
          penaltyXp: 15,
        },
      },
      {
        id: 'complete_vow',
        domain: 'Votos & Missões',
        method: 'POST',
        path: '/api/v1/vows/:id/complete',
        title: 'Cumprir Voto Diário',
        description: 'Marca o voto como cumprido hoje e concede +XP, +5 HP e +10 Moedas.',
        requiresAuth: true,
        pathParam: {
          key: 'id',
          label: 'ID do Voto',
          source: 'vow',
        },
        defaultBody: {
          dateKey: todayKey,
        },
      },
      {
        id: 'violate_vow',
        domain: 'Votos & Missões',
        method: 'POST',
        path: '/api/v1/vows/:id/violate',
        title: 'Registrar Quebra de Voto',
        description: 'Registra falha no voto diário aplicando penalidade de XP e -15 HP.',
        requiresAuth: true,
        pathParam: {
          key: 'id',
          label: 'ID do Voto',
          source: 'vow',
        },
        defaultBody: {
          dateKey: todayKey,
        },
      },
      {
        id: 'delete_vow',
        domain: 'Votos & Missões',
        method: 'DELETE',
        path: '/api/v1/vows/:id',
        title: 'Excluir Voto Diário',
        description: 'Remove um voto diário do Firestore.',
        requiresAuth: true,
        pathParam: {
          key: 'id',
          label: 'ID do Voto',
          source: 'vow',
        },
      },
      {
        id: 'daily_quests',
        domain: 'Votos & Missões',
        method: 'GET',
        path: '/api/v1/quests/daily',
        title: 'Avaliar Missões Automáticas',
        description: 'Calcula o progresso de passos (6.000), treino diário e check-in de peso.',
        requiresAuth: true,
      },
      {
        id: 'claim_daily_quest',
        domain: 'Votos & Missões',
        method: 'POST',
        path: '/api/v1/quests/daily/:questId/claim',
        title: 'Resgatar Missão Automática',
        description: 'Resgata XP e Moedas de uma missão automática já atingida hoje.',
        requiresAuth: true,
        pathParam: {
          key: 'questId',
          label: 'ID da Missão (steps_6000 | workout_today | weight_today)',
          source: 'quest',
        },
        defaultBody: {
          dateKey: todayKey,
        },
      },
      {
        id: 'health_summary',
        domain: 'Saúde',
        method: 'GET',
        path: '/api/v1/health-data/summary',
        title: 'Resumo de Saúde, Zonas FC & Recuperação',
        description: 'Retorna IMC, evolução de peso, zonas cardíacas Z1–Z5 e score ACWR de recuperação.',
        requiresAuth: true,
      },
      {
        id: 'health_weight',
        domain: 'Saúde',
        method: 'POST',
        path: '/api/v1/health-data/weight',
        title: 'Registrar Peso Corporal',
        description: 'Salva ou atualiza o peso do dia em weightLogs e sincroniza o perfil do herói.',
        requiresAuth: true,
        defaultBody: {
          weightKg: hero.weightKg ?? 75.5,
          dateKey: todayKey,
          note: 'Pesagem registrada pela Central API',
        },
      },
      {
        id: 'health_metrics',
        domain: 'Saúde',
        method: 'POST',
        path: '/api/v1/health-data/metrics',
        title: 'Registrar Métricas Diárias',
        description: 'Grava passos, calorias ativas, horas de sono, FC de repouso e HRV do dia.',
        requiresAuth: true,
        defaultBody: {
          dateKey: todayKey,
          steps: 7200,
          activeCalories: 460,
          sleepHours: 7.5,
          restingHeartRate: hero.restingHrBaseline ?? 60,
          hrvMs: 58,
          sources: ['api'],
        },
      },
      {
        id: 'health_activity',
        domain: 'Saúde',
        method: 'POST',
        path: '/api/v1/health-data/activities',
        title: 'Registrar Atividade de Saúde Externa',
        description: 'Cria uma atividade cardiovascular/esportiva externa e soma XP e moedas.',
        requiresAuth: true,
        defaultBody: {
          title: 'Corrida Leve de Recuperação',
          source: 'strava',
          sportType: 'Run',
          dateKey: todayKey,
          durationMinutes: 28,
          distanceKm: 4.5,
          calories: 290,
          avgHeartRate: 146,
          maxHeartRate: 168,
        },
      },
      {
        id: 'oracle_ask',
        domain: 'Oráculo',
        method: 'POST',
        path: '/api/v1/oracle/ask',
        title: 'Consultar Oráculo Gemini',
        description:
          'Envia pergunta para a IA com leitura automática do herói, Arsenal e recuperação, salvando no chat.',
        requiresAuth: true,
        defaultBody: {
          question: 'Com meu nível e recuperação atuais, qual treino devo priorizar hoje?',
          persist: true,
        },
      },
    ],
    [hero, stats.equippedGear, todayKey]
  );

  const [domainFilter, setDomainFilter] = useState<ApiDomain>('Todos');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedId, setSelectedId] = useState<string>('command_dispatch');
  const [paramValue, setParamValue] = useState<string>(defaultWorkoutId);
  const [bodyText, setBodyText] = useState<string>(() =>
    JSON.stringify(
      {
        action: 'grant_stats',
        payload: { xpDelta: 50, coinsDelta: 25 },
      },
      null,
      2
    )
  );
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [executing, setExecuting] = useState<boolean>(false);
  const [result, setResult] = useState<ApiExecutionResult | null>(null);
  const [copiedFlag, setCopiedFlag] = useState<
    'none' | 'token' | 'json' | 'curl_tpl' | 'curl_live'
  >('none');

  const selectedEndpoint = useMemo(
    () => endpoints.find((e) => e.id === selectedId) ?? endpoints[0],
    [endpoints, selectedId]
  );

  const getSuggestedParamValue = useCallback(
    (ep: ApiEndpointDef): string => {
      if (!ep.pathParam) return '';
      switch (ep.pathParam.source) {
        case 'workout':
          return defaultWorkoutId;
        case 'vow':
          return defaultVowId;
        case 'loadout':
          return defaultLoadoutId;
        case 'quest':
          return 'workout_today';
      }
    },
    [defaultLoadoutId, defaultVowId, defaultWorkoutId]
  );

  const selectEndpoint = useCallback(
    (ep: ApiEndpointDef) => {
      setSelectedId(ep.id);
      setParamValue(getSuggestedParamValue(ep));
      const body = ep.id === 'complete_workout'
        ? { ...ep.defaultBody, idempotencyKey: crypto.randomUUID() }
        : ep.defaultBody;
      setBodyText(body ? JSON.stringify(body, null, 2) : '');
      setJsonError(null);
    },
    [getSuggestedParamValue]
  );

  useEffect(() => {
    if (selectedEndpoint.pathParam && !paramValue) {
      setParamValue(getSuggestedParamValue(selectedEndpoint));
    }
  }, [getSuggestedParamValue, paramValue, selectedEndpoint]);

  const filteredEndpoints = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return endpoints.filter((ep) => {
      if (domainFilter !== 'Todos' && ep.domain !== domainFilter) return false;
      if (!q) return true;
      return (
        ep.path.toLowerCase().includes(q) ||
        ep.title.toLowerCase().includes(q) ||
        ep.description.toLowerCase().includes(q) ||
        ep.method.toLowerCase().includes(q)
      );
    });
  }, [domainFilter, endpoints, searchTerm]);

  const resolvedPath = useMemo(() => {
    if (!selectedEndpoint.pathParam) return selectedEndpoint.path;
    const cleanParam = encodeURIComponent(paramValue.trim() || getSuggestedParamValue(selectedEndpoint));
    return selectedEndpoint.path.replace(`:${selectedEndpoint.pathParam.key}`, cleanParam);
  }, [getSuggestedParamValue, paramValue, selectedEndpoint]);

  const hasBody =
    selectedEndpoint.method === 'POST' ||
    selectedEndpoint.method === 'PUT' ||
    selectedEndpoint.method === 'PATCH';

  const markCopied = (flag: 'token' | 'json' | 'curl_tpl' | 'curl_live') => {
    setCopiedFlag(flag);
    window.setTimeout(() => setCopiedFlag('none'), 2400);
  };

  const executeApiCall = useCallback(
    async (override?: {
      endpoint: ApiEndpointDef;
      path?: string;
      body?: Record<string, unknown>;
    }) => {
      const targetEndpoint = override?.endpoint ?? selectedEndpoint;
      const targetPath =
        override?.path ??
        (targetEndpoint.pathParam
          ? targetEndpoint.path.replace(
              `:${targetEndpoint.pathParam.key}`,
              encodeURIComponent(paramValue.trim() || getSuggestedParamValue(targetEndpoint))
            )
          : targetEndpoint.path);

      const needsBody =
        targetEndpoint.method === 'POST' ||
        targetEndpoint.method === 'PUT' ||
        targetEndpoint.method === 'PATCH';

      let parsedBodyStr: string | undefined;
      if (needsBody) {
        if (override?.body !== undefined) {
          parsedBodyStr = JSON.stringify(override.body);
        } else if (bodyText.trim()) {
          try {
            const parsed = JSON.parse(bodyText);
            parsedBodyStr = JSON.stringify(parsed);
            setJsonError(null);
          } catch (err) {
            setJsonError(
              err instanceof Error ? `JSON inválido: ${err.message}` : 'JSON inválido.'
            );
            return;
          }
        } else {
          parsedBodyStr = '{}';
        }
      }

      setExecuting(true);
      const startedAt = performance.now();
      try {
        const headers: Record<string, string> = {};
        if (targetEndpoint.requiresAuth) {
          const session = await validateAndGetFirebaseToken({ user });
          headers.Authorization = `Bearer ${session.token}`;
        }
        if (needsBody) {
          headers['Content-Type'] = 'application/json';
        }

        let resp = await fetch(targetPath, {
          method: targetEndpoint.method,
          headers,
          body: needsBody ? parsedBodyStr : undefined,
        });

        if (targetEndpoint.requiresAuth && resp.status === 401) {
          const refreshed = await validateAndGetFirebaseToken({ user, forceRefresh: true });
          headers.Authorization = `Bearer ${refreshed.token}`;
          resp = await fetch(targetPath, {
            method: targetEndpoint.method,
            headers,
            body: needsBody ? parsedBodyStr : undefined,
          });
        }

        const latencyMs = Math.max(1, Math.round(performance.now() - startedAt));
        const rawText = await resp.text();
        let formattedText = rawText;
        try {
          formattedText = JSON.stringify(JSON.parse(rawText), null, 2);
        } catch {
          // Mantém resposta em texto bruto caso não seja JSON
        }

        setResult({
          status: resp.status,
          ok: resp.ok,
          latencyMs,
          url: targetPath,
          bodyText: formattedText,
          executedAt: new Date().toLocaleTimeString('pt-BR'),
        });
      } catch (err) {
        const latencyMs = Math.max(1, Math.round(performance.now() - startedAt));
        const status = err instanceof ApiServiceError ? err.status : 0;
        const code = err instanceof ApiServiceError ? err.code : 'network_error';
        setResult({
          status,
          ok: false,
          latencyMs,
          url: targetPath,
          bodyText: JSON.stringify(
            {
              ok: false,
              code,
              error: err instanceof Error ? err.message : 'Falha de rede ao chamar a API.',
            },
            null,
            2
          ),
          executedAt: new Date().toLocaleTimeString('pt-BR'),
        });
      } finally {
        setExecuting(false);
      }
    },
    [bodyText, getSuggestedParamValue, paramValue, selectedEndpoint, user]
  );

  const handleQuickRun = (
    endpointId: string,
    customBody?: Record<string, unknown>
  ) => {
    const ep = endpoints.find((e) => e.id === endpointId);
    if (!ep) return;
    setSelectedId(ep.id);
    setParamValue(getSuggestedParamValue(ep));
    const nextBody = customBody ?? ep.defaultBody;
    setBodyText(nextBody ? JSON.stringify(nextBody, null, 2) : '');
    setJsonError(null);
    void executeApiCall({
      endpoint: ep,
      path: ep.pathParam
        ? ep.path.replace(`:${ep.pathParam.key}`, encodeURIComponent(getSuggestedParamValue(ep)))
        : ep.path,
      body: nextBody,
    });
  };

  const buildCurlCommand = (tokenPlaceholder: string): string => {
    const origin =
      typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
    const parts: string[] = [`curl -X ${selectedEndpoint.method} "${origin}${resolvedPath}"`];
    if (selectedEndpoint.requiresAuth) {
      parts.push(`  -H "Authorization: Bearer ${tokenPlaceholder}"`);
    }
    if (hasBody) {
      parts.push(`  -H "Content-Type: application/json"`);
      let compactBody = '{}';
      try {
        compactBody = JSON.stringify(JSON.parse(bodyText || '{}'));
      } catch {
        compactBody = bodyText.trim() || '{}';
      }
      const escaped = compactBody.replace(/'/g, `'\\''`);
      parts.push(`  -d '${escaped}'`);
    }
    return parts.join(' \\\n');
  };

  const handleCopyToken = async () => {
    const session = await validateAndGetFirebaseToken({ user });
    await navigator.clipboard.writeText(session.token);
    markCopied('token');
  };

  const handleCopyCurlLive = async () => {
    const session = await validateAndGetFirebaseToken({ user });
    await navigator.clipboard.writeText(buildCurlCommand(session.token));
    markCopied('curl_live');
  };

  const handleCopyCurlTemplate = async () => {
    await navigator.clipboard.writeText(buildCurlCommand('$FIREBASE_TOKEN'));
    markCopied('curl_tpl');
  };

  const handleFormatJson = () => {
    if (!bodyText.trim()) return;
    try {
      const parsed = JSON.parse(bodyText);
      setBodyText(JSON.stringify(parsed, null, 2));
      setJsonError(null);
    } catch (err) {
      setJsonError(err instanceof Error ? `JSON inválido: ${err.message}` : 'JSON inválido.');
    }
  };

  const paramSuggestions = useMemo<Array<{ id: string; label: string }>>(() => {
    if (!selectedEndpoint.pathParam) return [];
    switch (selectedEndpoint.pathParam.source) {
      case 'workout':
        return workouts.slice(0, 6).map((w) => ({ id: w.id, label: w.name }));
      case 'vow':
        return dailyVows.slice(0, 6).map((v) => ({ id: v.id, label: v.title }));
      case 'loadout':
        return [
          ...(stats.gearLoadouts ?? []).map((p) => ({ id: p.id, label: p.name })),
          { id: 'preset_1', label: 'Exemplo: Caça-Chefes' },
          { id: 'preset_2', label: 'Exemplo: Farm de Ouro' },
          { id: 'preset_3', label: 'Exemplo: Rush de XP' },
        ];
      case 'quest':
        return [
          { id: 'workout_today', label: 'Treino Diário' },
          { id: 'steps_6000', label: 'Passos 6.000' },
          { id: 'weight_today', label: 'Check-in de Peso' },
        ];
    }
  }, [dailyVows, selectedEndpoint.pathParam, stats.gearLoadouts, workouts]);

  return (
    <div className="space-y-6 pb-8">
      {/* Cabeçalho e Ações Rápidas */}
      <section className="rounded-lg bg-[#18181B] border border-[#27272A] p-5 md:p-6 space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="space-y-1.5 text-left">
            <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-orange-400">
              <Terminal size={18} strokeWidth={1.75} weight="regular" className="text-orange-400" />
              API unificada REST v1 · Starter Tier
            </div>
            <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-white">
              Central de comandos API
            </h1>
            <p className="text-sm text-zinc-400 max-w-2xl">
              Comande Herói, Treinos, Arsenal, Votos diários, Saúde e Oráculo via endpoints REST
              ou pelo orquestrador{' '}
              <code className="text-orange-400 font-mono-tabular">POST /api/v1/command</code>{' '}
              autenticado com seu token Firebase.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={handleCopyToken}
              className="min-h-[42px] px-4 py-2 rounded-md bg-[#111113] border border-[#27272A] hover:border-zinc-500 text-xs font-semibold text-zinc-200 inline-flex items-center gap-2 transition-colors"
            >
              {copiedFlag === 'token' ? (
                <>
                  <Check size={18} strokeWidth={1.75} weight="regular" className="text-emerald-400" />
                  Token Bearer copiado
                </>
              ) : (
                <>
                  <Key size={18} strokeWidth={1.75} weight="regular" className="text-orange-400" />
                  Copiar token Bearer
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => handleQuickRun('openapi_spec')}
              className="min-h-[42px] px-4 py-2 rounded-md bg-[#111113] hover:bg-[#27272A] border border-[#F97316]/45 text-xs font-semibold text-orange-300 inline-flex items-center gap-2 transition-colors"
            >
              <BookOpen size={18} strokeWidth={1.75} weight="regular" className="text-orange-400" />
              Abrir OpenAPI 3.0
            </button>
          </div>
        </div>

        {/* Barra de Disparo Rápido 1-Clique */}
        <div className="pt-4 border-t border-[#27272A] flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 mr-1 inline-flex items-center gap-1.5">
            <Lightning size={18} strokeWidth={1.75} weight="regular" className="text-orange-400" />
            Comandos rápidos:
          </span>
          <button
            type="button"
            onClick={() => handleQuickRun('full_state')}
            className="min-h-[36px] px-3 py-1.5 rounded-md bg-[#111113] hover:bg-[#27272A] border border-[#27272A] text-xs font-semibold text-zinc-200 transition-colors"
          >
            Estado global
          </button>
          <button
            type="button"
            onClick={() => handleQuickRun('daily_quests')}
            className="min-h-[36px] px-3 py-1.5 rounded-md bg-[#111113] hover:bg-[#27272A] border border-[#27272A] text-xs font-semibold text-zinc-200 transition-colors"
          >
            Missões de hoje
          </button>
          <button
            type="button"
            onClick={() => handleQuickRun('armory_catalog')}
            className="min-h-[36px] px-3 py-1.5 rounded-md bg-[#111113] hover:bg-[#27272A] border border-[#27272A] text-xs font-semibold text-zinc-200 transition-colors"
          >
            Catálogo do arsenal
          </button>
          <button
            type="button"
            onClick={() => handleQuickRun('health_summary')}
            className="min-h-[36px] px-3 py-1.5 rounded-md bg-[#111113] hover:bg-[#27272A] border border-[#27272A] text-xs font-semibold text-zinc-200 transition-colors"
          >
            Resumo de saúde
          </button>
          <button
            type="button"
            onClick={() =>
              handleQuickRun('grant_stats', { xpDelta: 50, coinsDelta: 25 })
            }
            className="min-h-[36px] px-3 py-1.5 rounded-md bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/40 text-xs font-semibold font-mono-tabular tabular-nums text-emerald-300 transition-colors"
          >
            +50 XP & +25 Moedas
          </button>
        </div>
      </section>

      {/* Grid Principal: Explorador de Endpoints + Bancada Interativa */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Coluna Esquerda: Explorador de Endpoints */}
        <aside className="lg:col-span-5 rounded-lg bg-[#18181B] border border-[#27272A] p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-300">
              Endpoints (<span className="font-mono-tabular tabular-nums">{filteredEndpoints.length}</span>)
            </h2>
            <span className="text-[11px] font-mono-tabular text-zinc-500">
              /api/v1/*
            </span>
          </div>

          <div className="relative">
            <MagnifyingGlass
              size={18} strokeWidth={1.75}
              weight="regular"
              className="text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
            />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar rota, comando ou recurso..."
              className="w-full min-h-[42px] pl-9 pr-3 py-2 rounded-md bg-[#111113] border border-[#27272A] focus:border-[#F97316] focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/40 text-xs text-zinc-100 placeholder:text-zinc-500"
            />
          </div>

          {/* Filtros de Domínio */}
          <div className="flex flex-wrap gap-1.5">
            {DOMAIN_FILTERS.map((dom) => {
              const active = domainFilter === dom;
              return (
                <button
                  key={dom}
                  type="button"
                  onClick={() => setDomainFilter(dom)}
                  className={`px-2.5 py-1.5 rounded-md text-[11px] font-semibold transition-colors border ${
                    active
                      ? 'bg-[#F97316] text-zinc-950 border-[#F97316]'
                      : 'bg-[#111113] text-zinc-400 hover:text-zinc-200 border-[#27272A]'
                  }`}
                >
                  {dom}
                </button>
              );
            })}
          </div>

          {/* Lista de Rotas */}
          <div className="space-y-1.5 max-h-[600px] overflow-y-auto pr-1">
            {filteredEndpoints.map((ep) => {
              const isSelected = ep.id === selectedEndpoint.id;
              return (
                <button
                  key={ep.id}
                  type="button"
                  onClick={() => selectEndpoint(ep)}
                  className={`w-full text-left p-3 rounded-md border transition-colors ${
                    isSelected
                      ? 'bg-[#111113] border-[#F97316]'
                      : 'bg-[#111113] border-[#27272A] hover:border-zinc-600'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className={`px-1.5 py-0.5 rounded-sm border text-[10px] font-bold font-mono-tabular shrink-0 ${METHOD_BADGE_CLASS[ep.method]}`}
                      >
                        {ep.method}
                      </span>
                      <span className="text-xs font-semibold font-mono-tabular text-zinc-100 truncate">
                        {ep.path}
                      </span>
                    </div>
                    <span className="text-[10px] font-medium text-zinc-500 shrink-0">
                      {ep.domain}
                    </span>
                  </div>
                  <div className="text-xs font-medium text-zinc-300 mt-1.5">
                    {ep.title}
                  </div>
                </button>
              );
            })}

            {filteredEndpoints.length === 0 && (
              <div className="p-5 text-left rounded-md bg-[#111113] border border-[#27272A] text-xs text-zinc-400">
                Nenhuma rota encontrada para "{searchTerm}".
              </div>
            )}
          </div>
        </aside>

        {/* Coluna Direita: Bancada de Teste & cURL */}
        <section className="lg:col-span-7 space-y-5">
          {/* Card do Comando Selecionado */}
          <div className="rounded-lg bg-[#18181B] border border-[#27272A] p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
              <div className="space-y-1.5 min-w-0 text-left">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`px-2 py-0.5 rounded-sm border text-xs font-bold font-mono-tabular ${METHOD_BADGE_CLASS[selectedEndpoint.method]}`}
                  >
                    {selectedEndpoint.method}
                  </span>
                  <code className="text-sm font-semibold font-mono-tabular text-white break-all">
                    {resolvedPath}
                  </code>
                </div>
                <h2 className="text-base font-bold text-white">
                  {selectedEndpoint.title}
                </h2>
                <p className="text-xs text-zinc-400 leading-relaxed">
                  {selectedEndpoint.description}
                </p>
              </div>

              <div className="shrink-0 flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#111113] border border-[#27272A] text-[11px] font-semibold text-zinc-300">
                  <ShieldCheck
                    size={18} strokeWidth={1.75}
                    weight="regular"
                    className={
                      selectedEndpoint.requiresAuth ? 'text-emerald-400' : 'text-zinc-400'
                    }
                  />
                  {selectedEndpoint.requiresAuth ? 'Bearer token' : 'Rota pública'}
                </span>
              </div>
            </div>

            {/* Ações rápidas do Orquestrador /api/v1/command */}
            {selectedEndpoint.id === 'command_dispatch' && (
              <div className="p-3.5 rounded-md bg-[#111113] border border-[#27272A] space-y-2">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                  Modelos de action para /api/v1/command
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {COMMAND_ACTION_PRESETS.map((preset) => (
                    <button
                      key={preset.action}
                      type="button"
                      onClick={() => {
                        setBodyText(
                          JSON.stringify(
                            {
                              action: preset.action,
                              payload: preset.buildPayload({
                                workoutId: defaultWorkoutId,
                                vowId: defaultVowId,
                                todayKey,
                              }),
                            },
                            null,
                            2
                          )
                        );
                        setJsonError(null);
                      }}
                      className="px-2.5 py-1.5 rounded-md bg-[#18181B] hover:bg-[#27272A] border border-[#27272A] hover:border-[#F97316]/50 text-[11px] font-semibold text-zinc-200 transition-colors"
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Parâmetro Dinâmico de Rota */}
            {selectedEndpoint.pathParam && (
              <div className="p-3.5 rounded-md bg-[#111113] border border-[#27272A] space-y-2.5">
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-zinc-300">
                  {selectedEndpoint.pathParam.label} (:{selectedEndpoint.pathParam.key})
                </label>
                <input
                  type="text"
                  value={paramValue}
                  onChange={(e) => setParamValue(e.target.value)}
                  className="w-full min-h-[42px] px-3 py-2 rounded-md bg-[#09090B] border border-[#27272A] focus:border-[#F97316] focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/40 text-xs font-mono-tabular text-white"
                />
                {paramSuggestions.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {paramSuggestions.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => setParamValue(s.id)}
                        className={`px-2 py-1 rounded-md border text-[11px] font-semibold transition-colors ${
                          paramValue === s.id
                            ? 'bg-[#F97316]/15 border-[#F97316]/60 text-orange-300'
                            : 'bg-[#18181B] border-[#27272A] text-zinc-400 hover:text-zinc-200'
                        }`}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Editor JSON de Payload */}
            {hasBody && (
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <label className="text-[11px] font-semibold uppercase tracking-wider text-zinc-300 inline-flex items-center gap-1.5">
                    <BracketsCurly size={18} strokeWidth={1.75} weight="regular" className="text-orange-400" />
                    Payload JSON
                  </label>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleFormatJson}
                      className="px-2.5 py-1 rounded-md bg-[#111113] hover:bg-[#27272A] border border-[#27272A] text-[11px] font-semibold text-zinc-300 inline-flex items-center gap-1"
                    >
                      <Code size={18} strokeWidth={1.75} weight="regular" />
                      Formatar
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setBodyText(
                          selectedEndpoint.defaultBody
                            ? JSON.stringify(selectedEndpoint.defaultBody, null, 2)
                            : '{}'
                        );
                        setJsonError(null);
                      }}
                      className="px-2.5 py-1 rounded-md bg-[#111113] hover:bg-[#27272A] border border-[#27272A] text-[11px] font-semibold text-zinc-300 inline-flex items-center gap-1"
                    >
                      <ArrowsClockwise size={18} strokeWidth={1.75} weight="regular" />
                      Restaurar exemplo
                    </button>
                  </div>
                </div>

                <textarea
                  rows={8}
                  value={bodyText}
                  onChange={(e) => {
                    setBodyText(e.target.value);
                    if (jsonError) setJsonError(null);
                  }}
                  spellCheck={false}
                  className="w-full p-3.5 rounded-md bg-[#09090B] border border-[#27272A] focus:border-[#F97316] focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/40 text-xs font-mono-tabular text-zinc-100 leading-relaxed resize-y"
                />

                {jsonError && (
                  <p className="text-xs font-semibold text-red-400">{jsonError}</p>
                )}
              </div>
            )}

            {/* Botão Principal de Execução */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <div className="text-[11px] text-zinc-400 font-mono-tabular">
                UID ativo: <span className="text-zinc-200">{user.uid}</span>
              </div>
              <button
                type="button"
                disabled={executing}
                onClick={() => void executeApiCall()}
                className="min-h-[42px] px-5 py-2.5 rounded-md bg-[#F97316] hover:bg-orange-400 disabled:opacity-50 text-zinc-950 text-xs font-bold inline-flex items-center gap-2 transition-colors"
              >
                {executing ? (
                  <>
                    <ArrowsClockwise size={18} strokeWidth={1.75} weight="regular" className="animate-spin" />
                    Executando...
                  </>
                ) : (
                  <>
                    <Play size={18} strokeWidth={1.75} weight="fill" />
                    Executar comando
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Card de Resposta HTTP */}
          <div className="rounded-lg bg-[#18181B] border border-[#27272A] p-5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <span className="text-xs font-semibold uppercase tracking-wider text-zinc-300 inline-flex items-center gap-1.5">
                  <PaperPlaneRight size={18} strokeWidth={1.75} weight="regular" className="text-orange-400" />
                  Resposta HTTP
                </span>
                {result && (
                  <>
                    <span
                      className={`px-2 py-0.5 rounded-sm border text-[11px] font-bold font-mono-tabular tabular-nums ${
                        result.ok
                          ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/40'
                          : 'bg-red-500/15 text-red-400 border-red-500/40'
                      }`}
                    >
                      HTTP {result.status || 'ERR'}
                    </span>
                    <span className="text-[11px] font-mono-tabular tabular-nums text-zinc-400">
                      {result.latencyMs} ms · {result.executedAt}
                    </span>
                  </>
                )}
              </div>

              {result && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={async () => {
                      await navigator.clipboard.writeText(result.bodyText);
                      markCopied('json');
                    }}
                    className="px-2.5 py-1 rounded-md bg-[#111113] hover:bg-[#27272A] border border-[#27272A] text-[11px] font-semibold text-zinc-300 inline-flex items-center gap-1"
                  >
                    {copiedFlag === 'json' ? (
                      <>
                        <Check size={18} strokeWidth={1.75} weight="regular" className="text-emerald-400" />
                        JSON copiado
                      </>
                    ) : (
                      <>
                        <Copy size={18} strokeWidth={1.75} weight="regular" />
                        Copiar JSON
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => setResult(null)}
                    aria-label="Limpar resposta"
                    className="px-2 py-1 rounded-md bg-[#111113] hover:bg-[#27272A] border border-[#27272A] text-zinc-400 hover:text-zinc-200"
                  >
                    <Trash size={18} strokeWidth={1.75} weight="regular" />
                  </button>
                </div>
              )}
            </div>

            {result ? (
              <pre className="p-4 rounded-md bg-[#09090B] border border-[#27272A] text-xs font-mono-tabular text-zinc-100 overflow-x-auto max-h-[380px] overflow-y-auto leading-relaxed">
                {result.bodyText}
              </pre>
            ) : (
              <div className="p-5 rounded-md bg-[#111113] border border-[#27272A] text-xs text-zinc-400 text-left">
                Clique em <strong className="text-zinc-200">Executar comando</strong> ou escolha um
                dos atalhos acima para visualizar a resposta real do servidor e do Firestore.
              </div>
            )}
          </div>

          {/* Card de Comando cURL Pronto */}
          <div className="rounded-lg bg-[#18181B] border border-[#27272A] p-5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-zinc-300 inline-flex items-center gap-1.5">
                <Terminal size={18} strokeWidth={1.75} weight="regular" className="text-orange-400" />
                Comando cURL
              </span>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => void handleCopyCurlTemplate()}
                  className="min-h-[36px] px-3 py-1 rounded-md bg-[#111113] hover:bg-[#27272A] border border-[#27272A] text-[11px] font-semibold text-zinc-200 inline-flex items-center gap-1.5"
                >
                  {copiedFlag === 'curl_tpl' ? (
                    <>
                      <Check size={18} strokeWidth={1.75} weight="regular" className="text-emerald-400" />
                      Copiado
                    </>
                  ) : (
                    <>
                      <Copy size={18} strokeWidth={1.75} weight="regular" />
                      Copiar cURL ($FIREBASE_TOKEN)
                    </>
                  )}
                </button>
                {selectedEndpoint.requiresAuth && (
                  <button
                    type="button"
                    onClick={() => void handleCopyCurlLive()}
                    className="min-h-[36px] px-3 py-1 rounded-md bg-[#111113] hover:bg-[#27272A] border border-[#F97316]/45 text-[11px] font-semibold text-orange-300 inline-flex items-center gap-1.5"
                  >
                    {copiedFlag === 'curl_live' ? (
                      <>
                        <Check size={18} strokeWidth={1.75} weight="regular" className="text-emerald-400" />
                        cURL com token copiado
                      </>
                    ) : (
                      <>
                        <Key size={18} strokeWidth={1.75} weight="regular" className="text-orange-400" />
                        Copiar cURL (token atual)
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>

            <pre className="p-3.5 rounded-md bg-[#09090B] border border-[#27272A] text-xs font-mono-tabular text-zinc-200 overflow-x-auto leading-relaxed">
              {buildCurlCommand('$FIREBASE_TOKEN')}
            </pre>
          </div>
        </section>
      </div>
    </div>
  );
}
