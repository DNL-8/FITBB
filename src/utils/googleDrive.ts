import { GoogleAuthProvider, reauthenticateWithPopup, type Auth } from 'firebase/auth';
import type {
  DailyHealthMetric,
  GameStats,
  HealthActivity,
  HeroProfile,
  UserAchievement,
  WeightLog,
  WorkoutLog,
} from '../types/fitness';

const GOOGLE_DRIVE_SCOPES = [
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/drive.readonly',
] as const;

const DRIVE_FOLDER_NAME = 'Fitness RPG Backups';
const DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD_BASE = 'https://www.googleapis.com/upload/drive/v3';

export interface DriveFileItem {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  modifiedTime?: string;
  webViewLink?: string;
  appProperties?: Record<string, string>;
}

export interface DriveBackupPayload {
  schemaVersion: 1;
  app: 'fitness-rpg';
  exportedAt: string;
  hero: HeroProfile;
  stats: GameStats;
  logs: WorkoutLog[];
  healthActivities: HealthActivity[];
  dailyMetrics: DailyHealthMetric[];
  weightLogs: WeightLog[];
  achievements: UserAchievement[];
}

export class DriveAuthExpiredError extends Error {
  constructor(message = 'Sua sessão do Google Drive expirou. Conecte novamente.') {
    super(message);
    this.name = 'DriveAuthExpiredError';
  }
}

export async function connectGoogleDrivePopup(auth: Auth, uid: string): Promise<string> {
  const user = auth.currentUser;
  if (!user || user.uid !== uid) {
    throw new Error('Entre novamente no Fitness RPG antes de conectar o Google Drive.');
  }
  const provider = new GoogleAuthProvider();
  for (const scope of GOOGLE_DRIVE_SCOPES) {
    provider.addScope(scope);
  }
  provider.setCustomParameters({ prompt: 'consent' });

  const result = await reauthenticateWithPopup(user, provider);
  if (result.user.uid !== uid || auth.currentUser?.uid !== uid) {
    throw new Error('Conecte o Google Drive com a mesma conta usada no Fitness RPG.');
  }
  const token = GoogleAuthProvider.credentialFromResult(result)?.accessToken?.trim();
  if (!token) {
    throw new Error(
      'Não foi possível obter a permissão do Google Drive. Autorize os escopos na janela do Google.'
    );
  }
  return token;
}

async function handleDriveResponseError(res: Response): Promise<never> {
  if (res.status === 401) {
    throw new DriveAuthExpiredError();
  }
  let detail = `Erro ${res.status} na API do Google Drive.`;
  try {
    const json = (await res.json()) as { error?: { message?: string } };
    if (json?.error?.message) {
      detail = json.error.message;
    }
  } catch {
    // Fallback para mensagem padrão
  }
  throw new Error(detail);
}

export type DriveFileFilterMode = 'health' | 'backups' | 'all';

