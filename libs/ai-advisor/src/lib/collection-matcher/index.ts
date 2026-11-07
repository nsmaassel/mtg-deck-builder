import type { CardColor, MtgCard, UpgradeRecommendation } from '../types';
import { cosineSimilarity, searchSimilarCards } from '../vector-engine';

/**
 * Commander color-identity rule: every non-colorless pip on the card must appear
 * on the commander. Colorless (`[]` or `'C'`) is always legal except that a
 * colorless-only commander accepts only colorless cards.
 */
export function isColorIdentityLegal(
  cardColors: readonly CardColor[],
  commanderColors: readonly CardColor[],
): boolean {
  const cardPips = cardColors.filter(c => c !== 'C');
  if (cardPips.length === 0) return true;

  const commanderPips = commanderColors.filter(c => c !== 'C');
  if (commanderPips.length === 0) return false;

  const legal = new Set(commanderPips);
  return cardPips.every(c => legal.has(c));
}

function isLand(card: MtgCard): boolean {
  return card.typeLine.toLowerCase().includes('land') || card.roles.includes('land');
}

function isCommanderCard(card: MtgCard, commanderId?: string): boolean {
  if (commanderId && card.id === commanderId) return true;
  return card.typeLine.toLowerCase().startsWith('legendary creature');
}

/**
 * Finds semantic substitutes for an expensive card in the user's owned collection.
 * Every match is a zero-cost binder_free swap. Off-identity cards are excluded.
 */
export function matchBinderSubstitutes(
  neededCard: MtgCard,
  userBinderCards: MtgCard[],
  commanderColors: CardColor[],
  topK = 3,
): UpgradeRecommendation[] {
  const matches = searchSimilarCards(neededCard, userBinderCards, topK * 2, c =>
    isColorIdentityLegal(c.colors, commanderColors),
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

function binderScore(cut: MtgCard, candidate: MtgCard): number {
  const roleOverlap = candidate.roles.filter(r => cut.roles.includes(r)).length;
  const cosine =
    cut.embedding && candidate.embedding
      ? cosineSimilarity(cut.embedding, candidate.embedding)
      : 0;
  const roleBoost = candidate.roles.length > cut.roles.length ? 0.2 : 0.05;
  return cosine * 0.55 + roleOverlap * 0.25 + roleBoost;
}

/**
 * Identifies $0 binder swaps that replace low-synergy filler cards.
 * Never cuts the commander or lands. Never recommends off-color cards.
 */
export function findZeroCostSwaps(
  currentDeck: MtgCard[],
  userBinderCards: MtgCard[],
  commanderColors: CardColor[],
  maxSwaps = 5,
  commanderId?: string,
): UpgradeRecommendation[] {
  const currentDeckIds = new Set(currentDeck.map(c => c.id));
  const availableBinder = userBinderCards.filter(
    c => !currentDeckIds.has(c.id) && isColorIdentityLegal(c.colors, commanderColors),
  );

  const cuts = currentDeck
    .filter(c => !isLand(c) && !isCommanderCard(c, commanderId))
    .sort((a, b) => a.roles.length - b.roles.length || b.manaValue - a.manaValue)
    .slice(0, maxSwaps * 2);

  const recommendations: UpgradeRecommendation[] = [];
  const usedAdds = new Set<string>();
  const usedCuts = new Set<string>();

  for (const cut of cuts) {
    if (recommendations.length >= maxSwaps) break;
    if (usedCuts.has(cut.id)) continue;

    const pool = availableBinder.filter(b => !usedAdds.has(b.id));
    const similar = searchSimilarCards(cut, pool, 8);
    const ranked = pool
      .map(b => {
        const cosine =
          similar.find(s => s.card.id === b.id)?.similarity ??
          (cut.embedding && b.embedding ? cosineSimilarity(cut.embedding, b.embedding) : 0);
        return { card: b, score: binderScore(cut, b), cosine };
      })
      .filter(r => r.score > 0.3)
      .sort((a, b) => b.score - a.score || b.cosine - a.cosine);

    const best = ranked[0];
    if (!best) continue;

    usedAdds.add(best.card.id);
    usedCuts.add(cut.id);
    recommendations.push({
      cutCard: cut,
      addCard: best.card,
      swapType: 'binder_free',
      synergyScoreDelta: Number(best.score.toFixed(3)),
      costDeltaUsd: 0,
      rationale: `Free swap from your collection: replaces low-impact '${cut.name}' with '${best.card.name}' to strengthen ${best.card.roles.join(', ')}.`,
    });
  }

  return recommendations;
}
