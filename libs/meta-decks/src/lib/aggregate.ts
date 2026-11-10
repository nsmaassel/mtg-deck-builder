import { otherClassification } from './classify';
import type { DeckClassification } from './classify';
import { slugify } from './names';
import type {
  ArchetypeCard,
  DeckCardLine,
  MetaArchetype,
  MetaFormat,
  MetaSnapshot,
  MetaSource,
  TournamentDeck,
} from './types';

export interface BuildMetaOptions {
  format: MetaFormat;
  /** Names a list; see `classifyDeck`. */
  classify: (deck: TournamentDeck) => DeckClassification;
  /** Matches an archetype needs before its win rate is reported (default 50). */
  minMatchesForWinRate?: number;
  /** Archetypes with fewer lists are folded into the Other bucket of each list's colours (default 3). */
  minDecks?: number;
  /** Lists kept per archetype besides the representative (default 4). */
  otherLists?: number;
  sources?: MetaSource[];
  /** ISO timestamp of the build; defaults to now. */
  generatedAt?: string;
}

const DEFAULT_MIN_MATCHES = 50;
const DEFAULT_MIN_DECKS = 3;
const DEFAULT_OTHER_LISTS = 4;

/** A finish this good earns the representative bonus; an undefeated league run counts as one. */
const TOP_FINISH = 8;
const UNRANKED = Number.POSITIVE_INFINITY;

// Typicality runs from 0 to 1 and the lists of one archetype usually sit within a few hundredths
// of each other, so these decide between near-equals without rescuing an unusual list.
const FINISH_BONUS = 0.05;
const RECENCY_BONUS = 0.05;

const MIN_MAIN_DECK = 60;
const MAX_SIDEBOARD = 15;

function round(value: number, places: number): number {
  const scale = 10 ** places;
  return Math.round(value * scale) / scale;
}

// Plain code-unit order: unlike localeCompare it is the same on every machine.
function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function compareNumbers(a: number, b: number): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Placement implied by a published result: `1st Place` → 1, `17th Place` → 17.
 * An undefeated record such as a league `5-0` ranks with the top 8; anything
 * else is unranked.
 */
export function finishRank(result: string): number {
  const place = /^(\d+)(?:st|nd|rd|th)?\s+place/i.exec(result.trim());
  if (place) return Number(place[1]);
  const record = /^(\d+)-(\d+)(?:-\d+)?$/.exec(result.trim());
  if (record && Number(record[1]) > 0 && Number(record[2]) === 0) return TOP_FINISH;
  return UNRANKED;
}

function copiesByCard(lines: readonly DeckCardLine[]): Map<string, number> {
  const copies = new Map<string, number>();
  for (const line of lines) copies.set(line.name, (copies.get(line.name) ?? 0) + line.count);
  return copies;
}

function cardCount(lines: readonly DeckCardLine[]): number {
  return lines.reduce((sum, line) => sum + line.count, 0);
}

interface CardTally {
  mainLists: number;
  mainCopies: number;
  sideLists: number;
  sideCopies: number;
}

/** How often a group of lists plays each card, sorted by main-deck share, then sideboard share. */
export function cardFrequencies(decks: readonly TournamentDeck[]): ArchetypeCard[] {
  const tallies = new Map<string, CardTally>();
  const tally = (name: string): CardTally => {
    let entry = tallies.get(name);
    if (!entry) {
      entry = { mainLists: 0, mainCopies: 0, sideLists: 0, sideCopies: 0 };
      tallies.set(name, entry);
    }
    return entry;
  };

  for (const deck of decks) {
    for (const [name, copies] of copiesByCard(deck.main)) {
      const entry = tally(name);
      entry.mainLists += 1;
      entry.mainCopies += copies;
    }
    for (const [name, copies] of copiesByCard(deck.side)) {
      const entry = tally(name);
      entry.sideLists += 1;
      entry.sideCopies += copies;
    }
  }

  const cards: ArchetypeCard[] = [...tallies].map(([name, t]) => ({
    name,
    mainShare: round(t.mainLists / decks.length, 4),
    mainAvg: t.mainLists === 0 ? 0 : round(t.mainCopies / t.mainLists, 2),
    sideShare: round(t.sideLists / decks.length, 4),
    sideAvg: t.sideLists === 0 ? 0 : round(t.sideCopies / t.sideLists, 2),
  }));
  return cards.sort(
    (a, b) => b.mainShare - a.mainShare || b.sideShare - a.sideShare || compareText(a.name, b.name),
  );
}

interface RankedList {
  deck: TournamentDeck;
  rank: number;
  score: number;
  /** A full main deck and a sideboard: something a player can copy as is. */
  complete: boolean;
}

// Last resort of every ordering, so that no result depends on the order the lists arrive in.
function compareIdentity(a: TournamentDeck, b: TournamentDeck): number {
  return (
    compareText(a.uri, b.uri) ||
    compareText(a.player, b.player) ||
    compareText(a.eventUri ?? a.event, b.eventUri ?? b.event) ||
    compareText(JSON.stringify([a.main, a.side]), JSON.stringify([b.main, b.side]))
  );
}

function byRepresentativeness(a: RankedList, b: RankedList): number {
  return (
    Number(b.complete) - Number(a.complete) ||
    compareNumbers(b.score, a.score) ||
    compareNumbers(a.rank, b.rank) ||
    compareText(b.deck.date, a.deck.date) ||
    compareIdentity(a.deck, b.deck)
  );
}

function byFinish(a: RankedList, b: RankedList): number {
  return (
    compareNumbers(a.rank, b.rank) ||
    compareText(b.deck.date, a.deck.date) ||
    compareNumbers(b.score, a.score) ||
    compareIdentity(a.deck, b.deck)
  );
}

