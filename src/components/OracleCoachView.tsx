import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowsClockwise, Compass, PaperPlaneRight, Sparkle } from '@phosphor-icons/react';
import { fetchAuthenticatedApi } from '../services/api';
import {
  ChatMessage,
  DailyHealthMetric,
  GameStats,
  HealthActivity,
  HeroProfile,
  WorkoutLog,
} from '../types/fitness';
import {
  buildZoneTotals,
  computeBmiSummary,
  computeRecoveryAssessment,
  getDualProgressionStatus,
  getEffectiveCurrentStreak,
  getFriendlyErrorMessage,
  getLevelProgress,
} from '../utils/rpgLogic';
import { ErrorBanner } from './HudPrimitives';

interface OracleCoachViewProps {
  hero: HeroProfile;
  stats: GameStats;
  logs: WorkoutLog[];
  healthActivities: HealthActivity[];
  dailyMetrics: DailyHealthMetric[];
  messages: ChatMessage[];
  onSaveChatMessage: (role: 'user' | 'oracle', content: string) => Promise<void>;
}

const MAX_PROMPT_LENGTH = 300;
const COOLDOWN_SECONDS = 5;

const QUICK_ORACLE_PROMPTS: readonly string[] = [
  'Minha recuperação permite treino intenso hoje?',
  'Como distribuir meu tempo entre Zonas 2 e 4?',
  'Qual treino combina com meu objetivo agora?',
  'Como interpretar minha carga aguda/crônica?',
];

