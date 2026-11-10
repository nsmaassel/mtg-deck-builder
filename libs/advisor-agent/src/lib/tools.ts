import { FunctionTool } from '@google/adk';
import { z } from 'zod';
import { FORMATS } from '@mtg/card-index';
import type { Format, IndexedCard } from '@mtg/card-index';
import {
  SubstituteFinder,
  checkDeck,
  deckFromTournamentList,
  describeMeta,
  frontColors,
  parseDeckText,
  parseFormat,
} from '@mtg/deck-advisor';
import type { AdvisorData, Collection, DeckCheck, SubstituteView } from '@mtg/deck-advisor';

/** What a conversation knows about the player. The browser sends it with every message. */
export interface PlayerContext {
  collection: Collection | null;
}

/** Tool results go into the model's context, so lists are kept this short. */
const MAX_DECKS = 12;
const MAX_STAND_INS = 3;
const MAX_CARDS_LOOKED_UP = 8;
const MAX_TAGS = 8;

const formatParam = z.string().describe(`Format name: one of ${FORMATS.join(', ')}. Arena names such as "HistoricBrawl" also work.`);

const percent = (value: number): number => Math.round(value * 1000) / 10;

function unknownFormat(format: string) {
  return { error: `Unknown format "${format}". Use one of: ${FORMATS.join(', ')}.` };
}

function standIn(substitute: SubstituteView) {
  return {
    card: substitute.card.name,
    match: substitute.quality,
    source: substitute.source === 'owned' ? `owned, ${substitute.available} spare` : `craft (${substitute.craftRarity} wildcard)`,
    why: substitute.reasons.join('; '),
  };
}

/** A deck check, cut down to what the model needs to explain it. */
function summarizeCheck(check: DeckCheck) {
  const { summary, plan } = check;
  return {
    format: check.format,
    deck: check.deckName ?? check.archetype,
    colors: check.colors.join('') || 'colourless',
    ownedPercent: percent(summary.completion),
    ownedCards: `${summary.ownedCards} of ${summary.totalCards}`,
    wildcardsToBuildExactly: summary.wildcardsNeeded,
    wildcardsShort: summary.wildcardsShort,
    craftableNow: summary.craftable,
    missing: check.cards.filter(card => card.missing > 0).map(card => ({
      card: card.name,
      board: card.board,
      copiesMissing: card.missing,
      status: card.status,
      wildcard: card.craftRarity,
      standIns: card.substitutes.slice(0, MAX_STAND_INS).map(standIn),
    })),
    buildableToday: {
      keepsPercentOfOriginal: percent(plan.fidelity),
      steps: plan.steps.map(step => ({
        action: step.action,
        copies: step.count,
        card: step.target,
        with: step.substitute?.card.name,
        match: step.substitute?.quality,
        wildcard: step.craftRarity,
        note: step.note,
      })),
      wildcardsSpent: plan.wildcardsSpent,
      wildcardsLeft: plan.wildcardsLeft,
    },
    unreadableLines: check.unrecognizedLines.length || undefined,
  };
}

function describeCard(card: IndexedCard, collection: Collection | null) {
  return {
    name: card.name,
    manaCost: card.manaCost || 'none',
    manaValue: card.cmc,
    type: card.typeLine,
    text: card.oracleText,
    onArena: card.onArena,
    craftWildcard: card.arenaRarity,
    legalIn: card.legal,
    bannedIn: card.banned.length ? card.banned : undefined,
    roles: card.tags.slice(0, MAX_TAGS),
    copiesOwned: collection ? (collection.owned.get(card.oracleId) ?? 0) : undefined,
  };
}

/**
 * The advisor's tools. Each one calls the deterministic engine and returns a
 * compact summary; none of them reaches the network.
 */