function rankLists(
  decks: readonly TournamentDeck[],
  cards: readonly ArchetypeCard[],
  from: string,
  to: string,
): RankedList[] {
  const mainShare = new Map(cards.map((card) => [card.name, card.mainShare]));
  const span = Date.parse(to) - Date.parse(from);

  return decks.map((deck) => {
    const size = cardCount(deck.main);
    const sideboard = cardCount(deck.side);
    // Typicality: the share-weighted fraction of the main deck that the archetype's other lists also play.
    const shared = deck.main.reduce((sum, line) => sum + (mainShare.get(line.name) ?? 0) * line.count, 0);
    const typicality = size === 0 ? 0 : shared / size;
    const rank = finishRank(deck.result);
    const recency = span > 0 ? (Date.parse(deck.date) - Date.parse(from)) / span : 1;
    return {
      deck,
      rank,
      score: typicality + (rank <= TOP_FINISH ? FINISH_BONUS : 0) + RECENCY_BONUS * recency,
      complete: size >= MIN_MAIN_DECK && sideboard >= 1 && sideboard <= MAX_SIDEBOARD,
    };
  });
}

function mostCommonColors(members: readonly DeckClassification[]): string[] {
  const counts = new Map<string, number>();
  for (const member of members) {
    const key = member.colors.join('');
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const [best] = [...counts].sort((a, b) => b[1] - a[1] || a[0].length - b[0].length || compareText(a[0], b[0]));
  return best ? [...best[0]] : [];
}

interface Group {
  name: string;
  isOther: boolean;
  decks: TournamentDeck[];
  members: DeckClassification[];
}

function groupByName(entries: ReadonlyArray<{ deck: TournamentDeck; archetype: DeckClassification }>): Group[] {
  const groups = new Map<string, Group>();
  for (const { deck, archetype } of entries) {
    let group = groups.get(archetype.name);
    if (!group) {
      group = { name: archetype.name, isOther: archetype.kind === 'other', decks: [], members: [] };
      groups.set(archetype.name, group);
    }
    group.decks.push(deck);
    group.members.push(archetype);
  }
  return [...groups.values()];
}

/**
 * Aggregates classified lists into a format's meta snapshot: archetypes with
 * meta share, tournament win rate, card frequencies and lists to copy.
 *
 * The output does not depend on the order of `decks`.
 */
export function buildMetaSnapshot(decks: readonly TournamentDeck[], options: BuildMetaOptions): MetaSnapshot {
  const minMatchesForWinRate = options.minMatchesForWinRate ?? DEFAULT_MIN_MATCHES;
  const minDecks = options.minDecks ?? DEFAULT_MIN_DECKS;
  const otherLists = options.otherLists ?? DEFAULT_OTHER_LISTS;

  const dates = decks.map((deck) => deck.date).sort();
  const from = dates[0] ?? '';
  const to = dates.at(-1) ?? '';
  const events = new Set(decks.map((deck) => deck.eventUri ?? `${deck.event}|${deck.date}`));

  const classified = decks.map((deck) => ({ deck, archetype: options.classify(deck) }));
  const tooSmall = new Set(
    groupByName(classified)
      .filter((group) => !group.isOther && group.decks.length < minDecks)
      .map((group) => group.name),
  );
  const groups = groupByName(
    classified.map((entry) =>
      tooSmall.has(entry.archetype.name) ? { ...entry, archetype: otherClassification(entry.archetype.colors) } : entry,
    ),
  ).sort((a, b) => b.decks.length - a.decks.length || compareText(a.name, b.name));

  const usedIds = new Map<string, number>();
  const archetypes = groups.map((group): MetaArchetype => {
    const slug = slugify(group.name) || 'archetype';
    const uses = (usedIds.get(slug) ?? 0) + 1;
    usedIds.set(slug, uses);

    const cards = cardFrequencies(group.decks);
    const ranked = rankLists(group.decks, cards, from, to);
    const [representative, ...rest] = [...ranked].sort(byRepresentativeness);
    if (!representative) throw new Error(`archetype ${group.name} has no lists`);

    let matchWins = 0;
    let matchLosses = 0;
    for (const deck of group.decks) {
      // Leagues publish undefeated lists only and no standings, so their lists carry no record.
      if (deck.wins === undefined || deck.losses === undefined) continue;
      matchWins += deck.wins;
      matchLosses += deck.losses;
    }
    const matches = matchWins + matchLosses;

    return {
      id: uses === 1 ? slug : `${slug}-${uses}`,
      name: group.name,
      colors: mostCommonColors(group.members),
      ...(group.isOther ? { isOther: true } : {}),
      deckCount: group.decks.length,
      // More places than the card shares: over a hundred archetypes must still add up to 1.
      metaShare: round(group.decks.length / decks.length, 6),
      matchWins,
      matchLosses,
      ...(matches > 0 && matches >= minMatchesForWinRate ? { winRate: round(matchWins / matches, 4) } : {}),
      cards,
      representative: representative.deck,
      otherLists: rest
        .sort(byFinish)
        .slice(0, otherLists)
        .map((list) => list.deck),
    };
  });

  const fieldWins = archetypes.reduce((sum, archetype) => sum + archetype.matchWins, 0);
  const fieldMatches = archetypes.reduce((sum, archetype) => sum + archetype.matchLosses, fieldWins);

  return {
    format: options.format,
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    from,
    to,
    eventCount: events.size,
    totalDecks: decks.length,
    minMatchesForWinRate,
    ...(fieldMatches > 0 ? { fieldWinRate: round(fieldWins / fieldMatches, 4) } : {}),
    archetypes,
    sources: options.sources ?? [],
  };
}
