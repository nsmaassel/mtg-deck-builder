import { recommendationScore } from '@mtg/commander-recs';
import type { Recommendation, RecommendationSlot } from '@mtg/commander-recs';

/** Enough to put an owned card ahead of a similar one to buy, not enough to beat a clearly better pick. */
export const OWNED_BOOST = 0.15;

/**
 * Score a candidate for a slot, 0..1.
 *
 *   score = popularity × wp + synergy × ws + cheapness × wc + colorFit × wf  (+ 0.15 when owned)
 *
 *   slot                        wp     ws     wc     wf
 *   ramp, draw, interaction     0.65   0.20   0.15   –
 *   synergy                     0.35   0.55   0.10   –
 *   winConditions               0.30   0.60   0.10   –
 *   lands                       0.45   0.15   –      0.40
 *
 * cheapness = max(0, 1 − mana value / 10). The weights are `SLOT_WEIGHTS` in
 * `@mtg/commander-recs`, which computes the unboosted score.
 *
 * Popularity is Scryfall's EDHREC rank, so it is Commander-wide: it knows that
 * Sol Ring is a staple and nothing about this commander. It leads the slots
 * where staples belong, and synergy leads the synergy and win-condition slots,
 * so two commanders in the same colours share their mana rocks and removal and
 * differ in what the deck is about.
 *
 * `slot` re-scores a card for a slot other than its own: a Goblin with a
 * removal ability that loses its interaction slot to Chaos Warp still competes
 * for a synergy slot on how well it fits.
 */
export function scoreCard(card: Recommendation, owned = false, slot: RecommendationSlot = card.slot): number {
  const base = slot === card.slot ? card.score : recommendationScore({ ...card, slot });
  return Math.min(1, base + (owned ? OWNED_BOOST : 0));
}

/** Check if a card's color identity is within the commander's color identity. */
export function isColorLegal(
  cardColorIdentity: readonly string[],
  commanderColorIdentity: readonly string[],
): boolean {
  if (cardColorIdentity.length === 0) return true; // Colorless is always legal
  const commanderColors = new Set(commanderColorIdentity);
  return cardColorIdentity.every(color => commanderColors.has(color));
}

/** Build the basic land for a given color. */
export function basicLandForColor(color: string): string {
  const COLOR_TO_BASIC: Record<string, string> = {
    W: 'Plains',
    U: 'Island',
    B: 'Swamp',
    R: 'Mountain',
    G: 'Forest',
  };
  return COLOR_TO_BASIC[color] ?? 'Wastes';
}

/**
 * How many of a deck's lands may be nonbasic, by number of colours in the
 * commander's identity. A one-colour deck wants its basics; a five-colour deck
 * needs nearly every land to fix. Index 0 is a colourless commander.
 */
const NONBASIC_LANDS_BY_COLORS = [30, 12, 20, 26, 30, 32] as const;

export function nonbasicLandLimit(colors: number): number {
  return NONBASIC_LANDS_BY_COLORS[Math.min(colors, NONBASIC_LANDS_BY_COLORS.length - 1)]!;
}
