import { ArrowRight, Heartbeat } from '@phosphor-icons/react';
import type { HealthConnectReadStatus } from '../services/api';
import type { HealthActivity } from '../types/fitness';
import type { HealthConnectDay } from '../utils/healthConnect';
import { formatBrazilianDate } from '../utils/rpgLogic';

interface ReportHealthConnectCardProps {
  status: HealthConnectReadStatus | 'loading';
  days: HealthConnectDay[];
  latestHeartRate: { time: string; beatsPerMinute: number } | null;
  latestRecordUpdate: number | null;
  latestActivity?: HealthActivity;
  onViewSync?: () => void;
}

const dateTime = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

export function ReportHealthConnectCard({
  status,
  days,
  latestHeartRate,
  latestRecordUpdate,
  latestActivity,
  onViewSync,
}: ReportHealthConnectCardProps) {
  const steps = days.find((day) => day.steps !== undefined);
  const calories = days.find((day) => day.totalCalories !== undefined);
  const hasData = Boolean(steps || calories || latestHeartRate || latestActivity || latestRecordUpdate);
  const label = {
    loading: 'Consultando',
    available: hasData ? 'Dados recebidos' : 'Sem dados',
    partial: 'Leitura parcial',
    unavailable: 'Indisponível',
  }[status];
  const badgeColor = status === 'available' && hasData
    ? 'bg-emerald-500/10 text-emerald-300'
    : status === 'partial' || status === 'unavailable'
      ? 'bg-amber-400/10 text-amber-200'
      : 'bg-zinc-800 text-zinc-300';

  const readings = [
    {
      label: 'Passos',
      value: steps?.steps?.toLocaleString('pt-BR'),
      time: steps && formatBrazilianDate(steps.dateKey),
    },
    {
      label: 'Frequência cardíaca',
      value: latestHeartRate && `${latestHeartRate.beatsPerMinute} bpm`,
      time: latestHeartRate && dateTime.format(new Date(latestHeartRate.time)),
    },
    {
      label: 'Calorias totais',
      value: calories && `${Math.round(calories.totalCalories ?? 0).toLocaleString('pt-BR')} kcal`,
      time: calories && formatBrazilianDate(calories.dateKey),
    },
  ];

  return (
    <section className="min-w-0 space-y-4 rounded-xl border border-zinc-800 bg-[#151518] p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
          <Heartbeat size={20} className="text-emerald-400" aria-hidden="true" />
          Health Connect
        </h2>
        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${badgeColor}`} aria-live="polite">
          {label}
        </span>
      </div>

      {latestRecordUpdate !== null && (
        <p className="text-xs text-zinc-400">
          Último envio registrado em{' '}
          <time dateTime={new Date(latestRecordUpdate).toISOString()} className="text-zinc-200">
            {dateTime.format(latestRecordUpdate)}
          </time>
        </p>
      )}

      {(steps || calories || latestHeartRate) && (
        <dl className="divide-y divide-zinc-800 rounded-lg border border-zinc-800 bg-[#101012] px-3.5">
          {readings.map(({ label: metric, value, time }) => (
            <div key={metric} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 py-2.5">
              <dt className="text-xs text-zinc-400">{metric}</dt>
              <dd className="text-right">
                <span className="text-sm font-semibold tabular-nums text-zinc-100">{value ?? '—'}</span>
                {time && <span className="ml-2 inline-block text-xs text-zinc-400">{time}</span>}
              </dd>
            </div>
          ))}
        </dl>
      )}

      {latestActivity && (
        <div className="min-w-0">
          <p className="text-xs text-zinc-400">Último treino do Android</p>
          <p className="mt-0.5 break-words text-sm font-medium text-zinc-100">{latestActivity.title}</p>
          <p className="text-xs text-zinc-400">
            {formatBrazilianDate(latestActivity.dateKey)} · {latestActivity.durationMinutes} min
          </p>
        </div>
      )}

      {status !== 'loading' && (status !== 'available' || !hasData || !onViewSync) && (
        <p className="text-xs leading-relaxed text-zinc-400">
          No Android, confira as permissões do Fitness RPG na Conexão Saúde e toque em{' '}
          <strong className="text-zinc-200">Sincronizar agora</strong>.
        </p>
      )}

      {onViewSync && (
        <button
          type="button"
          onClick={onViewSync}
          className="inline-flex min-h-9 items-center gap-2 rounded text-sm font-medium text-emerald-300 hover:text-emerald-200 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-400"
        >
          Ver sincronização
          <ArrowRight size={16} aria-hidden="true" />
        </button>
      )}
    </section>
  );
}