export async function listDriveFiles(
  token: string,
  options?: {
    filterMode?: DriveFileFilterMode;
    searchQuery?: string;
  }
): Promise<DriveFileItem[]> {
  const filterMode = options?.filterMode ?? 'health';
  const rawSearch = (options?.searchQuery ?? '').trim().replace(/'/g, "\\'");

  const clauses: string[] = [
    'trashed = false',
    "mimeType != 'application/vnd.google-apps.folder'",
  ];

  if (filterMode === 'health') {
    clauses.push(
      "(name contains '.csv' or name contains '.json' or name contains '.gpx' or name contains '.xml' or mimeType = 'text/csv' or mimeType = 'application/json')"
    );
  } else if (filterMode === 'backups') {
    clauses.push(
      "(appProperties has { key='fitnessRpgBackup' and value='true' } or name contains 'fitness-rpg-backup')"
    );
  }

  if (rawSearch) {
    clauses.push(`name contains '${rawSearch}'`);
  }

  const params = new URLSearchParams({
    q: clauses.join(' and '),
    fields: 'files(id,name,mimeType,size,modifiedTime,webViewLink,appProperties)',
    orderBy: 'modifiedTime desc',
    pageSize: '30',
  });

  const res = await fetch(`${DRIVE_API_BASE}/files?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    await handleDriveResponseError(res);
  }
  const data = (await res.json()) as { files?: DriveFileItem[] };
  return data.files ?? [];
}

export async function downloadDriveFileText(
  token: string,
  fileId: string
): Promise<string> {
  const res = await fetch(
    `${DRIVE_API_BASE}/files/${encodeURIComponent(fileId)}?alt=media`,
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );
  if (!res.ok) {
    await handleDriveResponseError(res);
  }
  return await res.text();
}

async function ensureFitnessRpgFolder(token: string): Promise<string | null> {
  try {
    const q = `name = '${DRIVE_FOLDER_NAME}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
    const params = new URLSearchParams({
      q,
      fields: 'files(id,name)',
      pageSize: '1',
    });
    const listRes = await fetch(`${DRIVE_API_BASE}/files?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (listRes.ok) {
      const data = (await listRes.json()) as { files?: Array<{ id: string }> };
      if (data.files && data.files.length > 0) {
        return data.files[0].id;
      }
    }

    const createRes = await fetch(`${DRIVE_API_BASE}/files?fields=id`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: DRIVE_FOLDER_NAME,
        mimeType: 'application/vnd.google-apps.folder',
      }),
    });
    if (createRes.ok) {
      const folder = (await createRes.json()) as { id?: string };
      return folder.id ?? null;
    }
  } catch {
    // Se não for possível criar pasta, salva na raiz normalmente
  }
  return null;
}

function buildMultipartBody(
  metadata: Record<string, unknown>,
  jsonContent: string
): { boundary: string; body: string } {
  const boundary = `fitness_rpg_boundary_${Date.now()}`;
  const body =
    `--${boundary}\r\n` +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    `${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\n` +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    `${jsonContent}\r\n` +
    `--${boundary}--`;
  return { boundary, body };
}

export async function createDriveBackupFile(
  token: string,
  filename: string,
  payload: DriveBackupPayload
): Promise<DriveFileItem> {
  const folderId = await ensureFitnessRpgFolder(token);
  const metadata: Record<string, unknown> = {
    name: filename,
    mimeType: 'application/json',
    description: `Backup automático Fitness RPG — Herói ${payload.hero.name}`,
    appProperties: {
      fitnessRpgBackup: 'true',
      heroName: payload.hero.name.slice(0, 40),
    },
  };
  if (folderId) {
    metadata.parents = [folderId];
  }

  const { boundary, body } = buildMultipartBody(
    metadata,
    JSON.stringify(payload, null, 2)
  );

  const res = await fetch(
    `${DRIVE_UPLOAD_BASE}/files?uploadType=multipart&fields=id,name,mimeType,size,modifiedTime,webViewLink,appProperties`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body,
    }
  );
  if (!res.ok) {
    await handleDriveResponseError(res);
  }
  return (await res.json()) as DriveFileItem;
}

export async function updateDriveBackupFile(
  token: string,
  fileId: string,
  filename: string,
  payload: DriveBackupPayload
): Promise<DriveFileItem> {
  const metadata: Record<string, unknown> = {
    name: filename,
    mimeType: 'application/json',
    description: `Backup atualizado Fitness RPG — Herói ${payload.hero.name}`,
    appProperties: {
      fitnessRpgBackup: 'true',
      heroName: payload.hero.name.slice(0, 40),
    },
  };

  const { boundary, body } = buildMultipartBody(
    metadata,
    JSON.stringify(payload, null, 2)
  );

  const res = await fetch(
    `${DRIVE_UPLOAD_BASE}/files/${encodeURIComponent(fileId)}?uploadType=multipart&fields=id,name,mimeType,size,modifiedTime,webViewLink,appProperties`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body,
    }
  );
  if (!res.ok) {
    await handleDriveResponseError(res);
  }
  return (await res.json()) as DriveFileItem;
}

export async function deleteDriveFile(
  token: string,
  fileId: string
): Promise<void> {
  const res = await fetch(`${DRIVE_API_BASE}/files/${encodeURIComponent(fileId)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    await handleDriveResponseError(res);
  }
}

export function parseDriveBackupJson(text: string): DriveBackupPayload | null {
  try {
    const parsed = JSON.parse(text) as Partial<DriveBackupPayload>;
    if (
      parsed &&
      parsed.app === 'fitness-rpg' &&
      parsed.hero &&
      parsed.stats &&
      Array.isArray(parsed.healthActivities) &&
      Array.isArray(parsed.dailyMetrics)
    ) {
      return parsed as DriveBackupPayload;
    }
  } catch {
    // Não é um JSON válido de backup do app
  }
  return null;
}

export function isFitnessBackupFile(file: DriveFileItem): boolean {
  return (
    file.appProperties?.fitnessRpgBackup === 'true' ||
    file.name.toLowerCase().includes('fitness-rpg-backup')
  );
}