export function createAdvisorTools(data: AdvisorData, player: PlayerContext): FunctionTool[] {
  const empty: Collection = { owned: new Map() };
  const collection = () => player.collection ?? empty;

  const collectionSummary = new FunctionTool({
    name: 'collection_summary',
    description: 'Whether the player has loaded a collection, how many cards it holds, and the wildcards they can spend.',
    execute: () => {
      if (!player.collection) return { loaded: false };
      const copies = [...player.collection.owned.values()].reduce((sum, n) => sum + n, 0);
      const byRarity: Record<string, number> = {};
      for (const oracleId of player.collection.owned.keys()) {
        const rarity = data.index.get(oracleId)?.arenaRarity ?? 'not on Arena';
        byRarity[rarity] = (byRarity[rarity] ?? 0) + 1;
      }
      return {
        loaded: true,
        differentCards: player.collection.owned.size,
        copies,
        differentCardsByRarity: byRarity,
        wildcards: player.collection.wildcards ?? 'not given',
      };
    },
  });

  const listMetaDecks = new FunctionTool({
    name: 'list_meta_decks',
    description:
      'The tournament meta for a format (standard or pioneer): archetypes with meta share and win rate. ' +
      'With a collection loaded, each deck also shows how much of it the player owns and the wildcards still needed, ' +
      'and the list is ordered by how close the player is to building it.',
    parameters: z.object({ format: formatParam }),
    execute: ({ format }) => {
      const key = parseFormat(format);
      const snapshot = key ? data.meta.get(key) : undefined;
      if (!snapshot) {
        return { error: `No meta data for "${format}". Meta decks exist for: ${[...data.meta.keys()].join(', ') || 'no formats'}.` };
      }
      const view = describeMeta(snapshot, data, player.collection ?? undefined);
      const decks = view.archetypes.filter(a => !a.isOther && !a.isFringe).slice(0, MAX_DECKS);
      return {
        format: view.format,
        source: `${view.totalDecks} tournament lists from ${view.eventCount} events, ${view.from} to ${view.to}; not Arena ladder results`,
        fieldWinRatePercent: view.fieldWinRate === undefined ? undefined : percent(view.fieldWinRate),
        orderedBy: player.collection ? 'closest to the player\'s collection first' : 'most played first',
        decks: decks.map(deck => ({
          archetype: deck.id,
          name: deck.name,
          colors: deck.colors.join('') || 'colourless',
          metaSharePercent: percent(deck.metaShare),
          winRatePercent: deck.winRate === undefined ? undefined : percent(deck.winRate),
          keyCards: deck.keyCards,
          ownedPercent: deck.gap ? percent(deck.gap.completion) : undefined,
          wildcardsNeeded: deck.gap?.wildcardsNeeded,
          wildcardsShort: deck.gap?.wildcardsShort,
          craftableNow: deck.gap?.craftable,
        })),
      };
    },
  });

  const checkMetaDeck = new FunctionTool({
    name: 'check_meta_deck',
    description:
      'Check one meta archetype against the player\'s collection: cards owned, cards missing with the wildcard each costs, ' +
      'stand-ins for each missing card, and a version the player can build today. Use the archetype id from list_meta_decks.',
    parameters: z.object({
      format: formatParam,
      archetype: z.string().describe('Archetype id from list_meta_decks, e.g. "izzet-prowess".'),
      spendWildcards: z.boolean().optional().describe('False to keep every wildcard and fill gaps with swaps only. Default true.'),
    }),
    execute: ({ format, archetype, spendWildcards }) => {
      const key = parseFormat(format);
      if (!key) return unknownFormat(format);
      const found = data.meta.get(key)?.archetypes.find(a => a.id === archetype);
      if (!found) return { error: `No archetype "${archetype}" in ${key}. Call list_meta_decks for the ids.` };
      const check = checkDeck(deckFromTournamentList(found.representative, found.name), key, collection(), data, {
        archetype: found,
        craft: spendWildcards === false ? 'none' : 'inventory',
      });
      const { player: pilot, result, event, date } = found.representative;
      return { list: `${pilot}, ${result}, ${event} (${date})`, ...summarizeCheck(check) };
    },
  });

  const checkDecklist = new FunctionTool({
    name: 'check_decklist',
    description:
      'Check a decklist the player pasted against their collection, in any format. Same result as check_meta_deck. ' +
      'Pass the list exactly as the player wrote it.',
    parameters: z.object({
      deckText: z.string().max(20_000).describe('The decklist: one "<count> <card name>" per line, or an MTG Arena export.'),
      format: formatParam,
      spendWildcards: z.boolean().optional().describe('False to keep every wildcard and fill gaps with swaps only. Default true.'),
    }),
    execute: ({ deckText, format, spendWildcards }) => {
      const key = parseFormat(format);
      if (!key) return unknownFormat(format);
      const deck = parseDeckText(deckText);
      if (deck.commander.length + deck.main.length + deck.sideboard.length === 0) {
        return { error: 'No cards could be read from that text. A decklist has one "<count> <card name>" per line.' };
      }
      const check = checkDeck(deck, key, collection(), data, { craft: spendWildcards === false ? 'none' : 'inventory' });
      return summarizeCheck(check);
    },
  });

  const lookupCards = new FunctionTool({
    name: 'lookup_cards',
    description: 'Rules text, cost, type, legality, Arena wildcard rarity and functional roles of up to 8 cards, and how many copies the player owns.',
    parameters: z.object({ names: z.array(z.string()).min(1).max(MAX_CARDS_LOOKED_UP).describe('Card names.') }),
    execute: ({ names }) => ({
      cards: names.map(name => {
        const card = data.index.byName(name);
        return card ? describeCard(card, player.collection) : { name, error: 'No card by this name.' };
      }),
    }),
  });

  const findStandIns = new FunctionTool({
    name: 'find_stand_ins',
    description:
      'Stand-ins for a single card outside a full decklist: cards the player owns that do the same job, and cheaper crafts. ' +
      'For a card in a known deck, prefer check_meta_deck or check_decklist, which also respect the deck\'s other cards.',
    parameters: z.object({
      card: z.string().describe('The card to replace.'),
      format: formatParam,
      deckColors: z.string().optional().describe('Colours the deck plays, as letters from WUBRG, e.g. "UR". Defaults to the card\'s own colours.'),
    }),
    execute: ({ card: name, format, deckColors }) => {
      const key = parseFormat(format) as Format | undefined;
      if (!key) return unknownFormat(format);
      const card = data.index.byName(name);
      if (!card) return { error: `No card named "${name}".` };
      const colors = deckColors
        ? [...deckColors.toUpperCase()].filter(c => 'WUBRG'.includes(c))
        : card.colorIdentity.length ? card.colorIdentity : frontColors(card);
      const finder = new SubstituteFinder({
        index: data.index, format: key, collection: collection(), colors, inDeck: new Map(), text: data.text,
      });
      const found = finder.suggest(card, { limit: 5 });
      return {
        card: card.name,
        format: key,
        colors: colors.join('') || 'colourless',
        standIns: found.map(s => ({
          card: s.card.name,
          match: s.quality,
          source: s.source === 'owned' ? `owned, ${Number.isFinite(s.available) ? s.available : 'any number'} spare` : `craft (${s.craftRarity} wildcard)`,
          why: s.reasons.join('; '),
        })),
      };
    },
  });

  return [collectionSummary, listMetaDecks, checkMetaDeck, checkDecklist, lookupCards, findStandIns];
}
