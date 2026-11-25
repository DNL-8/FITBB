import crypto from 'node:crypto';
import { Hono, type Context } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { ApiHttpError } from '../firebaseRest.ts';
import { input, readJsonInput } from '../input.ts';
import {
  type AppEnv,
  getAppBaseUrl,
  getStravaRedirectUri,
  logServerEvent,
  requireFirebaseAuth,
  sendInternalError,
  toContentfulStatus,
} from '../shared.ts';

const STRAVA_COOKIE_NAME = 'strava_oauth_session';
const STRAVA_STATE_COOKIE_NAME = 'strava_oauth_state';
const STRAVA_TOKEN_URL = 'https://www.strava.com/oauth/token';
const STRAVA_SCOPE = 'activity:read_all';

interface StravaCookiePayload {
  uid: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  athlete: {
    id: number;
    firstname: string;
    lastname: string;
    profile?: string;
    city?: string;
    country?: string;
  };
}

interface StravaRawActivity {
  id: number;
  name: string;
  sport_type?: string;
  type?: string;
  start_date_local?: string;
  start_date: string;
  moving_time?: number;
  elapsed_time?: number;
  distance?: number;
  total_elevation_gain?: number;
  calories?: number;
  kilojoules?: number;
  average_heartrate?: number;
  max_heartrate?: number;
  has_heartrate?: boolean;
}

interface StravaStreamsResponse {
  heartrate?: {
    data: number[];
  };
}

class MissingSessionSecretError extends Error {
  constructor() {
    super(
      'SESSION_SECRET não está configurada no servidor. Configure a variável de ambiente SESSION_SECRET para habilitar o OAuth do Strava.'
    );
    this.name = 'MissingSessionSecretError';
  }
}

export function getSessionSecretKey(): Buffer | null {
  const secret = process.env.SESSION_SECRET?.trim();
  if (!secret || secret === 'MY_SESSION_SECRET') {
    return null;
  }
  return crypto.createHash('sha256').update(secret, 'utf8').digest();
}

function requireSessionSecretKey(): Buffer {
  const key = getSessionSecretKey();
  if (!key) {
    throw new MissingSessionSecretError();
  }
  return key;
}

function getCookieOptions(maxAgeSeconds: number = 30 * 24 * 60 * 60) {
  const origin = new URL(getAppBaseUrl());
  const localHttp = origin.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname);
  const secure = process.env.NODE_ENV === 'production' || Boolean(process.env.VERCEL) || !localHttp;
  return {
    httpOnly: true,
    secure,
    sameSite: secure ? 'None' as const : 'Lax' as const,
    maxAge: maxAgeSeconds,
    path: '/',
  };
}

function encryptCookieJson(payload: unknown): string {
  const key = requireSessionSecretKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const plaintext = Buffer.from(JSON.stringify(payload), 'utf8');
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `v1.${iv.toString('base64url')}.${authTag.toString('base64url')}.${ciphertext.toString('base64url')}`;
}

function decryptCookieJson<T>(raw: unknown): T | null {
  if (typeof raw !== 'string' || !/^[A-Za-z0-9_.-]{1,4096}$/.test(raw)) return null;
  const key = requireSessionSecretKey();
  const parts = raw.split('.');
  if (parts.length !== 4 || parts[0] !== 'v1') return null;
  try {
    const iv = Buffer.from(parts[1], 'base64url');
    const authTag = Buffer.from(parts[2], 'base64url');
    const ciphertext = Buffer.from(parts[3], 'base64url');
    if (iv.length !== 12 || authTag.length !== 16) return null;
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
    return JSON.parse(decrypted) as T;
  } catch {
    return null;
  }
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => {
    switch (ch) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      case "'":
        return '&#39;';
      default:
        return ch;
    }
  });
}

function scriptJson(value: unknown): string {
  return JSON.stringify(value).replaceAll('<', '\\u003c');
}

function renderOAuthResult(c: Context<AppEnv>, message: string, status: 200 | 400 | 403 | 502 | 503, success = false): Response {
  const nonce = crypto.randomBytes(18).toString('base64url');
  c.header('Content-Security-Policy', `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'`);
  const result = success
    ? { type: 'STRAVA_OAUTH_SUCCESS' }
    : { type: 'STRAVA_OAUTH_ERROR', error: message };
  return c.html(`
    <!doctype html>
    <html lang="pt-BR">
      <head><meta charset="utf-8"><title>Conexão com o Strava</title></head>
      <body style="background:#07090E;color:#F4F4F5;font-family:sans-serif;padding:24px;text-align:center;">
        <p>${escapeHtml(message)}</p>
        <script nonce="${nonce}">
          if (window.opener) {
            window.opener.postMessage(${scriptJson(result)}, ${scriptJson(getAppBaseUrl())});
            window.close();
          } else if (${success}) {
            window.location.replace('/');
          }
        </script>
      </body>
    </html>
  `, status);
}

