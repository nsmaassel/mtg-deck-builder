import type { IndexedCard } from '@mtg/card-index';
import { assignSlot, cardName, popularityFromRank, powerTraits } from '@mtg/commander-recs';
import { analyzeCurve, averagePopularity } from './builder';
import type { DeckAnalysis, DeckCard, DeckList, SlotName } from './types';

/**
 * A Commander list somebody else wrote, in the shape the power assessment
 * takes: each card sorted into its slot and carrying what the card data says
 * about it. Nothing is scored against the commander; `synergy`, `score` and
 * the coverage of our own picks stay at zero. The curve and the popularity
 * average are the builder's own, so a built deck and a pasted one are
 * measured the same way.
 */
export function listAsDeck(commander: IndexedCard, cards: readonly IndexedCard[]): { deck: DeckList; analysis: DeckAnalysis } {
  const toDeckCard = (card: IndexedCard, slot: SlotName): DeckCard => {
    const traits = powerTraits(card);
    return {
      name: cardName(card),
      quantity: 1,
      ownedInCollection: false,
      popularity: popularityFromRank(card.edhrecRank),
      synergy: 0,
      score: 0,
      slot,
      cmc: card.cmc,
      type_line: card.typeLine,
      usdPrice: card.usd ?? null,
      reasons: [],
      ...(card.gameChanger ? { gameChanger: true } : {}),
      ...(traits.length > 0 ? { traits } : {}),
    };
  };

  const slots: Record<SlotName, DeckCard[]> = { ramp: [], draw: [], interaction: [], winConditions: [], synergy: [], lands: [], flex: [] };
  for (const card of cards) {
    const { slot } = assignSlot(card, new Set(card.tags));
    slots[slot].push(toDeckCard(card, slot));
  }
  const deck: DeckList = { commander: toDeckCard(commander, 'synergy'), slots, totalCards: 1 + cards.length };

  return {
    deck,
    analysis: {
      commanderName: deck.commander.name,
      ...analyzeCurve(deck),
      colorDistribution: {},
      topPicksCoveragePercent: 0,
      averagePopularityPercent: averagePopularity(slots),
      themes: [],
    },
  };
}
