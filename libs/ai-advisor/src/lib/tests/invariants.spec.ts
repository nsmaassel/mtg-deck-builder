import { describe, it, expect } from 'vitest';
import { generateUpgradeBlueprint } from '../upgrade-advisor';
import { findZeroCostSwaps, isColorIdentityLegal } from '../collection-matcher';
import { TOTAL_COMMANDER_DECK_SIZE } from '../types';
import {
  commanderSidar,
  dockside,
  lightningBolt,
  makeHundredCardPrecon,
  mysticRemora,
  ownedVodalian,
  rhysticStudy,
  swordsToPlowshares,
} from './fixtures';

describe('invariants (color identity, zero-cost binder, budget cap, exactly 100 cards)', () => {
  const deck = makeHundredCardPrecon();

  it('input precon is exactly 100 unique cards', () => {
    expect(deck).toHaveLength(TOTAL_COMMANDER_DECK_SIZE);
    expect(new Set(deck.map(c => c.id)).size).toBe(TOTAL_COMMANDER_DECK_SIZE);
  });

  it('binder-only swaps stay at 100 cards and $0.00', () => {
    const swaps = findZeroCostSwaps(
      deck,
      [mysticRemora, ownedVodalian, lightningBolt],
      commanderSidar.colors,
      5,
      commanderSidar.id,
    );
    expect(swaps.every(s => s.costDeltaUsd === 0)).toBe(true);

    const next = [...deck];
    for (const swap of swaps) {
      const idx = next.findIndex(c => c.id === swap.cutCard.id);
      if (idx !== -1) next[idx] = swap.addCard;
    }
    expect(next).toHaveLength(TOTAL_COMMANDER_DECK_SIZE);
  });

  it('composed blueprint: 100 cards, $0 binder, budget ≤ cap, no off-color bait', () => {
    const blueprint = generateUpgradeBlueprint(
      deck,
      [mysticRemora, ownedVodalian],
      [swordsToPlowshares, { ...rhysticStudy }, lightningBolt, dockside],
      commanderSidar,
      25,
      7,
    );

    expect(blueprint.finalDeck).toHaveLength(TOTAL_COMMANDER_DECK_SIZE);
    expect(new Set(blueprint.finalDeck.map(c => c.id)).size).toBe(TOTAL_COMMANDER_DECK_SIZE);
    expect(blueprint.binderSwaps.reduce((s, x) => s + x.costDeltaUsd, 0)).toBe(0);
    expect(blueprint.totalSpentUsd).toBeLessThanOrEqual(blueprint.totalBudgetUsd);

    const adds = [
      ...blueprint.finalDeck,
      ...blueprint.binderSwaps.map(s => s.addCard),
      ...blueprint.targetedBuys.map(s => s.addCard),
      ...blueprint.stapleUpgrades.map(s => s.addCard),
    ];
    for (const card of adds) {
      expect(isColorIdentityLegal(card.colors, commanderSidar.colors)).toBe(true);
      expect(['Lightning Bolt', 'Dockside Extortionist']).not.toContain(card.name);
    }
  });
});
