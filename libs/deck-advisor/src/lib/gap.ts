import { normalizeCardName } from '@mtg/card-index';
import type { CardIndex, Format, IndexedCard } from '@mtg/card-index';
import { FORMAT_RULES } from './formats';
import type { Board, CardGap, CardStatus, Collection, DeckGap, DeckLine, DeckList, Wildcards } from './types';

const COLOR_ORDER = 'WUBRG';

/** Once a player owns a playset, Arena lets them play any number the deck rules allow. */
const PLAYSET = 4;

/** Fewer main-deck copies than this asking for a colour is a stray card, not a colour of the deck. */
const MIN_COPIES_FOR_A_COLOR = 3;

export function emptyWildcards(): Wildcards {
  return { common: 0, uncommon: 0, rare: 0, mythic: 0 };
}

export function isLand(card: IndexedCard): boolean {
  // The front face decides: a spell with a land on the back is cast as a spell.
  return /\bLand\b/.test(card.typeLine.split('//')[0] ?? '');
}

/** Copies of a card the player can put in a deck. */
export function usableCopies(card: IndexedCard, collection: Collection): number {
  if (card.isBasicLand) return Infinity;
  const owned = collection.owned.get(card.oracleId) ?? 0;
  return owned >= PLAYSET ? Infinity : owned;
}

function sortColors(colors: Iterable<string>): string[] {
  return [...new Set(colors)]
    .filter(c => COLOR_ORDER.includes(c))
    .sort((a, b) => COLOR_ORDER.indexOf(a) - COLOR_ORDER.indexOf(b));
}

/** The boards that take up deck slots, in the order owned copies are handed out. */
export function deckBoards(deck: Pick<DeckList, 'commander' | 'companion' | 'main' | 'sideboard'>): Array<[Board, DeckLine[]]> {
  // Arena lists a companion both under `Companion` and in the sideboard; count it once.
  const inSideboard = new Set(deck.sideboard.map(l => normalizeCardName(l.name)));
  const companion = deck.companion.filter(l => !inSideboard.has(normalizeCardName(l.name)));
  return [
    ['commander', deck.commander],
    ['main', deck.main],
    ['companion', companion],
    ['sideboard', deck.sideboard],
  ];
}

/**
 * For each castable face of a card, the colour choices of each coloured mana
 * symbol in its cost: `{1}{R}` is `[['R']]`, hybrid `{R/W}` is `[['R', 'W']]`.
 * Adventure and split cards have one entry per half.
 */
export function castingCosts(card: IndexedCard): string[][][] {
  const faces = card.manaCost ? card.manaCost.split(' // ') : [''];
  return faces.map(face => {
    const cost: string[][] = [];
    for (const [, symbol = ''] of face.matchAll(/\{([^}]+)\}/g)) {
      // `{2/W}` can always be paid generically, so it asks for no colour.
      if (/^\d/.test(symbol)) continue;
      const choices = [...symbol].filter(ch => COLOR_ORDER.includes(ch));
      if (choices.length) cost.push(choices);
    }
    return cost;
  });
}

/** Colours the front face of a card asks for; for a costless card, its colours. */
export function frontColors(card: IndexedCard): string[] {
  if (!card.manaCost) return card.colors;
  return sortColors((castingCosts(card)[0] ?? []).flat());
}

function canPay(cost: string[][], colors: ReadonlySet<string>): boolean {
  return cost.every(choices => choices.some(c => colors.has(c)));
}

/** True when the deck's colours can cast the card's front face. */
export function isCastable(card: IndexedCard, colors: readonly string[]): boolean {
  if (!card.manaCost) return card.colors.every(c => colors.includes(c));
  return canPay(castingCosts(card)[0] ?? [], new Set(colors));
}

/**
 * Colours a deck may play: its commander's identity, else what its spells
 * need, else what its lands make.
 *
 * An adventure or split card only needs one half to be castable, so a red deck
 * playing a black creature for its red adventure stays a red deck.
 */
