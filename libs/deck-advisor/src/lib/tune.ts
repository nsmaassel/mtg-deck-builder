import type { CardIndex, IndexedCard, Rarity } from '@mtg/card-index';
import type { MetaArchetype, MetaSnapshot } from '@mtg/meta-decks/types';
import { deckColors, isLand, usableCopies } from './gap';
import type { Collection, DeckLine, DeckList } from './types';

/** The archetype a list most resembles, and how closely. */
export interface ArchetypeMatch {
  archetype: MetaArchetype;
  /** 0–1: how much of the list's spells and the archetype's usual spells coincide, copies counted. */
  similarity: number;
}

/** One card where a list and its archetype's other lists part ways. */
export interface TuneCard {
  card: IndexedCard;
  /** Share of the archetype's lists that play it on this board (0–1). */
  share: number;
  /** Mean copies among the lists that play it. */
  typicalCopies: number;
  /** Copies in the player's list, on this board. */
  inDeck: number;
  /** Copies the player owns, up to a playset. */
  owned: number;
  /** The wildcard a copy costs. Absent off Arena. */
  craftRarity?: Rarity;
}

/** A list read against the tournament lists of its archetype. */
export interface DeckTune {
  archetype: MetaArchetype;
  similarity: number;
  /** Main-deck cards most lists play that this one has none of, or clearly fewer. */
  missingStaples: TuneCard[];
  /** Main-deck spells in this list that few of the archetype's lists play. */
  unusual: TuneCard[];
  /** Sideboard cards most lists bring that this list has nowhere. */
  sideboardStaples: TuneCard[];
}

/** Below this, the nearest archetype is a different deck that shares some cards. */
const MIN_SIMILARITY = 0.4;
/** Card shares from fewer lists than this are anecdotes. */
const MIN_LISTS = 10;
const STAPLE_SHARE = 0.6;
const UNUSUAL_SHARE = 0.1;
/** A list is short on a staple when it runs this many fewer copies than lists usually do. */
const SHORT_BY = 1.5;
const PLAYSET = 4;
const MAX_ROWS = 8;

// An archetype's usual spells are worked out once: every deck check in a format reads all of them.
const usualSpells = new WeakMap<CardIndex, WeakMap<MetaArchetype, Map<string, number>>>();

/** Copies of each non-land card the archetype's lists run on average, counting lists that skip it as zero. */
function expectedSpells(archetype: MetaArchetype, index: CardIndex): Map<string, number> {
  let perIndex = usualSpells.get(index);
  if (!perIndex) usualSpells.set(index, (perIndex = new WeakMap()));
  let expected = perIndex.get(archetype);
  if (!expected) {
    expected = new Map();
    for (const entry of archetype.cards) {
      if (entry.mainShare <= 0) continue;
      const card = index.byName(entry.name);
      if (card && !isLand(card)) expected.set(card.oracleId, entry.mainShare * entry.mainAvg);
    }
    perIndex.set(archetype, expected);
  }
  return expected;
}

function counts(lines: DeckLine[], index: CardIndex): Map<string, number> {
  const out = new Map<string, number>();
  for (const line of lines) {
    const card = index.byName(line.name);
    if (card) out.set(card.oracleId, (out.get(card.oracleId) ?? 0) + line.count);
  }
  return out;
}

/**
 * The archetype of the snapshot a list most resembles: weighted overlap of
 * its non-land main-deck cards with the copies the archetype's lists usually
 * run. Lands are left out because mana bases differ more than plans do, so
 * colours decide between neighbours: a mono-green list is not read as the
 * green-white deck with the same creatures. Undefined when nothing is close.
 */
