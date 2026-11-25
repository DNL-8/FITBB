import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowDownRight,
  ArrowUpRight,
  CalendarBlank,
  CheckCircle,
  Minus,
  Plus,
  Scales,
  Trash,
  TrendDown,
  X,
} from '@phosphor-icons/react';
import { AnimatePresence, motion } from 'motion/react';
import { HeroProfile, WeightLog } from '../types/fitness';
import {
  computeBmiSummary,
  formatBrazilianDate,
  getFriendlyErrorMessage,
  getLocalDateKey,
} from '../utils/rpgLogic';
import { ErrorBanner } from './HudPrimitives';

interface WeightTrackerCardProps {
  hero: HeroProfile;
  weightLogs: WeightLog[];
  onSaveWeight: (weightKg: number, dateKey: string, note?: string | null) => Promise<void>;
  onDeleteWeight: (logId: string) => Promise<void>;
  onNavigateProfile?: () => void;
}

export const WeightTrackerCard: React.FC<WeightTrackerCardProps> = ({
  hero,
  weightLogs,
  onSaveWeight,
  onDeleteWeight,
  onNavigateProfile,
}) => {
  const todayKey = getLocalDateKey();

  const sortedLogs = useMemo(
    () => [...weightLogs].sort((a, b) => a.dateKey.localeCompare(b.dateKey)),
    [weightLogs]
  );

  const logsNewestFirst = useMemo(() => [...sortedLogs].reverse(), [sortedLogs]);
  const latestLog = sortedLogs.length > 0 ? sortedLogs[sortedLogs.length - 1] : null;
  const previousLog = sortedLogs.length > 1 ? sortedLogs[sortedLogs.length - 2] : null;
  const firstLog = sortedLogs.length > 0 ? sortedLogs[0] : null;

  const currentWeight = latestLog?.weightKg ?? hero.weightKg ?? null;

  const [selectedDate, setSelectedDate] = useState<string>(todayKey);
  const [weightInput, setWeightInput] = useState<string>(
    currentWeight !== null ? String(currentWeight) : ''
  );
  const [noteInput, setNoteInput] = useState<string>('');
  const [saving, setSaving] = useState<boolean>(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);
  const [showAllHistory, setShowAllHistory] = useState<boolean>(false);
  const [inspectedDateKey, setInspectedDateKey] = useState<string | null>(null);

  useEffect(() => {
    const existingForDate = sortedLogs.find((l) => l.dateKey === selectedDate);
    if (existingForDate) {
      setWeightInput(String(existingForDate.weightKg));
      setNoteInput(existingForDate.note ?? '');
    } else if (selectedDate === todayKey && currentWeight !== null) {
      setWeightInput((prev) => (prev.trim() === '' ? String(currentWeight) : prev));
    }
  }, [selectedDate, sortedLogs, todayKey, currentWeight]);

  const bmiSummary = useMemo(
    () => computeBmiSummary(hero.heightCm, currentWeight),
    [hero.heightCm, currentWeight]
  );

  const totalDelta =
    latestLog && firstLog && sortedLogs.length >= 2
      ? Number((latestLog.weightKg - firstLog.weightKg).toFixed(1))
      : null;

  const recentDelta =
    latestLog && previousLog
      ? Number((latestLog.weightKg - previousLog.weightKg).toFixed(1))
      : null;

  const parseWeightInput = (raw: string): number | null => {
    const normalized = raw.trim().replace(',', '.');
    if (!normalized) return null;
    const parsed = Number(normalized);
    if (!Number.isFinite(parsed)) return null;
    return Math.round(parsed * 10) / 10;
  };

  const handleStepWeight = (delta: number): void => {
    const parsed = parseWeightInput(weightInput);
    const base = parsed ?? currentWeight ?? 75;
    const next = Math.min(350, Math.max(25, Math.round((base + delta) * 10) / 10));
    setWeightInput(String(next));
    setErrorMsg(null);
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    setErrorMsg(null);
    setFeedbackMsg(null);

    const parsed = parseWeightInput(weightInput);
    if (parsed === null || parsed < 25 || parsed > 350) {
      setErrorMsg('Informe um peso válido entre 25 kg e 350 kg (ex: 108 ou 108,5).');
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(selectedDate)) {
      setErrorMsg('Selecione uma data válida para o registro.');
      return;
    }

    setSaving(true);
    try {
      const cleanNote = noteInput.trim().slice(0, 140) || null;
      await onSaveWeight(parsed, selectedDate, cleanNote);
      setFeedbackMsg(
        `Peso registrado: ${parsed.toFixed(1).replace('.', ',')} kg (${formatBrazilianDate(selectedDate)}).`
      );
      setInspectedDateKey(selectedDate);
    } catch (err: unknown) {
      setErrorMsg(getFriendlyErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (logId: string): Promise<void> => {
    setDeletingId(logId);
    setErrorMsg(null);
    setFeedbackMsg(null);
    try {
      await onDeleteWeight(logId);
      if (inspectedDateKey === logId) setInspectedDateKey(null);
    } catch (err: unknown) {
      setErrorMsg(getFriendlyErrorMessage(err));
    } finally {
      setDeletingId(null);
    }
  };

  // Dados do gráfico SVG (últimos 30 registros cronológicos)
  const chartData = useMemo(() => {
    const slice = sortedLogs.slice(-30);
    if (slice.length === 0) return null;

    const width = 520;
    const height = 148;
    const padX = 22;
    const padTop = 18;
    const padBottom = 22;
    const usableW = width - padX * 2;
    const usableH = height - padTop - padBottom;

    const weights = slice.map((item) => item.weightKg);
    const rawMin = Math.min(...weights);
    const rawMax = Math.max(...weights);
    const spread = rawMax - rawMin;
    const margin = spread < 1 ? 1.5 : spread * 0.22;
    const minVal = rawMin - margin;
    const maxVal = rawMax + margin;
    const range = Math.max(0.5, maxVal - minVal);

    const points = slice.map((log, index) => {
      const x =
        slice.length === 1
          ? width / 2
          : padX + (index / (slice.length - 1)) * usableW;
      const y = padTop + ((maxVal - log.weightKg) / range) * usableH;
      return {
        ...log,
        x: Number(x.toFixed(1)),
        y: Number(y.toFixed(1)),
      };
    });

    const linePath = points
      .map((pt, idx) => `${idx === 0 ? 'M' : 'L'} ${pt.x} ${pt.y}`)
      .join(' ');

    const areaPath =
      points.length > 1
        ? `${linePath} L ${points[points.length - 1].x} ${height - padBottom} L ${points[0].x} ${height - padBottom} Z`
        : '';

    return {
      width,
      height,
      padTop,
      padBottom,
      points,
      linePath,
      areaPath,
      rawMin,
      rawMax,
    };
  }, [sortedLogs]);

  const activePoint = useMemo(() => {
    if (!chartData || chartData.points.length === 0) return null;
    if (inspectedDateKey) {
      const found = chartData.points.find((p) => p.dateKey === inspectedDateKey);
      if (found) return found;
    }
    return chartData.points[chartData.points.length - 1];
  }, [chartData, inspectedDateKey]);

  const visibleHistory = showAllHistory ? logsNewestFirst : logsNewestFirst.slice(0, 4);

  const renderDeltaBadge = (delta: number | null, label: string) => {
    if (delta === null) return null;
    const isLoss = delta < 0;
    const isGain = delta > 0;
    return (
      <div
        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-sm border text-[11px] font-semibold font-mono-tabular tabular-nums bg-[#111113] ${
          isLoss
            ? 'border-emerald-500/40 text-[#10B981]'
            : isGain
            ? 'border-orange-500/40 text-orange-400'
            : 'border-[#27272A] text-zinc-300'
        }`}
      >
        {isLoss ? (
          <ArrowDownRight size={18} strokeWidth={1.75} weight="regular" />
        ) : isGain ? (
          <ArrowUpRight size={18} strokeWidth={1.75} weight="regular" />
        ) : (
          <Minus size={18} strokeWidth={1.75} weight="regular" />
        )}
        <span>
          {delta > 0 ? `+${delta.toFixed(1)}` : delta.toFixed(1)} kg {label}
        </span>
      </div>
    );
  };

  return (
    <section
      aria-label="Controle de peso e progresso físico"
      className="bg-[#18181B] border border-[#27272A] rounded-lg p-5 space-y-5"
    >
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1 text-left">
          <div className="text-xs font-semibold text-[#F97316] flex items-center gap-2">
            <Scales size={18} strokeWidth={1.75} weight="regular" />
            <span>Peso corporal e evolução física</span>
          </div>
          <p className="text-xs text-zinc-400">
            Registre suas pesagens para acompanhar a curva de progresso e manter o IMC atualizado.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {renderDeltaBadge(recentDelta, 'vs. anterior')}
          {totalDelta !== null &&
            sortedLogs.length > 2 &&
            renderDeltaBadge(totalDelta, 'total')}
        </div>
      </div>

      <ErrorBanner message={errorMsg} onDismiss={() => setErrorMsg(null)} />

      <AnimatePresence>
        {feedbackMsg && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            role="status"
            className="p-3 rounded-md bg-emerald-950/35 border border-emerald-500/40 text-xs text-emerald-200 flex items-center justify-between gap-2"
          >
            <span className="flex items-center gap-2 font-medium">
              <CheckCircle size={18} strokeWidth={1.75} weight="regular" className="text-[#10B981] shrink-0" />
              {feedbackMsg}
            </span>
            <button
              type="button"
              onClick={() => setFeedbackMsg(null)}
              aria-label="Fechar aviso"
              className="p-1 text-emerald-300 hover:text-white rounded hover:bg-white/5 transition-colors"
            >
              <X size={18} strokeWidth={1.75} weight="regular" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Coluna Esquerda: Entrada de Peso + Resumo Biométrico */}
        <div className="lg:col-span-5 space-y-3.5">
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-[#111113] border border-[#27272A] rounded-md p-3.5">
              <div className="text-[11px] font-medium text-zinc-400">Peso atual</div>
              <div className="text-2xl font-bold text-zinc-100 font-mono-tabular tabular-nums mt-1">
                {currentWeight !== null ? (
                  <>
                    {currentWeight.toFixed(1).replace('.', ',')}{' '}
                    <span className="text-xs font-sans font-medium text-zinc-400">kg</span>
                  </>
                ) : (
                  <span className="text-zinc-500">—</span>
                )}
              </div>
              <div className="text-[11px] text-zinc-500 mt-1 font-mono-tabular tabular-nums">
                {latestLog
                  ? `Último: ${formatBrazilianDate(latestLog.dateKey)}`
                  : hero.weightKg
                  ? 'Da ficha do herói'
                  : 'Sem registro ainda'}
              </div>
            </div>

            <div className="bg-[#111113] border border-[#27272A] rounded-md p-3.5 flex flex-col justify-between">
              <div className="text-[11px] font-medium text-zinc-400">IMC calculado</div>
              {bmiSummary ? (
                <>
                  <div className="text-2xl font-bold text-[#F97316] font-mono-tabular tabular-nums mt-1">
                    {bmiSummary.bmi.toFixed(1).replace('.', ',')}
                  </div>
                  <div className="text-[11px] text-zinc-400 truncate mt-1">
                    {bmiSummary.label}
                  </div>
                </>
              ) : (
                <div className="mt-1 space-y-1">
                  <div className="text-lg font-bold text-zinc-500 font-mono-tabular tabular-nums">—</div>
                  {onNavigateProfile ? (
                    <button
                      type="button"
                      onClick={onNavigateProfile}
                      className="text-[11px] font-semibold text-[#F97316] hover:text-orange-300 underline underline-offset-2 text-left"
                    >
                      Informar altura no Perfil
                    </button>
                  ) : (
                    <div className="text-[11px] text-zinc-500">Defina a altura no Perfil</div>
                  )}
                </div>
              )}
            </div>
          </div>

          <form
            onSubmit={(e) => void handleSubmit(e)}
            className="bg-[#111113] border border-[#27272A] rounded-md p-4 space-y-3"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label
                  htmlFor="dashboard-weight-input"
                  className="block text-[11px] font-medium text-zinc-300"
                >
                  Peso (kg)
                </label>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleStepWeight(-0.5)}
                    aria-label="Diminuir 0,5 kg"
                    className="w-9 h-9 rounded-md bg-[#18181B] hover:bg-[#27272A] border border-[#27272A] text-zinc-300 flex items-center justify-center shrink-0 transition-colors"
                  >
                    <Minus size={18} strokeWidth={1.75} weight="regular" />
                  </button>
                  <input
                    id="dashboard-weight-input"
                    type="text"
                    inputMode="decimal"
                    value={weightInput}
                    onChange={(e) => setWeightInput(e.target.value)}
                    placeholder="108.0"
                    className="w-full h-9 px-3 rounded-md bg-[#09090B] border border-[#27272A] text-sm font-bold font-mono-tabular tabular-nums text-zinc-100 text-center placeholder-zinc-600 focus:outline-none focus:border-[#F97316] focus-visible:ring-2 focus-visible:ring-[#F97316]/60"
                  />
                  <button
                    type="button"
                    onClick={() => handleStepWeight(0.5)}
                    aria-label="Aumentar 0,5 kg"
                    className="w-9 h-9 rounded-md bg-[#18181B] hover:bg-[#27272A] border border-[#27272A] text-zinc-300 flex items-center justify-center shrink-0 transition-colors"
                  >
                    <Plus size={18} strokeWidth={1.75} weight="regular" />
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="dashboard-weight-date"
                  className="block text-[11px] font-medium text-zinc-300"
                >
                  Data do registro
                </label>
                <div className="relative">
                  <input
                    id="dashboard-weight-date"
                    type="date"
                    value={selectedDate}
                    max={todayKey}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    className="w-full h-9 px-3 rounded-md bg-[#09090B] border border-[#27272A] text-xs font-medium font-mono-tabular tabular-nums text-zinc-100 focus:outline-none focus:border-[#F97316] focus-visible:ring-2 focus-visible:ring-[#F97316]/60"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="dashboard-weight-note"
                className="block text-[11px] font-medium text-zinc-400"
              >
                Observação (opcional)
              </label>
              <input
                id="dashboard-weight-note"
                type="text"
                maxLength={140}
                value={noteInput}
                onChange={(e) => setNoteInput(e.target.value)}
                placeholder="Ex: Em jejum, pós-treino..."
                className="w-full h-9 px-3 rounded-md bg-[#09090B] border border-[#27272A] text-xs text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-[#F97316] focus-visible:ring-2 focus-visible:ring-[#F97316]/60"
              />
            </div>

            <button
              type="submit"
              disabled={saving}
              className="w-full min-h-[40px] py-2 px-4 rounded-md bg-[#F97316] hover:bg-orange-400 disabled:bg-[#27272A] disabled:text-zinc-500 text-[#09090B] font-semibold text-xs flex items-center justify-center gap-2 transition-colors"
            >
              <Scales size={18} strokeWidth={1.75} weight="regular" />
              {saving ? 'Salvando registro...' : 'Salvar peso atual'}
            </button>
          </form>
        </div>

        {/* Coluna Direita: Curva de Evolução + Histórico Recente */}
        <div className="lg:col-span-7 flex flex-col justify-between space-y-4">
          <div className="bg-[#111113] border border-[#27272A] rounded-md p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-zinc-200">
                <TrendDown size={18} strokeWidth={1.75} weight="regular" className="text-[#10B981]" />
                <span>
                  Curva de progresso ({sortedLogs.length}{' '}
                  {sortedLogs.length === 1 ? 'registro' : 'registros'})
                </span>
              </div>

              {activePoint && (
                <div className="text-xs font-mono-tabular tabular-nums text-[#10B981] font-semibold">
                  {formatBrazilianDate(activePoint.dateKey)} ·{' '}
                  {activePoint.weightKg.toFixed(1).replace('.', ',')} kg
                </div>
              )}
            </div>

            {!chartData ? (
              <div className="h-36 rounded-md border border-dashed border-[#27272A] flex flex-col items-center justify-center text-center px-4">
                <Scales size={18} strokeWidth={1.75} weight="regular" className="text-zinc-600 mb-2" />
                <p className="text-xs text-zinc-400 max-w-xs">
                  Registre seu primeiro peso ao lado (ex: 108 kg) para iniciar seu histórico de evolução física.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                <svg
                  viewBox={`0 0 ${chartData.width} ${chartData.height}`}
                  className="w-full h-36 overflow-visible"
                  role="img"
                  aria-label="Gráfico de evolução de peso ao longo do tempo"
                >
                  <defs>
                    <linearGradient id="weightAreaGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#10B981" stopOpacity="0.24" />
                      <stop offset="100%" stopColor="#10B981" stopOpacity="0.01" />
                    </linearGradient>
                  </defs>

                  {[0.2, 0.5, 0.85].map((pct) => {
                    const y =
                      chartData.padTop +
                      pct * (chartData.height - chartData.padTop - chartData.padBottom);
                    return (
                      <line
                        key={pct}
                        x1={12}
                        x2={chartData.width - 12}
                        y1={y}
                        y2={y}
                        stroke="#27272A"
                        strokeDasharray="4 4"
                      />
                    );
                  })}

                  {chartData.areaPath && (
                    <path d={chartData.areaPath} fill="url(#weightAreaGrad)" />
                  )}

                  {chartData.points.length > 1 && (
                    <path
                      d={chartData.linePath}
                      fill="none"
                      stroke="#10B981"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  )}

                  {chartData.points.map((pt) => {
                    const isActive = activePoint?.dateKey === pt.dateKey;
                    return (
                      <g
                        key={pt.id}
                        className="cursor-pointer"
                        onMouseEnter={() => setInspectedDateKey(pt.dateKey)}
                        onClick={() => setInspectedDateKey(pt.dateKey)}
                      >
                        {isActive && (
                          <circle
                            cx={pt.x}
                            cy={pt.y}
                            r={8}
                            fill="rgba(16, 185, 129, 0.16)"
                          />
                        )}
                        <circle
                          cx={pt.x}
                          cy={pt.y}
                          r={isActive ? 4.5 : 3.2}
                          fill={isActive ? '#34D399' : '#10B981'}
                          stroke="#111113"
                          strokeWidth="2"
                        />
                      </g>
                    );
                  })}
                </svg>

                <div className="flex items-center justify-between text-[11px] text-zinc-500 font-mono-tabular tabular-nums px-1">
                  <span>
                    Mín: {chartData.rawMin.toFixed(1).replace('.', ',')} kg · Máx:{' '}
                    {chartData.rawMax.toFixed(1).replace('.', ',')} kg
                  </span>
                  <span>
                    {chartData.points.length === 1
                      ? 'Base inicial registrada'
                      : `${formatBrazilianDate(chartData.points[0].dateKey)} → ${formatBrazilianDate(
                          chartData.points[chartData.points.length - 1].dateKey
                        )}`}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Lista de registros recentes */}
          {logsNewestFirst.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-[11px] font-semibold text-zinc-400 px-0.5">
                <span className="flex items-center gap-1.5">
                  <CalendarBlank size={18} strokeWidth={1.75} weight="regular" className="text-zinc-500" />
                  Histórico de pesagens
                </span>
                {logsNewestFirst.length > 4 && (
                  <button
                    type="button"
                    onClick={() => setShowAllHistory((v) => !v)}
                    className="text-[#F97316] hover:text-orange-300 font-semibold"
                  >
                    {showAllHistory
                      ? 'Mostrar menos'
                      : `Ver todos (${logsNewestFirst.length})`}
                  </button>
                )}
              </div>

              <div className="space-y-1.5 max-h-52 overflow-y-auto pr-0.5">
                {visibleHistory.map((log, index) => {
                  const prevChrono = logsNewestFirst[index + 1] ?? null;
                  const diff = prevChrono
                    ? Number((log.weightKg - prevChrono.weightKg).toFixed(1))
                    : null;
                  return (
                    <div
                      key={log.id}
                      className="flex items-center justify-between gap-2 px-3 py-2 rounded-md bg-[#111113] border border-[#27272A] text-xs"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="font-mono-tabular tabular-nums text-zinc-400 shrink-0">
                          {formatBrazilianDate(log.dateKey)}
                        </span>
                        <span className="font-semibold text-zinc-100 font-mono-tabular tabular-nums shrink-0">
                          {log.weightKg.toFixed(1).replace('.', ',')} kg
                        </span>
                        {diff !== null && (
                          <span
                            className={`text-[11px] font-semibold font-mono-tabular tabular-nums shrink-0 ${
                              diff < 0
                                ? 'text-[#10B981]'
                                : diff > 0
                                ? 'text-orange-400'
                                : 'text-zinc-500'
                            }`}
                          >
                            ({diff > 0 ? `+${diff.toFixed(1)}` : diff.toFixed(1)})
                          </span>
                        )}
                        {log.note && (
                          <span className="text-[11px] text-zinc-500 truncate">
                            · {log.note}
                          </span>
                        )}
                      </div>

                      <button
                        type="button"
                        disabled={deletingId === log.id}
                        onClick={() => void handleDelete(log.id)}
                        aria-label={`Remover registro de ${formatBrazilianDate(log.dateKey)}`}
                        className="p-1.5 rounded text-zinc-500 hover:text-red-400 hover:bg-red-500/10 transition-colors shrink-0 disabled:opacity-40"
                      >
                        <Trash size={18} strokeWidth={1.75} weight="regular" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
};