export function deckColors(deck: Pick<DeckList, 'commander' | 'companion' | 'main' | 'sideboard'>, index: CardIndex): string[] {
  const commanders = deck.commander
    .map(l => index.byName(l.name))
    .filter((c): c is IndexedCard => c !== undefined);
  if (commanders.length) return sortColors(commanders.flatMap(c => c.colorIdentity));

  // The main deck decides. A one-of sideboard card in a third colour does not make a three-colour deck.
  const main = deck.main.flatMap(line => {
    const card = index.byName(line.name);
    return card ? [{ card, count: line.count }] : [];
  });
  const spells = main.filter(entry => !isLand(entry.card));
  const demand = new Map<string, number>();
  const ask = (color: string, count: number) => demand.set(color, (demand.get(color) ?? 0) + count);

  // Colours with no alternative: plain symbols on single-faced cards.
  for (const { card, count } of spells) {
    const costs = castingCosts(card);
    if (costs.length !== 1) continue;
    for (const color of new Set(costs[0]!.filter(choices => choices.length === 1).flat())) ask(color, count);
  }
  // Whatever still cannot be cast by any face gets its front face's first choices.
  for (const { card, count } of spells) {
    const costs = castingCosts(card);
    const known = new Set(demand.keys());
    if (costs.some(cost => canPay(cost, known))) continue;
    for (const choices of costs[0] ?? []) if (!choices.some(c => known.has(c))) ask(choices[0]!, count);
  }

  const committed = [...demand].filter(([, copies]) => copies >= MIN_COPIES_FOR_A_COLOR).map(([color]) => color);
  if (committed.length) return sortColors(committed);
  if (demand.size) return sortColors(demand.keys());
  return sortColors(main.flatMap(entry => entry.card.producedMana));
}

/**
 * Compare a decklist with a collection: which copies are owned, which are
 * missing, and what the missing ones cost in wildcards.
 */
export function analyzeGap(deck: DeckList, collection: Collection, index: CardIndex, format: Format): DeckGap {
  const rules = FORMAT_RULES[format];
  const remaining = new Map<string, number>();
  const cards: CardGap[] = [];
  const wildcardsNeeded = emptyWildcards();
  let totalCards = 0;
  let ownedCards = 0;
  let uncraftable = false;

  for (const [board, lines] of deckBoards(deck)) {
    for (const line of lines) {
      totalCards += line.count;
      const card = index.byName(line.name);
      if (!card) {
        cards.push({ name: line.name, board, needed: line.count, owned: 0, missing: line.count, status: 'unknown' });
        uncraftable = true;
        continue;
      }

      const legal = card.legal.includes(format);
      const playable = legal && (!rules.onArena || card.onArena);
      const left = remaining.get(card.oracleId) ?? usableCopies(card, collection);
      // A card that cannot be played here does not count as owned, whatever the collection says.
      const owned = playable ? Math.min(line.count, left) : 0;
      const missing = line.count - owned;
      remaining.set(card.oracleId, left - owned);
      ownedCards += owned;

      let status: CardStatus;
      if (!legal) status = 'not-legal';
      else if (!playable) status = 'not-on-arena';
      else if (missing === 0) status = 'owned';
      else status = owned > 0 ? 'partial' : 'missing';

      const craftRarity = rules.onArena && playable ? card.arenaRarity : undefined;
      if (missing > 0) {
        if (craftRarity) wildcardsNeeded[craftRarity] += missing;
        else if (rules.onArena) uncraftable = true;
      }

      cards.push({ name: card.name, board, needed: line.count, owned, missing, status, card, craftRarity });
    }
  }

  const gap: DeckGap = {
    format,
    colors: deckColors(deck, index),
    totalCards,
    ownedCards,
    completion: totalCards > 0 ? ownedCards / totalCards : 0,
    wildcardsNeeded,
    cards,
  };

  if (ownedCards === totalCards) {
    gap.craftable = true;
  } else if (rules.onArena && collection.wildcards) {
    const have = collection.wildcards;
    const short: Wildcards = {
      common: Math.max(0, wildcardsNeeded.common - have.common),
      uncommon: Math.max(0, wildcardsNeeded.uncommon - have.uncommon),
      rare: Math.max(0, wildcardsNeeded.rare - have.rare),
      mythic: Math.max(0, wildcardsNeeded.mythic - have.mythic),
    };
    gap.wildcardsShort = short;
    gap.craftable = !uncraftable && Object.values(short).every(n => n === 0);
  } else if (uncraftable) {
    gap.craftable = false;
  }

  return gap;
}
