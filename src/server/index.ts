import 'dotenv/config';
import fs from 'node:fs';
import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { cors } from 'hono/cors';
import { routePath } from 'hono/route';
import { secureHeaders } from 'hono/secure-headers';
import { handle } from 'hono/vercel';
import { getRequestListener } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { createApiV1Router } from './apiV1.ts';
import { getGeminiClient } from './gemini.ts';
import { createAiRouter } from './routes/ai.ts';
import { createStravaRouter, getSessionSecretKey } from './routes/strava.ts';
import {
  type AppEnv,
  MAX_JSON_BODY_BYTES,
  PORT,
  createAiRateLimiter,
  createGlobalRateLimiter,
  createRequestId,
  getAllowedCorsOrigins,
  logServerEvent,
  respondToApiError,
} from './shared.ts';

export { PORT, type AppEnv } from './shared.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function createAppServer(includeFrontend: boolean): Promise<Hono<AppEnv>> {
  if (!getSessionSecretKey()) {
    console.warn(
      '[server] AVISO: SESSION_SECRET não está configurada. As rotas de autenticação/sessão do Strava retornarão HTTP 503 até a configuração da variável.'
    );
  }

  const app = new Hono<AppEnv>();

  app.use(
    '*',
    secureHeaders({
      crossOriginEmbedderPolicy: false,
      crossOriginOpenerPolicy: 'same-origin-allow-popups',
      xFrameOptions: false,
    })
  );

  const allowedOrigins = getAllowedCorsOrigins();
  app.use('*', async (c, next) => {
    const origin = c.req.header('origin');
    if (origin && !allowedOrigins.has(origin)) {
      return c.json(
        {
          ok: false,
          error: 'Origem não autorizada pela política CORS.',
          code: 'cors_forbidden',
        },
        403
      );
    }
    return next();
  });

  app.use(
    '*',
    cors({
      origin: (origin) => (origin && allowedOrigins.has(origin) ? origin : ''),
      credentials: true,
    })
  );

  app.use('*', async (c, next) => {
    const requestId = createRequestId(c.req.header('x-request-id'));
    c.set('requestId', requestId);

    const isApiRequest = c.req.path.startsWith('/api/') || c.req.path === '/api';
    const startedAt = isApiRequest ? Date.now() : 0;

    await next();

    c.header('X-Request-Id', requestId);
    if (isApiRequest) {
      const level = c.res.status === 503 ? 'warn' : c.res.status >= 500 ? 'error' : 'info';
      logServerEvent(level, 'api_request', {
        requestId,
        method: c.req.method,
        path: routePath(c),
        statusCode: c.res.status,
        durationMs: Date.now() - startedAt,
      });
    }
  });

  const globalRateLimiter = createGlobalRateLimiter();
  app.use('/api/*', globalRateLimiter.middleware);

  app.use(
    '/api/*',
    bodyLimit({
      maxSize: MAX_JSON_BODY_BYTES,
      onError: (c) =>
        c.json(
          {
            ok: false,
            error: 'Payload JSON excede o limite de 2 MB.',
            code: 'payload_too_large',
          },
          413
        ),
    })
  );

  app.onError(respondToApiError);

  // Health check global da instância Hono
  app.get('/api/health', (c) => {
    return c.json({
      ok: true,
      service: 'fitness-rpg-api',
      version: 'v1',
      runtime: process.env.VERCEL ? 'vercel' : 'node',
      revision: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
      geminiConfigured: Boolean(getGeminiClient()),
      timestamp: new Date().toISOString(),
    });
  });

  const aiRateLimiter = createAiRateLimiter();

  // API Unificada REST v1
  app.route('/api/v1', createApiV1Router({ getGeminiClient, aiRateLimiter }));

  // Rotas Strava OAuth 2.0 e API v3
  app.route('/', createStravaRouter());

  // Rotas Gemini IA Server-Side
  app.route('/', createAiRouter({ getGeminiClient, aiRateLimiter }));

  // Fallback 404 para rotas /api/* não mapeadas
  app.all('/api/*', (c) => {
    return c.json(
      {
        ok: false,
        error: 'Endpoint de API não encontrado.',
        code: 'api_route_not_found',
      },
      404
    );
  });

  // --------------------------------------------------------------------------
  // Estático (Prod) — Dev usa bridge Vite em startLocalNodeServer()
  // --------------------------------------------------------------------------
  if (!includeFrontend && process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
    throw new Error('The serverless API must run with NODE_ENV=production.');
  }

  if (includeFrontend && process.env.NODE_ENV === 'production') {
    const distPath = path.resolve(__dirname, '..', '..', 'dist');
    const indexHtmlPath = path.join(distPath, 'index.html');
    app.use('*', serveStatic({ root: distPath }));
    app.get('*', async (c) => {
      const html = await fs.promises.readFile(indexHtmlPath, 'utf8');
      return c.html(html);
    });
  }

  return app;
}

let serverlessAppPromise: Promise<Hono<AppEnv>> | undefined;
let nodeListener: ReturnType<typeof getRequestListener> | undefined;

export function getServerlessApp(): Promise<Hono<AppEnv>> {
  serverlessAppPromise ??= createAppServer(false);
  return serverlessAppPromise;
}

export async function handleVercelRequest(req: Request): Promise<Response> {
  const app = await getServerlessApp();
  return handle(app)(req);
}

export default async function handler(
  req: IncomingMessage | Request,
  res?: ServerResponse
) {
  if (res) {
    const app = await getServerlessApp();
    nodeListener ??= getRequestListener(app.fetch);
    return nodeListener(req as IncomingMessage, res);
  }
  return handleVercelRequest(req as Request);
}

export async function startLocalNodeServer(): Promise<void> {
  const isProduction = process.env.NODE_ENV === 'production';
  const app = await createAppServer(true);
  const requestListener = getRequestListener(app.fetch);

  if (!isProduction) {
    let viteMiddleware:
      | ((req: IncomingMessage, res: ServerResponse, next: () => void) => void)
      | null = null;

    const server = http.createServer((req, res) => {
      const urlPath = (req.url || '/').split('?')[0];
      if (urlPath.startsWith('/api/') || urlPath === '/api' || urlPath.startsWith('/auth/')) {
        void requestListener(req, res);
        return;
      }

      // Garante headers compatíveis com iframe e popups do Firebase Auth / Strava OAuth no Vite Dev
      res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
      res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
      res.setHeader('X-Content-Type-Options', 'nosniff');

      if (!viteMiddleware) {
        void requestListener(req, res);
        return;
      }

      viteMiddleware(req, res, () => {
        void requestListener(req, res);
      });
    });

    const vitePkg = 'vite';
    const { createServer: createViteServer } = await import(vitePkg);
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        ws: { server },
      },
      appType: 'spa',
    });
    viteMiddleware = vite.middlewares;

    server.listen(PORT, '0.0.0.0', () => {
      console.log(`Fitness RPG & Saúde Hono server running on http://0.0.0.0:${PORT}`);
    });
    return;
  }

  const server = http.createServer((req, res) => {
    void requestListener(req, res);
  });

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Fitness RPG & Saúde Hono server running on http://0.0.0.0:${PORT}`);
  });
}
