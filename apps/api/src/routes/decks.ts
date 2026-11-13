import type { FastifyInstance } from 'fastify';
import type { CardIndex, IndexedCard } from '@mtg/card-index';
import { parseArenaCollection } from '@mtg/collection';
import { canBeCommander, profileCommander } from '@mtg/commander-recs';
import { getCardByName, ScryfallNotFoundError } from '@mtg/scryfall';
import { buildDeck, buildDeckForBracket, candidatesFor, comboLines } from '@mtg/deck-builder';
import type { Bracket } from '@mtg/power-level';
import { assessPowerLevel, bracketMethod } from '@mtg/power-level';
import { explainDeck, explainDeckCallsModel, EXPLAIN_DECK_MAX_OUTPUT_TOKENS } from '@mtg/ai-advisor';
import { unavailable } from './commander-data';
import type { CommanderRouteOptions } from './commander-data';

/**
 * The commander as the index knows it. A name the index does not have as
 * typed ("krenko mob boss") goes to Scryfall's fuzzy search for its proper
 * spelling; that is the only request a build makes to anyone.
 */
async function findCommander(index: CardIndex, name: string): Promise<IndexedCard | undefined> {
  const exact = index.byName(name);
  if (exact) return exact;
  try {
    return index.byName((await getCardByName(name)).name);
  } catch (err) {
    if (err instanceof ScryfallNotFoundError) return undefined;
    throw err;
  }
}

/** A Commander deck is 100 cards; the room above that is for a list still being cut. */
const EXPLAIN_MAX_CARDS = 150;
const EXPLAIN_MAX_NAME_LENGTH = 150;
/** The builder uses eight slots; a slot's name is a word. */
const EXPLAIN_MAX_SLOTS = 20;
const EXPLAIN_MAX_SLOT_NAME_LENGTH = 40;

/**
 * Everything of a deck that reaches the prompt when it is sent for an explanation (the
 * commander, the slot names and the card names), or null when it is not a deck a model
 * should be paid to read. Their number and length are what bound a call's cost.
 */
function explainableNames(deck: unknown, commanderName: string): string[] | null {
  const slots = (deck as { slots?: unknown } | null)?.slots;
  if (!slots || typeof slots !== 'object' || Array.isArray(slots)) return null;
  const slotNames = Object.keys(slots);
  if (slotNames.length > EXPLAIN_MAX_SLOTS || slotNames.some(slot => slot.length > EXPLAIN_MAX_SLOT_NAME_LENGTH)) return null;
  const names = [commanderName];
  for (const cards of Object.values(slots)) {
    if (!Array.isArray(cards)) return null;
    for (const card of cards) {
      const name = (card as { name?: unknown } | null)?.name;
      if (typeof name !== 'string') return null;
      names.push(name);
    }
  }
  if (names.length > EXPLAIN_MAX_CARDS + 1 || names.some(name => name.length > EXPLAIN_MAX_NAME_LENGTH)) return null;
  return [...names, ...slotNames];
}