async function readStravaToken(response: Response) {
  const payload = await response.json() as Record<string, unknown> | null;
  const tokenPattern = /^[A-Za-z0-9._~-]{1,512}$/;
  if (!payload || typeof payload.access_token !== 'string' || !tokenPattern.test(payload.access_token) ||
      typeof payload.refresh_token !== 'string' || !tokenPattern.test(payload.refresh_token) ||
      typeof payload.expires_at !== 'number' || !Number.isSafeInteger(payload.expires_at) ||
      payload.expires_at <= Date.now() / 1000) {
    throw new ApiHttpError(502, 'Resposta de sessão do Strava inválida.', 'invalid_strava_token_response');
  }
  return {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token,
    expiresAt: payload.expires_at,
    athlete: payload.athlete,
  };
}

function readStravaAthlete(value: unknown): StravaCookiePayload['athlete'] {
  const athlete = value as Record<string, unknown> | null;
  if (!athlete || typeof athlete.id !== 'number' || !Number.isSafeInteger(athlete.id) || athlete.id <= 0) {
    throw new ApiHttpError(502, 'Perfil retornado pelo Strava inválido.', 'invalid_strava_athlete');
  }
  const field = (name: string, max: number) => typeof athlete[name] === 'string' ? athlete[name].slice(0, max) : undefined;
  return {
    id: athlete.id,
    firstname: field('firstname', 100) ?? '',
    lastname: field('lastname', 100) ?? '',
    profile: field('profile', 200),
    city: field('city', 100),
    country: field('country', 100),
  };
}

function parseStravaCookie(c: Context<AppEnv>): StravaCookiePayload | null {
  const parsed = decryptCookieJson<StravaCookiePayload>(getCookie(c, STRAVA_COOKIE_NAME));
  if (!parsed?.uid || parsed.uid !== c.get('firebaseUser')?.uid || !parsed.accessToken || !parsed.refreshToken) return null;
  return parsed;
}

function writeStravaCookie(c: Context<AppEnv>, payload: StravaCookiePayload): void {
  const encoded = encryptCookieJson(payload);
  setCookie(c, STRAVA_COOKIE_NAME, encoded, getCookieOptions());
}

async function ensureFreshStravaSession(
  c: Context<AppEnv>
): Promise<StravaCookiePayload | null> {
  const session = parseStravaCookie(c);
  if (!session) return null;

  const nowEpochSec = Math.floor(Date.now() / 1000);
  if (session.expiresAt > nowEpochSec + 120) {
    return session;
  }

  const clientId = process.env.STRAVA_CLIENT_ID?.trim();
  const clientSecret = process.env.STRAVA_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return null;

  const refreshResp = await fetch(STRAVA_TOKEN_URL, {
    method: 'POST',
    redirect: 'error',
    signal: AbortSignal.timeout(8_000),
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
      refresh_token: session.refreshToken,
    }),
  });

  if (!refreshResp.ok) {
    if (refreshResp.status !== 400 && refreshResp.status !== 401) {
      throw new ApiHttpError(502, 'O Strava não conseguiu renovar a sessão.', 'strava_refresh_unavailable');
    }
    deleteCookie(c, STRAVA_COOKIE_NAME, getCookieOptions());
    return null;
  }

  const { athlete: _, ...tokens } = await readStravaToken(refreshResp);
  const updated: StravaCookiePayload = {
    uid: session.uid,
    ...tokens,
    athlete: session.athlete,
  };
  writeStravaCookie(c, updated);
  return updated;
}

function computeZonesFromStream(
  hrValues: number[],
  durationMinutes: number,
  maxHr: number
): [number, number, number, number, number] {
  const counts = [0, 0, 0, 0, 0];
  for (const hr of hrValues) {
    const pct = hr / maxHr;
    if (pct < 0.6) counts[0] += 1;
    else if (pct < 0.7) counts[1] += 1;
    else if (pct < 0.8) counts[2] += 1;
    else if (pct < 0.9) counts[3] += 1;
    else counts[4] += 1;
  }
  const total = counts.reduce((a, b) => a + b, 0);
  if (total === 0) return [durationMinutes, 0, 0, 0, 0];
  return [
    Math.round((counts[0] / total) * durationMinutes),
    Math.round((counts[1] / total) * durationMinutes),
    Math.round((counts[2] / total) * durationMinutes),
    Math.round((counts[3] / total) * durationMinutes),
    Math.round((counts[4] / total) * durationMinutes),
  ];
}

