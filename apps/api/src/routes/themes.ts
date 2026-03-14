import type { FastifyInstance } from 'fastify';
import { getThemeData, EDHRecNotFoundError } from '@mtg/edhrec';

const POPULAR_THEMES = [
  { slug: 'tokens', displayName: 'Tokens', description: 'Go wide with creature tokens and anthems' },
  { slug: 'voltron', displayName: 'Voltron', description: 'Stack equipment and auras on your commander' },
  { slug: 'control', displayName: 'Control', description: 'Counter spells and draw into a winning position' },
  { slug: 'combo', displayName: 'Combo', description: 'Assemble infinite combos for a sudden win' },
  { slug: 'stompy', displayName: 'Stompy', description: 'Play big green creatures and win with combat' },
  { slug: 'reanimator', displayName: 'Reanimator', description: 'Fill the graveyard and bring back fatties' },
  { slug: 'aristocrats', displayName: 'Aristocrats', description: 'Sacrifice creatures for value and drain' },
  { slug: 'spellslinger', displayName: 'Spellslinger', description: 'Cast instants and sorceries for value' },
  { slug: 'artifacts', displayName: 'Artifacts', description: 'Build an artifact engine to dominate' },
  { slug: 'enchantress', displayName: 'Enchantress', description: 'Draw cards and accrue value from enchantments' },
];

export async function themeRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/themes', {
    handler: async (_request, reply) => {
      return reply.send({ themes: POPULAR_THEMES });
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
      const { theme } = request.body;

      try {
        const themeData = await getThemeData(theme);
        const suggestedCommanders = (themeData.commanders ?? []).slice(0, 5).map((c: { name: string; edhrec_rank?: number; colorIdentity?: string[] }) => ({
          name: c.name,
          edhrec_rank: c.edhrec_rank ?? 0,
          colorIdentity: c.colorIdentity ?? [],
        }));

        return reply.send({
          suggestedCommanders,
          message: 'Select a commander to build a deck. Use POST /api/decks/build-from-commander with collectionText and commanderName.',
        });
      } catch (err) {
        if (err instanceof EDHRecNotFoundError) {
          return reply.status(404).send({ error: 'Theme not found', theme });
        }
        throw err;
      }
    },
  });
}
