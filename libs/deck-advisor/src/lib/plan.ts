import type { CardIndex, Format, IndexedCard } from '@mtg/card-index';
import { formatArenaDeck } from './deck-text';
import { FORMAT_RULES } from './formats';
import { analyzeGap, deckCopies, emptyWildcards, isLand } from './gap';
import { suggestSubstitutes } from './substitutes';
import type { TextModel } from './similarity';
import type {
  ArchetypeUsage,
  Board,
  CardGap,
  Collection,
  DeckLine,
  DeckList,
  DeckPlan,
  PlanStep,
  Substitute,
  Wildcards,
} from './types';

export interface PlanOptions {
  usage?: ArchetypeUsage;
  /**
   * `inventory` (default) crafts the cards that are hardest to replace until
   * the collection's wildcards run out. `none` keeps every wildcard and fills
   * the deck from the collection alone.
   */
  craft?: 'inventory' | 'none';
  /** Stand-ins considered per missing card. Default 12. */
  candidatesPerCard?: number;
}

/** With a stand-in this good already owned, a wildcard is better spent elsewhere. */
const GOOD_ENOUGH_TO_SKIP_CRAFT = 0.8;

const BOARD_WEIGHT: Record<Board, number> = { commander: 3, main: 1, companion: 0.6, sideboard: 0.5 };

interface Hole {
  gap: CardGap;
  card: IndexedCard;
  /** How much the deck depends on this card, before considering stand-ins. */
  importance: number;
  options: Substitute[];
  left: number;
}

function importance(gap: CardGap, usage: ArchetypeUsage | undefined): number {
  const weight = BOARD_WEIGHT[gap.board];
  if (!usage) return weight;
  const id = gap.card?.oracleId ?? '';
  const share = gap.board === 'sideboard' ? usage.sideShare(id) : usage.mainShare(id);
  // A card every list plays is core; one a fifth of lists play is a flex slot.
  return weight * (0.4 + 0.6 * share);
}

function craftNote(best: Substitute | undefined): string {
  if (!best) return 'Worth the wildcard: nothing you own does this job.';
  if (best.quality === 'close') return `${best.card.name} would be a close stand-in, but the wildcard is there for the real card.`;
  if (best.quality === 'partial') return `Worth the wildcard: the closest card you own (${best.card.name}) is only a partial match.`;
  return `Worth the wildcard: nothing you own really replaces it (closest: ${best.card.name}).`;
}

function addTo(lines: DeckLine[], name: string, count: number): void {
  const line = lines.find(l => l.name === name);
  if (line) line.count += count;
  else lines.push({ name, count });
}

/**
 * Turn a decklist the player cannot fully build into one they can: craft what
 * is hardest to replace with the wildcards on hand, and fill the rest with the
 * closest cards they own.
 */
