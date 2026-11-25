import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface FirebaseAppletConfig {
  projectId: string;
  appId?: string;
  apiKey?: string;
  authDomain?: string;
  firestoreDatabaseId?: string;
}

export interface VerifiedFirebaseUser {
  uid: string;
  email: string | null;
  emailVerified: boolean;
  isAdmin: boolean;
  token: string;
}

export class ApiHttpError extends Error {
  statusCode: number;
  code: string;

  constructor(statusCode: number, message: string, code: string = 'api_error') {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

let cachedConfig: FirebaseAppletConfig | null = null;

export function getFirebaseAppletConfig(): FirebaseAppletConfig {
  if (cachedConfig) return cachedConfig;
  const candidatePath = path.resolve(__dirname, '..', '..', 'firebase-applet-config.json');
  const configPath = fs.existsSync(candidatePath)
    ? candidatePath
    : path.resolve(process.cwd(), 'firebase-applet-config.json');
  const raw = fs.readFileSync(configPath, 'utf8');
  const parsed = JSON.parse(raw) as FirebaseAppletConfig;
  if (!parsed.projectId) {
    throw new Error('Configuração Firebase ausente em firebase-applet-config.json.');
  }
  cachedConfig = parsed;
  return parsed;
}

interface CertCacheEntry {
  certs: Record<string, string>;
  expiresAtMs: number;
}

let certCache: CertCacheEntry | null = null;
const GOOGLE_CERTS_URL =
  'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';

let certRequest: Promise<Record<string, string>> | undefined;
let lastCertRefreshAt = 0;

async function getGooglePublicCerts(forceRefresh = false): Promise<Record<string, string>> {
  const now = Date.now();
  if (certRequest) return certRequest;
  if (certCache && certCache.expiresAtMs > now &&
      (!forceRefresh || now - lastCertRefreshAt < 30_000)) return certCache.certs;

  lastCertRefreshAt = now;
  certRequest = fetch(GOOGLE_CERTS_URL, { signal: AbortSignal.timeout(4_000), redirect: 'error' })
    .then(async (response) => {
      if (!response.ok) throw new Error('Certificados indisponíveis');
      const certs = await response.json() as Record<string, string> | null;
      if (!certs || typeof certs !== 'object' || Array.isArray(certs) ||
          Object.keys(certs).length === 0 || Object.values(certs).some((cert) => typeof cert !== 'string')) {
        throw new Error('Resposta de certificados inválida');
      }
      const maxAge = Number(response.headers.get('cache-control')?.match(/max-age=(\d+)/i)?.[1] ?? 3600);
      certCache = { certs, expiresAtMs: now + maxAge * 1000 };
      return certs;
    })
    .catch(() => {
      if (certCache && certCache.expiresAtMs > Date.now()) return certCache.certs;
      throw new ApiHttpError(503, 'Chaves públicas do Firebase indisponíveis.', 'auth_certs_unavailable');
    })
    .finally(() => { certRequest = undefined; });
  return certRequest;
}

function decodeBase64UrlJson<T>(segment: string): T {
  return JSON.parse(Buffer.from(segment, 'base64url').toString('utf8')) as T;
}

export async function verifyFirebaseBearerToken(
  authHeader: string | undefined
): Promise<VerifiedFirebaseUser> {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new ApiHttpError(
      401,
      'Cabeçalho Authorization: Bearer <token_firebase> obrigatório.',
      'missing_bearer_token'
    );
  }

  const token = authHeader.slice('Bearer '.length).trim();
  if (token.length > 16_384 || !/^[\w-]+\.[\w-]+\.[\w-]+$/.test(token)) {
    throw new ApiHttpError(401, 'Token Firebase inválido.', 'invalid_token_format');
  }

  const [headerB64, payloadB64, sigB64] = token.split('.');
  let header: { alg?: string; kid?: string };
  let payload: {
    aud?: string;
    iss?: string;
    sub?: string;
    exp?: number;
    iat?: number;
    auth_time?: number;
    email?: string;
    email_verified?: boolean;
    admin?: unknown;
  };

  try {
    header = decodeBase64UrlJson(headerB64);
    payload = decodeBase64UrlJson(payloadB64);
  } catch {
    throw new ApiHttpError(401, 'Token JWT malformado.', 'malformed_jwt');
  }

  if (!header || typeof header !== 'object' || header.alg !== 'RS256' ||
      typeof header.kid !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(header.kid) ||
      !payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new ApiHttpError(401, 'Algoritmo ou identificador de chave JWT inválido.', 'invalid_jwt_header');
  }

  const { projectId } = getFirebaseAppletConfig();
  const nowSec = Math.floor(Date.now() / 1000);

  if (payload.aud !== projectId) {
    throw new ApiHttpError(401, 'Token pertence a outro projeto Firebase.', 'invalid_audience');
  }
  if (payload.iss !== `https://securetoken.google.com/${projectId}`) {
    throw new ApiHttpError(401, 'Emissor do token Firebase inválido.', 'invalid_issuer');
  }
  if (typeof payload.sub !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(payload.sub)) {
    throw new ApiHttpError(401, 'Usuário do token ausente ou inválido.', 'invalid_subject');
  }
  if (typeof payload.exp !== 'number' || !Number.isSafeInteger(payload.exp) || payload.exp <= nowSec) {
    throw new ApiHttpError(401, 'Token Firebase expirado. Atualize sua sessão.', 'token_expired');
  }
  if (typeof payload.iat !== 'number' || !Number.isSafeInteger(payload.iat) ||
      payload.iat <= 0 || payload.iat > nowSec + 300 || payload.exp <= payload.iat) {
    throw new ApiHttpError(401, 'Timestamp iat do token inválido.', 'invalid_iat');
  }
  if (typeof payload.auth_time !== 'number' || !Number.isSafeInteger(payload.auth_time) ||
      payload.auth_time <= 0 || payload.auth_time > payload.iat) {
    throw new ApiHttpError(401, 'Timestamp de autenticação do token inválido.', 'invalid_auth_time');
  }
  let certs = await getGooglePublicCerts(false);
  let pem = Object.hasOwn(certs, header.kid) ? certs[header.kid] : undefined;
  if (!pem) {
    certs = await getGooglePublicCerts(true);
    pem = Object.hasOwn(certs, header.kid) ? certs[header.kid] : undefined;
  }
  if (!pem) {
    throw new ApiHttpError(401, 'Chave de assinatura do token não reconhecida.', 'unknown_key_id');
  }

  const verifier = crypto.createVerify('RSA-SHA256');
  verifier.update(`${headerB64}.${payloadB64}`);
  verifier.end();

  const isSignatureValid = verifier.verify(pem, Buffer.from(sigB64, 'base64url'));
  if (!isSignatureValid) {
    throw new ApiHttpError(401, 'Assinatura do token Firebase inválida.', 'invalid_signature');
  }

  if (payload.email_verified !== true) {
    throw new ApiHttpError(
      403,
      'Sua conta precisa ter o e-mail verificado para gravar dados no Firestore.',
      'email_not_verified'
    );
  }

  return {
    uid: payload.sub,
    email: typeof payload.email === 'string' ? payload.email : null,
    emailVerified: true,
    isAdmin: payload.admin === true,
    token,
  };
}

// ============================================================================
// FIRESTORE REST API v1 SERIALIZAÇÃO & CLIENTE (STARTER TIER COMPATÍVEL)
// ============================================================================

type FirestoreValue =
  | { nullValue: null }
  | { booleanValue: boolean }
  | { integerValue: string }
  | { doubleValue: number }
  | { stringValue: string }
  | { referenceValue: string }
  | { arrayValue: { values?: FirestoreValue[] } }
  | { mapValue: { fields?: Record<string, FirestoreValue> } };

interface FirestoreDocumentRaw {
  name?: string;
  fields?: Record<string, FirestoreValue>;
  updateTime?: string;
}

function encodeFirestoreValue(value: unknown): FirestoreValue {
  if (value === null || value === undefined) {
    return { nullValue: null };
  }
  if (typeof value === 'boolean') {
    return { booleanValue: value };
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return { integerValue: '0' };
    if (Number.isInteger(value) && Math.abs(value) <= 9007199254740991) {
      return { integerValue: String(value) };
    }
    return { doubleValue: value };
  }
  if (typeof value === 'string') {
    return { stringValue: value };
  }
  if (Array.isArray(value)) {
    return {
      arrayValue: {
        values: value.map((item) => encodeFirestoreValue(item)),
      },
    };
  }
  if (typeof value === 'object') {
    const fields: Record<string, FirestoreValue> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v !== undefined) {
        fields[k] = encodeFirestoreValue(v);
      }
    }
    return { mapValue: { fields } };
  }
  return { stringValue: String(value) };
}

