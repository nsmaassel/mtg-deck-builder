import { describe, it, expect } from 'vitest';
import { findZeroCostSwaps, isColorIdentityLegal, matchBinderSubstitutes } from '../collection-matcher';
import {
  commanderSidar,
  fillerKnight,
  lightningBolt,
  makeHundredCardPrecon,
  mysticRemora,
  ownedVodalian,
  rhysticStudy,
} from './fixtures';

describe('color identity', () => {
  it('rejects red in Esper and allows colorless', () => {
    expect(isColorIdentityLegal(lightningBolt.colors, commanderSidar.colors)).toBe(false);
    expect(isColorIdentityLegal(['W', 'U'], commanderSidar.colors)).toBe(true);
    expect(isColorIdentityLegal(['C'], commanderSidar.colors)).toBe(true);
    expect(isColorIdentityLegal([], commanderSidar.colors)).toBe(true);
    expect(isColorIdentityLegal(['U'], ['C'])).toBe(false);
  });
});

describe('matchBinderSubstitutes', () => {
  it('substitutes Rhystic Study with owned Mystic Remora at $0', () => {
    const substitutes = matchBinderSubstitutes(
      rhysticStudy,
      [mysticRemora, fillerKnight, lightningBolt],
      commanderSidar.colors,
      2,
    );
    expect(substitutes.length).toBeGreaterThan(0);
    expect(substitutes[0]?.addCard.name).toBe('Mystic Remora');
    expect(substitutes[0]?.swapType).toBe('binder_free');
    expect(substitutes[0]?.costDeltaUsd).toBe(0);
    expect(substitutes[0]?.synergyScoreDelta ?? 0).toBeGreaterThan(0.9);
    expect(substitutes.every(s => s.addCard.name !== 'Lightning Bolt')).toBe(true);
  });
});

describe('findZeroCostSwaps', () => {
  it('only emits $0 color-legal replacements and never cuts the commander', () => {
    const deck = makeHundredCardPrecon();
    const swaps = findZeroCostSwaps(
      deck,
      [mysticRemora, ownedVodalian, lightningBolt],
      commanderSidar.colors,
      5,
      commanderSidar.id,
    );

    expect(swaps.length).toBeGreaterThan(0);
    expect(swaps.every(s => s.costDeltaUsd === 0)).toBe(true);
    expect(swaps.every(s => s.swapType === 'binder_free')).toBe(true);
    expect(swaps.every(s => s.addCard.name !== 'Lightning Bolt')).toBe(true);
    expect(swaps.every(s => s.cutCard.id !== commanderSidar.id)).toBe(true);
    expect(swaps.every(s => isColorIdentityLegal(s.addCard.colors, commanderSidar.colors))).toBe(
      true,
    );
    expect(new Set(swaps.map(s => s.addCard.id)).size).toBe(swaps.length);
  });
});
