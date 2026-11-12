import type { FastifyInstance } from 'fastify';
import { cardName, findCommanders } from '@mtg/commander-recs';
import { unavailable } from './commander-data';
import type { CommanderRouteOptions } from './commander-data';

export async function commanderRoutes(app: FastifyInstance, { index }: CommanderRouteOptions): Promise<void> {
  app.get<{
    Querystring: { q: string };
  }>('/api/commanders/search', {
    schema: {
      querystring: {
        type: 'object',
        required: ['q'],
        properties: {
          q: { type: 'string', minLength: 2 },
        },
      },
    },
    handler: async (request, reply) => {
      if (!index) return unavailable(reply);
      const { q } = request.query;

      // Searching the index the builder uses means every suggestion can be built.
      return reply.send({
        commanders: findCommanders(index, q).map(c => ({
          name: cardName(c),
          slug: cardName(c).toLowerCase().replace(/[^a-z0-9]+/g, '-'),
          colorIdentity: c.colorIdentity,
        })),
      });
    },
  });
}