function encodeFirestoreFields(obj: Record<string, unknown>): Record<string, FirestoreValue> {
  const fields: Record<string, FirestoreValue> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) {
      fields[k] = encodeFirestoreValue(v);
    }
  }
  return fields;
}

function decodeFirestoreValue(val: FirestoreValue | undefined): unknown {
  if (!val || typeof val !== 'object') return null;
  if ('nullValue' in val) return null;
  if ('booleanValue' in val) return val.booleanValue;
  if ('integerValue' in val) return Number(val.integerValue);
  if ('doubleValue' in val) return Number(val.doubleValue);
  if ('stringValue' in val) return val.stringValue;
  if ('arrayValue' in val) {
    const arr = val.arrayValue?.values ?? [];
    return arr.map((item) => decodeFirestoreValue(item));
  }
  if ('mapValue' in val) {
    const out: Record<string, unknown> = {};
    const fields = val.mapValue?.fields ?? {};
    for (const [k, v] of Object.entries(fields)) {
      out[k] = decodeFirestoreValue(v);
    }
    return out;
  }
  return null;
}

function decodeFirestoreDoc<T>(docRaw: FirestoreDocumentRaw): T {
  const out: Record<string, unknown> = {};
  const fields = docRaw.fields ?? {};
  for (const [k, v] of Object.entries(fields)) {
    out[k] = decodeFirestoreValue(v);
  }
  return out as T;
}

