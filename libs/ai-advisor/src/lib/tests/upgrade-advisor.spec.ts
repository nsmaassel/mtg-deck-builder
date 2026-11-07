import { describe, it, expect } from 'vitest';
import { generateUpgradeBlueprint, UpgradeAdvisorError } from '../upgrade-advisor';
import { isColorIdentityLegal } from '../collection-matcher';
import { TOTAL_COMMANDER_DECK_SIZE } from '../types';
import {
  commanderSidar,
  dockside,
  fillerKnight,
  lightningBolt,
  makeHundredCardPrecon,
  mysticRemora,
  ownedVodalian,
  rhysticStudy,
  swordsToPlowshares,
} from './fixtures';

describe('upgrade-advisor', () => {
  it('zero-dollar tune-up spends $0 and keeps exactly 100 color-legal cards', () => {
    const deck = makeHundredCardPrecon();
    const blueprint = generateUpgradeBlueprint(
      deck,
      [mysticRemora, ownedVodalian],
      [swordsToPlowshares, lightningBolt, dockside],
      commanderSidar,
      0,
      6,
    );

    expect(blueprint.totalSpentUsd).toBe(0);
    expect(blueprint.binderSwaps.length).toBeGreaterThan(0);
    expect(blueprint.binderSwaps.every(s => s.costDeltaUsd === 0)).toBe(true);
    expect(blueprint.targetedBuys).toHaveLength(0);
    expect(blueprint.finalDeck).toHaveLength(TOTAL_COMMANDER_DECK_SIZE);
    expect(blueprint.roleDistribution.draw.after).toBeGreaterThanOrEqual(
      blueprint.roleDistribution.draw.before,
    );

    for (const card of blueprint.finalDeck) {
      expect(isColorIdentityLegal(card.colors, commanderSidar.colors)).toBe(true);
      expect(card.name).not.toBe('Lightning Bolt');
      expect(card.name).not.toBe('Dockside Extortionist');
    }
  });

  it('enforces a $25 budget cap and wishlists over-budget staples', () => {
    const blueprint = generateUpgradeBlueprint(
      makeHundredCardPrecon(),
      [ownedVodalian],
      [swordsToPlowshares, { ...rhysticStudy, priceUsd: 45 }, lightningBolt, dockside],
      commanderSidar,
      25,
      7,
    );

    expect(blueprint.totalSpentUsd).toBeLessThanOrEqual(25);
    expect(blueprint.targetedBuys.every(s => s.swapType === 'budget_buy')).toBe(true);
    expect(blueprint.targetedBuys.reduce((sum, s) => sum + s.costDeltaUsd, 0)).toBeLessThanOrEqual(
      25,
    );
    expect(blueprint.targetedBuys.some(b => b.addCard.name === 'Swords to Plowshares')).toBe(true);
    expect(blueprint.targetedBuys.some(b => b.addCard.name === 'Rhystic Study')).toBe(false);
    expect(blueprint.stapleUpgrades.some(s => s.addCard.name === 'Rhystic Study')).toBe(true);
    expect(blueprint.stapleUpgrades.every(s => s.swapType === 'staple_upgrade')).toBe(true);
    expect(blueprint.finalDeck).toHaveLength(100);
    expect(blueprint.finalDeck.some(c => c.name === 'Rhystic Study')).toBe(false);

    for (const card of [
      ...blueprint.finalDeck,
      ...blueprint.binderSwaps.map(s => s.addCard),
      ...blueprint.targetedBuys.map(s => s.addCard),
      ...blueprint.stapleUpgrades.map(s => s.addCard),
    ]) {
      expect(isColorIdentityLegal(card.colors, commanderSidar.colors)).toBe(true);
    }
  });

  it('throws when the starting list is not 100 cards', () => {
    expect(() =>
      generateUpgradeBlueprint(
        [commanderSidar, fillerKnight],
        [],
        [],
        commanderSidar,
        0,
      ),
    ).toThrow(UpgradeAdvisorError);
  });
});