function estimateZonesFromAvg(
  avgHr: number | null,
  durationMinutes: number,
  maxHr: number
): [number, number, number, number, number] {
  if (!avgHr || durationMinutes <= 0) {
    return [0, Math.round(durationMinutes * 0.7), Math.round(durationMinutes * 0.3), 0, 0];
  }
  const ratio = avgHr / maxHr;
  if (ratio < 0.6) return [durationMinutes, 0, 0, 0, 0];
  if (ratio < 0.7) {
    return [Math.round(durationMinutes * 0.2), Math.round(durationMinutes * 0.8), 0, 0, 0];
  }
  if (ratio < 0.8) {
    return [0, Math.round(durationMinutes * 0.25), Math.round(durationMinutes * 0.65), Math.round(durationMinutes * 0.1), 0];
  }
  if (ratio < 0.9) {
    return [0, 0, Math.round(durationMinutes * 0.3), Math.round(durationMinutes * 0.6), Math.round(durationMinutes * 0.1)];
  }
  return [0, 0, 0, Math.round(durationMinutes * 0.35), Math.round(durationMinutes * 0.65)];
}

function downsampleNumbers(arr: number[], maxPoints: number): number[] {
  if (arr.length <= maxPoints) return arr.map((v) => Math.round(v));
  const result: number[] = [];
  const step = arr.length / maxPoints;
  for (let i = 0; i < maxPoints; i++) {
    const idx = Math.min(arr.length - 1, Math.floor(i * step));
    result.push(Math.round(arr[idx]));
  }
  return result;
}