function getFirestoreBaseInfo() {
  const cfg = getFirebaseAppletConfig();
  const dbId = cfg.firestoreDatabaseId?.trim() || '(default)';
  const resourcePrefix = `projects/${cfg.projectId}/databases/${encodeURIComponent(dbId)}/documents`;
  const baseUrl = `https://firestore.googleapis.com/v1/${resourcePrefix}`;
  return { projectId: cfg.projectId, dbId, resourcePrefix, baseUrl };
}

async function parseFirestoreError(res: Response): Promise<ApiHttpError> {
  let msg = `Erro no Firestore (${res.status})`;
  let statusCode = res.status;
  let code = 'firestore_rest_error';
  try {
    const errJson = (await res.json()) as {
      error?: { status?: string };
    };
    const errStatus = errJson?.error?.status;
    if (res.status === 403 || errStatus === 'PERMISSION_DENIED') {
      statusCode = 403;
      msg =
        'Permissão negada pelas regras do Firestore. Verifique se os campos atendem ao formato exigido e se a conta está verificada.';
    } else if (res.status === 401) {
      statusCode = 401;
      msg = 'Token Firebase recusado ou expirado pelo Firestore.';
    } else if (res.status === 404) {
      statusCode = 404;
      msg = 'Documento não encontrado no Firestore.';
    } else if (
      res.status === 409 ||
      errStatus === 'ABORTED' ||
      errStatus === 'ALREADY_EXISTS' ||
      errStatus === 'FAILED_PRECONDITION'
    ) {
      statusCode = 409;
      code = 'concurrency_conflict';
      msg = 'Conflito de atualização simultânea ou registro já existente no Firestore.';
    }
  } catch {
    // mantém mensagem padrão
  }
  return new ApiHttpError(statusCode, msg, code);
}

