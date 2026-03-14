import Fastify from 'fastify';
import { collectionRoutes } from './routes/collection';
import { commanderRoutes } from './routes/commanders';
import { deckRoutes } from './routes/decks';
import { themeRoutes } from './routes/themes';

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

  return app;
}
