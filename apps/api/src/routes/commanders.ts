import type { FastifyInstance } from 'fastify';
import { searchCommanders, ScryfallNotFoundError } from '@mtg/scryfall';

export async function commanderRoutes(app: FastifyInstance): Promise<void> {
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
      const { q } = request.query;

      try {
        const cards = await searchCommanders(q);
        return reply.send({
          commanders: cards.map(c => ({
            name: c.name,
            slug: c.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
            colorIdentity: c.color_identity,
          })),
        });
      } catch (err) {
        if (err instanceof ScryfallNotFoundError) {
          return reply.send({ commanders: [] });
        }
        throw err;
      }
    },
  });
}
