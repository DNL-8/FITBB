import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowsClockwise, Coins, Lightning, Receipt } from '@phosphor-icons/react';
import { api } from '../services/api';
import type { ProgressEntryKind, ProgressLedgerPage } from '../types/progressLedger';
import { getFriendlyErrorMessage } from '../utils/errors';

const KIND_LABELS: Record<ProgressEntryKind, string> = {
  workout: 'Treino concluído',
  health_activity: 'Atividade importada',
  armory_purchase: 'Compra no Arsenal',
  daily_quest: 'Missão diária',
  vow_completed: 'Voto cumprido',
  vow_broken: 'Voto quebrado',
  adjustment: 'Ajuste de progresso',
};

const FILTERS = [
  { id: 'all', label: 'Tudo' },
  { id: 'xp', label: 'XP' },
  { id: 'coins', label: 'Moedas' },
] as const;
type Filter = typeof FILTERS[number]['id'];

const numberFormatter = new Intl.NumberFormat('pt-BR');
const deltaFormatter = new Intl.NumberFormat('pt-BR', { signDisplay: 'exceptZero' });
const dateFormatter = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? dateFormatter.format(date) : 'Data indisponível';
}

function Amount({ delta, balance, currency }: { delta: number; balance: number; currency: 'XP' | 'moedas' }) {
  const Icon = currency === 'XP' ? Lightning : Coins;
  const color = delta < 0 ? 'text-rose-300' : delta > 0 ? 'text-emerald-300' : 'text-zinc-300';
  return (
    <div className="min-w-0 rounded-md bg-zinc-900/70 p-2.5 sm:bg-transparent sm:p-0">
      <dt className="flex items-center gap-1.5 text-xs text-zinc-400">
        <Icon size={15} aria-hidden="true" /> {currency === 'XP' ? 'XP' : 'Moedas'}
      </dt>
      <dd className={`mt-1 text-sm font-semibold tabular-nums ${color}`}>{deltaFormatter.format(delta)}</dd>
      <dd className="mt-0.5 text-[11px] tabular-nums text-zinc-400">Após a operação · {numberFormatter.format(balance)}</dd>
    </div>
  );
}

export function ProgressLedgerPanel({ statsRevision }: { statsRevision: string }) {
  const [page, setPage] = useState<ProgressLedgerPage | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const request = useRef<AbortController | null>(null);

  const load = useCallback(async (cursor?: string) => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    setError(null);
    try {
      const result = await api.hero.getProgressLedger(cursor, controller.signal);
      if (controller.signal.aborted) return;
      setPage((previous) => cursor && previous
        ? { ...result, entries: [...previous.entries, ...result.entries] }
        : result);
    } catch (cause) {
      if (!controller.signal.aborted) setError(getFriendlyErrorMessage(cause));
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    return () => request.current?.abort();
  }, [load, statsRevision]);

  const entries = page?.entries.filter((entry) => (
    filter === 'all' || (filter === 'xp' ? entry.xpDelta !== 0 : entry.coinDelta !== 0)
  )) ?? [];

  return (
    <section className="space-y-4 rounded-xl border border-zinc-800 bg-[#18181B] p-3.5 sm:p-5" aria-labelledby="progress-ledger-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h2 id="progress-ledger-title" className="flex items-center gap-2 text-base font-semibold text-white">
            <Receipt size={18} className="shrink-0 text-orange-400" aria-hidden="true" /> Extrato de XP e moedas
          </h2>
          <p className="text-xs text-zinc-400">Veja o motivo e o saldo após cada lançamento.</p>
        </div>
        <button type="button" disabled={loading} onClick={() => void load()}
          className="ui-press inline-flex min-h-10 items-center gap-1.5 rounded-md border border-zinc-700 px-3 text-xs font-medium text-zinc-200 hover:bg-zinc-800 disabled:opacity-50">
          <ArrowsClockwise size={16} aria-hidden="true" /> Atualizar
        </button>
      </div>

      {loading && <p role="status" className="text-xs text-zinc-400">Carregando lançamentos…</p>}
      {error && <p role="alert" className="rounded-md bg-rose-500/10 p-3 text-sm text-rose-200">{error}</p>}
      {page?.available === false && (
        <p role="status" className="rounded-lg border border-orange-400/30 bg-orange-500/10 p-3 text-sm text-orange-200">
          O extrato ficará disponível quando as novas regras do Firestore forem publicadas. Ele começará a registrar as próximas movimentações.
        </p>
      )}
      {page?.available && page.entries.length === 0 && (
        <p role="status" className="rounded-lg bg-[#111113] p-4 text-sm text-zinc-300">
          Nenhum lançamento registrado. A próxima compra, recompensa ou penalidade aparecerá aqui.
        </p>
      )}
      {page?.available && page.entries.length > 0 && (
        <>
          <div role="group" aria-label="Filtrar lançamentos" className="flex flex-wrap gap-1.5">
            {FILTERS.map(({ id, label }) => (
              <button key={id} type="button" aria-pressed={filter === id} onClick={() => setFilter(id)}
                className="ui-press min-h-10 rounded-md border border-zinc-700 px-3 text-xs font-medium text-zinc-300 aria-pressed:border-orange-500/50 aria-pressed:bg-orange-500/10 aria-pressed:text-orange-300">
                {label}
              </button>
            ))}
          </div>
          {entries.length > 0 ? (
            <ol className="divide-y divide-zinc-800 overflow-hidden rounded-lg border border-zinc-800 bg-[#111113]">
              {entries.map((entry) => (
                <li key={entry.id} className="grid gap-3 p-3 sm:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] sm:items-center sm:p-4">
                  <div className="min-w-0">
                    <p className="text-xs text-zinc-400">{KIND_LABELS[entry.kind]}</p>
                    <p className="mt-0.5 break-words text-sm font-semibold text-zinc-100">{entry.title}</p>
                    <time dateTime={entry.createdAt} className="text-xs text-zinc-400">{formatDate(entry.createdAt)}</time>
                  </div>
                  <dl className="grid grid-cols-2 gap-2">
                    <Amount delta={entry.xpDelta} balance={entry.totalXp} currency="XP" />
                    <Amount delta={entry.coinDelta} balance={entry.goldCoins} currency="moedas" />
                  </dl>
                </li>
              ))}
            </ol>
          ) : <p className="text-sm text-zinc-300">Nenhum dos lançamentos carregados corresponde ao filtro.</p>}
          {page.nextCursor && (
            <button type="button" disabled={loading} onClick={() => void load(page.nextCursor ?? undefined)}
              className="ui-press min-h-11 rounded-md border border-zinc-700 px-4 text-sm font-medium text-zinc-100 hover:bg-zinc-800 disabled:opacity-50">
              Carregar lançamentos anteriores
            </button>
          )}
        </>
      )}
    </section>
  );
}
