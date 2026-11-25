import React, { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowsClockwise,
  CaretDown,
  CaretUp,
  Check,
  CheckCircle,
  Clock,
  Copy,
  DownloadSimple,
  FileCsv,
  Flame,
  Footprints,
  Heart,
  Heartbeat,
  Lightning,
  Link,
  LinkBreak,
  Medal,
  Mountains,
  Pulse,
  Sparkle,
  TrendUp,
  UploadSimple,
  Watch,
  X,
} from '@phosphor-icons/react';
import { Dialog, Tabs } from 'radix-ui';
import {
  DailyHealthMetric,
  ExercisePrRecord,
  GameStats,
  HealthActivity,
  HealthImportBatchResult,
  HealthImportProgress,
  HeroProfile,
  ParsedHealthImport,
  ReportPeriod,
  ReportSourceFilter,
  StravaAthleteSummary,
  UserAchievement,
  WeightLog,
  WorkoutLog,
} from '../types/fitness';
import {
  ACHIEVEMENT_DEFINITIONS,
  MAX_IMPORT_ACTIVITIES_PER_ROUND,
  buildWeeklyTrends,
  buildZoneTotals,
  computeRecoveryAssessment,
  formatBrazilianDate,
  getAchievementCurrentProgress,
  getEffectiveCurrentStreak,
  getFriendlyErrorMessage,
  getLocalDateKey,
  getWeeklyRaidBossState,
} from '../utils/rpgLogic';
import {
  buildCsvTemplateSample,
  buildSamsungHealthSampleCsv,
  parseAppleHealthXmlFile,
  parseCsvHealthContent,
  parseGpxContent,
  parseSamsungHealthFiles,
} from '../utils/healthParsers';
import type { HealthConnectDay } from '../utils/healthConnect';
import { fetchAuthenticatedApi, fetchStrava, type HealthConnectReadStatus } from '../services/api';
import { GoogleDriveCard } from './GoogleDriveCard';
import { ReportHealthConnectCard } from './ReportHealthConnectCard';
import {
  AchievementGlyph,
  ErrorBanner,
  LevelBadge,
  XpProgressBar,
} from './HudPrimitives';

function formatSourceLabel(source: HealthActivity['source']): string {
  if (source === 'strava') return 'Strava';
  if (source === 'apple_health') return 'Apple Health';
  if (source === 'samsung_health') return 'Samsung Health';
  if (source === 'health_connect') return 'Health Connect';
  return source.toUpperCase();
}

const XpEvolutionChart = lazy(() => import('./XpEvolutionChart'));

const reportPages = [
  { id: 'overview', label: 'Visão geral', icon: Pulse },
  { id: 'activities', label: 'Atividades', icon: Footprints },
  { id: 'progress', label: 'Evolução', icon: TrendUp },
  { id: 'sync', label: 'Sincronização', icon: ArrowsClockwise },
] as const;

const sourceOptions: Array<{ id: ReportSourceFilter; label: string }> = [
  { id: 'all', label: 'Todas as origens' },
  { id: 'health_connect', label: 'Health Connect' },
  { id: 'strava', label: 'Strava' },
  { id: 'samsung_health', label: 'Samsung Health' },
  { id: 'files', label: 'Arquivos importados' },
  { id: 'rpg', label: 'Treinos do app' },
];

const trendOptions = [
  { id: 'minutes', field: 'totalMinutes', label: 'Tempo', unit: 'min' },
  { id: 'distance', field: 'distanceKm', label: 'Distância', unit: 'km' },
  { id: 'volume', field: 'totalVolumeKg', label: 'Volume', unit: 'kg' },
  { id: 'xp', field: 'xpEarned', label: 'XP', unit: 'XP' },
] as const;
const activitiesPageSize = 12;

interface ReportsAndHealthViewProps {
  hero: HeroProfile;
  stats: GameStats;
  logs: WorkoutLog[];
  exercisePrs?: ExercisePrRecord[];
  healthActivities: HealthActivity[];
  dailyMetrics: DailyHealthMetric[];
  healthConnectStatus: HealthConnectReadStatus | 'loading';
  healthConnectDays: HealthConnectDay[];
  latestHealthConnectHeartRate: { time: string; beatsPerMinute: number } | null;
  latestHealthConnectRecordUpdate: number | null;
  weightLogs: WeightLog[];
  achievements: UserAchievement[];
  driveAccessToken: string | null;
  onDriveAccessTokenChange: (token: string | null) => void;
  onImportHealthData: (
    activities: Omit<HealthActivity, 'userId'>[],
    dailyMetrics: Omit<DailyHealthMetric, 'userId'>[],
    options?: {
      onProgress?: (progress: HealthImportProgress) => void;
    }
  ) => Promise<HealthImportBatchResult>;
}

