import React, { useCallback, useEffect, useState } from 'react';
import {
  ArrowSquareOut,
  ArrowsClockwise,
  Cloud,
  CloudArrowUp,
  DownloadSimple,
  FileCode,
  FileCsv,
  HardDrive,
  LinkBreak,
  MagnifyingGlass,
  Trash,
  Warning,
  X,
} from '@phosphor-icons/react';
import { auth } from '../firebaseApp';
import {
  DailyHealthMetric,
  GameStats,
  HealthActivity,
  HeroProfile,
  ParsedHealthImport,
  UserAchievement,
  WeightLog,
  WorkoutLog,
} from '../types/fitness';
import {
  parseAppleHealthXmlFile,
  parseCsvHealthContent,
  parseGpxContent,
  parseSamsungHealthFiles,
} from '../utils/healthParsers';
import {
  DriveAuthExpiredError,
  DriveBackupPayload,
  DriveFileFilterMode,
  DriveFileItem,
  connectGoogleDrivePopup,
  createDriveBackupFile,
  deleteDriveFile,
  downloadDriveFileText,
  isFitnessBackupFile,
  listDriveFiles,
  parseDriveBackupJson,
  updateDriveBackupFile,
} from '../utils/googleDrive';
import { getFriendlyErrorMessage, getLocalDateKey } from '../utils/rpgLogic';

interface GoogleDriveCardProps {
  hero: HeroProfile;
  stats: GameStats;
  logs: WorkoutLog[];
  healthActivities: HealthActivity[];
  dailyMetrics: DailyHealthMetric[];
  weightLogs: WeightLog[];
  achievements: UserAchievement[];
  driveAccessToken: string | null;
  onDriveAccessTokenChange: (token: string | null) => void;
  onImportParsedHealth: (parsed: ParsedHealthImport) => void;
  onImportSuccessMessage: (msg: string) => void;
  onErrorMessage: (msg: string) => void;
}

type PendingDriveMutation =
  | {
      kind: 'create';
      filename: string;
    }
  | {
      kind: 'overwrite';
      file: DriveFileItem;
    }
  | {
      kind: 'delete';
      file: DriveFileItem;
    };

