import type { FastifyInstance } from 'fastify';
import { parseArenaCollection } from '@mtg/collection';
import { getCardByName, ScryfallNotFoundError } from '@mtg/scryfall';
import { getCommanderData, EDHRecNotFoundError } from '@mtg/edhrec';
import { buildDeck } from '@mtg/deck-builder';
import { explainDeck } from '@mtg/ai-advisor';

export async function deckRoutes(app: FastifyInstance): Promise<void> {
  app.post<{
    Body: {
      collectionText: string;
      commanderName: string;
      options?: { budget?: 'any' | 'budget' };
    };
  }>('/api/decks/build-from-commander', {
    schema: {
      body: {
        type: 'object',
        required: ['collectionText', 'commanderName'],
        properties: {
          collectionText: { type: 'string' },
          commanderName: { type: 'string' },
          options: {
            type: 'object',
            properties: {
              budget: { type: 'string', enum: ['any', 'budget'] },
            },
          },
        },
      },
    },
    handler: async (request, reply) => {
      const { collectionText, commanderName, options } = request.body;

      const parseResult = parseArenaCollection(collectionText);

      // Count non-basic-land cards as a proxy for "valid non-empty input"
      const nonBasicCount = Array.from(parseResult.collection.values())
        .filter(c => !['plains','island','swamp','mountain','forest','wastes',
          'snow-covered plains','snow-covered island','snow-covered swamp',
          'snow-covered mountain','snow-covered forest'].includes(c.normalizedName))
        .length;

      if (nonBasicCount === 0) {
        return reply.status(400).send({
          error: 'Invalid collection format',
          message: 'Could not parse collection. Use MTG Arena export format.',
          unrecognizedLines: parseResult.unrecognizedLines,
        });
      }

      // Validate commander exists in Scryfall
      let commanderCard;
      try {
        commanderCard = await getCardByName(commanderName);
      } catch (err) {
        if (err instanceof ScryfallNotFoundError) {
          return reply.status(404).send({ error: 'Commander not found', commanderName });
        }
        throw err;
      }

      // Validate commander is legal in Commander format
      if (commanderCard.legalities.commander !== 'legal') {
        return reply.status(422).send({
          error: 'Commander not legal',
          message: `${commanderName} is not legal in Commander format`,
        });
      }

      // Fetch EDHRec recommendations
      let edhrecCards;
      try {
        const edhrecData = await getCommanderData(commanderName);
        edhrecCards = edhrecData.cards;
      } catch (err) {
        if (err instanceof EDHRecNotFoundError) {
          return reply.status(404).send({ error: 'Commander not found on EDHRec', commanderName });
        }
        throw err;
      }

      // Resolve Scryfall data for owned cards
      const collectionScryfallData = new Map<string, typeof commanderCard>();
      const cardNames = Array.from(parseResult.collection.keys());
      await Promise.allSettled(
        cardNames.map(async name => {
          try {
            const card = await getCardByName(name);
            collectionScryfallData.set(name.toLowerCase(), card);
          } catch {
            // Skip cards not found — parser already handled basic lands
          }
        }),
      );

      // Build the deck
      const result = buildDeck({
        commanderCard,
        edhrecCards,
        collection: parseResult.collection,
        collectionScryfallData,
        options,
      });

      return reply.send(result);
    },
  });

  app.post<{
    Body: { deck: unknown; commanderName: string };
  }>('/api/ai/explain-deck', {
    schema: {
      body: {
        type: 'object',
        required: ['deck', 'commanderName'],
        properties: {
          deck: { type: 'object' },
          commanderName: { type: 'string' },
        },
      },
    },
    handler: async (request, reply) => {
      const { deck, commanderName } = request.body;
      const result = await explainDeck({
        deck: deck as Parameters<typeof explainDeck>[0]['deck'],
        commanderName,
      });
      return reply.send(result);
    },
  });
}