export interface FirestorePrecondition {
  exists?: boolean;
  updateTime?: string;
}

const CHRONOLOGICAL_QUERY_FIELDS: Partial<Record<string, string>> = {
  workoutLogs: 'completedAt',
  dailyHealthMetrics: 'dateKey',
  healthActivities: 'dateKey',
  weightLogs: 'dateKey',
  healthConnectRecords: 'startTime',
};

interface UserQuerySelection {
  recordType?: string;
  documentPrefix?: string;
  activityIdentity?: { source: string; externalId: string };
  afterId?: string;
}

type WorkoutLogCursor = [uid: string, id: string, completedAt: string | null];

function readWorkoutLogCursor(value: string, uid: string): WorkoutLogCursor {
  let cursor: unknown;
  if (/^[A-Za-z0-9_-]{1,1024}$/.test(value)) {
    try {
      cursor = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
    } catch {
      // Report malformed cursors using the same response below.
    }
  }
  if (!Array.isArray(cursor) || cursor.length !== 3 || cursor[0] !== uid ||
      typeof cursor[1] !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(cursor[1]) ||
      (cursor[2] !== null && (typeof cursor[2] !== 'string' || cursor[2].length > 40))) {
    throw new ApiHttpError(400, 'Cursor do histórico de treinos inválido.', 'invalid_workout_log_cursor');
  }
  return [uid, cursor[1], cursor[2]];
}

export class FirestoreRestClient {
  async getDocWithMeta<T>(
    token: string,
    relativePath: string
  ): Promise<{ data: T; updateTime: string } | null> {
    const { baseUrl } = getFirestoreBaseInfo();
    const cleanPath = relativePath.replace(/^\/+/, '');
    const res = await fetch(`${baseUrl}/${cleanPath}`, {
      method: 'GET',
      signal: AbortSignal.timeout(8_000),
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    if (res.status === 404) return null;
    if (!res.ok) {
      throw await parseFirestoreError(res);
    }
    const raw = (await res.json()) as FirestoreDocumentRaw;
    if (typeof raw.updateTime !== 'string' || !raw.updateTime) {
      throw new ApiHttpError(502, 'O Firestore não retornou a versão do documento.', 'missing_firestore_version');
    }
    return {
      data: decodeFirestoreDoc<T>(raw),
      updateTime: raw.updateTime,
    };
  }

  async getDoc<T>(token: string, relativePath: string): Promise<T | null> {
    const doc = await this.getDocWithMeta<T>(token, relativePath);
    return doc ? doc.data : null;
  }

  async setDoc<T extends Record<string, unknown>>(
    token: string,
    relativePath: string,
    data: T,
    precondition?: FirestorePrecondition
  ): Promise<T> {
    const { baseUrl } = getFirestoreBaseInfo();
    const cleanPath = relativePath.replace(/^\/+/, '');
    const params = new URLSearchParams();
    if (precondition?.exists !== undefined) {
      params.set('currentDocument.exists', String(precondition.exists));
    }
    if (precondition?.updateTime) {
      params.set('currentDocument.updateTime', precondition.updateTime);
    }
    const qs = params.toString();
    const url = `${baseUrl}/${cleanPath}${qs ? `?${qs}` : ''}`;

    const res = await fetch(url, {
      method: 'PATCH',
      signal: AbortSignal.timeout(8_000),
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        fields: encodeFirestoreFields(data),
      }),
    });
    if (!res.ok) {
      throw await parseFirestoreError(res);
    }
    const raw = (await res.json()) as FirestoreDocumentRaw;
    return decodeFirestoreDoc<T>(raw);
  }

