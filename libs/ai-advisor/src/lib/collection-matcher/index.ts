import type { CardColor, MtgCard, UpgradeRecommendation } from '../types';
import { searchSimilarCards } from '../vector-engine';

/**
 * Checks if a card conforms to a commander color identity.
 */
export function isColorIdentityLegal(cardColors: CardColor[], commanderColors: CardColor[]): boolean {
  if (commanderColors.includes('C') && commanderColors.length === 1) {
    return cardColors.length === 0 || (cardColors.length === 1 && cardColors[0] === 'C');
  }
  const commSet = new Set(commanderColors);
  return cardColors.every((c) => c === 'C' || commSet.has(c));
}

/**
 * Finds semantic substitutes for an expensive card in the user's owned collection.
 */
export function matchBinderSubstitutes(
  neededCard: MtgCard,
  userBinderCards: MtgCard[],
  commanderColors: CardColor[],
  topK = 3
): UpgradeRecommendation[] {
  const matches = searchSimilarCards(neededCard, userBinderCards, topK * 2, (c) =>
    isColorIdentityLegal(c.colors, commanderColors)
  );

  return matches.slice(0, topK).map(({ card, similarity }) => ({
    cutCard: neededCard,
    addCard: card,
    swapType: 'binder_free',
    synergyScoreDelta: Number(similarity.toFixed(3)),
    costDeltaUsd: 0,
    rationale: `Owned substitute from binder with ${(similarity * 100).toFixed(0)}% functional mechanical match. Saves $${neededCard.priceUsd.toFixed(2)}.`,
  }));
}

/**
 * Identifies 0-dollar binder swaps to replace low-synergy filler cards in a precon.
 */
export function findZeroCostSwaps(
  currentDeck: MtgCard[],
  userBinderCards: MtgCard[],
  commanderColors: CardColor[],
  maxSwaps = 5
): UpgradeRecommendation[] {
  const currentDeckIds = new Set(currentDeck.map((c) => c.id));
  const availableBinder = userBinderCards.filter(
    (c) => !currentDeckIds.has(c.id) && isColorIdentityLegal(c.colors, commanderColors)
  );

  // Find lowest synergy/filler cards in current deck (exclude lands)
  const cuts = currentDeck
    .filter((c) => !c.typeLine.toLowerCase().includes('land'))
    .sort((a, b) => a.roles.length - b.roles.length || b.manaValue - a.manaValue)
    .slice(0, maxSwaps);

  const recommendations: UpgradeRecommendation[] = [];
  const usedAdds = new Set<string>();

  for (const cut of cuts) {
    // Find best match in binder that has high roles or similarity
    const candidates = availableBinder
      .filter((b) => !usedAdds.has(b.id))
      .map((b) => {
        const roleOverlap = b.roles.filter((r) => cut.roles.includes(r)).length;
        const score = roleOverlap * 0.4 + (b.roles.length > cut.roles.length ? 0.3 : 0.1);
        return { card: b, score };
      })
      .sort((a, b) => b.score - a.score);

    if (candidates.length > 0 && candidates[0].score > 0.3) {
      const best = candidates[0].card;
      usedAdds.add(best.id);
      recommendations.push({
        cutCard: cut,
        addCard: best,
        swapType: 'binder_free',
        synergyScoreDelta: Number(candidates[0].score.toFixed(3)),
        costDeltaUsd: 0,
        rationale: `Free swap from your collection: replaces low-impact '${cut.name}' with '${best.name}' to strengthen ${best.roles.join(', ')}.`,
      });
    }
  }

  return recommendations;
}