export const ReportsAndHealthView: React.FC<ReportsAndHealthViewProps> = ({
  hero,
  stats,
  logs,
  exercisePrs = [],
  healthActivities,
  dailyMetrics,
  healthConnectStatus,
  healthConnectDays,
  latestHealthConnectHeartRate,
  latestHealthConnectRecordUpdate,
  weightLogs,
  achievements,
  driveAccessToken,
  onDriveAccessTokenChange,
  onImportHealthData,
}) => {
  const [section, setSection] = useState('overview');
  const [period, setPeriod] = useState<ReportPeriod>(28);
  const [sourceFilter, setSourceFilter] = useState<ReportSourceFilter>('all');
  const [trend, setTrend] = useState<(typeof trendOptions)[number]>(trendOptions[0]);
  const [visibleActivityCount, setVisibleActivityCount] = useState(activitiesPageSize);
  const syncTabRef = useRef<HTMLButtonElement>(null);
  const activityTrigger = useRef<HTMLButtonElement | null>(null);

  const openSync = () => {
    setSection('sync');
    syncTabRef.current?.focus();
  };

  // Estado Strava OAuth
  const [stravaConfigured, setStravaConfigured] = useState<boolean>(false);
  const [stravaCallbackUrl, setStravaCallbackUrl] = useState<string>('');
  const [stravaConnected, setStravaConnected] = useState<boolean>(false);
  const [stravaAthlete, setStravaAthlete] = useState<StravaAthleteSummary | null>(null);
  const [stravaSyncDays, setStravaSyncDays] = useState<number>(30);
  const [stravaBusy, setStravaBusy] = useState<boolean>(false);
  const stravaPopup = useRef<Window | null>(null);
  const [copiedCallback, setCopiedCallback] = useState<boolean>(false);

  // Estado Importação de Arquivos & Samsung Health
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const samsungInputRef = useRef<HTMLInputElement | null>(null);
  const [showSamsungGuide, setShowSamsungGuide] = useState<boolean>(false);
  const [parsingFile, setParsingFile] = useState<boolean>(false);
  const [parsingLabel, setParsingLabel] = useState<string>('Processando arquivo de saúde...');
  const [parseProgress, setParseProgress] = useState<number>(0);
  const [parsedPreview, setParsedPreview] = useState<ParsedHealthImport | null>(null);
  const [committingImport, setCommittingImport] = useState<boolean>(false);
  const [importProgress, setImportProgress] = useState<HealthImportProgress | null>(null);
  const [importSummary, setImportSummary] = useState<{
    sourceLabel: string;
    result: HealthImportBatchResult;
  } | null>(null);
  const [resumeBatch, setResumeBatch] = useState<{
    sourceLabel: string;
    activities: Omit<HealthActivity, 'userId'>[];
    dailyMetrics: Omit<DailyHealthMetric, 'userId'>[];
  } | null>(null);

  // Feedback / Erros / Detalhe de Atividade / Insights IA
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [selectedActivity, setSelectedActivity] = useState<HealthActivity | null>(null);
  const [aiInsights, setAiInsights] = useState<string | null>(null);
  const [loadingInsights, setLoadingInsights] = useState<boolean>(false);

  const loadStravaState = async (): Promise<void> => {
    try {
      const cfgRes = await fetch('/api/strava/config');
      if (!cfgRes.ok) return;
      const cfg = (await cfgRes.json()) as {
        configured: boolean;
        callbackUrl: string;
      };
      setStravaConfigured(cfg.configured);
      setStravaCallbackUrl(cfg.callbackUrl);
      if (!cfg.configured) {
        setStravaConnected(false);
        setStravaAthlete(null);
        return;
      }
      const statusRes = await fetchStrava('status');
      if (statusRes.ok) {
        const st = (await statusRes.json()) as {
          connected: boolean;
          athlete: StravaAthleteSummary | null;
        };
        setStravaConnected(st.connected);
        setStravaAthlete(st.athlete);
      }
    } catch {
      // Silencioso caso endpoint não esteja pronto
    }
  };

  useEffect(() => {
    void loadStravaState();

    const handleOAuthMessage = (event: MessageEvent): void => {
      if (event.origin !== window.location.origin || !stravaPopup.current ||
          event.source !== stravaPopup.current) return;
      if (event.data?.type === 'STRAVA_OAUTH_SUCCESS') {
        stravaPopup.current = null;
        void loadStravaState();
        setStatusMessage('Conta Strava conectada. Clique em Sincronizar para importar atividades.');
        setErrorMsg(null);
      } else if (event.data?.type === 'STRAVA_OAUTH_ERROR') {
        stravaPopup.current = null;
        setErrorMsg(String(event.data.error || 'Autorização Strava não concluída.'));
      }
    };

    window.addEventListener('message', handleOAuthMessage);
    return () => window.removeEventListener('message', handleOAuthMessage);
  }, []);

  const handleConnectStrava = async (): Promise<void> => {
    setErrorMsg(null);
    setStatusMessage(null);
    setStravaBusy(true);
    stravaPopup.current?.close();
    const popup = window.open('about:blank', 'strava_oauth_popup', 'width=600,height=720');
    stravaPopup.current = popup;
    try {
      if (!popup) throw new Error('O navegador bloqueou o popup do Strava. Permita popups e tente novamente.');
      const res = await fetchStrava('auth-url');
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !data.url) {
        throw new Error(data.error || 'Não foi possível iniciar o OAuth do Strava.');
      }
      popup.location.replace(data.url);
    } catch (err: unknown) {
      popup?.close();
      stravaPopup.current = null;
      setErrorMsg(getFriendlyErrorMessage(err));
    } finally {
      setStravaBusy(false);
    }
  };

  const executeSequentialImport = async (
    sourceLabel: string,
    activities: Omit<HealthActivity, 'userId'>[],
    metrics: Omit<DailyHealthMetric, 'userId'>[],
    previousAggregate?: HealthImportBatchResult
  ): Promise<HealthImportBatchResult> => {
    setCommittingImport(true);
    setErrorMsg(null);
    setImportProgress({
      phase: activities.length > 0 ? 'activities' : 'metrics',
      processedActivities: 0,
      totalActivities: Math.min(activities.length, MAX_IMPORT_ACTIVITIES_PER_ROUND),
      processedMetrics: 0,
      totalMetrics: metrics.length,
      importedActivities: 0,
      skippedDuplicates: 0,
      errorCount: 0,
      xpAdded: 0,
      currentLabel: 'Preparando importação sequencial...',
    });

    try {
      const result = await onImportHealthData(activities, metrics, {
        onProgress: (prog) => setImportProgress(prog),
      });

      const mergedResult: HealthImportBatchResult = previousAggregate
        ? {
            importedActivities: previousAggregate.importedActivities + result.importedActivities,
            skippedDuplicates: previousAggregate.skippedDuplicates + result.skippedDuplicates,
            errorCount: result.errorCount,
            importedDays: previousAggregate.importedDays + result.importedDays,
            xpAdded: previousAggregate.xpAdded + result.xpAdded,
            truncatedOverLimit: previousAggregate.truncatedOverLimit || result.truncatedOverLimit,
            totalOriginalActivities: previousAggregate.totalOriginalActivities,
            completedExternalIds: [
              ...previousAggregate.completedExternalIds,
              ...result.completedExternalIds,
            ],
            completedMetricDates: [
              ...previousAggregate.completedMetricDates,
              ...result.completedMetricDates,
            ],
            failedActivities: result.failedActivities,
            failedMetrics: result.failedMetrics,
            lastError: result.lastError,
          }
        : result;

      setImportSummary({ sourceLabel, result: mergedResult });

      if (mergedResult.failedActivities.length > 0 || mergedResult.failedMetrics.length > 0) {
        setResumeBatch({
          sourceLabel,
          activities: mergedResult.failedActivities.map((f) => f.activity),
          dailyMetrics: mergedResult.failedMetrics.map((f) => f.metric),
        });
        setErrorMsg(
          mergedResult.lastError
            ? `Importação interrompida com ${mergedResult.errorCount} pendência(s): ${mergedResult.lastError}`
            : `Importação concluída parcialmente com ${mergedResult.errorCount} erro(s). Você pode retomar apenas os itens pendentes sem duplicar.`
        );
      } else {
        setResumeBatch(null);
        setStatusMessage(
          `Importação concluída (${sourceLabel}): ${mergedResult.importedActivities} importada(s), ${mergedResult.skippedDuplicates} duplicada(s) ignorada(s), ${mergedResult.importedDays} dia(s) de métricas (+${mergedResult.xpAdded} XP pelo servidor).`
        );
      }

      return mergedResult;
    } finally {
      setCommittingImport(false);
      setImportProgress(null);
    }
  };

  const handleSyncStrava = async (): Promise<void> => {
    setErrorMsg(null);
    setStatusMessage(null);
    setStravaBusy(true);
    try {
      const res = await fetchStrava('sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          days: stravaSyncDays,
          maxHr: hero.maxHrEstimated ?? 190,
        }),
      });
      const data = (await res.json()) as {
        activities?: Omit<HealthActivity, 'userId'>[];
        truncated?: boolean;
        error?: string;
      };
      if (!res.ok || !data.activities) {
        throw new Error(data.error || 'Falha ao sincronizar atividades do Strava.');
      }
      await executeSequentialImport('Strava API v3', data.activities, []);
      if (data.truncated) setStatusMessage('O período contém mais de 250 atividades. Selecione um período menor para sincronizar.');
    } catch (err: unknown) {
      setErrorMsg(getFriendlyErrorMessage(err));
    } finally {
      setStravaBusy(false);
    }
  };

  const handleDisconnectStrava = async (): Promise<void> => {
    setStravaBusy(true);
    try {
      const response = await fetchStrava('disconnect', { method: 'POST' });
      if (!response.ok) throw new Error('Não foi possível desconectar a conta Strava.');
      setStravaConnected(false);
      setStravaAthlete(null);
      setStatusMessage('Conta Strava desconectada desta sessão.');
    } catch (error) {
      setErrorMsg(getFriendlyErrorMessage(error));
    } finally {
      setStravaBusy(false);
    }
  };

  const handleCopyCallback = async (): Promise<void> => {
    if (!stravaCallbackUrl) return;
    try {
      await navigator.clipboard.writeText(stravaCallbackUrl);
      setCopiedCallback(true);
      window.setTimeout(() => setCopiedCallback(false), 2000);
    } catch {
      // Ignora erro de clipboard
    }
  };

  const handleFileSelected = async (
    e: React.ChangeEvent<HTMLInputElement>
  ): Promise<void> => {
    const file = e.target.files?.[0];
    if (!file) return;
    setErrorMsg(null);
    setStatusMessage(null);
    setParsedPreview(null);
    setParsingLabel(`Processando ${file.name}...`);
    setParsingFile(true);
    setParseProgress(5);

    const maxHr = hero.maxHrEstimated ?? 190;
    const lowerName = file.name.toLowerCase();

    try {
      let parsed: ParsedHealthImport;
      if (lowerName.endsWith('.gpx')) {
        const text = await file.text();
        parsed = parseGpxContent(text, file.name, maxHr);
      } else if (lowerName.endsWith('.csv')) {
        const text = await file.text();
        parsed = parseCsvHealthContent(text, file.name, maxHr);
      } else if (lowerName.endsWith('.xml')) {
        parsed = await parseAppleHealthXmlFile(file, maxHr, (pct) =>
          setParseProgress(pct)
        );
      } else {
        throw new Error(
          'Formato não suportado. Envie arquivos .xml (Apple Health), .gpx ou .csv.'
        );
      }
      setParsedPreview(parsed);
    } catch (err: unknown) {
      setErrorMsg(getFriendlyErrorMessage(err));
    } finally {
      setParsingFile(false);
      setParseProgress(0);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSamsungFilesSelected = async (
    e: React.ChangeEvent<HTMLInputElement>
  ): Promise<void> => {
    const fileList = Array.from(e.target.files ?? []);
    if (fileList.length === 0) return;
    setErrorMsg(null);
    setStatusMessage(null);
    setParsedPreview(null);
    setParsingLabel(`Lendo ${fileList.length} arquivo(s) do Samsung Health...`);
    setParsingFile(true);
    setParseProgress(5);

    const maxHr = hero.maxHrEstimated ?? 190;
    try {
      const parsed = await parseSamsungHealthFiles(fileList, maxHr, (pct) =>
        setParseProgress(pct)
      );
      setParsedPreview(parsed);
    } catch (err: unknown) {
      setErrorMsg(getFriendlyErrorMessage(err));
    } finally {
      setParsingFile(false);
      setParseProgress(0);
      if (samsungInputRef.current) samsungInputRef.current.value = '';
    }
  };

  const existingExternalIds = useMemo(
    () => new Set(healthActivities.map((a) => a.externalId)),
    [healthActivities]
  );

  const previewStats = useMemo(() => {
    if (!parsedPreview) return null;
    const total = parsedPreview.activities.length;
    const roundActivities = parsedPreview.activities.slice(0, MAX_IMPORT_ACTIVITIES_PER_ROUND);
    let duplicateCount = 0;
    for (const act of roundActivities) {
      if (existingExternalIds.has(act.externalId)) duplicateCount += 1;
    }
    return {
      total,
      overLimit: total > MAX_IMPORT_ACTIVITIES_PER_ROUND,
      roundTotal: roundActivities.length,
      duplicateCount,
      newCount: roundActivities.length - duplicateCount,
    };
  }, [parsedPreview, existingExternalIds]);

  const handleConfirmFileImport = async (): Promise<void> => {
    if (!parsedPreview) return;
    setImportSummary(null);
    setResumeBatch(null);
    setStatusMessage(null);
    try {
      const result = await executeSequentialImport(
        parsedPreview.sourceLabel,
        parsedPreview.activities,
        parsedPreview.dailyMetrics
      );
      if (result.errorCount === 0) {
        setParsedPreview(null);
      } else {
        // Mantém a pré-visualização limpa porque o botão de retomar já preserva os pendentes
        setParsedPreview(null);
      }
    } catch (err: unknown) {
      setErrorMsg(getFriendlyErrorMessage(err));
    }
  };

  const handleResumeImport = async (): Promise<void> => {
    if (!resumeBatch) return;
    setStatusMessage(null);
    try {
      await executeSequentialImport(
        resumeBatch.sourceLabel,
        resumeBatch.activities,
        resumeBatch.dailyMetrics,
        importSummary?.result
      );
    } catch (err: unknown) {
      setErrorMsg(getFriendlyErrorMessage(err));
    }
  };

  const handleDownloadCsvTemplate = (): void => {
    const csv = buildCsvTemplateSample();
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'modelo_saude_fitness_rpg.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadSamsungSample = (): void => {
    const csv = buildSamsungHealthSampleCsv();
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'modelo_samsung_health.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const now = new Date();
  const todayKey = getLocalDateKey(now);
  const cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (period - 1));
  const cutoffKey = getLocalDateKey(cutoff);

  const filteredActivities = useMemo(() => {
    return healthActivities.filter((a) => {
      if (a.dateKey < cutoffKey || a.dateKey > todayKey) return false;
      if (sourceFilter === 'strava') return a.source === 'strava';
      if (sourceFilter === 'samsung_health') return a.source === 'samsung_health';
      if (sourceFilter === 'health_connect') return a.source === 'health_connect';
      if (sourceFilter === 'files') {
        return a.source !== 'strava' && a.source !== 'samsung_health' && a.source !== 'health_connect';
      }
      if (sourceFilter === 'rpg') return false;
      return true;
    });
  }, [healthActivities, cutoffKey, todayKey, sourceFilter]);

  const filteredLogs = useMemo(() => {
    if (
      sourceFilter === 'strava' ||
      sourceFilter === 'samsung_health' ||
      sourceFilter === 'health_connect' ||
      sourceFilter === 'files'
    ) {
      return [];
    }
    return logs.filter((log) => log.dateKey >= cutoffKey && log.dateKey <= todayKey);
  }, [logs, cutoffKey, todayKey, sourceFilter]);

  const weeklyTrends = useMemo(
    () => buildWeeklyTrends(filteredLogs, filteredActivities, dailyMetrics, period),
    [filteredLogs, filteredActivities, dailyMetrics, period, todayKey]
  );

  const zoneTotals = useMemo(
    () => buildZoneTotals(filteredActivities, filteredLogs, hero.maxHrEstimated ?? 190),
    [filteredActivities, filteredLogs, hero.maxHrEstimated]
  );

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

  const reportSummary = useMemo(() => {
    const totalMin =
      filteredActivities.reduce((a, b) => a + b.durationMinutes, 0) +
      filteredLogs.reduce((a, b) => a + b.durationMinutes, 0);
    const totalDist = Number(
      filteredActivities.reduce((a, b) => a + b.distanceKm, 0).toFixed(1)
    );
    const totalCal =
      filteredActivities.reduce((a, b) => a + b.calories, 0) +
      filteredLogs.reduce((a, b) => a + b.durationMinutes * 7, 0);
    const hrActs = filteredActivities.filter((a) => a.avgHeartRate !== null && a.avgHeartRate > 0);
    const avgHr =
      hrActs.length > 0
        ? Math.round(
            hrActs.reduce((acc, a) => acc + (a.avgHeartRate ?? 0), 0) / hrActs.length
          )
        : null;

    const totalVolumeKg = Math.round(
      filteredLogs.reduce((acc, log) => acc + (log.totalVolumeKg ?? 0), 0)
    );
    const totalPrs = filteredLogs.reduce((acc, log) => acc + (log.prCount ?? 0), 0);

    return {
      totalMin,
      totalDist,
      totalCal,
      avgHr,
      totalVolumeKg,
      totalPrs,
      sessionsCount: filteredActivities.length + filteredLogs.length,
    };
  }, [filteredActivities, filteredLogs]);

  const handleGenerateAiInsights = async (): Promise<void> => {
    setLoadingInsights(true);
    setErrorMsg(null);
    try {
      const summary = [
        `Período analisado: últimos ${period} dias`,
        `Sessões: ${reportSummary.sessionsCount} | Tempo total: ${reportSummary.totalMin} min | Distância: ${reportSummary.totalDist} km | Calorias: ${reportSummary.totalCal} kcal`,
        `FC média em sessões: ${reportSummary.avgHr ?? 'não registrada'} bpm`,
        `Recuperação atual: ${recovery.score}/100 (${recovery.statusLabel}) | ACWR: ${recovery.acwrRatio}`,
        `Sono médio 7d: ${recovery.avgSleepHours ?? 'n/d'}h | FC repouso: ${recovery.latestRestingHr ?? 'n/d'} bpm`,
        `Zonas Cardíacas: ${zoneTotals
          .map((z) => `${z.label}: ${z.minutes}m (${z.percentage}%)`)
          .join(', ')}`,
      ].join('\n');

      const res = await fetchAuthenticatedApi('/api/reports/insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ summary }),
      });
      const data = (await res.json()) as { insights?: string; error?: string };
      if (!res.ok || !data.insights) {
        throw new Error(data.error || 'Não foi possível gerar insights agora.');
      }
      setAiInsights(data.insights);
    } catch (err: unknown) {
      setErrorMsg(getFriendlyErrorMessage(err));
    } finally {
      setLoadingInsights(false);
    }
  };

  // Heatmap 28 dias
  const heatmapDays = useMemo(() => {
    const cells: Array<{
      dateKey: string;
      dayNum: string;
      count: number;
      minutes: number;
      xp: number;
      intensity: 0 | 1 | 2 | 3;
    }> = [];

    const now = new Date();
    for (let offset = 27; offset >= 0; offset--) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - offset);
      const key = getLocalDateKey(d);
      const dayLogs = logs.filter((l) => l.dateKey === key);
      const dayActs = healthActivities.filter((a) => a.dateKey === key);
      const count = dayLogs.length + dayActs.length;
      const minutes =
        dayLogs.reduce((acc, l) => acc + l.durationMinutes, 0) +
        dayActs.reduce((acc, a) => acc + a.durationMinutes, 0);
      const xp =
        dayLogs.reduce((acc, l) => acc + l.xpEarned + l.bonusXpEarned, 0) +
        dayActs.reduce((acc, a) => acc + a.xpAwarded, 0);

      let intensity: 0 | 1 | 2 | 3 = 0;
      if (count >= 3 || minutes >= 60) intensity = 3;
      else if (count === 2 || minutes >= 30) intensity = 2;
      else if (count >= 1) intensity = 1;

      cells.push({
        dateKey: key,
        dayNum: String(d.getDate()).padStart(2, '0'),
        count,
        minutes,
        xp,
        intensity,
      });
    }
    return cells;
  }, [logs, healthActivities]);

  const [selectedDateKey, setSelectedDateKey] = useState<string>(getLocalDateKey());
  const selectedDayInfo =
    heatmapDays.find((c) => c.dateKey === selectedDateKey) ??
    heatmapDays[heatmapDays.length - 1];

  const achievementsMap = useMemo(() => {
    const map: Partial<Record<string, UserAchievement>> = {};
    for (const item of achievements) map[item.id] = item;
    return map;
  }, [achievements]);

  const unlockedCount = useMemo(
    () => achievements.filter((a) => a.unlocked).length,
    [achievements]
  );

  const effectiveStreak = getEffectiveCurrentStreak(
    stats.currentStreak,
    stats.lastWorkoutDate
  );

  const maxTrendValue = Math.max(1, ...weeklyTrends.map((week) => week[trend.field] ?? 0));
  const hasTrend = weeklyTrends.some((week) => (week[trend.field] ?? 0) > 0);
  const weeklyRaidDefeated = useMemo(
    () => getWeeklyRaidBossState(todayKey, logs, healthActivities).isDefeated,
    [todayKey, logs, healthActivities]
  );
  const sortedPrs = useMemo(
    () => [...exercisePrs].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [exercisePrs]
  );

  const recentActivities = useMemo(() => [
    ...filteredActivities.map((activity) => ({ kind: 'health' as const, time: Date.parse(activity.startedAt), activity })),
    ...filteredLogs.map((log) => ({ kind: 'workout' as const, time: Date.parse(log.completedAt), log })),
  ].sort((a, b) => (b.time || 0) - (a.time || 0)), [filteredActivities, filteredLogs]);

  const latestHealthConnectActivity = useMemo(() =>
    healthActivities.reduce<HealthActivity | undefined>((latest, activity) =>
      activity.source === 'health_connect' && (!latest || activity.startedAt > latest.startedAt)
        ? activity
        : latest, undefined),
  [healthActivities]);

  // Evolução do totalXp ao longo dos últimos 30 dias com base nos workoutLogs
  const xpEvolution30Days = useMemo(() => {
    const now = new Date();
    const dailyWorkoutXp = new Map<string, { xp: number; sessions: number }>();

    for (const log of logs) {
      const gained = Math.max(0, (log.xpEarned ?? 0) + (log.bonusXpEarned ?? 0));
      const existing = dailyWorkoutXp.get(log.dateKey) ?? { xp: 0, sessions: 0 };
      dailyWorkoutXp.set(log.dateKey, {
        xp: existing.xp + gained,
        sessions: existing.sessions + 1,
      });
    }

    const days: Array<{
      dateKey: string;
      shortLabel: string;
      fullDate: string;
      dailyXp: number;
      sessions: number;
    }> = [];

    let xpInWindow = 0;
    for (let offset = 29; offset >= 0; offset--) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - offset);
      const key = getLocalDateKey(d);
      const entry = dailyWorkoutXp.get(key) ?? { xp: 0, sessions: 0 };
      xpInWindow += entry.xp;
      const dd = String(d.getDate()).padStart(2, '0');
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      days.push({
        dateKey: key,
        shortLabel: `${dd}/${mm}`,
        fullDate: formatBrazilianDate(key),
        dailyXp: entry.xp,
        sessions: entry.sessions,
      });
    }

    const baselineXp = Math.max(0, stats.totalXp - xpInWindow);
    let cumulative = baselineXp;
    const series = days.map((day) => {
      cumulative += day.dailyXp;
      return {
        ...day,
        totalXp: cumulative,
      };
    });

    const bestDayXp = series.reduce((max, item) => Math.max(max, item.dailyXp), 0);

    return {
      series,
      xpInWindow,
      bestDayXp,
      baselineXp,
    };
  }, [logs, stats.totalXp]);

  const healthConnectSummary = {
    status: healthConnectStatus,
    days: healthConnectDays,
    latestHeartRate: latestHealthConnectHeartRate,
    latestRecordUpdate: latestHealthConnectRecordUpdate,
    latestActivity: latestHealthConnectActivity,
  };
  const summaryMetrics = [
    {
      label: 'Tempo de treino',
      icon: Clock,
      value: reportSummary.totalMin.toLocaleString('pt-BR'),
      unit: 'min',
      detail: `${reportSummary.sessionsCount} ${reportSummary.sessionsCount === 1 ? 'sessão' : 'sessões'}`,
    },
    {
      label: 'Distância',
      icon: Footprints,
      value: reportSummary.totalDist.toLocaleString('pt-BR'),
      unit: 'km',
    },
    {
      label: 'Calorias estimadas',
      icon: Flame,
      value: reportSummary.totalCal.toLocaleString('pt-BR'),
      unit: 'kcal',
    },
    {
      label: 'FC média',
      icon: Heart,
      value: reportSummary.avgHr?.toLocaleString('pt-BR') ?? '—',
      unit: reportSummary.avgHr !== null ? 'bpm' : '',
      detail: reportSummary.avgHr === null ? 'Sem medidas nos treinos' : 'Nos treinos com medição',
    },
    ...(reportSummary.totalVolumeKg > 0 || reportSummary.totalPrs > 0
      ? [
          {
            label: 'Volume levantado',
            icon: TrendUp,
            value: reportSummary.totalVolumeKg.toLocaleString('pt-BR'),
            unit: 'kg',
            detail: `${reportSummary.totalPrs} ${reportSummary.totalPrs === 1 ? 'PR registrado' : 'PRs registrados'} no período`,
          },
        ]
      : []),
  ];

  return (
    <Tabs.Root value={section} onValueChange={setSection} className="min-w-0 space-y-4 pb-5 sm:space-y-5">
      <h1 className="text-2xl font-bold tracking-tight text-zinc-50 sm:text-3xl">Relatórios</h1>

      <Tabs.List
        aria-label="Seções dos relatórios"
        className="grid grid-cols-2 gap-1 rounded-xl border border-zinc-800 bg-[#111113] p-1 sm:grid-cols-4"
      >
        {reportPages.map(({ id, label, icon: Icon }) => (
          <Tabs.Trigger
            key={id}
            value={id}
            ref={id === 'sync' ? syncTabRef : undefined}
            className="ui-press flex min-h-11 min-w-0 items-center justify-center gap-1.5 rounded-lg px-2 text-xs font-semibold text-zinc-400 hover:text-zinc-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-400 data-[state=active]:bg-orange-400/12 data-[state=active]:text-orange-300 sm:gap-2 sm:text-sm"
          >
            <Icon size={17} aria-hidden="true" className="shrink-0" />
            {label}
          </Tabs.Trigger>
        ))}
      </Tabs.List>

      {(section === 'overview' || section === 'activities') && (
        <div className="flex flex-wrap items-end gap-x-4 gap-y-3 rounded-xl border border-zinc-800 bg-[#111113] p-3 sm:p-4">
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-zinc-400">Período</span>
            <div role="group" aria-label="Período" className="flex gap-1 rounded-lg bg-zinc-900 p-1">
              {([7, 28, 90] as const).map((days) => (
                <button
                  key={days}
                  type="button"
                  aria-pressed={period === days}
                  onClick={() => {
                    setPeriod(days);
                    setVisibleActivityCount(activitiesPageSize);
                  }}
                  className="ui-press min-h-9 whitespace-nowrap rounded-md px-2.5 text-xs font-semibold text-zinc-400 hover:text-zinc-100 focus-visible:outline-2 focus-visible:outline-orange-400 aria-pressed:bg-orange-400 aria-pressed:text-zinc-950 sm:px-3"
                >
                  {days} dias
                </button>
              ))}
            </div>
          </div>

          <label className="flex min-w-36 flex-1 flex-col gap-1.5 text-xs font-medium text-zinc-400 sm:flex-none">
            Origem
            <select
              value={sourceFilter}
              onChange={(event) => {
                const option = sourceOptions.find(({ id }) => id === event.target.value);
                if (option) setSourceFilter(option.id);
                setVisibleActivityCount(activitiesPageSize);
              }}
              className="min-h-11 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 text-sm text-zinc-100 focus-visible:outline-2 focus-visible:outline-orange-400 sm:w-48"
            >
              {sourceOptions.map(({ id, label }) => <option key={id} value={id}>{label}</option>)}
            </select>
          </label>
          <p className="w-full text-xs tabular-nums text-zinc-400 sm:ml-auto sm:w-auto sm:pb-3">
            {formatBrazilianDate(cutoffKey)} a {formatBrazilianDate(todayKey)}
          </p>
        </div>
      )}

      <ErrorBanner message={errorMsg} onDismiss={() => setErrorMsg(null)} />

      {statusMessage && (
        <div role="status" className="p-3.5 rounded-lg bg-[#111113] border border-emerald-500/40 text-emerald-200 text-xs flex items-center justify-between gap-2">
          <span className="flex items-center gap-2">
            <CheckCircle size={18} strokeWidth={1.75} weight="regular" className="text-emerald-400 shrink-0" />
            {statusMessage}
          </span>
          <button
            type="button"
            onClick={() => setStatusMessage(null)}
            aria-label="Fechar confirmação"
            className="text-emerald-300 hover:text-white p-1"
          >
            <X size={18} strokeWidth={1.75} weight="regular" />
          </button>
        </div>
      )}

      <Tabs.Content value="overview" className="ui-screen-enter space-y-4 sm:space-y-5">
        <dl aria-label="Resumo do período" className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
          {summaryMetrics.map(({ label, icon: Icon, value, unit, detail }) => (
            <div key={label} className="min-w-0 rounded-xl border border-zinc-800 bg-[#151518] p-3.5 sm:p-4">
              <dt className="flex items-start gap-2 text-xs font-medium text-zinc-400">
                <Icon size={16} className="shrink-0 text-orange-300" aria-hidden="true" />
                {label}
              </dt>
              <dd className="mt-2 text-xl font-bold tabular-nums text-zinc-50 sm:text-2xl">
                {value}{' '}
                {unit && <span className="text-xs font-medium text-zinc-400">{unit}</span>}
              </dd>
              {detail && <dd className="mt-0.5 text-xs text-zinc-400">{detail}</dd>}
            </div>
          ))}
        </dl>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
          <section className="min-w-0 space-y-4 rounded-xl border border-zinc-800 bg-[#151518] p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-zinc-100">Tendência semanal</h2>
              <div role="group" aria-label="Métrica do gráfico" className="flex gap-1 rounded-lg bg-[#101012] p-1">
                {trendOptions.map((option) => (
                  <button
                    type="button"
                    key={option.id}
                    aria-pressed={trend.id === option.id}
                    onClick={() => setTrend(option)}
                    className="ui-press min-h-8 rounded-md px-2.5 text-xs font-medium text-zinc-400 hover:text-zinc-100 focus-visible:outline-2 focus-visible:outline-orange-400 aria-pressed:bg-zinc-800 aria-pressed:text-orange-300"
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            {hasTrend ? (
              <div className="overflow-x-auto pb-2">
                <ul className="flex min-w-full gap-2" aria-label={`${trend.label} por semana`}>
                  {weeklyTrends.map((week) => {
                    const value = week[trend.field] ?? 0;
                    return (
                      <li key={week.startDateKey} className="flex min-w-12 flex-1 flex-col items-center gap-2 text-xs tabular-nums">
                        <span className="whitespace-nowrap font-semibold text-zinc-200">
                          {value.toLocaleString('pt-BR')}<span className="sr-only"> {trend.unit}</span>
                        </span>
                        <div className="flex h-28 w-full items-end justify-center border-b border-zinc-800">
                          <div
                            className="ui-trend-bar h-full w-[60%] max-w-14 rounded-t-md bg-orange-400"
                            style={{ scale: `1 ${value / maxTrendValue}` }}
                            aria-hidden="true"
                          />
                        </div>
                        <time dateTime={week.startDateKey} className="text-zinc-400">{week.weekLabel}</time>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : (
              <div className="flex min-h-36 items-center justify-center rounded-lg border border-dashed border-zinc-700 text-center text-sm text-zinc-400">
                Sem registros para esta métrica no período.
              </div>
            )}
          </section>
          <ReportHealthConnectCard {...healthConnectSummary} onViewSync={openSync} />
        </div>

        {/* BLOCO 3: RECUPERAÇÃO & PRONTIDÃO + ZONAS CARDÍACAS Z1-Z5 */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Recuperação & ACWR */}
          <section className="lg:col-span-5 bg-[#18181B] border border-[#27272A] rounded-lg p-5 flex flex-col justify-between space-y-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-bold text-white flex items-center gap-2">
                  <Heartbeat size={18} strokeWidth={1.75} weight="regular" className="text-emerald-400" />
                  Recuperação e prontidão
                </h2>
                <button
                  type="button"
                  disabled={loadingInsights}
                  onClick={() => void handleGenerateAiInsights()}
                  className="text-xs font-semibold text-orange-400 hover:text-orange-300 flex items-center gap-1"
                >
                  <Sparkle size={18} strokeWidth={1.75} weight="regular" />
                  {loadingInsights ? 'Analisando...' : 'Análise do Oráculo'}
                </button>
              </div>

              <div className="flex items-center gap-4 p-4 rounded-md bg-[#111113] border border-[#27272A]">
                <div className="relative w-20 h-20 shrink-0 flex items-center justify-center">
                  <svg viewBox="0 0 80 80" className="w-20 h-20 -rotate-90">
                    <circle
                      cx="40"
                      cy="40"
                      r="34"
                      fill="none"
                      stroke="#27272A"
                      strokeWidth="6"
                    />
                    <circle
                      cx="40"
                      cy="40"
                      r="34"
                      fill="none"
                      stroke={
                        recovery.score >= 75
                          ? '#10B981'
                          : recovery.score >= 55
                          ? '#F97316'
                          : '#EF4444'
                      }
                      strokeWidth="6"
                      strokeLinecap="butt"
                      strokeDasharray={`${(recovery.score / 100) * 213.6} 213.6`}
                    />
                  </svg>
                  <span className="absolute text-lg font-bold text-white font-mono-tabular tabular-nums">
                    {recovery.score}
                  </span>
                </div>

                <div className="space-y-1 min-w-0 text-left">
                  <div className="text-sm font-bold text-white">
                    Prontidão: {recovery.statusLabel}
                  </div>
                  <p className="text-xs text-zinc-400 leading-relaxed">
                    {recovery.recommendation}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-3 rounded-md bg-[#111113] border border-[#27272A] text-left">
                  <div className="text-[11px] text-zinc-500">Carga aguda / crônica</div>
                  <div className="font-bold text-white font-mono-tabular tabular-nums mt-0.5">
                    {recovery.acwrRatio}{' '}
                    <span className="text-[11px] font-sans font-normal text-zinc-400">
                      ACWR
                    </span>
                  </div>
                </div>
                <div className="p-3 rounded-md bg-[#111113] border border-[#27272A] text-left">
                  <div className="text-[11px] text-zinc-500">Sono médio (7d)</div>
                  <div className="font-bold text-zinc-100 font-mono-tabular tabular-nums mt-0.5">
                    {recovery.avgSleepHours !== null ? `${recovery.avgSleepHours} h` : '—'}
                  </div>
                </div>
                <div className="p-3 rounded-md bg-[#111113] border border-[#27272A] text-left">
                  <div className="text-[11px] text-zinc-500">FC repouso recente</div>
                  <div className="font-bold text-emerald-400 font-mono-tabular tabular-nums mt-0.5">
                    {recovery.latestRestingHr !== null
                      ? `${recovery.latestRestingHr} bpm`
                      : `${hero.restingHrBaseline ?? 60} bpm (base)`}
                  </div>
                </div>
                <div className="p-3 rounded-md bg-[#111113] border border-[#27272A] text-left">
                  <div className="text-[11px] text-zinc-500">HRV média (7d)</div>
                  <div className="font-bold text-orange-400 font-mono-tabular tabular-nums mt-0.5">
                    {recovery.avgHrvMs !== null ? `${recovery.avgHrvMs} ms` : '—'}
                  </div>
                </div>
              </div>

              {aiInsights && (
                <div className="p-3.5 rounded-md bg-[#111113] border border-[#F97316]/35 text-xs text-zinc-200 whitespace-pre-line leading-relaxed text-left">
                  {aiInsights}
                </div>
              )}
            </div>
          </section>

          {/* Zonas de Frequência Cardíaca Z1-Z5 */}
          <section className="lg:col-span-7 bg-[#18181B] border border-[#27272A] rounded-lg p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <Heart size={18} strokeWidth={1.75} weight="regular" className="text-orange-400" />
                Zonas de frequência cardíaca (Z1–Z5)
              </h2>
              <span className="text-xs text-zinc-400 font-mono-tabular tabular-nums">
                FCmáx {hero.maxHrEstimated ?? 190} bpm
              </span>
            </div>

            {/* Barra empilhada */}
            <div className="w-full h-3.5 rounded-sm bg-[#111113] border border-[#27272A] overflow-hidden flex">
              {zoneTotals.map((z) =>
                z.percentage > 0 ? (
                  <div
                    key={z.zone}
                    style={{
                      width: `${z.percentage}%`,
                      backgroundColor: z.barHex,
                    }}
                    title={`${z.label}: ${z.minutes} min (${z.percentage}%)`}
                    className="h-full transition-all duration-500"
                  />
                ) : null
              )}
            </div>

            <div className="space-y-2.5">
              {zoneTotals.map((z) => (
                <div
                  key={z.zone}
                  className="p-3 rounded-md bg-[#111113] border border-[#27272A] space-y-1.5 text-left"
                >
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`font-bold ${z.colorClass}`}>{z.label}</span>
                      <span className="text-[11px] text-zinc-500 font-mono-tabular tabular-nums">
                        {z.rangeLabel}
                      </span>
                    </div>
                    <div className="font-mono-tabular tabular-nums font-bold text-white shrink-0">
                      {z.minutes} min{' '}
                      <span className="text-zinc-400 font-normal">({z.percentage}%)</span>
                    </div>
                  </div>
                  <div className="w-full h-1.5 rounded-sm bg-[#18181B] overflow-hidden">
                    <div
                      className="h-full rounded-sm transition-all duration-500"
                      style={{
                        width: `${z.percentage}%`,
                        backgroundColor: z.barHex,
                      }}
                    />
                  </div>
                  <div className="text-[11px] text-zinc-500">{z.benefit}</div>
                </div>
              ))}
            </div>
          </section>
        </div>

      </Tabs.Content>

      <Tabs.Content value="activities" className="ui-screen-enter space-y-3">
        <section aria-labelledby="report-activities-title" className="space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="report-activities-title" className="text-base font-semibold text-zinc-100">Histórico de atividades</h2>
            <span className="text-xs tabular-nums text-zinc-400">
              {recentActivities.length} {recentActivities.length === 1 ? 'registro' : 'registros'}
            </span>
          </div>

          {recentActivities.length === 0 ? (
            <div className="space-y-2 rounded-xl border border-zinc-800 bg-[#151518] p-5 sm:p-6">
              <p className="text-sm font-semibold text-zinc-100">Nenhuma atividade neste período e origem</p>
              <p className="text-sm text-zinc-400">Altere os filtros ou sincronize seus treinos.</p>
              <button
                type="button"
                onClick={openSync}
                className="min-h-9 rounded text-sm font-medium text-orange-300 hover:text-orange-200 focus-visible:outline-2 focus-visible:outline-orange-400"
              >
                Ir para Sincronização
              </button>
            </div>
          ) : (
            <ul className="divide-y divide-zinc-800 overflow-hidden rounded-xl border border-zinc-800 bg-[#151518]">
              {recentActivities.slice(0, visibleActivityCount).map((entry) => {
                if (entry.kind === 'workout') {
                  const { log } = entry;
                  return (
                    <li key={`workout-${log.id}`} className="flex items-start justify-between gap-3 p-3.5 sm:p-4">
                      <div className="min-w-0">
                        <span className="text-xs font-medium text-orange-300">Treino do app</span>
                        <h3 className="break-words text-sm font-semibold text-zinc-100">{log.workoutName}</h3>
                        <p className="mt-1 text-xs tabular-nums text-zinc-400">
                          {formatBrazilianDate(log.dateKey)} · {log.durationMinutes} min · {log.completedExercises}/{log.totalExercises} exercícios
                          {(log.totalVolumeKg ?? 0) > 0 && ` · ${Math.round(log.totalVolumeKg ?? 0).toLocaleString('pt-BR')} kg`}
                          {(log.prCount ?? 0) > 0 && ` · ${log.prCount} PR${log.prCount === 1 ? '' : 's'}`}
                        </p>
                      </div>
                      <span className="shrink-0 text-sm font-semibold tabular-nums text-emerald-300">
                        +{log.xpEarned + log.bonusXpEarned} XP
                      </span>
                    </li>
                  );
                }

                const { activity } = entry;
                return (
                  <li key={`health-${activity.id}`}>
                    <button
                      type="button"
                      onClick={(event) => {
                        activityTrigger.current = event.currentTarget;
                        setSelectedActivity(activity);
                      }}
                      className="flex w-full items-start justify-between gap-3 p-3.5 text-left transition-colors hover:bg-zinc-800/70 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-orange-400 sm:p-4"
                    >
                      <div className="min-w-0">
                        <span className="text-xs font-medium text-emerald-300">{formatSourceLabel(activity.source)}</span>
                        <h3 className="break-words text-sm font-semibold text-zinc-100">{activity.title}</h3>
                        <p className="mt-1 text-xs tabular-nums text-zinc-400">
                          {formatBrazilianDate(activity.dateKey)} · {activity.durationMinutes} min
                          {activity.distanceKm > 0 && ` · ${activity.distanceKm.toLocaleString('pt-BR')} km`}
                          {activity.avgHeartRate && ` · ${activity.avgHeartRate} bpm`}
                        </p>
                      </div>
                      <div className="shrink-0 space-y-1 text-right">
                        {activity.xpAwarded > 0 && (
                          <div className="text-sm font-semibold tabular-nums text-emerald-300">+{activity.xpAwarded} XP</div>
                        )}
                        <div className="text-xs font-medium text-orange-300">Ver detalhes</div>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {recentActivities.length > visibleActivityCount && (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs tabular-nums text-zinc-400">
                Mostrando {visibleActivityCount} de {recentActivities.length}
              </span>
              <button
                type="button"
                onClick={() => setVisibleActivityCount((count) => count + activitiesPageSize)}
                className="min-h-10 rounded-lg border border-zinc-700 px-3 text-sm font-medium text-zinc-200 hover:bg-zinc-800 focus-visible:outline-2 focus-visible:outline-orange-400"
              >
                Mostrar mais
              </button>
            </div>
          )}
        </section>
      </Tabs.Content>

      <Tabs.Content value="progress" className="ui-screen-enter space-y-4 sm:space-y-5">
        {/* BLOCO 4A: EVOLUÇÃO DO TOTAL XP (ÚLTIMOS 30 DIAS - RECHARTS) */}
        <section className="bg-[#18181B] border border-[#27272A] rounded-lg p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="text-left">
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <Lightning size={18} strokeWidth={1.75} weight="fill" className="text-orange-400" />
                Evolução de XP em 30 dias
              </h2>
              <p className="text-xs text-zinc-400 mt-0.5">
                XP acumulado com base nos treinos registrados.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs font-mono-tabular tabular-nums">
              <div className="px-3 py-1.5 rounded-md bg-[#111113] border border-[#27272A]">
                <span className="text-zinc-400 font-sans">Treinos 30d: </span>
                <span className="font-bold text-orange-400">
                  +{xpEvolution30Days.xpInWindow.toLocaleString('pt-BR')} XP
                </span>
              </div>
              {xpEvolution30Days.bestDayXp > 0 && (
                <div className="px-3 py-1.5 rounded-md bg-[#111113] border border-[#27272A]">
                  <span className="text-zinc-400 font-sans">Pico diário: </span>
                  <span className="font-bold text-zinc-100">
                    +{xpEvolution30Days.bestDayXp.toLocaleString('pt-BR')} XP
                  </span>
                </div>
              )}
              <div className="px-3 py-1.5 rounded-md bg-[#111113] border border-emerald-500/35">
                <span className="text-zinc-400 font-sans">Atual: </span>
                <span className="font-bold text-emerald-400">
                  {stats.totalXp.toLocaleString('pt-BR')} XP
                </span>
              </div>
            </div>
          </div>

          <Suspense fallback={<div role="status" className="grid h-64 place-items-center text-sm text-zinc-400 sm:h-72">Carregando gráfico de XP…</div>}>
            <XpEvolutionChart series={xpEvolution30Days.series} />
          </Suspense>
        </section>

        {/* BLOCO 5: PATENTE RPG + HEATMAP 28 DIAS */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <section className="lg:col-span-5 bg-[#18181B] border border-[#27272A] rounded-lg p-5 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div className="text-left">
                <span className="text-xs font-medium text-zinc-400">Patente RPG</span>
                <div className="mt-1">
                  <LevelBadge level={stats.level} size="lg" showHunterRank />
                </div>
              </div>
              <div className="text-right">
                <span className="text-xs font-medium text-zinc-400">XP total</span>
                <div className="text-xl font-bold text-orange-400 font-mono-tabular tabular-nums">
                  {stats.totalXp.toLocaleString('pt-BR')} XP
                </div>
              </div>
            </div>

            <XpProgressBar totalXp={stats.totalXp} />

            <div className="grid grid-cols-2 gap-2.5 text-xs pt-1">
              <div className="p-3 rounded-md bg-[#111113] border border-[#27272A] text-left">
                <div className="text-zinc-400">Treinos app</div>
                <div className="text-lg font-bold text-emerald-400 font-mono-tabular tabular-nums">
                  {stats.totalWorkouts}
                </div>
              </div>
              <div className="p-3 rounded-md bg-[#111113] border border-[#27272A] text-left">
                <div className="text-zinc-400">Sequência atual</div>
                <div className="text-lg font-bold text-zinc-100 font-mono-tabular tabular-nums">
                  {effectiveStreak} {effectiveStreak === 1 ? 'dia' : 'dias'}
                </div>
                <div className="text-zinc-400">Recorde de {stats.longestStreak} dias</div>
              </div>
            </div>
          </section>

          <section className="lg:col-span-7 bg-[#18181B] border border-[#27272A] rounded-lg p-5 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <Flame size={18} strokeWidth={1.75} weight="regular" className="text-orange-400" />
                Consistência nos últimos 28 dias
              </h2>
              <div className="flex items-center gap-1 text-[10px] text-zinc-400">
                <span>Menos</span>
                <span className="w-3 h-3 rounded-sm bg-[#111113] border border-[#27272A]" />
                <span className="w-3 h-3 rounded-sm bg-orange-950/60 border border-orange-500/35" />
                <span className="w-3 h-3 rounded-sm bg-orange-600/75" />
                <span className="w-3 h-3 rounded-sm bg-[#F97316]" />
                <span>Mais</span>
              </div>
            </div>

            <div className="grid grid-cols-7 gap-2">
              {heatmapDays.map((cell) => {
                const bgByIntensity: Record<0 | 1 | 2 | 3, string> = {
                  0: 'bg-[#111113] border-[#27272A] text-zinc-600',
                  1: 'bg-orange-950/60 border-orange-500/35 text-orange-300',
                  2: 'bg-orange-600/75 border-orange-400/70 text-white',
                  3: 'bg-[#F97316] border-orange-300 text-zinc-950 font-bold',
                };
                const isSelected = selectedDayInfo?.dateKey === cell.dateKey;

                return (
                  <button
                    key={cell.dateKey}
                    type="button"
                    onClick={() => setSelectedDateKey(cell.dateKey)}
                    aria-label={`${formatBrazilianDate(cell.dateKey)}: ${cell.count} atividade(s)`}
                    className={`aspect-square rounded-md border flex flex-col items-center justify-center text-[11px] font-semibold font-mono-tabular tabular-nums transition-colors ${
                      bgByIntensity[cell.intensity]
                    } ${isSelected ? 'ring-2 ring-white' : 'hover:border-zinc-500'}`}
                  >
                    <span>{cell.dayNum}</span>
                    {cell.count > 0 && (
                      <span className="text-[9px] leading-none mt-0.5">{cell.count}x</span>
                    )}
                  </button>
                );
              })}
            </div>

            {selectedDayInfo && (
              <div className="p-3.5 rounded-md bg-[#111113] border border-[#27272A] flex items-center justify-between gap-3 text-xs">
                <div className="space-y-0.5 text-left">
                  <div className="font-bold text-white font-mono-tabular tabular-nums">
                    {formatBrazilianDate(selectedDayInfo.dateKey)}
                  </div>
                  <div className="text-zinc-400">
                    {selectedDayInfo.count === 0
                      ? 'Nenhuma atividade registrada nesta data.'
                      : `${selectedDayInfo.count} atividade(s) · ${selectedDayInfo.minutes} min totais`}
                  </div>
                </div>
                {selectedDayInfo.xp > 0 ? (
                  <span className="px-2.5 py-1 rounded-sm bg-emerald-500/15 border border-emerald-500/35 font-bold text-emerald-400 font-mono-tabular tabular-nums">
                    +{selectedDayInfo.xp} XP
                  </span>
                ) : (
                  <span className="text-xs text-zinc-500 font-medium">Descanso</span>
                )}
              </div>
            )}
          </section>
        </div>

        {/* BLOCO 6B: RECORDES PESSOAIS (PRs) */}
        <section className="bg-[#18181B] border border-[#27272A] rounded-lg p-5 space-y-3 text-left">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-bold text-white flex items-center gap-2">
              <TrendUp size={18} strokeWidth={1.75} weight="regular" className="text-emerald-400" />
              Recordes pessoais por exercício (PRs)
            </h2>
            <span className="text-xs font-mono-tabular tabular-nums text-zinc-400">
              {sortedPrs.length} {sortedPrs.length === 1 ? 'exercício' : 'exercícios'}
            </span>
          </div>

          {sortedPrs.length === 0 ? (
            <p className="text-xs text-zinc-400">
              Conclua séries com carga e repetições durante os treinos para registrar seus recordes e acompanhar seu 1RM estimado (Epley).
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {sortedPrs.slice(0, 9).map((pr) => (
                <div
                  key={pr.id}
                  className="p-3.5 rounded-md bg-[#111113] border border-[#27272A] space-y-1.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="text-xs font-semibold text-white truncate">
                      {pr.exerciseName}
                    </div>
                    <span className="text-[10px] font-mono-tabular tabular-nums text-zinc-500 shrink-0">
                      {formatBrazilianDate(pr.dateKey)}
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between gap-2 font-mono-tabular tabular-nums">
                    <span className="text-sm font-bold text-orange-400">
                      {pr.bestWeightKg > 0 ? `${pr.bestWeightKg} kg` : `${pr.bestReps} reps`}
                    </span>
                    <span className="text-xs font-semibold text-emerald-400">
                      {pr.estimated1RmKg > 0 ? `1RM ~${pr.estimated1RmKg} kg` : `Máx ${pr.bestReps} reps`}
                    </span>
                  </div>
                  <div className="text-[11px] text-zinc-400 font-mono-tabular tabular-nums">
                    Melhor série: {pr.bestVolumeKg > 0 ? `${pr.bestVolumeKg} kg` : `${pr.bestReps} reps`}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* BLOCO 7: CONQUISTAS RPG */}
        <section className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-sm font-bold text-white flex items-center gap-2">
              <Medal size={18} strokeWidth={1.75} weight="regular" className="text-emerald-400" />
              Conquistas da jornada (<span className="font-mono-tabular tabular-nums">{unlockedCount}/{ACHIEVEMENT_DEFINITIONS.length}</span>)
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {ACHIEVEMENT_DEFINITIONS.map((def) => {
              const record = achievementsMap[def.id];
              const unlocked = Boolean(record?.unlocked);
              const currentVal = Math.min(
                def.targetValue,
                getAchievementCurrentProgress(def.id, stats, {
                  prCountTotal: exercisePrs.length,
                  weeklyRaidDefeated,
                })
              );
              const pct = Math.min(100, Math.round((currentVal / def.targetValue) * 100));

              return (
                <div
                  key={def.id}
                  className={`p-4 rounded-lg border transition-colors space-y-2.5 text-left ${
                    unlocked
                      ? 'bg-[#18181B] border-emerald-500/40'
                      : 'bg-[#18181B] border-[#27272A] opacity-85'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={`w-9 h-9 rounded-md flex items-center justify-center shrink-0 border ${
                        unlocked
                          ? 'bg-[#111113] border-emerald-500/40 text-emerald-400'
                          : 'bg-[#111113] border-[#27272A] text-zinc-500'
                      }`}
                    >
                      <AchievementGlyph
                        id={def.id}
                        size={18}
                        className={unlocked ? 'text-emerald-400' : 'text-zinc-500'}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="font-bold text-sm text-white truncate">
                          {def.title}
                        </h3>
                        <span
                          className={`text-[11px] font-semibold shrink-0 font-mono-tabular tabular-nums ${
                            unlocked ? 'text-emerald-400' : 'text-zinc-500'
                          }`}
                        >
                          {unlocked ? 'Desbloqueada' : `${pct}%`}
                        </span>
                      </div>
                      <p className="text-xs text-zinc-400 mt-0.5">{def.description}</p>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <div className="flex justify-between text-[11px] text-zinc-400 font-mono-tabular tabular-nums">
                      <span>
                        {currentVal}/{def.targetValue} {def.metricLabel}
                      </span>
                      {unlocked && record?.unlockedAt ? (
                        <span className="text-emerald-400">
                          Em {formatBrazilianDate(record.unlockedAt)}
                        </span>
                      ) : (
                        def.bonusXp > 0 && (
                          <span className="text-orange-400 font-semibold">
                            +{def.bonusXp} XP
                          </span>
                        )
                      )}
                    </div>
                    <div className="w-full h-1.5 bg-[#111113] rounded-sm overflow-hidden">
                      <div
                        className={`h-full rounded-sm transition-all duration-500 ${
                          unlocked ? 'bg-emerald-500' : 'bg-zinc-600'
                        }`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

      </Tabs.Content>

      <Tabs.Content value="sync" forceMount hidden={section !== 'sync'} className="ui-screen-enter space-y-4 sm:space-y-5">
        <ReportHealthConnectCard {...healthConnectSummary} />
        {/* BLOCO 1: INTEGRAÇÕES DE SAÚDE (Strava OAuth + Samsung Health + Apple Health/GPX/CSV) */}
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-stretch">
          {/* Card Strava OAuth */}
          <div className="bg-[#18181B] border border-[#27272A] rounded-lg p-5 flex flex-col justify-between space-y-4">
            <div className="space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1 text-left">
                  <h2 className="text-sm font-bold text-white flex items-center gap-2">
                    <Link size={18} strokeWidth={1.75} weight="regular" className="text-orange-400 shrink-0" />
                    Strava API v3 (OAuth 2.0)
                  </h2>
                  <p className="text-xs text-zinc-400">
                    Sincronize atividades, ritmo, elevação e streams cardíacos.
                  </p>
                </div>

                <span
                  className={`text-xs font-semibold whitespace-nowrap shrink-0 ${
                    stravaConnected ? 'text-emerald-400' : 'text-zinc-500'
                  }`}
                >
                  {stravaConnected ? 'Conectado' : 'Desconectado'}
                </span>
              </div>

              {!stravaConfigured ? (
                <div className="p-3.5 rounded-md bg-[#111113] border border-amber-500/35 space-y-2 text-xs text-zinc-300">
                  <div className="font-semibold text-amber-300">
                    Configuração Strava Developer necessária
                  </div>
                  <p className="text-zinc-400 leading-relaxed">
                    Adicione <code className="text-zinc-200">STRAVA_CLIENT_ID</code> e{' '}
                    <code className="text-zinc-200">STRAVA_CLIENT_SECRET</code> nas variáveis de ambiente e cadastre esta URL de callback no Strava:
                  </p>
                  {stravaCallbackUrl && (
                    <div className="flex items-center gap-2">
                      <code className="flex-1 p-2 rounded-md bg-[#09090B] border border-[#27272A] text-[11px] font-mono-tabular text-orange-300 truncate">
                        {stravaCallbackUrl}
                      </code>
                      <button
                        type="button"
                        onClick={() => void handleCopyCallback()}
                        className="px-2.5 py-2 rounded-md bg-[#18181B] hover:bg-[#27272A] border border-[#27272A] text-zinc-200 shrink-0"
                        title="Copiar URL de callback"
                      >
                        {copiedCallback ? (
                          <Check size={18} strokeWidth={1.75} weight="regular" className="text-emerald-400" />
                        ) : (
                          <Copy size={18} strokeWidth={1.75} weight="regular" />
                        )}
                      </button>
                    </div>
                  )}
                </div>
              ) : stravaConnected && stravaAthlete ? (
                <div className="p-3.5 rounded-md bg-[#111113] border border-emerald-500/35 flex items-center justify-between gap-3">
                  <div className="min-w-0 text-left">
                    <div className="text-sm font-bold text-white truncate">
                      {stravaAthlete.firstname} {stravaAthlete.lastname}
                    </div>
                    <div className="text-xs text-zinc-400 font-mono-tabular">
                      Atleta #{stravaAthlete.id}
                      {stravaAthlete.city ? ` · ${stravaAthlete.city}` : ''}
                    </div>
                  </div>
                  <select
                    aria-label="Janela de sincronização Strava"
                    value={stravaSyncDays}
                    onChange={(e) => setStravaSyncDays(Number(e.target.value))}
                    className="px-2.5 py-1.5 rounded-md bg-[#18181B] border border-[#27272A] text-xs text-zinc-200 font-mono-tabular"
                  >
                    <option value={7}>7 dias</option>
                    <option value={30}>30 dias</option>
                    <option value={90}>90 dias</option>
                  </select>
                </div>
              ) : (
                <p className="text-xs text-zinc-400 leading-relaxed text-left">
                  Conecte sua conta Strava via janela segura para importar corridas, ciclismo, caminhadas e fluxos de BPM automaticamente.
                </p>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              {!stravaConnected ? (
                <button
                  type="button"
                  disabled={stravaBusy || !stravaConfigured}
                  onClick={() => void handleConnectStrava()}
                  className="flex-1 min-h-[42px] py-2.5 px-4 rounded-md bg-[#F97316] hover:bg-orange-400 disabled:bg-zinc-800 disabled:text-zinc-500 text-zinc-950 font-bold text-xs flex items-center justify-center gap-2 transition-colors whitespace-nowrap"
                >
                  {stravaBusy ? (
                    <ArrowsClockwise size={18} strokeWidth={1.75} weight="regular" className="animate-spin" />
                  ) : (
                    <Link size={18} strokeWidth={1.75} weight="regular" />
                  )}
                  Conectar Strava
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    disabled={stravaBusy}
                    onClick={() => void handleSyncStrava()}
                    className="flex-1 min-h-[42px] py-2.5 px-4 rounded-md bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-zinc-950 font-bold text-xs flex items-center justify-center gap-2 transition-colors whitespace-nowrap"
                  >
                    <ArrowsClockwise size={18} strokeWidth={1.75} weight="regular" className={stravaBusy ? 'animate-spin' : ''} />
                    Sincronizar atividades
                  </button>
                  <button
                    type="button"
                    disabled={stravaBusy}
                    onClick={() => void handleDisconnectStrava()}
                    className="min-h-[42px] px-3.5 py-2.5 rounded-md bg-[#111113] hover:bg-[#27272A] border border-[#27272A] text-zinc-300 text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap"
                  >
                    <LinkBreak size={18} strokeWidth={1.75} weight="regular" />
                    Desconectar
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Card Dedicado Samsung Health (CSV e JSON) */}
          <div className="bg-[#18181B] border border-[#27272A] rounded-lg p-5 flex flex-col justify-between space-y-4">
            <div className="space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 space-y-1 text-left">
                  <h2 className="text-sm font-bold text-white flex items-center gap-2">
                    <Watch size={18} strokeWidth={1.75} weight="regular" className="text-emerald-400 shrink-0" />
                    Samsung Health (CSV e JSON)
                  </h2>
                  <p className="text-xs text-zinc-400">
                    Treinos, passos, sono, FC em repouso e XP automático.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleDownloadSamsungSample}
                  className="text-xs font-semibold text-emerald-400 hover:text-emerald-300 flex items-center gap-1 whitespace-nowrap shrink-0"
                  title="Baixar CSV modelo do Samsung Health para teste"
                >
                  <DownloadSimple size={18} strokeWidth={1.75} weight="regular" />
                  Modelo CSV
                </button>
              </div>

              <p className="text-xs text-zinc-400 leading-relaxed text-left">
                Envie juntos os arquivos de <code className="text-zinc-200">exercise</code>,{' '}
                <code className="text-zinc-200">pedometer_day_summary</code>,{' '}
                <code className="text-zinc-200">sleep</code> e{' '}
                <code className="text-zinc-200">heart_rate</code> (`.csv` e `.json`).
              </p>

              <div className="rounded-md bg-[#111113] border border-[#27272A] overflow-hidden">
                <button
                  type="button"
                  onClick={() => setShowSamsungGuide((prev) => !prev)}
                  className="w-full px-3.5 py-2.5 flex items-center justify-between text-xs font-semibold text-zinc-200 hover:text-emerald-400 transition-colors"
                >
                  <span>Como exportar do celular</span>
                  {showSamsungGuide ? (
                    <CaretUp size={18} strokeWidth={1.75} weight="regular" className="text-zinc-400 shrink-0" />
                  ) : (
                    <CaretDown size={18} strokeWidth={1.75} weight="regular" className="text-zinc-400 shrink-0" />
                  )}
                </button>
                {showSamsungGuide && (
                  <ol className="px-3.5 pb-3 pt-1.5 space-y-1.5 text-[11px] text-zinc-400 border-t border-[#27272A] list-decimal list-inside leading-relaxed text-left">
                    <li>
                      Abra o app <strong className="text-zinc-200">Samsung Health</strong> e acesse{' '}
                      <strong className="text-zinc-200">Configurações</strong>.
                    </li>
                    <li>
                      Toque em <strong className="text-zinc-200">Baixar dados pessoais</strong> e salve o arquivo exportado.
                    </li>
                    <li>
                      Extraia a pasta e selecione múltiplos <code className="text-zinc-200">.csv</code> e{' '}
                      <code className="text-zinc-200">.json</code> abaixo.
                    </li>
                  </ol>
                )}
              </div>
            </div>

            <div>
              <input
                ref={samsungInputRef}
                type="file"
                accept=".csv,.json"
                multiple
                onChange={(e) => void handleSamsungFilesSelected(e)}
                className="hidden"
              />
              <button
                type="button"
                disabled={parsingFile || committingImport}
                onClick={() => samsungInputRef.current?.click()}
                className="w-full min-h-[42px] py-2.5 px-4 rounded-md bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-zinc-950 font-bold text-xs flex items-center justify-center gap-2 transition-colors whitespace-nowrap"
              >
                <UploadSimple size={18} strokeWidth={1.75} weight="regular" className="shrink-0" />
                Selecionar arquivos (.csv, .json)
              </button>
            </div>
          </div>

          {/* Card Importador Apple Health XML, GPX e CSV */}
          <div className="bg-[#18181B] border border-[#27272A] rounded-lg p-5 flex flex-col justify-between space-y-4">
            <div className="space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 space-y-1 text-left">
                  <h2 className="text-sm font-bold text-white flex items-center gap-2">
                    <UploadSimple size={18} strokeWidth={1.75} weight="regular" className="text-orange-400 shrink-0" />
                    Importar Apple Health, GPX e CSV
                  </h2>
                  <p className="text-xs text-zinc-400">
                    Envie <code className="text-zinc-300">export.xml</code>, trilhas{' '}
                    <code className="text-zinc-300">.gpx</code> ou planilhas{' '}
                    <code className="text-zinc-300">.csv</code>.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleDownloadCsvTemplate}
                  className="text-xs font-semibold text-orange-400 hover:text-orange-300 flex items-center gap-1 whitespace-nowrap shrink-0"
                >
                  <DownloadSimple size={18} strokeWidth={1.75} weight="regular" />
                  Modelo CSV
                </button>
              </div>

              <p className="text-xs text-zinc-400 leading-relaxed text-left">
                Seus dados são processados localmente com deduplicação automática antes de atualizar seus relatórios, métricas diárias e XP.
              </p>
            </div>

            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xml,.gpx,.csv"
                onChange={(e) => void handleFileSelected(e)}
                className="hidden"
              />
              <button
                type="button"
                disabled={parsingFile || committingImport}
                onClick={() => fileInputRef.current?.click()}
                className="w-full min-h-[42px] py-2.5 px-4 rounded-md bg-[#111113] hover:bg-[#27272A] disabled:opacity-50 border border-[#27272A] hover:border-[#F97316]/60 text-zinc-100 font-semibold text-xs flex items-center justify-center gap-2 transition-colors whitespace-nowrap"
              >
                <FileCsv size={18} strokeWidth={1.75} weight="regular" className="text-orange-400 shrink-0" />
                Selecionar arquivo (.xml, .gpx, .csv)
              </button>
            </div>
          </div>
        </section>

        {/* Card Google Drive: Importação de Saúde & Backup na Nuvem */}
        <GoogleDriveCard
          hero={hero}
          stats={stats}
          logs={logs}
          healthActivities={healthActivities}
          dailyMetrics={dailyMetrics}
          weightLogs={weightLogs}
          achievements={achievements}
          driveAccessToken={driveAccessToken}
          onDriveAccessTokenChange={onDriveAccessTokenChange}
          onImportParsedHealth={(parsed) => {
            setErrorMsg(null);
            setStatusMessage(null);
            setParsedPreview(parsed);
          }}
          onImportSuccessMessage={(msg) => {
            setErrorMsg(null);
            setStatusMessage(msg);
          }}
          onErrorMessage={(msg) => {
            setStatusMessage(null);
            setErrorMsg(msg);
          }}
        />

        {/* Painel de Progresso de Leitura, Envio Sequencial, Retomada e Pré-Visualização */}
        {parsingFile && (
          <div className="p-4 rounded-lg bg-[#18181B] border border-[#F97316]/45 space-y-2">
            <div className="flex justify-between text-xs text-orange-400 font-semibold font-mono-tabular tabular-nums">
              <span>{parsingLabel}</span>
              <span>{parseProgress}%</span>
            </div>
            <div className="w-full h-2 bg-[#111113] rounded-sm overflow-hidden border border-[#27272A]">
              <div
                className="h-full bg-[#F97316] transition-all duration-200"
                style={{ width: `${parseProgress}%` }}
              />
            </div>
          </div>
        )}

        {committingImport && importProgress && (
          <div className="p-5 rounded-lg bg-[#18181B] border border-[#F97316]/45 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-left">
                <h3 className="text-sm font-bold text-white">
                  Importando sequencialmente via servidor...
                </h3>
                <p className="text-xs text-zinc-400 truncate max-w-xl">
                  {importProgress.currentLabel}
                </p>
              </div>
              <span className="text-xs font-bold font-mono-tabular tabular-nums text-orange-400">
                {importProgress.processedActivities + importProgress.processedMetrics} /{' '}
                {importProgress.totalActivities + importProgress.totalMetrics}
              </span>
            </div>

            {(() => {
              const totalItems = Math.max(
                1,
                importProgress.totalActivities + importProgress.totalMetrics
              );
              const doneItems =
                importProgress.processedActivities + importProgress.processedMetrics;
              const pct = Math.min(100, Math.round((doneItems / totalItems) * 100));
              return (
                <div className="space-y-1.5">
                  <div className="w-full h-2.5 bg-[#111113] rounded-sm overflow-hidden border border-[#27272A]">
                    <div
                      className="h-full bg-emerald-500 transition-all duration-150"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono-tabular tabular-nums text-zinc-400">
                    <span>
                      Importadas: <strong className="text-emerald-400">{importProgress.importedActivities}</strong> ·
                      Duplicadas ignoradas: <strong className="text-zinc-200">{importProgress.skippedDuplicates}</strong> ·
                      Erros: <strong className="text-red-400">{importProgress.errorCount}</strong>
                    </span>
                    <span className="text-emerald-400 font-semibold">
                      +{importProgress.xpAdded} XP (servidor)
                    </span>
                  </div>
                </div>
              );
            })()}
          </div>
        )}

        {!committingImport && importSummary && (
          <div className="p-5 rounded-lg bg-[#18181B] border border-[#27272A] space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-left">
                <h3 className="text-sm font-bold text-white">
                  Resumo da importação · {importSummary.sourceLabel}
                </h3>
                <p className="text-xs text-zinc-400">
                  Processamento sequencial com deduplicação e XP validados no servidor.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setImportSummary(null);
                  setResumeBatch(null);
                }}
                className="text-zinc-400 hover:text-white p-1"
                title="Fechar resumo"
              >
                <X size={18} strokeWidth={1.75} weight="regular" />
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
              <div className="p-3 rounded-md bg-[#111113] border border-emerald-500/35 text-left">
                <div className="text-[11px] text-zinc-400">Importadas</div>
                <div className="text-lg font-bold text-emerald-400 font-mono-tabular tabular-nums mt-0.5">
                  {importSummary.result.importedActivities}
                </div>
                <div className="text-[11px] text-zinc-500 font-mono-tabular tabular-nums">
                  +{importSummary.result.xpAdded} XP · {importSummary.result.importedDays}d métricas
                </div>
              </div>

              <div className="p-3 rounded-md bg-[#111113] border border-[#27272A] text-left">
                <div className="text-[11px] text-zinc-400">Ignoradas (duplicidade)</div>
                <div className="text-lg font-bold text-zinc-200 font-mono-tabular tabular-nums mt-0.5">
                  {importSummary.result.skippedDuplicates}
                </div>
                <div className="text-[11px] text-zinc-500">Sem XP duplicado</div>
              </div>

              <div
                className={`p-3 rounded-md bg-[#111113] border text-left ${
                  importSummary.result.errorCount > 0 ? 'border-red-500/40' : 'border-[#27272A]'
                }`}
              >
                <div className="text-[11px] text-zinc-400">Com erro</div>
                <div
                  className={`text-lg font-bold font-mono-tabular tabular-nums mt-0.5 ${
                    importSummary.result.errorCount > 0 ? 'text-red-400' : 'text-zinc-300'
                  }`}
                >
                  {importSummary.result.errorCount}
                </div>
                <div className="text-[11px] text-zinc-500">
                  {resumeBatch ? 'Pronto para retomar' : 'Nenhuma pendência'}
                </div>
              </div>

              <div className="p-3 rounded-md bg-[#111113] border border-[#27272A] text-left">
                <div className="text-[11px] text-zinc-400">Limite da rodada</div>
                <div className="text-lg font-bold text-orange-400 font-mono-tabular tabular-nums mt-0.5">
                  {Math.min(
                    importSummary.result.totalOriginalActivities,
                    MAX_IMPORT_ACTIVITIES_PER_ROUND
                  )}{' '}
                  <span className="text-xs text-zinc-500">/ {MAX_IMPORT_ACTIVITIES_PER_ROUND}</span>
                </div>
                <div className="text-[11px] text-zinc-500">
                  {importSummary.result.truncatedOverLimit ? 'Arquivo excedeu 200' : 'Dentro do limite'}
                </div>
              </div>
            </div>

            {importSummary.result.truncatedOverLimit && (
              <div className="p-3 rounded-md bg-[#111113] border border-amber-500/35 text-xs text-amber-200 text-left">
                Este arquivo possuía{' '}
                <strong className="font-mono-tabular">{importSummary.result.totalOriginalActivities}</strong> atividades; esta
                rodada processou o limite de <strong className="font-mono-tabular">{MAX_IMPORT_ACTIVITIES_PER_ROUND}</strong>{' '}
                atividades mais recentes. Reimporte o arquivo depois para enviar o restante sem
                duplicar as já salvas.
              </div>
            )}

            {resumeBatch && (
              <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-md bg-[#111113] border border-red-500/35">
                <div className="text-xs text-red-200 text-left">
                  Restam{' '}
                  <strong className="font-mono-tabular">
                    {resumeBatch.activities.length} atividade(s) e {resumeBatch.dailyMetrics.length}{' '}
                    métrica(s)
                  </strong>{' '}
                  pendentes após falha. As já concluídas não serão enviadas novamente.
                </div>
                <button
                  type="button"
                  disabled={committingImport}
                  onClick={() => void handleResumeImport()}
                  className="min-h-[40px] px-4 py-2 rounded-md bg-[#F97316] hover:bg-orange-400 text-zinc-950 font-bold text-xs flex items-center gap-1.5 whitespace-nowrap"
                >
                  <ArrowsClockwise size={18} strokeWidth={1.75} weight="regular" />
                  Retomar importação
                </button>
              </div>
            )}
          </div>
        )}

        {parsedPreview && (
          <div className="p-5 rounded-lg bg-[#18181B] border border-emerald-500/40 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-left">
                <h3 className="text-sm font-bold text-white">{parsedPreview.sourceLabel}</h3>
                <p className="text-xs text-zinc-400">
                  Confira o resumo antes de enviar sequencialmente e validar o XP no servidor.
                </p>
              </div>
              <span className="font-mono-tabular tabular-nums text-xs text-emerald-400 font-bold">
                {parsedPreview.activities.length} treino(s) · {parsedPreview.dailyMetrics.length} dia(s) de métricas
              </span>
            </div>

            {previewStats?.overLimit && (
              <div className="p-3 rounded-md bg-[#111113] border border-amber-500/40 text-xs text-amber-200 leading-relaxed text-left">
                <strong>Atenção:</strong> o arquivo possui{' '}
                <strong className="font-mono-tabular">{previewStats.total}</strong> atividades,
                acima do limite de{' '}
                <strong className="font-mono-tabular">{MAX_IMPORT_ACTIVITIES_PER_ROUND}</strong>{' '}
                por rodada. Serão processadas as{' '}
                <strong className="font-mono-tabular">{MAX_IMPORT_ACTIVITIES_PER_ROUND}</strong>{' '}
                atividades mais recentes agora; para importar as demais, reenvie o arquivo em uma
                nova rodada (duplicadas serão ignoradas automaticamente).
              </div>
            )}

            {previewStats && previewStats.roundTotal > 0 && (
              <div className="text-xs text-zinc-400 font-mono-tabular tabular-nums text-left">
                Nesta rodada ({previewStats.roundTotal} atividades):{' '}
                <strong className="text-emerald-400">{previewStats.newCount} nova(s)</strong> ·{' '}
                <strong className="text-zinc-300">{previewStats.duplicateCount} já importada(s)</strong>
              </div>
            )}

            {parsedPreview.warnings.length > 0 && (
              <div className="p-3 rounded-md bg-[#111113] border border-amber-500/35 text-xs text-amber-200 text-left">
                {parsedPreview.warnings[0]}
              </div>
            )}

            {parsedPreview.dailyMetrics.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                <div className="p-2.5 rounded-md bg-[#111113] border border-[#27272A] text-left">
                  <div className="text-[11px] text-zinc-400">Dias c/ passos</div>
                  <div className="font-bold text-white font-mono-tabular tabular-nums mt-0.5">
                    {parsedPreview.dailyMetrics.filter((m) => m.steps > 0).length}
                  </div>
                </div>
                <div className="p-2.5 rounded-md bg-[#111113] border border-[#27272A] text-left">
                  <div className="text-[11px] text-zinc-400">Maior contagem passos</div>
                  <div className="font-bold text-emerald-400 font-mono-tabular tabular-nums mt-0.5">
                    {Math.max(0, ...parsedPreview.dailyMetrics.map((m) => m.steps)).toLocaleString('pt-BR')}
                  </div>
                </div>
                <div className="p-2.5 rounded-md bg-[#111113] border border-[#27272A] text-left">
                  <div className="text-[11px] text-zinc-400">Dias c/ sono</div>
                  <div className="font-bold text-zinc-200 font-mono-tabular tabular-nums mt-0.5">
                    {parsedPreview.dailyMetrics.filter((m) => m.sleepHours > 0).length}
                  </div>
                </div>
                <div className="p-2.5 rounded-md bg-[#111113] border border-[#27272A] text-left">
                  <div className="text-[11px] text-zinc-400">Dias c/ FC repouso</div>
                  <div className="font-bold text-orange-400 font-mono-tabular tabular-nums mt-0.5">
                    {parsedPreview.dailyMetrics.filter((m) => m.restingHeartRate !== null).length}
                  </div>
                </div>
              </div>
            )}

            {parsedPreview.activities.length > 0 && (
              <div className="max-h-40 overflow-y-auto space-y-1 pr-1 rounded-md bg-[#111113] border border-[#27272A] p-3">
                {parsedPreview.activities.slice(0, 12).map((act) => {
                  const dup = existingExternalIds.has(act.externalId);
                  return (
                    <div
                      key={act.externalId}
                      className="flex items-center justify-between text-xs text-zinc-300 py-1.5 border-b border-[#27272A] last:border-0"
                    >
                      <span className="truncate pr-2">
                        <span className="font-mono-tabular text-zinc-400">{act.dateKey}</span> ·{' '}
                        {act.title} ({act.durationMinutes}m
                        {act.avgHeartRate ? ` · ${act.avgHeartRate} bpm` : ''})
                      </span>
                      <span
                        className={`shrink-0 font-semibold font-mono-tabular tabular-nums ${
                          dup ? 'text-zinc-500' : 'text-emerald-400'
                        }`}
                      >
                        {dup ? 'Já importado' : `+${act.xpAwarded} XP (est.)`}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="flex items-center justify-end gap-2.5 pt-1">
              <button
                type="button"
                disabled={committingImport}
                onClick={() => setParsedPreview(null)}
                className="min-h-[42px] px-4 py-2 rounded-md bg-[#111113] hover:bg-[#27272A] border border-[#27272A] text-zinc-300 text-xs font-semibold"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={
                  committingImport ||
                  (parsedPreview.activities.length === 0 && parsedPreview.dailyMetrics.length === 0)
                }
                onClick={() => void handleConfirmFileImport()}
                className="min-h-[42px] px-5 py-2 rounded-md bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-zinc-950 font-bold text-xs"
              >
                {committingImport ? 'Salvando...' : 'Confirmar importação'}
              </button>
            </div>
          </div>
        )}

      </Tabs.Content>

      <Dialog.Root open={selectedActivity !== null} onOpenChange={(open) => !open && setSelectedActivity(null)}>
        {selectedActivity && (
          <Dialog.Portal>
            <Dialog.Overlay className="ui-dialog-overlay fixed inset-0 z-50 bg-black/80" />
            <Dialog.Content
              className="ui-dialog-enter fixed left-1/2 top-1/2 z-50 max-h-[90dvh] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 space-y-5 overflow-y-auto rounded-xl border border-zinc-700 bg-[#18181b] p-4 text-zinc-100 sm:p-6"
              onCloseAutoFocus={(event) => {
                event.preventDefault();
                activityTrigger.current?.focus();
              }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="text-left">
                  <div className="text-xs font-semibold text-orange-400 uppercase tracking-wider">
                    {formatSourceLabel(selectedActivity.source)} · {selectedActivity.sportType}
                  </div>
                  <Dialog.Title className="mt-0.5 break-words text-lg font-bold text-white">
                    {selectedActivity.title}
                  </Dialog.Title>
                  <Dialog.Description className="text-xs tabular-nums text-zinc-400">
                    {formatBrazilianDate(selectedActivity.dateKey)}
                  </Dialog.Description>
                </div>
                <Dialog.Close
                  type="button"
                  aria-label="Fechar detalhes da atividade"
                  className="grid size-10 shrink-0 place-items-center rounded-lg border border-zinc-800 bg-[#111113] text-zinc-400 hover:text-white focus-visible:outline-2 focus-visible:outline-orange-400"
                >
                  <X size={18} aria-hidden="true" />
                </Dialog.Close>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-left">
                <div className="p-3 rounded-md bg-[#111113] border border-[#27272A]">
                  <div className="text-[11px] text-zinc-400">Duração</div>
                  <div className="text-base font-bold text-white font-mono-tabular tabular-nums">
                    {selectedActivity.durationMinutes}m
                  </div>
                </div>
                <div className="p-3 rounded-md bg-[#111113] border border-[#27272A]">
                  <div className="text-[11px] text-zinc-400">Distância</div>
                  <div className="text-base font-bold text-orange-400 font-mono-tabular tabular-nums">
                    {selectedActivity.distanceKm} km
                  </div>
                </div>
                <div className="p-3 rounded-md bg-[#111113] border border-[#27272A]">
                  <div className="text-[11px] text-zinc-400">FC média/máx</div>
                  <div className="text-base font-bold text-zinc-100 font-mono-tabular tabular-nums">
                    {selectedActivity.avgHeartRate ?? '—'}/{selectedActivity.maxHeartRate ?? '—'}
                  </div>
                </div>
                <div className="p-3 rounded-md bg-[#111113] border border-[#27272A]">
                  <div className="text-[11px] text-zinc-400 flex items-center gap-1">
                    <Mountains size={18} strokeWidth={1.75} weight="regular" /> Elevação
                  </div>
                  <div className="text-base font-bold text-emerald-400 font-mono-tabular tabular-nums">
                    {selectedActivity.elevationGainM}m
                  </div>
                </div>
              </div>

              {/* Gráfico SVG da Curva Cardíaca */}
              {selectedActivity.hrSamplePoints?.length > 1 && (
                <div className="p-4 rounded-md bg-[#111113] border border-[#27272A] space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-zinc-300 flex items-center gap-1.5">
                      <Heart size={18} strokeWidth={1.75} weight="regular" className="text-orange-400" />
                      Curva de frequência cardíaca (bpm)
                    </span>
                    <span className="font-mono-tabular tabular-nums text-zinc-400">
                      {Math.min(...selectedActivity.hrSamplePoints)}–
                      {Math.max(...selectedActivity.hrSamplePoints)} bpm
                    </span>
                  </div>
                  <svg viewBox="0 0 320 90" className="w-full h-24 overflow-visible">
                    {(() => {
                      const pts = selectedActivity.hrSamplePoints;
                      const minHr = Math.min(...pts) - 5;
                      const maxHr = Math.max(...pts) + 5;
                      const span = Math.max(10, maxHr - minHr);
                      const poly = pts
                        .map((val, idx) => {
                          const x = (idx / (pts.length - 1)) * 320;
                          const y = 82 - ((val - minHr) / span) * 74;
                          return `${x.toFixed(1)},${y.toFixed(1)}`;
                        })
                        .join(' ');
                      return (
                        <polyline
                          fill="none"
                          stroke="#F97316"
                          strokeWidth="2.5"
                          strokeLinejoin="round"
                          strokeLinecap="round"
                          points={poly}
                        />
                      );
                    })()}
                  </svg>
                </div>
              )}

              {/* Zonas da Atividade */}
              <div className="space-y-2 text-left">
                <div className="text-xs font-semibold text-zinc-300">
                  Tempo por zona cardíaca nesta sessão
                </div>
                <div className="grid grid-cols-5 gap-1.5 text-left">
                  {(['Z1', 'Z2', 'Z3', 'Z4', 'Z5'] as const).map((label, idx) => (
                    <div
                      key={label}
                      className="p-2 rounded-md bg-[#111113] border border-[#27272A]"
                    >
                      <div className="text-[10px] font-semibold text-zinc-400">{label}</div>
                      <div className="text-xs font-bold text-white font-mono-tabular tabular-nums mt-0.5">
                        {selectedActivity.zoneMinutes?.[idx] ?? 0}m
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-[#27272A] text-xs">
                <span className="text-zinc-400 font-mono-tabular tabular-nums">
                  {selectedActivity.calories} kcal estimadas
                </span>
                <span className="font-bold text-emerald-400 font-mono-tabular tabular-nums flex items-center gap-1">
                  <Lightning size={18} strokeWidth={1.75} weight="fill" />+
                  {selectedActivity.xpAwarded} XP atribuídos
                </span>
              </div>
            </Dialog.Content>
          </Dialog.Portal>
        )}
      </Dialog.Root>
    </Tabs.Root>
  );
};