  async deleteDoc(token: string, relativePath: string): Promise<void> {
    const { baseUrl } = getFirestoreBaseInfo();
    const cleanPath = relativePath.replace(/^\/+/, '');
    const res = await fetch(`${baseUrl}/${cleanPath}`, {
      method: 'DELETE',
      signal: AbortSignal.timeout(8_000),
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    if (res.status === 404) return;
    if (!res.ok) {
      throw await parseFirestoreError(res);
    }
  }

  async queryByUser<T>(
    token: string,
    uid: string,
    collectionId: string,
    limit: number = 1000,
    selection: UserQuerySelection = {}
  ): Promise<T[]> {
    const { documents } = await this.queryUserDocuments(token, uid, collectionId, limit, selection);
    return documents.map((doc) => decodeFirestoreDoc<T>(doc));
  }

  async queryWorkoutLogsPage<T>(token: string, uid: string, limit: number, cursor?: string) {
    const position = cursor === undefined ? undefined : readWorkoutLogCursor(cursor, uid);
    const { resourcePrefix } = getFirestoreBaseInfo();
    const startAfter = position ? [
      ...(position[2] === null ? [] : [{ stringValue: position[2] }]),
      { referenceValue: `${resourcePrefix}/users/${uid}/workoutLogs/${position[1]}` },
    ] : undefined;
    const { documents, sortField } = await this.queryUserDocuments(
      token, uid, 'workoutLogs', limit + 1, {}, startAfter, position?.[2] === null
    );
    const page = documents.slice(0, limit);
    let nextCursor: string | null = null;
    if (documents.length > limit) {
      const last = page[page.length - 1];
      const id = last?.name?.split('/').at(-1);
      const value = last?.fields?.completedAt;
      const completedAt = value && 'stringValue' in value ? value.stringValue : null;
      if (!id || (sortField && completedAt === null)) {
        throw new ApiHttpError(502, 'Cursor do Firestore inválido.', 'invalid_firestore_cursor');
      }
      const next: WorkoutLogCursor = [uid, id, sortField ? completedAt : null];
      nextCursor = Buffer.from(JSON.stringify(next)).toString('base64url');
    }
    return {
      logs: page.map((doc) => decodeFirestoreDoc<T>(doc)),
      nextCursor,
      order: sortField ? 'completedAt' : 'documentId',
    };
  }

  private async queryUserDocuments(
    token: string,
    uid: string,
    collectionId: string,
    limit: number,
    selection: UserQuerySelection,
    startAfter?: FirestoreValue[],
    orderByDocumentId = false
  ) {
    const { baseUrl, resourcePrefix } = getFirestoreBaseInfo();
    const maxItems = Math.max(1, Math.min(2000, Math.round(limit)));
    const pageSize = Math.min(250, maxItems);
    const documents: FirestoreDocumentRaw[] = [];
    let sortField = selection.documentPrefix || selection.activityIdentity || selection.afterId || orderByDocumentId
      ? undefined
      : CHRONOLOGICAL_QUERY_FIELDS[collectionId];
    const prefix = selection.documentPrefix
      ? `${resourcePrefix}/users/${uid}/${collectionId}/${selection.documentPrefix}`
      : undefined;
    const after = selection.afterId && `${resourcePrefix}/users/${uid}/${collectionId}/${selection.afterId}`;
    let cursor = prefix ? [{ referenceValue: `${prefix}\uf8ff` }] : after ? [{ referenceValue: after }] : startAfter;
    const equals = (fieldPath: string, value: string) => ({
      fieldFilter: { field: { fieldPath }, op: 'EQUAL', value: { stringValue: value } },
    });
    const filters = [equals('userId', uid)];
    if (selection.recordType) filters.push(equals('type', selection.recordType));
    if (selection.activityIdentity) {
      filters.push(equals('source', selection.activityIdentity.source), equals('externalId', selection.activityIdentity.externalId));
    }
    const where = filters.length === 1 ? filters[0] : { compositeFilter: { op: 'AND', filters } };

    while (documents.length < maxItems) {
      const batchLimit = Math.min(pageSize, maxItems - documents.length);
      const res = await fetch(`${baseUrl}/users/${encodeURIComponent(uid)}:runQuery`, {
        method: 'POST',
        signal: AbortSignal.timeout(8_000),
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          structuredQuery: {
            from: [{ collectionId }],
            where,
            orderBy: [
              ...(sortField ? [{ field: { fieldPath: sortField }, direction: 'DESCENDING' }] : []),
              { field: { fieldPath: '__name__' }, direction: 'DESCENDING' },
            ],
            ...(cursor ? { startAt: { values: cursor, before: false } } : {}),
            ...(prefix ? { endAt: { values: [{ referenceValue: prefix }], before: false } } : {}),
            limit: batchLimit,
          },
        }),
      });

      if (!res.ok) {
        if (!cursor && sortField && res.status === 400) {
          const details = await res.clone().json().catch(() => null) as
            { error?: { status?: string; message?: string } } | null;
          if (details?.error?.status === 'FAILED_PRECONDITION' &&
              /index/i.test(details.error.message ?? '')) {
            sortField = undefined;
            continue;
          }
        }
        throw await parseFirestoreError(res);
      }

      const rows = (await res.json()) as Array<{ document?: FirestoreDocumentRaw }>;
      let pageCount = 0;
      let lastDoc: FirestoreDocumentRaw | undefined;
      for (const row of rows) {
        if (row.document && row.document.fields) {
          documents.push(row.document);
          pageCount += 1;
          lastDoc = row.document;
        }
      }

      if (pageCount < batchLimit) {
        break;
      }
      if (!lastDoc?.name) throw new ApiHttpError(502, 'Cursor do Firestore ausente.', 'invalid_firestore_cursor');
      const sortValue = sortField ? lastDoc.fields?.[sortField] : undefined;
      if (sortField && !sortValue) throw new ApiHttpError(502, 'Cursor do Firestore inválido.', 'invalid_firestore_cursor');
      cursor = [...(sortValue ? [sortValue] : []), { referenceValue: lastDoc.name }];
    }

    return { documents, sortField };
  }

