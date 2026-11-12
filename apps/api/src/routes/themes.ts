import type { FastifyInstance } from 'fastify';
import { cardName, commandersForTheme, listThemes } from '@mtg/commander-recs';
import { unavailable } from './commander-data';
import type { CommanderRouteOptions } from './commander-data';

/** Fold a theme's slug or display name to one comparable form: `Wheels & Card Draw` → `wheels-card-draw`. */
function fold(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export async function themeRoutes(app: FastifyInstance, { index }: CommanderRouteOptions): Promise<void> {
  app.get('/api/themes', {
    handler: async (_request, reply) => {
      return reply.send({
        themes: listThemes().map(({ slug, name, description }) => ({ slug, displayName: name, description })),
      });
    },
  });

  app.post<{
    Body: { collectionText: string; theme: string };
  }>('/api/decks/build-from-theme', {
    schema: {
      body: {
        type: 'object',
        required: ['collectionText', 'theme'],
        properties: {
          collectionText: { type: 'string' },
          theme: { type: 'string' },
        },
      },
    },
    handler: async (request, reply) => {
      if (!index) return unavailable(reply);
      const { theme } = request.body;

      const wanted = fold(theme);
      const found = listThemes().find(t => t.slug === wanted || fold(t.name) === wanted);
      if (!found) return reply.status(404).send({ error: 'Theme not found', theme });

      const suggestedCommanders = commandersForTheme(index, found.slug, { limit: 5 }).map(c => ({
        name: cardName(c),
        // Scryfall's rank for the card anywhere in a deck; the bulk data has none for a card as a commander.
        edhrec_rank: c.edhrecRank ?? null,
        colorIdentity: c.colorIdentity,
      }));

      return reply.send({
        theme: found,
        suggestedCommanders,
        message: 'Select a commander to build a deck. Use POST /api/decks/build-from-commander with collectionText and commanderName.',
      });
    },
  });
}
