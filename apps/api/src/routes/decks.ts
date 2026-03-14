import type { FastifyInstance } from 'fastify';
import { parseArenaCollection } from '@mtg/collection';
import { getCardByName, ScryfallNotFoundError } from '@mtg/scryfall';
import { getCommanderData, EDHRecNotFoundError } from '@mtg/edhrec';
import { buildDeck } from '@mtg/deck-builder';
import type { Bracket } from '@mtg/power-level';
import { assessPowerLevelWithCombos } from '@mtg/power-level';
import { explainDeck } from '@mtg/ai-advisor';

export async function deckRoutes(app: FastifyInstance): Promise<void> {
  app.post<{
    Body: {
      collectionText: string;
      commanderName: string;
      options?: {
        mode?: 'prefer-owned' | 'owned-only' | 'budget';
        budgetMaxPrice?: number;
        targetBracket?: Bracket;
      };
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
              mode: { type: 'string', enum: ['prefer-owned', 'owned-only', 'budget'] },
              budgetMaxPrice: { type: 'number', minimum: 0 },
              targetBracket: { type: 'number', minimum: 1, maximum: 5 },
            },
          },
        },
      },
    },
    handler: async (request, reply) => {
      const { collectionText, commanderName, options } = request.body;
      const mode = options?.mode ?? 'prefer-owned';
      const budgetMaxPrice = options?.budgetMaxPrice ?? 5;
      const targetBracket = options?.targetBracket;

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
        edhrecCards = edhrecData.cardlist;
      } catch (err) {
        if (err instanceof EDHRecNotFoundError) {
          return reply.status(404).send({ error: 'Commander not found on EDHRec', commanderName });
        }
        throw err;
      }

      // Resolve Scryfall data for owned collection cards
      const collectionScryfallData = new Map<string, typeof commanderCard>();
      const ownedNames = Array.from(parseResult.collection.keys());
      await Promise.allSettled(
        ownedNames.map(async name => {
          try {
            const card = await getCardByName(name);
            collectionScryfallData.set(name.toLowerCase(), card);
          } catch {
            // Skip cards not found on Scryfall
          }
        }),
      );

      // For budget mode: also fetch Scryfall data for top unowned recommendations
      // so the builder can price-filter them before placing
      if (mode === 'budget') {
        const ownedSet = new Set(ownedNames.map(n => n.toLowerCase()));
        const topUnowned = edhrecCards
          .filter(c => !ownedSet.has(c.name.toLowerCase()))
          .slice(0, 80); // top 80 by EDHRec order (already sorted by inclusion)
        await Promise.allSettled(
          topUnowned.map(async card => {
            const norm = card.name.toLowerCase();
            if (collectionScryfallData.has(norm)) return;
            try {
              const sf = await getCardByName(card.name);
              collectionScryfallData.set(norm, sf);
            } catch {
              // Not found — builder will include speculatively
            }
          }),
        );
      }

      // Build the deck
      const result = buildDeck({
        commanderCard,
        edhrecCards,
        collection: parseResult.collection,
        collectionScryfallData,
        options: { mode, budgetMaxPrice, targetBracket },
      });

      // Build candidate pool for swap suggestions: EDHRec cards not in the final deck
      const deckNames = new Set(
        [result.deck.commander, ...Object.values(result.deck.slots).flat()].map(c => c.name.toLowerCase())
      );
      const edhrecCandidates = edhrecCards
        .filter(c => !deckNames.has(c.name.toLowerCase()))
        .map(c => ({ name: c.name, inclusion: c.inclusion, synergy: c.synergy, label: c.label }));

      // Enhance power level with Commander Spellbook combo detection (async, best-effort)
      const powerLevel = await assessPowerLevelWithCombos(result.deck, result.analysis, targetBracket, edhrecCandidates);

      return reply.send({ ...result, powerLevel });
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
