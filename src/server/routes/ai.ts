import { Hono } from 'hono';
import { Type, type GoogleGenAI } from '@google/genai';
import { ApiHttpError } from '../firebaseRest.ts';
import { generateGeminiText } from '../gemini.ts';
import { input, readJsonInput } from '../input.ts';
import {
  type AiRateLimiter,
  type AppEnv,
  MAX_AI_CONTEXT_CHARS,
  requireFirebaseAuth,
  sendInternalError,
} from '../shared.ts';

interface AiRouterDeps {
  getGeminiClient: () => GoogleGenAI | null;
  aiRateLimiter: AiRateLimiter;
}

export function createAiRouter(deps: AiRouterDeps): Hono<AppEnv> {
  const router = new Hono<AppEnv>();

  router.post(
    '/api/oracle/ask',
    requireFirebaseAuth,
    async (c) => {
      try {
        const { question, contextText = '' } = await readJsonInput(c, input.oracleContext);
        const limited = await deps.aiRateLimiter.consume(c);
        if (limited) return limited;

        const ai = deps.getGeminiClient();
        if (!ai) {
          return c.json(
            {
              error:
                'A chave GEMINI_API_KEY não está configurada no servidor. Configure-a no painel Secrets do AI Studio.',
            },
            503
          );
        }

        const systemInstruction = [
          'Você é o "Oráculo", mentor sábio de treinamento físico e saúde no aplicativo Fitness RPG.',
          'REGRAS INVIOLÁVEIS:',
          '1. Responda sempre em português brasileiro (pt-BR).',
          '2. Seja curto, claro, motivador e prático (máximo de 3 parágrafos curtos).',
          '3. Use EXCLUSIVAMENTE os dados reais fornecidos no contexto (XP, nível, streak, recuperação, zonas cardíacas e carga). NUNCA invente métricas.',
          '4. NUNCA forneça diagnóstico médico. Em relatos de dor aguda, tontura ou lesão, recomende procurar um médico ou profissional de educação física.',
          '5. Sempre finalize com uma recomendação prática acionável considerando o nível de recuperação atual do usuário.',
        ].join('\n');

        const reply = await generateGeminiText(ai, JSON.stringify({ context: contextText, question }), {
          systemInstruction,
        });

        return c.json({ reply });
      } catch (err) {
        if (err instanceof ApiHttpError) throw err;
        return sendInternalError(
          c,
          err,
          'POST /api/oracle/ask',
          'Falha ao consultar o Oráculo Gemini.'
        );
      }
    }
  );

  router.post(
    '/api/reports/insights',
    requireFirebaseAuth,
    async (c) => {
      try {
        const { summary } = await readJsonInput(c, input.insights);
        const limited = await deps.aiRateLimiter.consume(c);
        if (limited) return limited;

        const ai = deps.getGeminiClient();
        if (!ai) {
          return c.json(
            {
              error: 'Configure GEMINI_API_KEY no painel Secrets para gerar insights inteligentes.',
            },
            503
          );
        }

        const insights = await generateGeminiText(ai, summary, {
          systemInstruction:
            'Você é um fisiologista do exercício e analista de performance. Baseie-se apenas nos números fornecidos, sem inventar dados e sem diagnóstico médico. Responda em 3 tópicos concisos em pt-BR.',
        });
        return c.json({ insights });
      } catch (err) {
        if (err instanceof ApiHttpError) throw err;
        return sendInternalError(c, err, 'POST /api/reports/insights', 'Falha ao gerar análise.');
      }
    }
  );

  router.post(
    '/api/oracle/load-adjustments',
    requireFirebaseAuth,
    async (c) => {
      try {
        const payload = await readJsonInput(c, input.loadAdjustments);
        const promptPayload = JSON.stringify(payload);
        if (promptPayload.length > MAX_AI_CONTEXT_CHARS) {
          throw new ApiHttpError(400, 'Contexto de treinamento excede o limite.', 'ai_context_too_long');
        }
        const limited = await deps.aiRateLimiter.consume(c);
        if (limited) return limited;

        const ai = deps.getGeminiClient();
        if (!ai) {
          return c.json(
            {
              error:
                'A chave GEMINI_API_KEY não está configurada no servidor. Configure-a no painel Secrets do AI Studio.',
            },
            503
          );
        }

        interface CandidateExerciseMeta {
          workoutId: string;
          workoutName: string;
          exerciseId: string;
          exerciseName: string;
          currentLoadKg: number;
        }

        const allowedExerciseMap = new Map<string, CandidateExerciseMeta>();
        for (const { workoutId, workoutName, exercises } of payload.candidateWorkouts) {
          for (const exercise of exercises) {
            allowedExerciseMap.set(`${workoutId}::${exercise.exerciseId}`, {
              workoutId,
              workoutName,
              exerciseId: exercise.exerciseId,
              exerciseName: exercise.name,
              currentLoadKg: exercise.currentLoadKg,
            });
          }
        }

        const systemInstruction = [
          'Você é o "Oráculo", Coach de Força e Calistenia Híbrida do aplicativo Fitness RPG.',
          'Sua tarefa é analisar o histórico recente de workoutLogs e o sinal de estagnação detectado para sugerir ajustes práticos de carga (em kg).',
          'REGRAS INVIOLÁVEIS:',
          '1. Responda sempre em português brasileiro (pt-BR).',
          '2. Use EXCLUSIVAMENTE workoutId e exerciseId exatamente como fornecidos em candidateWorkouts. Nunca invente IDs.',
          '3. Retorne entre 2 e 4 recomendações focadas nos exercícios de maior impacto (ou exercícios principais com carga).',
          '4. Se o sinal for "repeated_incomplete" ou "frequency_drop", priorize deload leve ou ajuste conservador (-2.5 kg ou -5 kg onde currentLoadKg >= 5, ou manter 0 kg se peso corporal) para restaurar 100% de conclusão técnica.',
          '5. Se o sinal for "stalled_xp" com alta conclusão recente (>= 85%), recomende sobrecarga progressiva realista (+2.5 kg ou +5 kg, ou +2.5 kg via mochila em exercícios como Paralelas quando currentLoadKg === 0).',
          '6. Sugira valores múltiplos de 0.5 kg (preferencialmente 2.5 kg ou 5 kg) e nunca valores negativos.',
          '7. Seja direto e prático em analysisSummary (máx. 2 frases) e rationale (máx. 1 frase por exercício).',
        ].join('\n');

        const rawText = await generateGeminiText(ai, promptPayload, {
          systemInstruction,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              analysisSummary: { type: Type.STRING },
              strategyLabel: { type: Type.STRING },
              recommendations: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    workoutId: { type: Type.STRING },
                    exerciseId: { type: Type.STRING },
                    suggestedLoadKg: { type: Type.NUMBER },
                    rationale: { type: Type.STRING },
                  },
                  required: ['workoutId', 'exerciseId', 'suggestedLoadKg', 'rationale'],
                },
              },
            },
            required: ['analysisSummary', 'strategyLabel', 'recommendations'],
          },
        }, 2000);

        const parsed = JSON.parse(rawText) as {
          analysisSummary?: unknown;
          strategyLabel?: unknown;
          recommendations?: Array<{
            workoutId?: unknown;
            exerciseId?: unknown;
            suggestedLoadKg?: unknown;
            rationale?: unknown;
          }>;
        };

        if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.recommendations)) {
          throw new ApiHttpError(502, 'Resposta de ajustes inválida.', 'invalid_gemini_reply');
        }
        const seenKeys = new Set<string>();
        const validRecommendations = parsed.recommendations
          .map((rec) => {
            if (!rec || typeof rec.workoutId !== 'string' || typeof rec.exerciseId !== 'string') return null;
            const wId = rec.workoutId.trim();
            const eId = rec.exerciseId.trim();
            const key = `${wId}::${eId}`;
            const meta = allowedExerciseMap.get(key);
            if (!meta || seenKeys.has(key)) return null;
            const rawSuggested = rec.suggestedLoadKg;
            if (typeof rawSuggested !== 'number' || !Number.isFinite(rawSuggested)) return null;
            seenKeys.add(key);
            const clamped = Math.min(400, Math.max(0, Math.round(rawSuggested * 2) / 2));
            const deltaKg = Number((clamped - meta.currentLoadKg).toFixed(1));
            const rationale =
              typeof rec.rationale === 'string' && rec.rationale.trim()
                ? rec.rationale.trim().slice(0, 300)
                : 'Ajuste calibrado conforme seu histórico recente.';

            return {
              workoutId: meta.workoutId,
              workoutName: meta.workoutName,
              exerciseId: meta.exerciseId,
              exerciseName: meta.exerciseName,
              currentLoadKg: meta.currentLoadKg,
              suggestedLoadKg: clamped,
              deltaKg,
              rationale,
            };
          })
          .filter((item): item is NonNullable<typeof item> => item !== null)
          .slice(0, 4);

        if (validRecommendations.length === 0) {
          return c.json(
            {
              error:
                'O Oráculo não conseguiu mapear exercícios válidos para ajuste. Tente novamente.',
            },
            502
          );
        }

        return c.json({
          analysisSummary:
            typeof parsed.analysisSummary === 'string' && parsed.analysisSummary.trim()
              ? parsed.analysisSummary.trim().slice(0, 600)
              : 'Ajuste estratégico recomendado com base nos seus treinos recentes.',
          strategyLabel:
            typeof parsed.strategyLabel === 'string' && parsed.strategyLabel.trim()
              ? parsed.strategyLabel.trim().slice(0, 80)
              : 'Calibragem de Carga',
          recommendations: validRecommendations,
        });
      } catch (err) {
        if (err instanceof ApiHttpError) throw err;
        return sendInternalError(
          c,
          err,
          'POST /api/oracle/load-adjustments',
          'Falha ao gerar sugestões de carga com o Oráculo.'
        );
      }
    }
  );

  return router;
}