  async commitWrites(
    token: string,
    operations: Array<
      | {
          type: 'set' | 'patch';
          path: string;
          data: Record<string, unknown>;
          precondition?: FirestorePrecondition;
        }
      | { type: 'delete'; path: string }
    >
  ): Promise<void> {
    if (operations.length === 0) return;
    const { projectId, dbId } = getFirebaseAppletConfigDbNames();
    const parentUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${encodeURIComponent(dbId)}/documents`;

    const writes = operations.map((op) => {
      const cleanPath = op.path.replace(/^\/+/, '');
      const fullName = `projects/${projectId}/databases/${dbId}/documents/${cleanPath}`;
      if (op.type === 'delete') {
        return { delete: fullName };
      }
      return {
        ...(op.precondition ? { currentDocument: op.precondition } : {}),
        ...(op.type === 'patch' ? { updateMask: { fieldPaths: Object.keys(op.data) } } : {}),
        update: {
          name: fullName,
          fields: encodeFirestoreFields(op.data),
        },
      };
    });

    const res = await fetch(`${parentUrl}:commit`, {
      method: 'POST',
      signal: AbortSignal.timeout(8_000),
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ writes }),
    });

    if (!res.ok) {
      throw await parseFirestoreError(res);
    }
  }
}

function getFirebaseAppletConfigDbNames() {
  const cfg = getFirebaseAppletConfig();
  return {
    projectId: cfg.projectId,
    dbId: cfg.firestoreDatabaseId?.trim() || '(default)',
  };
}

export const firestoreRest = new FirestoreRestClient();