export async function deckRoutes(app: FastifyInstance, { index, combos, chatBudget }: CommanderRouteOptions): Promise<void> {
  // How a bracket is worked out and where each signal comes from, sent with every build so the page can show it.
  const method = bracketMethod(
    index
      ? { cardDataDate: index.builtAt.slice(0, 10), gameChangerCount: index.all().filter(card => card.gameChanger).length }
      : {},
  );

  app.post<{
    Body: {
      collectionText?: string;
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
        required: ['commanderName'],
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
      if (!index) return unavailable(reply);
      const { collectionText, commanderName, options } = request.body;
      const mode = options?.mode ?? 'prefer-owned';
      const budgetMaxPrice = options?.budgetMaxPrice ?? 5;
      const targetBracket = options?.targetBracket;

      // Parse collection from the provider; otherwise use empty collection (new player path)
      const parseResult = collectionText?.trim()
        ? parseArenaCollection(collectionText)
        : parseArenaCollection('');

      const nonBasicCount = Array.from(parseResult.collection.values())
        .filter(c => !['plains','island','swamp','mountain','forest','wastes',
          'snow-covered plains','snow-covered island','snow-covered swamp',
          'snow-covered mountain','snow-covered forest'].includes(c.normalizedName))
        .length;

      // If user provided collection text, validate it parses to something meaningful
      if (collectionText?.trim() && nonBasicCount === 0) {
        return reply.status(400).send({
          error: 'Invalid collection format',
          message: 'Could not parse collection. Use MTG Arena export format.',
          unrecognizedLines: parseResult.unrecognizedLines,
        });
      }

      // Owned-only mode fundamentally requires a collection to draw from.
      // Without any non-basic owned cards there is nothing to build — reject
      // with a clear message rather than silently returning a broken deck.
      if (mode === 'owned-only' && nonBasicCount === 0) {
        return reply.status(400).send({
          error: 'Owned Only mode requires a collection',
          message: 'To build strictly from your own cards, paste your MTG Arena collection export. Or select "I\'m new to Commander" with a different mode.',
        });
      }

      const commander = await findCommander(index, commanderName);
      if (!commander) {
        return reply.status(404).send({ error: 'Commander not found', commanderName });
      }

      // Validate commander is legal in Commander format
      if (!commander.legal.includes('commander')) {
        return reply.status(422).send({
          error: 'Commander not legal',
          message: `${commanderName} is not legal in Commander format`,
        });
      }
      // Legal in the format is not the same as able to lead a deck: Sol Ring is legal in the 99.
      if (!canBeCommander(commander)) {
        return reply.status(422).send({
          error: 'Not a commander',
          message: `${commander.name} cannot be a commander. Pick a legendary creature, or a card that says it can be your commander.`,
        });
      }

      // Recommendations come from the local card index: what this commander
      // is about, the best cards for it, and every owned card scored on its merits.
      const profile = profileCommander(index, commander);
      const { recommendations, owned } = candidatesFor(index, profile, parseResult.collection, { mode, budgetMaxPrice });

      // With a target the build is steered to that bracket; combos count towards it when their data is loaded.
      const input = { profile, recommendations, owned, options: { mode, budgetMaxPrice, targetBracket } };
      const result = targetBracket
        ? buildDeckForBracket(input, targetBracket, deck => (combos ? comboLines(index, combos, deck) : []))
        : buildDeck(input);

      // Candidate pool for swap suggestions: recommendations not in the final deck
      const deckNames = new Set(
        [result.deck.commander, ...Object.values(result.deck.slots).flat()].map(c => c.name)
      );
      // Cards the bracket tuning took out on purpose are not offered back.
      const leftOut = new Set(result.bracketTuning?.leftOut.map(card => card.name));
      const swapCandidates = recommendations.filter(r => !deckNames.has(r.name) && !leftOut.has(r.name));

      // Assess again with what the build itself could not know: the cards left out, for swap
      // suggestions, and the combos in the deck, from Commander Spellbook's data when it is loaded.
      const lines = combos ? comboLines(index, combos, result.deck) : [];
      const powerLevel = assessPowerLevel(result.deck, result.analysis, targetBracket, swapCandidates, lines);

      return reply.send({ ...result, powerLevel, bracketMethod: method });
    },
  });

  app.post<{
    Body: { deck: unknown; commanderName: string };
  }>('/api/ai/explain-deck', {
    // A built deck with all its card details is about a tenth of this.
    bodyLimit: 256 * 1024,
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
      const names = explainableNames(deck, commanderName);
      if (!names) {
        return reply.status(400).send({
          error: 'Not a deck',
          message: `An explanation needs a deck of at most ${EXPLAIN_MAX_CARDS} named cards, grouped into at most ${EXPLAIN_MAX_SLOTS} slots.`,
        });
      }

      // With a model key this is a paid call, so it counts against the same ceiling as the chat.
      const paid = explainDeckCallsModel();
      const decision = paid ? chatBudget?.spend() : undefined;
      if (decision && !decision.allowed) {
        return reply.status(429).send({
          error: 'Budget reached',
          message: decision.reason === 'day'
            ? 'The explanation is not available again today: the daily budget for model calls is used up. The deck itself is unaffected.'
            : 'A lot of questions are being answered right now. Try again in a minute.',
        });
      }

      try {
        const result = await explainDeck({
          deck: deck as Parameters<typeof explainDeck>[0]['deck'],
          commanderName,
        });
        return reply.send(result);
      } finally {
        // The call reports no token counts, so charge what it can have used at most, answered or
        // not: about four characters a token for the names, with the separators and "(none)" of an
        // empty slot, and the instructions around them.
        if (paid) {
          const promptTokens = Math.ceil((names.join(' (none) ').length + 2000) / 4);
          chatBudget?.charge({ promptTokens, outputTokens: EXPLAIN_DECK_MAX_OUTPUT_TOKENS, thinkingTokens: 0 });
          chatBudget?.done();
        }
      }
    },
  });
}
