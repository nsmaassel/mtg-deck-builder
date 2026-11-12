import { FunctionTool } from '@google/adk';
import { z } from 'zod';
import { FORMATS } from '@mtg/card-index';
import type { Format, IndexedCard } from '@mtg/card-index';
import {
  SubstituteFinder,
  checkDeck,
  collectionCombos,
  deckFromTournamentList,
  describeMeta,
  frontColors,
  parseDeckText,
  parseFormat,
} from '@mtg/deck-advisor';
import type {
  AdvisorData,
  Collection,
  ComboCompleterView,
  ComboView,
  DeckCheck,
  DeckTuneView,
  TuneCardView,
} from '@mtg/deck-advisor';

/** What a conversation knows about the player. The browser sends it with every message. */
export interface PlayerContext {
  collection: Collection | null;
}

/** Tool results go into the model's context, so lists are kept this short. */
const MAX_DECKS = 12;
const MAX_STAND_INS = 3;
const MAX_CARDS_LOOKED_UP = 8;
const MAX_TAGS = 8;
const MAX_TUNE_ROWS = 5;
const MAX_COMBOS = 4;

const COMBO_SOURCE =
  'Commander Spellbook (commanderspellbook.com). Each combo there also lists prerequisites (mana, cards in play) and steps that are not included here.';

const formatParam = z.string().describe(`Format name: one of ${FORMATS.join(', ')}. Arena names such as "HistoricBrawl" also work.`);

const percent = (value: number): number => Math.round(value * 1000) / 10;

function unknownFormat(format: string) {
  return { error: `Unknown format "${format}". Use one of: ${FORMATS.join(', ')}.` };
}

/** The service reports "any number" as this many copies. */
const UNLIMITED = 99;

interface StandIn {
  card: { name: string };
  quality: string;
  source: 'owned' | 'craft';
  available: number;
  craftRarity?: string;
  reasons: string[];
}

function standIn(substitute: StandIn) {
  const spare = substitute.available >= UNLIMITED ? 'any number' : String(substitute.available);
  return {
    card: substitute.card.name,
    match: substitute.quality,
    source: substitute.source === 'owned' ? `owned, ${spare} spare` : `craft (${substitute.craftRarity} wildcard)`,
    why: substitute.reasons.join('; '),
  };
}

const NO_COLLECTION_NOTE =
  'No collection is loaded, so every card is counted as not owned. Say so, and suggest loading one in the "Your collection" panel.';

function combo(view: ComboView) {
  return {
    cards: view.cards.map(card => card.name),
    does: view.moreResults ? [...view.produces, `and ${view.moreResults} more`] : view.produces,
    alsoNeeds: view.alsoNeeds.length ? view.alsoNeeds : undefined,
    decksUsingIt: view.popularity,
  };
}

function comboCompleter(view: ComboCompleterView, collectionLoaded: boolean) {
  return {
    card: view.card.name,
    copiesOwned: collectionLoaded ? view.owned : undefined,
    wildcard: view.card.arenaRarity,
    finishesCombos: view.finishes,
    forExample: combo(view.combos[0]!),
  };
}

/** The list against its archetype's tournament lists, with the field names doing the explaining. */
function summarizeTune(tune: DeckTuneView, collectionLoaded: boolean) {
  const row = (entry: TuneCardView) => ({
    card: entry.card.name,
    playedByPercentOfLists: percent(entry.share),
    usualCopies: entry.typicalCopies || undefined,
    copiesInThisList: entry.inDeck,
    copiesOwned: collectionLoaded ? entry.owned : undefined,
    wildcard: entry.craftRarity,
  });
  return {
    archetype: tune.archetype,
    tournamentLists: tune.lists,
    resemblancePercent: tune.similarity === undefined ? undefined : percent(tune.similarity),
    mostListsPlayButThisOneLacks: tune.missingStaples.slice(0, MAX_TUNE_ROWS).map(row),
    thisOnePlaysButFewListsDo: tune.unusual.slice(0, MAX_TUNE_ROWS).map(row),
    sideboardCardsMostListsBring: tune.sideboardStaples.slice(0, MAX_TUNE_ROWS).map(row),
  };
}