export function createStravaRouter(): Hono<AppEnv> {
  const router = new Hono<AppEnv>();

  router.use('/api/strava/*', async (c, next) => {
    c.header('Cache-Control', 'no-store');
    await next();
  });

  router.get('/api/strava/config', (c) => {
    const configured = Boolean(
      process.env.STRAVA_CLIENT_ID?.trim() &&
        process.env.STRAVA_CLIENT_SECRET?.trim() &&
        getSessionSecretKey()
    );
    return c.json({
      configured,
      sessionSecretConfigured: Boolean(getSessionSecretKey()),
      callbackUrl: getStravaRedirectUri(),
      appUrl: getAppBaseUrl(),
    });
  });

  router.get('/api/strava/auth-url', requireFirebaseAuth, (c) => {
    if (!getSessionSecretKey()) {
      return c.json(
        {
          error: new MissingSessionSecretError().message,
          code: 'missing_session_secret',
        },
        503
      );
    }

    const clientId = process.env.STRAVA_CLIENT_ID?.trim();
    const clientSecret = process.env.STRAVA_CLIENT_SECRET?.trim();
    if (!clientId || !clientSecret) {
      return c.json(
        {
          error:
            'As credenciais STRAVA_CLIENT_ID e STRAVA_CLIENT_SECRET ainda não estão configuradas nas variáveis do ambiente.',
          callbackUrl: getStravaRedirectUri(),
        },
        400
      );
    }

    const state = crypto.randomBytes(24).toString('base64url');
    const encryptedState = encryptCookieJson({
      state,
      uid: c.get('firebaseUser')!.uid,
      exp: Date.now() + 10 * 60 * 1000,
    });
    setCookie(c, STRAVA_STATE_COOKIE_NAME, encryptedState, getCookieOptions(10 * 60));

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: getStravaRedirectUri(),
      response_type: 'code',
      approval_prompt: 'auto',
      scope: STRAVA_SCOPE,
      state,
    });

    return c.json({
      url: `https://www.strava.com/api/v3/oauth/authorize?${params.toString()}`,
    });
  });

  const handleStravaCallback = async (c: Context<AppEnv>): Promise<Response> => {
    c.header('Cache-Control', 'no-store');
    c.header('Referrer-Policy', 'no-referrer');
    if (!getSessionSecretKey()) {
      return renderOAuthResult(c, new MissingSessionSecretError().message, 503);
    }

    const query = c.req.queries();
    const stored = decryptCookieJson<{ state?: string; uid?: string; exp?: number }>(
      getCookie(c, STRAVA_STATE_COOKIE_NAME)
    );
    deleteCookie(c, STRAVA_STATE_COOKIE_NAME, getCookieOptions());

    const state = query.state?.[0];
    if (query.state?.length !== 1 || typeof state !== 'string' || !/^[A-Za-z0-9_-]{32}$/.test(state) ||
        !stored?.uid || typeof stored.state !== 'string' || !/^[A-Za-z0-9_-]{32}$/.test(stored.state) ||
        typeof stored.exp !== 'number' || Date.now() > stored.exp ||
        !crypto.timingSafeEqual(Buffer.from(state), Buffer.from(stored.state))) {
      return renderOAuthResult(c, 'Conexão inválida ou expirada. Tente conectar o Strava novamente.', 403);
    }

    const code = query.code?.[0];
    if (query.error?.length === 1 && !code) {
      return renderOAuthResult(c, 'Autorização do Strava cancelada. Você pode fechar esta janela.', 200);
    }
    if (query.error || query.code?.length !== 1 || !code || !/^[A-Za-z0-9_-]{1,512}$/.test(code)) {
      return renderOAuthResult(c, 'Resposta de autorização do Strava inválida.', 400);
    }
    const scopes = query.scope?.[0];
    if (query.scope && (query.scope.length !== 1 || !scopes?.split(',').includes(STRAVA_SCOPE))) {
      return renderOAuthResult(c, 'Autorize o acesso às atividades para conectar o Strava.', 403);
    }

    const clientId = process.env.STRAVA_CLIENT_ID?.trim();
    const clientSecret = process.env.STRAVA_CLIENT_SECRET?.trim();
    if (!clientId || !clientSecret) {
      return renderOAuthResult(c, 'Integração com o Strava ainda não configurada.', 503);
    }

    try {
      const response = await fetch(STRAVA_TOKEN_URL, {
        method: 'POST',
        redirect: 'error',
        signal: AbortSignal.timeout(8_000),
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: clientId,
          client_secret: clientSecret,
          code,
          grant_type: 'authorization_code',
        }),
      });
      if (!response.ok) {
        throw new ApiHttpError(502, 'O Strava recusou a autorização.', 'strava_code_exchange_failed');
      }

      const { athlete, ...tokens } = await readStravaToken(response);
      writeStravaCookie(c, { uid: stored.uid, ...tokens, athlete: readStravaAthlete(athlete) });
      return renderOAuthResult(c, 'Strava conectado. Você pode fechar esta janela.', 200, true);
    } catch (err) {
      logServerEvent('warn', 'strava_oauth_failed', {
        requestId: c.get('requestId'),
        code: err instanceof ApiHttpError ? err.code : 'strava_upstream_unavailable',
      });
      return renderOAuthResult(c, 'Falha ao autenticar com o Strava. Tente novamente.', 502);
    }
  };

  router.get('/auth/strava/callback', handleStravaCallback);
  router.get('/auth/strava/callback/', handleStravaCallback);

  router.get('/api/strava/status', requireFirebaseAuth, async (c) => {
    if (!getSessionSecretKey()) {
      return c.json(
        {
          error: new MissingSessionSecretError().message,
          code: 'missing_session_secret',
        },
        503
      );
    }
    try {
      const session = await ensureFreshStravaSession(c);
      if (!session) {
        return c.json({ connected: false, athlete: null });
      }
      return c.json({ connected: true, athlete: session.athlete });
    } catch (error) {
      if (error instanceof ApiHttpError) throw error;
      return c.json({ error: 'Não foi possível consultar a sessão do Strava.' }, 502);
    }
  });

  router.post('/api/strava/disconnect', requireFirebaseAuth, (c) => {
    for (const name of [STRAVA_COOKIE_NAME, STRAVA_STATE_COOKIE_NAME]) {
      deleteCookie(c, name, getCookieOptions());
    }
    return c.json({ disconnected: true });
  });

  router.post('/api/strava/sync', requireFirebaseAuth, async (c) => {
    if (!getSessionSecretKey()) {
      return c.json(
        {
          error: new MissingSessionSecretError().message,
          code: 'missing_session_secret',
        },
        503
      );
    }
    try {
      const { days: requestedDays = 30, maxHr: requestedMaxHr = 190 } = await readJsonInput(c, input.stravaSync);
      const session = await ensureFreshStravaSession(c);
      if (!session) {
        return c.json({ error: 'Conta Strava não conectada ou sessão expirada.' }, 401);
      }

      const days = Math.round(requestedDays);
      const maxHr = Math.min(220, Math.max(130, Math.round(requestedMaxHr)));
      const afterEpoch = Math.floor(Date.now() / 1000) - days * 86400;
      const deadline = AbortSignal.timeout(18_000);
      const rawActivities: StravaRawActivity[] = [];
      const maxPages = 5;
      const perPage = 50;
      let truncated = false;
      for (let page = 1; page <= maxPages; page++) {
        const response = await fetch(
          `https://www.strava.com/api/v3/athlete/activities?after=${afterEpoch}&per_page=${perPage}&page=${page}`,
          { headers: { Authorization: `Bearer ${session.accessToken}` }, signal: deadline, redirect: 'error' }
        );
        if (!response.ok) {
          return c.json({ error: `Erro ao consultar atividades do Strava (${response.status}).` },
            toContentfulStatus(response.status, 502));
        }
        const items = (await response.json()) as StravaRawActivity[];
        rawActivities.push(...items);
        if (items.length < perPage) break;
        truncated = page === maxPages;
      }
      const streamTargetIds = rawActivities
        .filter((act) => Boolean(act.has_heartrate))
        .slice(0, 10)
        .map((act) => act.id);

      const streamResultsByActivityId = new Map<number, StravaStreamsResponse>();
      const STREAM_CHUNK_SIZE = 5;
      for (let i = 0; i < streamTargetIds.length; i += STREAM_CHUNK_SIZE) {
        const chunkIds = streamTargetIds.slice(i, i + STREAM_CHUNK_SIZE);
        const settled = await Promise.allSettled(
          chunkIds.map(async (actId) => {
            const streamRes = await fetch(
              `https://www.strava.com/api/v3/activities/${actId}/streams?keys=heartrate,time&key_by_type=true`,
              {
                headers: { Authorization: `Bearer ${session.accessToken}` },
                signal: deadline,
                redirect: 'error',
              }
            );
            if (!streamRes.ok) return null;
            const streamJson = (await streamRes.json()) as StravaStreamsResponse;
            return { actId, streamJson };
          })
        );
        for (const resItem of settled) {
          if (resItem.status === 'fulfilled' && resItem.value) {
            streamResultsByActivityId.set(resItem.value.actId, resItem.value.streamJson);
          }
        }
      }

      const mapped = [];

      for (const act of rawActivities) {
        const startedAt = act.start_date_local || act.start_date;
        const dateKey = startedAt.slice(0, 10);
        const durationMinutes = Math.max(
          1,
          Math.round((act.moving_time || act.elapsed_time || 60) / 60)
        );
        const distanceKm = Number(((act.distance || 0) / 1000).toFixed(2));
        const elevationGainM = Math.round(act.total_elevation_gain || 0);
        const avgHr = act.average_heartrate ? Math.round(act.average_heartrate) : null;
        const maxHrAct = act.max_heartrate ? Math.round(act.max_heartrate) : null;
        const estimatedCalories =
          act.calories && act.calories > 0
            ? Math.round(act.calories)
            : act.kilojoules && act.kilojoules > 0
            ? Math.round(act.kilojoules * 1.05)
            : Math.round(durationMinutes * (avgHr ? (avgHr / 140) * 8.5 : 7.5));

        let hrSamplePoints: number[] = [];
        let zoneMinutes = estimateZonesFromAvg(avgHr, durationMinutes, maxHr);

        const streamJson = streamResultsByActivityId.get(act.id);
        const hrData = streamJson?.heartrate?.data;
        if (Array.isArray(hrData) && hrData.length > 0) {
          zoneMinutes = computeZonesFromStream(hrData, durationMinutes, maxHr);
          hrSamplePoints = downsampleNumbers(hrData, 40);
        }

        const sportType = act.sport_type || act.type || 'Workout';
        const xpAwarded = Math.min(
          500,
          Math.max(20, Math.round(durationMinutes * 3 + distanceKm * 6))
        );

        mapped.push({
          id: `strava_${act.id}`,
          externalId: `strava_${act.id}`,
          source: 'strava',
          title: (act.name || sportType).slice(0, 140),
          sportType: sportType.slice(0, 60),
          dateKey,
          startedAt,
          durationMinutes,
          distanceKm,
          calories: estimatedCalories,
          elevationGainM,
          avgHeartRate: avgHr,
          maxHeartRate: maxHrAct,
          zoneMinutes,
          hrSamplePoints,
          xpAwarded,
          createdAt: new Date().toISOString(),
        });
      }

      return c.json({
        athlete: session.athlete,
        activities: mapped,
        truncated,
      });
    } catch (err) {
      if (err instanceof ApiHttpError) throw err;
      return sendInternalError(c, err, 'POST /api/strava/sync', 'Falha na sincronização Strava.');
    }
  });

  return router;
}