export const OracleCoachView: React.FC<OracleCoachViewProps> = ({
  hero,
  stats,
  logs,
  healthActivities,
  dailyMetrics,
  messages,
  onSaveChatMessage,
}) => {
  const [input, setInput] = useState<string>('');
  const [sending, setSending] = useState<boolean>(false);
  const [cooldownRemaining, setCooldownRemaining] = useState<number>(0);
  const [requestTimestamps, setRequestTimestamps] = useState<number[]>([]);
  const [oracleError, setOracleError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const sortedMessages = useMemo(() => {
    return [...messages].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }, [messages]);

  const recovery = useMemo(
    () =>
      computeRecoveryAssessment(
        logs,
        healthActivities,
        dailyMetrics,
        stats,
        hero.restingHrBaseline ?? 60
      ),
    [logs, healthActivities, dailyMetrics, stats, hero.restingHrBaseline]
  );

  const zoneTotals = useMemo(
    () => buildZoneTotals(healthActivities, logs, hero.maxHrEstimated ?? 190),
    [healthActivities, logs, hero.maxHrEstimated]
  );

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [sortedMessages.length, sending]);

  useEffect(() => {
    if (cooldownRemaining <= 0) return;
    const timer = window.setInterval(() => {
      setCooldownRemaining((prev) => (prev > 1 ? prev - 1 : 0));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [cooldownRemaining]);

  const buildContextPayload = (): string => {
    const levelInfo = getLevelProgress(stats.totalXp);
    const dual = getDualProgressionStatus(stats);
    const effectiveStreak = getEffectiveCurrentStreak(
      stats.currentStreak,
      stats.lastWorkoutDate
    );
    const bmiSummary = computeBmiSummary(hero.heightCm, hero.weightKg);
    const zSummary = zoneTotals
      .map((z) => `${z.label}: ${z.minutes} min (${z.percentage}%)`)
      .join(' | ');

    return [
      'DADOS REAIS DO USUÁRIO:',
      `- Classe: ${hero.heroClass} | Objetivo: ${hero.objective} | Experiência: ${hero.experience}`,
      `- Biometria: Altura ${hero.heightCm ? `${hero.heightCm} cm` : 'não informada'} | Peso ${hero.weightKg ? `${hero.weightKg} kg` : 'não informado'}${bmiSummary ? ` | IMC ${bmiSummary.bmi} (${bmiSummary.label})` : ''}`,
      `- Mundo Real: Nível ${levelInfo.level} (${dual.hunter.current.label} · ${levelInfo.levelTitle}) | XP: ${stats.totalXp}`,
      `- Mundo de Murim: ${dual.murim.current.name} (${dual.murim.qiPoints} Qi · Técnica: ${dual.murim.current.qiTechnique})`,
      `- Streak: ${effectiveStreak}d | Treinos RPG: ${stats.totalWorkouts} | Chefes: ${stats.bossesDefeated ?? 0} | Atividades Saúde: ${healthActivities.length}`,
      `- Prontidão/Recuperação: ${recovery.score}/100 (${recovery.statusLabel}) | ACWR: ${recovery.acwrRatio}`,
      `- Sono médio 7d: ${recovery.avgSleepHours ?? 'não informado'}h | FC repouso recente: ${recovery.latestRestingHr ?? 'não informada'} bpm`,
      `- Distribuição Zonas Cardíacas: ${zSummary}`,
    ].join('\n');
  };

  const handleSendMessage = async (rawText?: string): Promise<void> => {
    const textToSend = (rawText ?? input).trim();
    if (!textToSend || sending || cooldownRemaining > 0) return;

    if (textToSend.length > MAX_PROMPT_LENGTH) {
      setOracleError(`A mensagem deve ter no máximo ${MAX_PROMPT_LENGTH} caracteres.`);
      return;
    }

    const now = Date.now();
    const recentRequests = requestTimestamps.filter((ts) => now - ts < 60_000);
    if (recentRequests.length >= 8) {
      setOracleError(
        'Limite de consultas ao Oráculo atingido (8 por minuto). Aguarde alguns instantes.'
      );
      return;
    }

    setOracleError(null);
    setSending(true);
    if (!rawText) setInput('');
    setRequestTimestamps([...recentRequests, now]);
    setCooldownRemaining(COOLDOWN_SECONDS);

    try {
      await onSaveChatMessage('user', textToSend);
      const response = await fetchAuthenticatedApi('/api/oracle/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: textToSend, contextText: buildContextPayload() }),
      });
      const data = (await response.json()) as { reply?: string; error?: string };
      if (!response.ok || !data.reply) {
        throw new Error(data.error || 'Falha ao consultar o Oráculo.');
      }
      await onSaveChatMessage('oracle', data.reply);
    } catch (err: unknown) {
      setOracleError(getFriendlyErrorMessage(err));
    } finally {
      setSending(false);
    }
  };

  const effectiveStreak = getEffectiveCurrentStreak(
    stats.currentStreak,
    stats.lastWorkoutDate
  );

  return (
    <div className="flex flex-col h-[calc(100vh-9.5rem)] md:h-[calc(100vh-6rem)] max-h-[780px] space-y-3">
      <header className="bg-[#18181B] border border-[#27272A] rounded-lg p-4 space-y-2 shrink-0 text-left">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-md bg-[#111113] border border-[#27272A] flex items-center justify-center shrink-0">
            <Compass size={18} strokeWidth={1.75} weight="regular" className="text-orange-400" />
          </div>
          <div>
            <h1 className="text-base font-bold tracking-tight text-white">
              Oráculo · Análise de treino
            </h1>
            <p className="text-xs text-zinc-400">
              Conectado ao seu nível, prontidão e zonas cardíacas registradas.
            </p>
          </div>
        </div>

        <div className="text-[11px] text-zinc-400 font-mono-tabular tabular-nums flex flex-wrap gap-x-2 gap-y-1">
          <span className="text-zinc-200">Nível {stats.level}</span>
          <span aria-hidden="true">·</span>
          <span>{stats.totalXp.toLocaleString('pt-BR')} XP</span>
          <span aria-hidden="true">·</span>
          <span>Streak {effectiveStreak}d</span>
          <span aria-hidden="true">·</span>
          <span className="text-orange-400">
            Prontidão {recovery.score}% ({recovery.statusLabel})
          </span>
          <span aria-hidden="true">·</span>
          <span>ACWR {recovery.acwrRatio}</span>
        </div>
      </header>

      <ErrorBanner message={oracleError} onDismiss={() => setOracleError(null)} />

      <div className="flex-1 overflow-y-auto bg-[#18181B] border border-[#27272A] rounded-lg p-4 space-y-3.5">
        {sortedMessages.length === 0 && (
          <div className="h-full flex flex-col items-start justify-center text-left px-2 py-6 space-y-4 max-w-lg">
            <div className="w-10 h-10 rounded-md bg-[#111113] border border-[#27272A] flex items-center justify-center">
              <Sparkle size={18} strokeWidth={1.75} weight="regular" className="text-orange-400" />
            </div>
            <div className="space-y-1">
              <h2 className="font-bold text-white text-sm">
                Consulta fisiológica para {hero.name}
              </h2>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Leitura direta de treinos, atividades do Strava/Apple Health, sono e zonas cardíacas para orientar intensidade e descanso.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {QUICK_ORACLE_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => void handleSendMessage(prompt)}
                  disabled={sending || cooldownRemaining > 0}
                  className="text-xs font-medium px-3 py-2 rounded-md bg-[#111113] hover:bg-zinc-800 border border-[#27272A] hover:border-orange-500/45 text-zinc-200 transition-colors cursor-pointer text-left"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        )}

        {sortedMessages.map((msg) => {
          const isUser = msg.role === 'user';
          return (
            <div
              key={msg.id}
              className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[85%] rounded-lg px-4 py-3 text-xs sm:text-sm leading-relaxed whitespace-pre-line text-left ${
                  isUser
                    ? 'bg-[#F97316] text-zinc-950 font-semibold rounded-br-sm'
                    : 'bg-[#111113] border border-[#27272A] text-zinc-200 rounded-bl-sm'
                }`}
              >
                {!isUser && (
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-orange-400 mb-1">
                    Oráculo
                  </div>
                )}
                {msg.content}
              </div>
            </div>
          );
        })}

        {sending && (
          <div className="flex justify-start">
            <div className="bg-[#111113] border border-[#27272A] rounded-lg px-4 py-3 text-xs text-zinc-300 flex items-center gap-2">
              <ArrowsClockwise size={18} strokeWidth={1.75} weight="regular" className="animate-spin text-orange-400" />
              Analisando suas métricas de saúde...
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {sortedMessages.length > 0 && (
        <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 shrink-0">
          {QUICK_ORACLE_PROMPTS.map((prompt) => (
            <button
              key={prompt}
              type="button"
              onClick={() => void handleSendMessage(prompt)}
              disabled={sending || cooldownRemaining > 0}
              className="text-xs font-medium whitespace-nowrap shrink-0 px-3 py-1.5 rounded-md bg-[#18181B] hover:bg-zinc-800 border border-[#27272A] text-zinc-300 disabled:opacity-50 transition-colors cursor-pointer"
            >
              {prompt}
            </button>
          ))}
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void handleSendMessage();
        }}
        className="bg-[#18181B] border border-[#27272A] rounded-lg p-2.5 space-y-1.5 shrink-0"
      >
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={input}
            maxLength={MAX_PROMPT_LENGTH}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Pergunte sobre carga, zonas ou recuperação..."
            disabled={sending}
            className="flex-1 bg-[#111113] border border-[#27272A] rounded-md px-3.5 py-2.5 text-xs sm:text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-orange-500"
          />
          <button
            type="submit"
            disabled={!input.trim() || sending || cooldownRemaining > 0}
            aria-label="Enviar mensagem ao Oráculo"
            className="min-h-[42px] px-4 py-2 rounded-md bg-[#F97316] hover:bg-orange-400 disabled:bg-[#111113] disabled:border disabled:border-[#27272A] disabled:text-zinc-500 text-zinc-950 font-semibold text-xs flex items-center gap-1.5 transition-colors shrink-0 font-mono-tabular tabular-nums cursor-pointer"
          >
            <PaperPlaneRight size={18} strokeWidth={1.75} weight="regular" />
            {cooldownRemaining > 0 ? `${cooldownRemaining}s` : 'Enviar'}
          </button>
        </div>
        <div className="flex items-center justify-between px-1 text-[11px] text-zinc-500">
          <span>Orientação educativa · Em caso de dor, procure um médico</span>
          <span
            className={`font-mono-tabular tabular-nums ${
              input.length >= MAX_PROMPT_LENGTH - 20 ? 'text-orange-400' : ''
            }`}
          >
            {input.length}/{MAX_PROMPT_LENGTH}
          </span>
        </div>
      </form>
    </div>
  );
};