/** A deck check, cut down to what the model needs to explain it. */
function summarizeCheck(check: DeckCheck, collectionLoaded: boolean) {
  const { summary, plan } = check;
  return {
    collectionLoaded,
    note: collectionLoaded ? undefined : NO_COLLECTION_NOTE,
    format: check.format,
    deck: check.deckName ?? check.archetype,
    colors: check.colors.join('') || 'colourless',
    problems: check.issues.length ? check.issues.map(issue => issue.message) : undefined,
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
      sameAsOriginalPercent: percent(plan.fidelity),
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
    comparedWithTournamentLists: check.tune && summarizeTune(check.tune, collectionLoaded),
    combos: check.combos && (check.combos.inDeckTotal > 0 || check.combos.oneCardAway.length > 0)
      ? {
        source: COMBO_SOURCE,
        inThisList: check.combos.inDeckTotal,
        mostPlayedInThisList: check.combos.inDeck.slice(0, MAX_COMBOS).map(combo),
        oneCardWouldAdd: check.combos.oneCardAway.slice(0, MAX_COMBOS).map(entry => comboCompleter(entry, collectionLoaded)),
      }
      : undefined,
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

export interface ToolLimits {
  /** Tool runs allowed over the lifetime of this set of tools, which the chat builds once per turn. */
  maxCalls?: number;
}

const TOO_MANY_CALLS = {
  error: 'Too many checks for one question. Answer from the results you already have, and ask the player to narrow the question down if that is not enough.',
};

/** True for what a tool returns once the turn's allowance of runs is used up: the tool itself did not run. */
export function isRefusedByLimit(result: unknown): boolean {
  return result === TOO_MANY_CALLS || (typeof result === 'object' && result !== null && (result as { error?: unknown }).error === TOO_MANY_CALLS.error);
}

/**
 * The advisor's tools. Each one calls the deterministic engine and returns a
 * compact summary; none of them reaches the network.
 */
export function createAdvisorTools(data: AdvisorData, player: PlayerContext, limits: ToolLimits = {}): FunctionTool[] {
  // Every result rides along in each later model call of the turn, so the number of runs is what bounds a turn's cost.
  let calls = 0;
  const limited = <Args extends unknown[], Result>(execute: (...args: Args) => Result) =>
    (...args: Args): Result | typeof TOO_MANY_CALLS => {
      calls += 1;
      return limits.maxCalls !== undefined && calls > limits.maxCalls ? TOO_MANY_CALLS : execute(...args);
    };

  // A name that matches nothing comes back with the nearest real names, so the model has something true to offer.
  const noSuchCard = (name: string) => {
    const closestNames = data.index.closest(name).map(card => card.name);
    return { error: `No card named "${name}".`, closestNames: closestNames.length ? closestNames : undefined };
  };

  const empty: Collection = { owned: new Map() };
  const collection = () => player.collection ?? empty;
  const loaded = player.collection !== null;

  // Working out which cards may enter a deck scans the whole card pool, so a finder is kept per
  // format and colours for the turn: the model often asks about several cards of one deck.
  const finders = new Map<string, SubstituteFinder>();
  const finderFor = (format: Format, colors: string[]): SubstituteFinder => {
    const key = `${format}:${colors.join('')}`;
    let finder = finders.get(key);
    if (!finder) {
      finder = new SubstituteFinder({
        index: data.index, format, collection: collection(), colors, inDeck: new Map(), text: data.text,
      });
      finders.set(key, finder);
    }
    return finder;
  };

  const collectionSummary = new FunctionTool({
    name: 'collection_summary',
    description: 'Whether the player has loaded a collection, how many cards it holds, and the wildcards they can spend.',
    execute: limited(() => {
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
    }),
  });

  const listMetaDecks = new FunctionTool({
    name: 'list_meta_decks',
    description:
      'The tournament meta for a format (standard or pioneer): archetypes with meta share and win rate. ' +
      'With a collection loaded, each deck also shows how much of it the player owns and the wildcards still needed, ' +
      'and the list is ordered by how close the player is to building it.',
    parameters: z.object({ format: formatParam }),
    execute: limited(({ format }) => {
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
    }),
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
    execute: limited(({ format, archetype, spendWildcards }) => {
      const key = parseFormat(format);
      if (!key) return unknownFormat(format);
      const found = data.meta.get(key)?.archetypes.find(a => a.id === archetype);
      if (!found) return { error: `No archetype "${archetype}" in ${key}. Call list_meta_decks for the ids.` };
      const check = checkDeck(deckFromTournamentList(found.representative, found.name), key, collection(), data, {
        archetype: found,
        craft: spendWildcards === false ? 'none' : 'inventory',
      });
      const { player: pilot, result, event, date } = found.representative;
      return { list: `${pilot}, ${result}, ${event} (${date})`, ...summarizeCheck(check, loaded) };
    }),
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
    execute: limited(({ deckText, format, spendWildcards }) => {
      const key = parseFormat(format);
      if (!key) return unknownFormat(format);
      const deck = parseDeckText(deckText);
      if (deck.commander.length + deck.main.length + deck.sideboard.length === 0) {
        return { error: 'No cards could be read from that text. A decklist has one "<count> <card name>" per line.' };
      }
      const check = checkDeck(deck, key, collection(), data, { craft: spendWildcards === false ? 'none' : 'inventory' });
      return summarizeCheck(check, loaded);
    }),
  });

  const lookupCards = new FunctionTool({
    name: 'lookup_cards',
    description: 'Rules text, cost, type, legality, Arena wildcard rarity and functional roles of up to 8 cards, and how many copies the player owns.',
    parameters: z.object({ names: z.array(z.string()).min(1).max(MAX_CARDS_LOOKED_UP).describe('Card names.') }),
    execute: limited(({ names }) => ({
      cards: names.map(name => {
        const card = data.index.byName(name);
        return card ? describeCard(card, player.collection) : { name, ...noSuchCard(name) };
      }),
    })),
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
    execute: limited(({ card: name, format, deckColors }) => {
      const key = parseFormat(format) as Format | undefined;
      if (!key) return unknownFormat(format);
      const card = data.index.byName(name);
      if (!card) return noSuchCard(name);
      const colors = deckColors
        ? [...deckColors.toUpperCase()].filter(c => 'WUBRG'.includes(c))
        : card.colorIdentity.length ? card.colorIdentity : frontColors(card);
      return {
        collectionLoaded: loaded,
        note: loaded ? undefined : 'No collection is loaded, so only crafts can be suggested. Say so.',
        card: card.name,
        format: key,
        colors: colors.join('') || 'colourless',
        standIns: finderFor(key, colors).suggest(card, { limit: 5 }).map(standIn),
      };
    }),
  });

  const findCombos = new FunctionTool({
    name: 'find_combos',
    description:
      'Combos the player already owns every card of in a format, and the cards they do not own that would finish the most combos. ' +
      'Needs a loaded collection. For the combos in one decklist, use check_meta_deck or check_decklist instead.',
    parameters: z.object({
      format: formatParam,
      colors: z.string().optional().describe('Only combos that fit inside these colours, as letters from WUBRG, e.g. "UR".'),
    }),
    execute: limited(({ format, colors }) => {
      const key = parseFormat(format);
      if (!key) return unknownFormat(format);
      if (!data.combos) return { error: 'Combo data is not loaded on this server.' };
      if (!player.collection) {
        return { collectionLoaded: false, note: 'No collection is loaded, so there is nothing to look for combos in. Say so, and suggest loading one in the "Your collection" panel.' };
      }
      const identity = colors ? [...colors.toUpperCase()].filter(c => 'WUBRG'.includes(c)) : undefined;
      const found = collectionCombos(player.collection, key, data.index, data.combos, identity);
      return {
        collectionLoaded: true,
        source: COMBO_SOURCE,
        format: key,
        colors: identity?.join('') || 'any',
        combosOwned: found.ownedTotal,
        mostPlayedOwned: found.owned.slice(0, MAX_COMBOS).map(combo),
        oneCardAway: found.oneCardAway.slice(0, MAX_COMBOS).map(entry => comboCompleter(entry, true)),
      };
    }),
  });

  return [collectionSummary, listMetaDecks, checkMetaDeck, checkDecklist, lookupCards, findStandIns, findCombos];
}
