import type { FastifyInstance } from 'fastify';
import { parseArenaCollection } from '@mtg/collection';

const BASIC_LANDS = new Set([
  'plains', 'island', 'swamp', 'mountain', 'forest', 'wastes',
  'snow-covered plains', 'snow-covered island', 'snow-covered swamp',
  'snow-covered mountain', 'snow-covered forest',
]);

export async function collectionRoutes(app: FastifyInstance): Promise<void> {
  app.post<{
    Body: { collectionText: string };
  }>('/api/collection/parse', {
    schema: {
      body: {
        type: 'object',
        required: ['collectionText'],
        properties: {
          collectionText: { type: 'string' },
        },
      },
    },
    handler: async (request, reply) => {
      const { collectionText } = request.body;
      const result = parseArenaCollection(collectionText);

      const nonBasicCards = Array.from(result.collection.values())
        .filter(c => !BASIC_LANDS.has(c.normalizedName));

      if (nonBasicCards.length === 0) {
        return reply.status(400).send({
          error: 'Invalid collection format',
          message: 'Collection text could not be parsed. Use MTG Arena export format.',
          unrecognizedLines: result.unrecognizedLines,
        });
      }

      return reply.send({
        cards: nonBasicCards,
        commandersFound: result.commandersFound,
        totalCards: nonBasicCards.length,
        unrecognizedLines: result.unrecognizedLines,
      });
    },
  });
}
