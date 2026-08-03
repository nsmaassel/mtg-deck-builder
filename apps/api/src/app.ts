import Fastify, { type FastifyReply } from 'fastify';
import { collectionRoutes } from './routes/collection';
import { commanderRoutes } from './routes/commanders';
import { deckRoutes } from './routes/decks';
import { themeRoutes } from './routes/themes';
import { resolve } from 'path';
import { existsSync, readFileSync, statSync } from 'fs';

// In production, the Fastify server also serves the built web SPA. The Docker
// runner lays out output as <cwd>/dist/... (WORKDIR is the repo root), so the
// built SPA is found relative to the current working directory.
const WEB_DIST_PATHS = [
  resolve(process.cwd(), 'dist/apps/web'),  // Docker (WORKDIR=/app) + local build
  resolve(process.cwd(), '../../dist/apps/web'),
];

function findWebDist(): string | null {
  for (const p of WEB_DIST_PATHS) {
    if (existsSync(p)) return p;
  }
  return null;
}

/** Serve a built SPA (static files + index.html fallback) coexisting with /api routes. */
async function serveStatic(url: string, reply: FastifyReply): Promise<boolean> {
  const webDist = findWebDist();
  if (!webDist) return false;

  const reqUrl = url.split('?')[0] ?? '/';

  // Never serve index.html for API or unknown API-like paths
  if (reqUrl.startsWith('/api/')) return false;

  // Resolve requested path within the web dist root (guard against traversal)
  const requested = reqUrl === '/' ? 'index.html' : reqUrl.replace(/^\/+/, '');
  const filePath = resolve(webDist, requested);
  if (!filePath.startsWith(webDist)) return false;

  try {
    if (existsSync(filePath) && statSync(filePath).isFile()) {
      const contentType =
        filePath.endsWith('.html') ? 'text/html'
        : filePath.endsWith('.js') ? 'application/javascript'
        : filePath.endsWith('.css') ? 'text/css'
        : filePath.endsWith('.svg') ? 'image/svg+xml'
        : filePath.endsWith('.png') ? 'image/png'
        : filePath.endsWith('.ico') ? 'image/x-icon'
        : 'application/octet-stream';
      reply.type(contentType);
      if (contentType === 'text/html') reply.header('Cache-Control', 'no-cache');
      reply.send(readFileSync(filePath));
      return true;
    }
  } catch {
    // fall through to SPA fallback or 404
  }

  // SPA fallback: any non-API, non-existent path serves index.html (client-side routing)
  const indexPath = resolve(webDist, 'index.html');
  if (reqUrl !== '/' && existsSync(indexPath)) {
    reply.type('text/html').header('Cache-Control', 'no-cache').send(readFileSync(indexPath));
    return true;
  }

  return false;
}

export function buildApp() {
  const app = Fastify({
    logger: {
      level: process.env['LOG_LEVEL'] ?? 'info',
    },
  });

  // CORS for web frontend
  app.addHook('onRequest', async (request, reply) => {
    reply.header('Access-Control-Allow-Origin', process.env['CORS_ORIGIN'] ?? '*');
    reply.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    reply.header('Access-Control-Allow-Headers', 'Content-Type');
    if (request.method === 'OPTIONS') {
      return reply.status(204).send();
    }
  });

  app.get('/health', async () => ({ status: 'ok', version: '1.0.0' }));

  app.register(collectionRoutes);
  app.register(commanderRoutes);
  app.register(deckRoutes);
  app.register(themeRoutes);

  // Catch-all: serve the SPA (static files + index.html fallback), or 404 for /api
  app.setNotFoundHandler(async (request, reply) => {
    const served = await serveStatic(request.url, reply);
    if (!served) {
      if (request.url.startsWith('/api/')) {
        return reply.status(404).send({ error: 'Not found' });
      }
      return reply.status(404).send({ error: 'Frontend not built. Run `pnpm build` first.' });
    }
  });

  return app;
}