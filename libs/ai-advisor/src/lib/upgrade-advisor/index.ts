import type {
  CardColor,
  CardRole,
  DeckUpgradeBlueprint,
  MtgCard,
  RoleDistribution,
  UpgradeRecommendation,
} from '../types';
import { TOTAL_COMMANDER_DECK_SIZE } from '../types';
import { findZeroCostSwaps, isColorIdentityLegal } from '../collection-matcher';

export class UpgradeAdvisorError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UpgradeAdvisorError';
  }
}

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
      dist[role] = (dist[role] ?? 0) + 1;
    }
  }
  return dist;
}

function isLand(card: MtgCard): boolean {
  return card.typeLine.toLowerCase().includes('land') || card.roles.includes('land');
}

function applySwapInPlace(deck: MtgCard[], swap: UpgradeRecommendation): void {
  const idx = deck.findIndex(c => c.id === swap.cutCard.id);
  if (idx !== -1) {
    deck[idx] = swap.addCard;
  }
}

/**
 * Tiered precon upgrade advisor.
 * binder_free is always $0. budget_buy never exceeds `budgetUsd`.
 * staple_upgrade lists over-budget luxury cards (not applied to finalDeck).
 * `finalDeck` is always the same length as the input (exactly 100 for Commander).
 */
export function generateUpgradeBlueprint(
  currentDeck: MtgCard[],
  userBinderCards: MtgCard[],
  marketSinglesCorpus: MtgCard[],
  commander: MtgCard,
  budgetUsd: number,
  targetTier = 6.5,
): DeckUpgradeBlueprint {
  if (currentDeck.length !== TOTAL_COMMANDER_DECK_SIZE) {
    throw new UpgradeAdvisorError(
      `Deck must contain exactly ${TOTAL_COMMANDER_DECK_SIZE} cards, got ${currentDeck.length}`,
    );
  }

  const commanderColors: CardColor[] = commander.colors;
  const initialRoles = calculateRoleDistribution(currentDeck);

  const binderSwaps = findZeroCostSwaps(
    currentDeck,
    userBinderCards,
    commanderColors,
    5,
    commander.id,
  ).map(s => ({ ...s, swapType: 'binder_free' as const, costDeltaUsd: 0 }));

  const deckAfterBinder = [...currentDeck];
  for (const swap of binderSwaps) {
    applySwapInPlace(deckAfterBinder, swap);
  }

  const targetedBuys: UpgradeRecommendation[] = [];
  const stapleUpgrades: UpgradeRecommendation[] = [];

  const currentIds = new Set(deckAfterBinder.map(c => c.id));
  const validSingles = marketSinglesCorpus.filter(
    c => !currentIds.has(c.id) && isColorIdentityLegal(c.colors, commanderColors),
  );

  const remainingCuts = deckAfterBinder
    .filter(
      c =>
        !isLand(c) &&
        c.id !== commander.id &&
        !binderSwaps.some(s => s.addCard.id === c.id),
    )
    .sort((a, b) => a.roles.length - b.roles.length)
    .slice(0, 5);

  let remainingBudget = budgetUsd;
  let totalSpent = 0;

  for (const cut of remainingCuts) {
    if (remainingBudget <= 0) break;

    const affordableSingles = validSingles
      .filter(
        s =>
          s.priceUsd > 0 &&
          s.priceUsd <= remainingBudget &&
          !targetedBuys.some(t => t.addCard.id === s.id),
      )
      .sort((a, b) => b.roles.length - a.roles.length || a.priceUsd - b.priceUsd);

    const buy = affordableSingles[0];
    if (!buy) continue;

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
    applySwapInPlace(deckAfterBinder, rec);
  }

  if (totalSpent > budgetUsd + 1e-9) {
    throw new UpgradeAdvisorError(
      `budget_buy exceeded cap $${budgetUsd} with $${totalSpent}`,
    );
  }

  const luxuryStaples = validSingles
    .filter(
      s =>
        s.priceUsd > Math.max(20, budgetUsd) &&
        !deckAfterBinder.some(d => d.id === s.id) &&
        !targetedBuys.some(t => t.addCard.id === s.id),
    )
    .slice(0, 2);

  for (const luxury of luxuryStaples) {
    const cut =
      deckAfterBinder.find(c => c.id !== commander.id && !isLand(c)) ?? deckAfterBinder[0]!;
    stapleUpgrades.push({
      cutCard: cut,
      addCard: luxury,
      swapType: 'staple_upgrade',
      synergyScoreDelta: 0.95,
      costDeltaUsd: luxury.priceUsd,
      rationale: `Aspirational luxury staple: '${luxury.name}' ($${luxury.priceUsd.toFixed(2)}) is an optimal long-term addition.`,
    });
  }

  if (deckAfterBinder.length !== TOTAL_COMMANDER_DECK_SIZE) {
    throw new UpgradeAdvisorError(
      `Deck size changed from ${currentDeck.length} to ${deckAfterBinder.length}`,
    );
  }

  for (const card of deckAfterBinder) {
    if (!isColorIdentityLegal(card.colors, commanderColors)) {
      throw new UpgradeAdvisorError(
        `Card '${card.name}' violates commander color identity.`,
      );
    }
  }

  const finalRoles = calculateRoleDistribution(deckAfterBinder);
  const roleDist: RoleDistribution = {
    ramp: { before: initialRoles.ramp ?? 0, after: finalRoles.ramp ?? 0 },
    draw: { before: initialRoles.draw ?? 0, after: finalRoles.draw ?? 0 },
    removal: { before: initialRoles.removal ?? 0, after: finalRoles.removal ?? 0 },
    board_wipe: { before: initialRoles.board_wipe ?? 0, after: finalRoles.board_wipe ?? 0 },
    wincon: { before: initialRoles.wincon ?? 0, after: finalRoles.wincon ?? 0 },
    land: { before: initialRoles.land ?? 0, after: finalRoles.land ?? 0 },
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