export function planDeck(
  deck: DeckList,
  collection: Collection,
  index: CardIndex,
  format: Format,
  text: TextModel,
  options: PlanOptions = {},
): DeckPlan {
  const rules = FORMAT_RULES[format];
  const gap = analyzeGap(deck, collection, index, format);
  const usage = options.usage;

  // What the player can sleeve up right now; holes are filled below.
  const built: Record<Board, DeckLine[]> = { commander: [], companion: [], main: [], sideboard: [] };
  for (const entry of gap.cards) {
    if (entry.owned > 0 && entry.card) addTo(built[entry.board], entry.card.arenaName ?? entry.card.name, entry.owned);
  }
  // Every copy the list asks for counts against the copy limit, owned or not,
  // or a stand-in could collide with a later craft of the same card.
  const reserved = deckCopies(gap);

  const holes: Hole[] = [];
  const steps: PlanStep[] = [];
  for (const entry of gap.cards) {
    if (entry.missing === 0) continue;
    if (!entry.card) {
      steps.push({
        action: 'unfilled', board: entry.board, target: entry.name, count: entry.missing,
        note: 'No card by this name was found, so it cannot be matched or replaced.',
      });
      continue;
    }
    // A commander defines the deck; nothing stands in for it.
    const options_ = entry.board === 'commander'
      ? []
      : suggestSubstitutes(
          entry.card,
          { index, format, collection, colors: gap.colors, inDeck: reserved, usage, text },
          { sources: ['owned'], limit: options.candidatesPerCard ?? 12 },
        );
    holes.push({ gap: entry, card: entry.card, importance: importance(entry, usage), options: options_, left: entry.missing });
  }

  // Crafts go where a wildcard buys the most: important cards with no good stand-in.
  const wildcardsSpent = emptyWildcards();
  const wildcardsLeft = collection.wildcards ? { ...collection.wildcards } : undefined;
  if (wildcardsLeft && rules.onArena && options.craft !== 'none') {
    const craftValue = (hole: Hole) => hole.importance * (1 - (hole.options[0]?.score ?? 0));
    for (const hole of [...holes].sort((a, b) => craftValue(b) - craftValue(a))) {
      const rarity = hole.gap.craftRarity;
      if (!rarity) continue;
      const best = hole.options[0];
      if (best && best.score >= GOOD_ENOUGH_TO_SKIP_CRAFT && best.available >= hole.left) continue;
      const count = Math.min(hole.left, wildcardsLeft[rarity]);
      if (count === 0) continue;
      wildcardsLeft[rarity] -= count;
      wildcardsSpent[rarity] += count;
      hole.left -= count;
      addTo(built[hole.gap.board], hole.card.arenaName ?? hole.card.name, count);
      steps.push({
        action: 'craft', board: hole.gap.board, target: hole.card.name, count, craftRarity: rarity,
        note: craftNote(best),
      });
    }
  }

  // Fill what is left from the collection, most important card first so it gets first pick.
  const used = new Map<string, number>();
  let substituteScore = 0;
  for (const hole of [...holes].sort((a, b) => b.importance - a.importance)) {
    for (const option of hole.options) {
      if (hole.left === 0) break;
      const id = option.card.oracleId;
      const free = option.available - (used.get(id) ?? 0);
      if (free < 1) continue;
      const count = Math.min(hole.left, free);
      used.set(id, (used.get(id) ?? 0) + count);
      hole.left -= count;
      substituteScore += option.score * count;
      addTo(built[hole.gap.board], option.card.arenaName ?? option.card.name, count);
      steps.push({
        action: 'substitute', board: hole.gap.board, target: hole.card.name, count, substitute: option,
        note: option.reasons[0] ?? 'Closest card available in your collection.',
      });
    }
    if (hole.left > 0) {
      steps.push({
        action: 'unfilled', board: hole.gap.board, target: hole.card.name, count: hole.left,
        note: hole.gap.board === 'commander'
          ? 'The commander has to be crafted; the deck does not work without it.'
          : isLand(hole.card)
            ? 'No spare land in these colours; add basic lands.'
            : 'Nothing in your collection does a similar job in these colours.',
      });
    }
  }

  const finalDeck = { commander: built.commander, companion: built.companion, main: built.main, sideboard: built.sideboard };
  const crafted = Object.values(wildcardsSpent).reduce((sum, n) => sum + n, 0);
  const plan: DeckPlan = {
    format,
    gap,
    steps,
    deck: finalDeck,
    arenaText: formatArenaDeck(finalDeck),
    wildcardsSpent,
    fidelity: gap.totalCards > 0 ? (gap.ownedCards + crafted + substituteScore) / gap.totalCards : 0,
  };
  if (wildcardsLeft) plan.wildcardsLeft = wildcardsLeft;
  return plan;
}

/** Wildcards weighed by how hard they are to come by, in rare-wildcard equivalents. */
export function craftCost(wildcards: Wildcards): number {
  return wildcards.common * 0.05 + wildcards.uncommon * 0.15 + wildcards.rare + wildcards.mythic * 2;
}

export interface RankedDeck<T> {
  item: T;
  gap: ReturnType<typeof analyzeGap>;
  /** `craftCost` of the wildcards still needed. */
  cost: number;
}

/**
 * Order decks by how close the collection is to building them: buildable ones
 * first, then by the wildcards still needed, then by copies already owned.
 */
export function rankDecks<T>(
  items: readonly T[],
  deckOf: (item: T) => DeckList,
  collection: Collection,
  index: CardIndex,
  format: Format,
): Array<RankedDeck<T>> {
  return items
    .map(item => {
      const gap = analyzeGap(deckOf(item), collection, index, format);
      return { item, gap, cost: craftCost(gap.wildcardsNeeded) };
    })
    .sort((a, b) =>
      Number(b.gap.craftable === true) - Number(a.gap.craftable === true) ||
      a.cost - b.cost ||
      b.gap.completion - a.gap.completion,
    );
}
