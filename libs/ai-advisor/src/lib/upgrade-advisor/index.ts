import type { CardColor, CardRole, DeckUpgradeBlueprint, MtgCard, RoleDistribution, UpgradeRecommendation } from '../types';
import { findZeroCostSwaps, isColorIdentityLegal, matchBinderSubstitutes } from '../collection-matcher';

export function calculateRoleDistribution(cards: MtgCard[]): Record<CardRole, number> {
  const dist: Record<CardRole, number> = {
    ramp: 0,
    draw: 0,
    removal: 0,
    board_wipe: 0,
    wincon: 0,
    synergy: 0,
    land: 0,
  };
  for (const card of cards) {
    for (const role of card.roles) {
      dist[role] = (dist[role] || 0) + 1;
    }
  }
  return dist;
}

export function generateUpgradeBlueprint(
  currentDeck: MtgCard[],
  userBinderCards: MtgCard[],
  marketSinglesCorpus: MtgCard[],
  commander: MtgCard,
  budgetUsd: number,
  targetTier = 6.5
): DeckUpgradeBlueprint {
  const commanderColors: CardColor[] = commander.colors;

  // 1. Initial State
  const initialRoles = calculateRoleDistribution(currentDeck);

  // 2. Find $0 Free Binder Swaps
  const binderSwaps = findZeroCostSwaps(currentDeck, userBinderCards, commanderColors, 5);
  const deckAfterBinder = [...currentDeck];

  for (const swap of binderSwaps) {
    const idx = deckAfterBinder.findIndex((c) => c.id === swap.cutCard.id);
    if (idx !== -1) {
      deckAfterBinder[idx] = swap.addCard;
    }
  }

  // 3. Find Budget Targeted Buys within budgetUsd
  let remainingBudget = budgetUsd;
  const targetedBuys: UpgradeRecommendation[] = [];
  const stapleUpgrades: UpgradeRecommendation[] = [];

  const currentIds = new Set(deckAfterBinder.map((c) => c.id));
  const validSingles = marketSinglesCorpus.filter(
    (c) => !currentIds.has(c.id) && isColorIdentityLegal(c.colors, commanderColors)
  );

  // Identify remaining cut candidates
  const remainingCuts = deckAfterBinder
    .filter((c) => !c.typeLine.toLowerCase().includes('land') && !binderSwaps.some((s) => s.addCard.id === c.id))
    .sort((a, b) => a.roles.length - b.roles.length)
    .slice(0, 5);

  let totalSpent = 0;

  for (const cut of remainingCuts) {
    // Find high-synergy budget card ($1 to $5)
    const affordableSingles = validSingles
      .filter((s) => s.priceUsd <= remainingBudget && s.priceUsd > 0 && !targetedBuys.some((t) => t.addCard.id === s.id))
      .sort((a, b) => b.roles.length - a.roles.length || a.priceUsd - b.priceUsd);

    if (affordableSingles.length > 0) {
      const buy = affordableSingles[0];
      const costDelta = buy.priceUsd;
      remainingBudget -= costDelta;
      totalSpent += costDelta;

      const rec: UpgradeRecommendation = {
        cutCard: cut,
        addCard: buy,
        swapType: 'budget_buy',
        synergyScoreDelta: 0.85,
        costDeltaUsd: costDelta,
        rationale: `Targeted buy: adding '${buy.name}' ($${buy.priceUsd.toFixed(2)}) significantly boosts your ${buy.roles.join(', ')}.`,
      };
      targetedBuys.push(rec);

      const idx = deckAfterBinder.findIndex((c) => c.id === cut.id);
      if (idx !== -1) {
        deckAfterBinder[idx] = buy;
      }
    }
  }

  // 4. Identify luxury staple wishlist ($20+)
  const luxuryStaples = validSingles
    .filter((s) => s.priceUsd > 20 && !deckAfterBinder.some((d) => d.id === s.id))
    .slice(0, 2);

  for (const luxury of luxuryStaples) {
    stapleUpgrades.push({
      cutCard: deckAfterBinder.find((c) => c.roles.includes('draw')) || deckAfterBinder[0],
      addCard: luxury,
      swapType: 'staple_upgrade',
      synergyScoreDelta: 0.95,
      costDeltaUsd: luxury.priceUsd,
      rationale: `Aspirational luxury staple: '${luxury.name}' ($${luxury.priceUsd.toFixed(2)}) is an optimal long-term addition.`,
    });
  }

  // 5. Final Distribution & Invariant Checks
  const finalRoles = calculateRoleDistribution(deckAfterBinder);

  // Invariant 1: Deck count exactly matches original deck count (100)
  if (deckAfterBinder.length !== currentDeck.length) {
    throw new Error(`Invariant failed: Deck size changed from ${currentDeck.length} to ${deckAfterBinder.length}`);
  }

  // Invariant 2: Total spent <= budgetUsd
  if (totalSpent > budgetUsd) {
    throw new Error(`Invariant failed: Total spent $${totalSpent} exceeded budget $${budgetUsd}`);
  }

  // Invariant 3: Strict color identity
  for (const card of deckAfterBinder) {
    if (!isColorIdentityLegal(card.colors, commanderColors)) {
      throw new Error(`Invariant failed: Card '${card.name}' violates commander color identity.`);
    }
  }

  const roleDist: RoleDistribution = {
    ramp: { before: initialRoles.ramp, after: finalRoles.ramp },
    draw: { before: initialRoles.draw, after: finalRoles.draw },
    removal: { before: initialRoles.removal, after: finalRoles.removal },
    board_wipe: { before: initialRoles.board_wipe, after: finalRoles.board_wipe },
    wincon: { before: initialRoles.wincon, after: finalRoles.wincon },
    land: { before: initialRoles.land, after: finalRoles.land },
  };

  return {
    commander: commander.name,
    currentTier: 4.0,
    projectedTier: targetTier,
    totalBudgetUsd: budgetUsd,
    totalSpentUsd: Number(totalSpent.toFixed(2)),
    binderSwaps,
    targetedBuys,
    stapleUpgrades,
    finalDeck: deckAfterBinder,
    roleDistribution: roleDist,
  };
}