export function nearestArchetype(deck: DeckList, snapshot: MetaSnapshot, index: CardIndex): ArchetypeMatch | undefined {
  const spells = new Map<string, number>();
  for (const [oracleId, count] of counts(deck.main, index)) {
    const card = index.get(oracleId);
    if (card && !isLand(card)) spells.set(oracleId, count);
  }
  if (spells.size === 0) return undefined;
  const colors = new Set(deckColors(deck, index));

  let best: ArchetypeMatch | undefined;
  for (const archetype of snapshot.archetypes) {
    if (archetype.isOther || archetype.colors.some(color => !colors.has(color))) continue;
    const expected = expectedSpells(archetype, index);
    let shared = 0;
    let union = 0;
    for (const id of new Set([...spells.keys(), ...expected.keys()])) {
      const mine = spells.get(id) ?? 0;
      const theirs = expected.get(id) ?? 0;
      shared += Math.min(mine, theirs);
      union += Math.max(mine, theirs);
    }
    const similarity = union > 0 ? shared / union : 0;
    if (!best || similarity > best.similarity) best = { archetype, similarity };
  }
  return best && best.similarity >= MIN_SIMILARITY ? best : undefined;
}

/**
 * Read a list against the tournament lists of its archetype: what most of
 * them play that it does not, and what it plays that few of them do. This is
 * what other players settled on, not a verdict: an unusual card can be a
 * deliberate choice. Undefined when the archetype has too few lists to say.
 */
export function tuneDeck(deck: DeckList, match: ArchetypeMatch, collection: Collection, index: CardIndex): DeckTune | undefined {
  const { archetype } = match;
  if (archetype.deckCount < MIN_LISTS) return undefined;

  const main = counts(deck.main, index);
  const side = counts(deck.sideboard, index);
  const row = (card: IndexedCard, share: number, typicalCopies: number, inDeck: number): TuneCard => {
    const entry: TuneCard = {
      card,
      share,
      typicalCopies,
      inDeck,
      owned: Math.min(PLAYSET, usableCopies(card, collection)),
    };
    if (card.arenaRarity) entry.craftRarity = card.arenaRarity;
    return entry;
  };

  const missingStaples: TuneCard[] = [];
  const unusual: TuneCard[] = [];
  const sideboardStaples: TuneCard[] = [];
  const seen = new Set<string>();

  for (const entry of archetype.cards) {
    const card = index.byName(entry.name);
    if (!card || card.isBasicLand) continue;
    seen.add(card.oracleId);
    const inMain = main.get(card.oracleId) ?? 0;
    const inSide = side.get(card.oracleId) ?? 0;

    // A land most lists play matters when it is absent; how many copies of it is a mana-base choice.
    const short = isLand(card) ? inMain === 0 : inMain === 0 || entry.mainAvg - inMain >= SHORT_BY;
    if (entry.mainShare >= STAPLE_SHARE && short) missingStaples.push(row(card, entry.mainShare, entry.mainAvg, inMain));
    if (inMain > 0 && !isLand(card) && entry.mainShare < UNUSUAL_SHARE) unusual.push(row(card, entry.mainShare, entry.mainAvg, inMain));
    if (entry.sideShare >= STAPLE_SHARE && inSide === 0 && inMain === 0) {
      sideboardStaples.push(row(card, entry.sideShare, entry.sideAvg, 0));
    }
  }
  // Spells no list of the archetype plays at all.
  for (const [oracleId, inMain] of main) {
    const card = index.get(oracleId);
    if (card && !seen.has(oracleId) && !isLand(card)) unusual.push(row(card, 0, 0, inMain));
  }

  const byShare = (a: TuneCard, b: TuneCard) => b.share - a.share || a.card.name.localeCompare(b.card.name);
  return {
    archetype,
    similarity: match.similarity,
    missingStaples: missingStaples.sort(byShare).slice(0, MAX_ROWS),
    unusual: unusual.sort((a, b) => a.share - b.share || b.inDeck - a.inDeck || a.card.name.localeCompare(b.card.name)).slice(0, MAX_ROWS),
    sideboardStaples: sideboardStaples.sort(byShare).slice(0, MAX_ROWS),
  };
}