function formatFileSize(sizeStr?: string): string {
  const bytes = Number(sizeStr ?? 0);
  if (!Number.isFinite(bytes) || bytes <= 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDriveDate(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return d.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function isSupportedImportName(name: string): boolean {
  const lower = name.toLowerCase();
  return (
    lower.endsWith('.csv') ||
    lower.endsWith('.json') ||
    lower.endsWith('.gpx') ||
    lower.endsWith('.xml')
  );
}

export const GoogleDriveCard: React.FC<GoogleDriveCardProps> = ({
  hero,
  stats,
  logs,
  healthActivities,
  dailyMetrics,
  weightLogs,
  achievements,
  driveAccessToken,
  onDriveAccessTokenChange,
  onImportParsedHealth,
  onImportSuccessMessage,
  onErrorMessage,
}) => {
  const [files, setFiles] = useState<DriveFileItem[]>([]);
  const [filterMode, setFilterMode] = useState<DriveFileFilterMode>('health');
  const [searchInput, setSearchInput] = useState<string>('');
  const [appliedSearch, setAppliedSearch] = useState<string>('');
  const [loadingFiles, setLoadingFiles] = useState<boolean>(false);
  const [connecting, setConnecting] = useState<boolean>(false);
  const [busyFileId, setBusyFileId] = useState<string | null>(null);
  const [mutating, setMutating] = useState<boolean>(false);

  const [pendingMutation, setPendingMutation] =
    useState<PendingDriveMutation | null>(null);
  const [backupPreview, setBackupPreview] = useState<{
    file: DriveFileItem;
    payload: DriveBackupPayload;
    rawJson: string;
  } | null>(null);

  const buildBackupPayload = useCallback(
    (): DriveBackupPayload => ({
      schemaVersion: 1,
      app: 'fitness-rpg',
      exportedAt: new Date().toISOString(),
      hero,
      stats,
      logs,
      healthActivities,
      dailyMetrics,
      weightLogs,
      achievements,
    }),
    [hero, stats, logs, healthActivities, dailyMetrics, weightLogs, achievements]
  );

  const refreshFiles = useCallback(
    async (tokenOverride?: string): Promise<void> => {
      const token = tokenOverride ?? driveAccessToken;
      if (!token) return;
      setLoadingFiles(true);
      try {
        const list = await listDriveFiles(token, {
          filterMode,
          searchQuery: appliedSearch,
        });
        setFiles(list);
      } catch (err: unknown) {
        if (err instanceof DriveAuthExpiredError) {
          onDriveAccessTokenChange(null);
          setFiles([]);
        }
        onErrorMessage(getFriendlyErrorMessage(err));
      } finally {
        setLoadingFiles(false);
      }
    },
    [
      driveAccessToken,
      filterMode,
      appliedSearch,
      onDriveAccessTokenChange,
      onErrorMessage,
    ]
  );

  useEffect(() => {
    if (driveAccessToken) {
      void refreshFiles(driveAccessToken);
    } else {
      setFiles([]);
    }
  }, [driveAccessToken, filterMode, appliedSearch, refreshFiles]);

  const handleConfigureDrive = async (): Promise<void> => {
    setConnecting(true);
    try {
      const token = await connectGoogleDrivePopup(auth, hero.userId);
      onDriveAccessTokenChange(token);
      onImportSuccessMessage(
        'Google Drive configurado com sucesso. Seus arquivos de saúde e backups já podem ser acessados.'
      );
    } catch (err: unknown) {
      onErrorMessage((err as { code?: string })?.code === 'auth/user-mismatch'
        ? 'Selecione a mesma conta Google usada no Fitness RPG.'
        : getFriendlyErrorMessage(err));
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnectDrive = (): void => {
    onDriveAccessTokenChange(null);
    setFiles([]);
    setBackupPreview(null);
    onImportSuccessMessage('Permissão de sessão do Google Drive encerrada.');
  };

  const handleImportFromDrive = async (file: DriveFileItem): Promise<void> => {
    if (!driveAccessToken) return;
    if (!isSupportedImportName(file.name)) {
      onErrorMessage(
        `Formato não suportado para "${file.name}". Selecione um arquivo .csv, .json, .gpx ou .xml.`
      );
      return;
    }

    setBusyFileId(file.id);
    try {
      const content = await downloadDriveFileText(driveAccessToken, file.id);
      const lower = file.name.toLowerCase();
      const maxHr = hero.maxHrEstimated ?? 190;

      if (lower.endsWith('.json')) {
        const backup = parseDriveBackupJson(content);
        if (backup) {
          setBackupPreview({ file, payload: backup, rawJson: content });
          return;
        }
        const jsonFile = new File([content], file.name, {
          type: 'application/json',
        });
        const parsed = await parseSamsungHealthFiles([jsonFile], maxHr);
        onImportParsedHealth(parsed);
        return;
      }

      if (lower.endsWith('.gpx')) {
        const parsed = parseGpxContent(content, file.name, maxHr);
        onImportParsedHealth(parsed);
        return;
      }

      if (lower.endsWith('.csv')) {
        const csvFile = new File([content], file.name, { type: 'text/csv' });
        const samsungAttempt = await parseSamsungHealthFiles([csvFile], maxHr);
        if (
          samsungAttempt.activities.length > 0 ||
          samsungAttempt.dailyMetrics.length > 0
        ) {
          onImportParsedHealth(samsungAttempt);
          return;
        }
        const parsed = parseCsvHealthContent(content, file.name, maxHr);
        onImportParsedHealth(parsed);
        return;
      }

      if (lower.endsWith('.xml')) {
        const xmlFile = new File([content], file.name, { type: 'text/xml' });
        const parsed = await parseAppleHealthXmlFile(xmlFile, maxHr);
        onImportParsedHealth(parsed);
      }
    } catch (err: unknown) {
      if (err instanceof DriveAuthExpiredError) {
        onDriveAccessTokenChange(null);
        setFiles([]);
      }
      onErrorMessage(getFriendlyErrorMessage(err));
    } finally {
      setBusyFileId(null);
    }
  };

  const handleConfirmMutation = async (): Promise<void> => {
    if (!pendingMutation || !driveAccessToken) return;
    setMutating(true);
    try {
      if (pendingMutation.kind === 'create') {
        const payload = buildBackupPayload();
        const created = await createDriveBackupFile(
          driveAccessToken,
          pendingMutation.filename,
          payload
        );
        onImportSuccessMessage(
          `Backup "${created.name}" salvo na pasta Fitness RPG Backups do Google Drive.`
        );
        setPendingMutation(null);
        await refreshFiles(driveAccessToken);
      } else if (pendingMutation.kind === 'overwrite') {
        const payload = buildBackupPayload();
        const updated = await updateDriveBackupFile(
          driveAccessToken,
          pendingMutation.file.id,
          pendingMutation.file.name,
          payload
        );
        onImportSuccessMessage(
          `Backup "${updated.name}" atualizado no Google Drive com seus dados mais recentes.`
        );
        setPendingMutation(null);
        await refreshFiles(driveAccessToken);
      } else if (pendingMutation.kind === 'delete') {
        await deleteDriveFile(driveAccessToken, pendingMutation.file.id);
        onImportSuccessMessage(
          `Arquivo "${pendingMutation.file.name}" removido do Google Drive.`
        );
        setFiles((prev) => prev.filter((f) => f.id !== pendingMutation.file.id));
        if (backupPreview?.file.id === pendingMutation.file.id) {
          setBackupPreview(null);
        }
        setPendingMutation(null);
      }
    } catch (err: unknown) {
      if (err instanceof DriveAuthExpiredError) {
        onDriveAccessTokenChange(null);
        setFiles([]);
      }
      onErrorMessage(getFriendlyErrorMessage(err));
    } finally {
      setMutating(false);
    }
  };

  const handleImportActivitiesFromBackup = (): void => {
    if (!backupPreview) return;
    const { payload, file } = backupPreview;
    const activitiesWithoutUser = payload.healthActivities.map(
      ({ userId: _omit, ...rest }) => rest
    );
    const metricsWithoutUser = payload.dailyMetrics.map(
      ({ userId: _omit, ...rest }) => rest
    );
    onImportParsedHealth({
      sourceLabel: `Backup Google Drive (${file.name})`,
      activities: activitiesWithoutUser,
      dailyMetrics: metricsWithoutUser,
      warnings:
        activitiesWithoutUser.length === 0 && metricsWithoutUser.length === 0
          ? ['Este backup não contém atividades externas ou métricas diárias de saúde.']
          : [],
    });
    setBackupPreview(null);
  };

  const handleDownloadBackupCopy = (): void => {
    if (!backupPreview) return;
    const blob = new Blob([backupPreview.rawJson], {
      type: 'application/json;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = backupPreview.file.name;
    a.click();
    URL.revokeObjectURL(url);
  };

  const defaultBackupFilename = `fitness-rpg-backup-${getLocalDateKey()}.json`;

  return (
    <div className="bg-[#18181B] border border-[#27272A] rounded-lg p-5 space-y-4 text-left">
      {/* Cabeçalho */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-md bg-[#111113] border border-[#27272A] flex items-center justify-center text-orange-400 shrink-0">
            <HardDrive size={18} strokeWidth={1.75} weight="regular" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-bold text-white">
                Google Drive (importação e backup na nuvem)
              </h2>
              <span
                className={`text-[11px] font-semibold font-mono-tabular ${
                  driveAccessToken ? 'text-emerald-400' : 'text-zinc-500'
                }`}
              >
                · {driveAccessToken ? 'Conectado em sessão' : 'Desconectado'}
              </span>
            </div>
            <p className="text-xs text-zinc-400 mt-0.5 leading-relaxed">
              Importe exportações do Samsung Health, Apple Health, GPX ou CSV direto do Google Drive e salve backups completos.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {!driveAccessToken ? (
            <button
              type="button"
              disabled={connecting}
              onClick={() => void handleConfigureDrive()}
              className="min-h-[42px] px-4 py-2 rounded-md bg-[#F97316] hover:bg-orange-400 disabled:opacity-50 text-zinc-950 font-semibold text-xs flex items-center gap-2 transition-colors whitespace-nowrap cursor-pointer"
            >
              {connecting ? (
                <ArrowsClockwise size={18} strokeWidth={1.75} weight="regular" className="animate-spin" />
              ) : (
                <Cloud size={18} strokeWidth={1.75} weight="regular" />
              )}
              {connecting ? 'Autorizando...' : 'Configurar Google Drive'}
            </button>
          ) : (
            <>
              <button
                type="button"
                disabled={mutating}
                onClick={() =>
                  setPendingMutation({
                    kind: 'create',
                    filename: defaultBackupFilename,
                  })
                }
                className="min-h-[40px] px-3.5 py-2 rounded-md bg-[#F97316] hover:bg-orange-400 disabled:opacity-50 text-zinc-950 font-semibold text-xs flex items-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer"
              >
                <CloudArrowUp size={18} strokeWidth={1.75} weight="regular" />
                Novo backup no Drive
              </button>
              <button
                type="button"
                disabled={loadingFiles}
                onClick={() => void refreshFiles()}
                className="min-h-[40px] px-3 py-2 rounded-md bg-[#111113] hover:bg-zinc-800 border border-[#27272A] text-zinc-200 text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
              >
                <ArrowsClockwise
                  size={18} strokeWidth={1.75}
                  weight="regular"
                  className={`text-orange-400 ${
                    loadingFiles ? 'animate-spin' : ''
                  }`}
                />
                Atualizar
              </button>
              <button
                type="button"
                onClick={handleDisconnectDrive}
                className="min-h-[40px] px-3 py-2 rounded-md bg-[#111113] hover:bg-zinc-800 border border-[#27272A] text-zinc-400 hover:text-white text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                title="Encerrar token em memória desta sessão"
              >
                <LinkBreak size={18} strokeWidth={1.75} weight="regular" />
                Desconectar
              </button>
            </>
          )}
        </div>
      </div>

      {/* Estado desconectado vs conectado */}
      {!driveAccessToken ? (
        <div className="p-3.5 rounded-md bg-[#111113] border border-[#27272A] text-xs text-zinc-400">
          Ao conectar, você autoriza a leitura de arquivos para importação e a gravação de backups criados pelo app.
          A conexão fica ativa nesta sessão até você desconectar ou sair.
        </div>
      ) : (
        <div className="space-y-3">
          {/* Barra de filtro e busca */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
            <div className="flex items-center gap-1 p-1 rounded-md bg-[#111113] border border-[#27272A] overflow-x-auto">
              {(
                [
                  { id: 'health', label: 'Arquivos de saúde' },
                  { id: 'backups', label: 'Backups RPG' },
                  { id: 'all', label: 'Todos do Drive' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setFilterMode(tab.id)}
                  className={`px-3 py-1.5 rounded-sm text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                    filterMode === tab.id
                      ? 'bg-[#F97316] text-zinc-950'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                setAppliedSearch(searchInput.trim());
              }}
              className="flex items-center gap-1.5 flex-1 sm:max-w-xs"
            >
              <div className="relative flex-1">
                <MagnifyingGlass size={18} strokeWidth={1.75} weight="regular" className="text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="Buscar arquivo no Drive..."
                  className="w-full pl-8 pr-3 py-2 rounded-md bg-[#111113] border border-[#27272A] text-xs text-white placeholder:text-zinc-500 focus:outline-none focus:border-orange-500"
                />
              </div>
              <button
                type="submit"
                className="px-3 py-2 rounded-md bg-[#111113] hover:bg-zinc-800 border border-[#27272A] text-xs font-semibold text-zinc-200 whitespace-nowrap cursor-pointer"
              >
                Buscar
              </button>
              {appliedSearch && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchInput('');
                    setAppliedSearch('');
                  }}
                  className="p-2 rounded-md bg-[#111113] border border-[#27272A] text-zinc-400 hover:text-white cursor-pointer"
                  aria-label="Limpar busca"
                >
                  <X size={18} strokeWidth={1.75} weight="regular" />
                </button>
              )}
            </form>
          </div>

          {/* Lista de arquivos */}
          {loadingFiles ? (
            <div className="p-6 rounded-md bg-[#111113] border border-[#27272A] flex items-center justify-center gap-2 text-xs text-zinc-400">
              <ArrowsClockwise size={18} strokeWidth={1.75} weight="regular" className="animate-spin text-orange-400" />
              Carregando arquivos do Google Drive...
            </div>
          ) : files.length === 0 ? (
            <div className="p-5 rounded-md bg-[#111113] border border-[#27272A] text-left space-y-1">
              <div className="text-xs font-semibold text-zinc-300">
                Nenhum arquivo encontrado neste filtro
              </div>
              <p className="text-[11px] text-zinc-500">
                Envie arquivos .csv, .json, .gpx ou .xml para o seu Google Drive ou crie um novo backup RPG acima.
              </p>
            </div>
          ) : (
            <div className="max-h-72 overflow-y-auto space-y-2 pr-1">
              {files.map((file) => {
                const isBackup = isFitnessBackupFile(file);
                const canImport = isSupportedImportName(file.name);
                const isBusy = busyFileId === file.id;

                return (
                  <div
                    key={file.id}
                    className="p-3 rounded-md bg-[#111113] border border-[#27272A] flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
                  >
                    <div className="flex items-start gap-2.5 min-w-0">
                      <div className="w-9 h-9 rounded-md flex items-center justify-center shrink-0 bg-[#18181B] border border-[#27272A] text-orange-400">
                        {isBackup ? (
                          <FileCode size={18} strokeWidth={1.75} weight="regular" />
                        ) : (
                          <FileCsv size={18} strokeWidth={1.75} weight="regular" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-white truncate">
                            {file.name}
                          </span>
                          {isBackup && (
                            <span className="text-[10px] font-semibold text-orange-400 uppercase tracking-wider shrink-0">
                              Backup RPG
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-zinc-400 font-mono-tabular tabular-nums flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5">
                          <span>{formatDriveDate(file.modifiedTime)}</span>
                          <span>· {formatFileSize(file.size)}</span>
                          {file.webViewLink && (
                            <a
                              href={file.webViewLink}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-0.5 text-orange-400 hover:text-orange-300 font-sans"
                            >
                              Abrir no Drive
                              <ArrowSquareOut size={18} strokeWidth={1.75} weight="regular" />
                            </a>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                      {canImport && (
                        <button
                          type="button"
                          disabled={isBusy || mutating}
                          onClick={() => void handleImportFromDrive(file)}
                          className="px-3 py-1.5 rounded-md bg-[#10B981] hover:bg-emerald-400 disabled:opacity-50 text-zinc-950 font-semibold text-[11px] flex items-center gap-1 transition-colors cursor-pointer"
                        >
                          {isBusy ? (
                            <ArrowsClockwise size={18} strokeWidth={1.75} weight="regular" className="animate-spin" />
                          ) : (
                            <DownloadSimple size={18} strokeWidth={1.75} weight="regular" />
                          )}
                          {isBackup ? 'Inspecionar' : 'Importar'}
                        </button>
                      )}

                      {isBackup && (
                        <button
                          type="button"
                          disabled={isBusy || mutating}
                          onClick={() =>
                            setPendingMutation({ kind: 'overwrite', file })
                          }
                          className="px-3 py-1.5 rounded-md bg-[#18181B] hover:bg-zinc-800 border border-[#27272A] text-zinc-200 font-semibold text-[11px] flex items-center gap-1 transition-colors cursor-pointer"
                          title="Sobrescrever este backup com seus dados atuais"
                        >
                          <ArrowsClockwise size={18} strokeWidth={1.75} weight="regular" className="text-orange-400" />
                          Atualizar
                        </button>
                      )}

                      <button
                        type="button"
                        disabled={isBusy || mutating}
                        onClick={() => setPendingMutation({ kind: 'delete', file })}
                        className="px-2.5 py-1.5 rounded-md bg-[#18181B] hover:bg-red-500/10 border border-[#27272A] hover:border-red-500/40 text-zinc-400 hover:text-red-400 font-semibold text-[11px] flex items-center gap-1 transition-colors cursor-pointer"
                        title="Excluir arquivo do Google Drive"
                      >
                        <Trash size={18} strokeWidth={1.75} weight="regular" />
                        Excluir
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Pré-visualização de Backup JSON baixado do Drive */}
          {backupPreview && (
            <div className="p-4 rounded-md bg-[#111113] border border-orange-500/45 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-xs font-semibold text-orange-400 uppercase tracking-wider">
                    Pré-visualização de backup · {backupPreview.file.name}
                  </div>
                  <div className="text-xs text-zinc-400 mt-0.5">
                    Herói <strong className="text-white">{backupPreview.payload.hero.name}</strong> · Nível {backupPreview.payload.stats.level} ·{' '}
                    <span className="font-mono-tabular tabular-nums">
                      {backupPreview.payload.stats.totalXp.toLocaleString('pt-BR')} XP
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setBackupPreview(null)}
                  className="p-1.5 rounded-md bg-[#18181B] text-zinc-400 hover:text-white cursor-pointer"
                >
                  <X size={18} strokeWidth={1.75} weight="regular" />
                </button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono-tabular tabular-nums">
                <div className="p-2.5 rounded-md bg-[#18181B] border border-[#27272A]">
                  <div className="text-[10px] text-zinc-400 font-sans">Treinos RPG</div>
                  <div className="font-bold text-white mt-0.5">
                    {backupPreview.payload.logs.length}
                  </div>
                </div>
                <div className="p-2.5 rounded-md bg-[#18181B] border border-[#27272A]">
                  <div className="text-[10px] text-zinc-400 font-sans">Ativ. saúde</div>
                  <div className="font-bold text-orange-400 mt-0.5">
                    {backupPreview.payload.healthActivities.length}
                  </div>
                </div>
                <div className="p-2.5 rounded-md bg-[#18181B] border border-[#27272A]">
                  <div className="text-[10px] text-zinc-400 font-sans">Dias métricas</div>
                  <div className="font-bold text-emerald-400 mt-0.5">
                    {backupPreview.payload.dailyMetrics.length}
                  </div>
                </div>
                <div className="p-2.5 rounded-md bg-[#18181B] border border-[#27272A]">
                  <div className="text-[10px] text-zinc-400 font-sans">Pesagens</div>
                  <div className="font-bold text-zinc-200 mt-0.5">
                    {backupPreview.payload.weightLogs?.length ?? 0}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={handleDownloadBackupCopy}
                  className="px-3.5 py-2 rounded-md bg-[#18181B] hover:bg-zinc-800 border border-[#27272A] text-zinc-200 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                >
                  <DownloadSimple size={18} strokeWidth={1.75} weight="regular" />
                  Baixar JSON
                </button>
                <button
                  type="button"
                  onClick={handleImportActivitiesFromBackup}
                  className="px-4 py-2 rounded-md bg-[#10B981] hover:bg-emerald-400 text-zinc-950 font-semibold text-xs cursor-pointer"
                >
                  Restaurar atividades e métricas
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Modal de Confirmação Obrigatória para Mutações/Exclusões no Google Drive */}
      {pendingMutation && (
        <div className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4">
          <div className="bg-[#18181B] border border-[#27272A] rounded-lg max-w-md w-full p-6 space-y-4 text-left">
            <div className="flex items-start gap-3">
              <div
                className={`w-10 h-10 rounded-md flex items-center justify-center shrink-0 border bg-[#111113] ${
                  pendingMutation.kind === 'delete'
                    ? 'border-red-500/45 text-red-400'
                    : 'border-orange-500/45 text-orange-400'
                }`}
              >
                <Warning size={18} strokeWidth={1.75} weight="regular" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-bold text-white">
                  {pendingMutation.kind === 'create'
                    ? 'Confirmar novo backup no Google Drive'
                    : pendingMutation.kind === 'overwrite'
                    ? 'Confirmar sobrescrita de arquivo'
                    : 'Confirmar exclusão no Google Drive'}
                </h3>
                <p className="text-xs text-zinc-300 leading-relaxed">
                  {pendingMutation.kind === 'create' && (
                    <>
                      Deseja criar o arquivo{' '}
                      <strong className="text-white">{pendingMutation.filename}</strong>{' '}
                      na pasta <strong className="text-orange-400">Fitness RPG Backups</strong> com {logs.length} treino(s), {healthActivities.length} atividade(s) de saúde, {dailyMetrics.length} dia(s) de métricas e {weightLogs.length} pesagem(ns)?
                    </>
                  )}
                  {pendingMutation.kind === 'overwrite' && (
                    <>
                      Esta ação irá substituir o conteúdo atual de{' '}
                      <strong className="text-white">{pendingMutation.file.name}</strong>{' '}
                      no seu Google Drive pelos seus dados locais atuais ({logs.length} treino(s), {healthActivities.length} atividade(s) e {weightLogs.length} pesagem(ns)).
                    </>
                  )}
                  {pendingMutation.kind === 'delete' && (
                    <>
                      Esta ação irá excluir permanentemente{' '}
                      <strong className="text-red-400">{pendingMutation.file.name}</strong>{' '}
                      do seu Google Drive. Seus dados já salvos no app não serão apagados.
                    </>
                  )}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                disabled={mutating}
                onClick={() => setPendingMutation(null)}
                className="min-h-[40px] px-4 py-2 rounded-md bg-[#111113] hover:bg-zinc-800 border border-[#27272A] text-zinc-300 text-xs font-semibold cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={mutating}
                onClick={() => void handleConfirmMutation()}
                className={`min-h-[40px] px-5 py-2 rounded-md font-semibold text-xs flex items-center gap-1.5 cursor-pointer ${
                  pendingMutation.kind === 'delete'
                    ? 'bg-red-600 hover:bg-red-500 text-white'
                    : 'bg-[#F97316] hover:bg-orange-400 text-zinc-950'
                } disabled:opacity-50`}
              >
                {mutating && <ArrowsClockwise size={18} strokeWidth={1.75} weight="regular" className="animate-spin" />}
                {mutating
                  ? 'Processando...'
                  : pendingMutation.kind === 'delete'
                  ? 'Confirmar exclusão'
                  : pendingMutation.kind === 'overwrite'
                  ? 'Confirmar sobrescrita'
                  : 'Confirmar envio'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
