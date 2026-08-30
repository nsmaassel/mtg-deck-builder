import { describe, expect, it } from 'vitest';
import type { MtgCard } from '../types';
import { cosineSimilarity, hybridSearch, searchSimilarCards } from './vector-engine';
import { isColorIdentityLegal, matchBinderSubstitutes, findZeroCostSwaps } from './collection-matcher';
import { generateUpgradeBlueprint } from './upgrade-advisor';

describe('MTG Semantic Synergy Search & Precon Upgrade Advisor (Frontier E2E)', () => {
  // Test Fixtures
  const commanderSidar: MtgCard = {
    id: 'c-sidar',
    name: 'Sidar Jabari of Zhalfir',
    manaValue: 4,
    colors: ['W', 'U', 'B'],
    typeLine: 'Legendary Creature — Human Knight',
    oracleText: 'Flying, first strike. Whenever you attack with Knights, loot.',
    priceUsd: 8.5,
    roles: ['synergy', 'draw', 'wincon'],
    embedding: [0.1, 0.8, 0.4, 0.2],
  };

  const rhysticStudy: MtgCard = {
    id: 'staple-rhystic',
    name: 'Rhystic Study',
    manaValue: 3,
    colors: ['U'],
    typeLine: 'Enchantment',
    oracleText: 'Whenever an opponent casts a spell, you may draw a card unless they pay 1.',
    priceUsd: 45.0,
    roles: ['draw'],
    embedding: [0.9, 0.1, 0.85, 0.3],
  };

  const mysticRemora: MtgCard = {
    id: 'binder-remora',
    name: 'Mystic Remora',
    manaValue: 1,
    colors: ['U'],
    typeLine: 'Enchantment',
    oracleText: 'Cumulative upkeep 1. Whenever an opponent casts a noncreature spell, draw.',
    priceUsd: 7.0,
    roles: ['draw'],
    embedding: [0.88, 0.12, 0.82, 0.28], // High cosine similarity to Rhystic Study
  };

  const fillerKnight: MtgCard = {
    id: 'precon-filler',
    name: 'Vanilla Knight',
    manaValue: 5,
    colors: ['W'],
    typeLine: 'Creature — Knight',
    oracleText: 'Vigilance.',
    priceUsd: 0.1,
    roles: ['synergy'],
    embedding: [0.05, 0.2, 0.1, 0.1],
  };

  const ownedVodalianWaveKnight: MtgCard = {
    id: 'binder-vodalian',
    name: 'Vodalian Wave-Knight',
    manaValue: 4,
    colors: ['W', 'U'],
    typeLine: 'Creature — Merfolk Knight',
    oracleText: 'Whenever you draw a card, put a +1/+1 counter on each Knight you control.',
    priceUsd: 2.5,
    roles: ['synergy', 'wincon'],
    embedding: [0.2, 0.75, 0.5, 0.3],
  };

  const budgetRemoval: MtgCard = {
    id: 'market-swords',
    name: 'Swords to Plowshares',
    manaValue: 1,
    colors: ['W'],
    typeLine: 'Instant',
    oracleText: 'Exile target creature. Its controller gains life equal to its power.',
    priceUsd: 1.75,
    roles: ['removal'],
    embedding: [0.3, 0.1, 0.2, 0.9],
  };

  const redIllegalCard: MtgCard = {
    id: 'illegal-bolt',
    name: 'Lightning Bolt',
    manaValue: 1,
    colors: ['R'],
    typeLine: 'Instant',
    oracleText: 'Deal 3 damage to any target.',
    priceUsd: 1.0,
    roles: ['removal'],
  };

  // Build a 100-card sample precon deck
  const baseDeck: MtgCard[] = [
    commanderSidar,
    fillerKnight,
    ...Array.from({ length: 38 }, (_, i) => ({
      id: `land-${i}`,
      name: `Island ${i}`,
      manaValue: 0,
      colors: ['U' as const],
      typeLine: 'Basic Land — Island',
      oracleText: '{T}: Add {U}',
      priceUsd: 0.05,
      roles: ['land' as const],
    })),
    ...Array.from({ length: 60 }, (_, i) => ({
      id: `spell-${i}`,
      name: `Knight Spell ${i}`,
      manaValue: 3,
      colors: ['W' as const, 'U' as const],
      typeLine: 'Creature — Knight',
      oracleText: 'Knight synergy text',
      priceUsd: 0.5,
      roles: ['synergy' as const, 'draw' as const],
    })),
  ];

  it('Journey 1: Zero-Dollar Precon Tune-Up ($0 binder swaps with 100-card & color invariants)', () => {
    const userBinder = [mysticRemora, ownedVodalianWaveKnight];
    const blueprint = generateUpgradeBlueprint(baseDeck, userBinder, [budgetRemoval], commanderSidar, 0.0, 6.0);

    expect(blueprint.totalSpentUsd).toBe(0.0);
    expect(blueprint.binderSwaps.length).toBeGreaterThan(0);
    expect(blueprint.targetedBuys.length).toBe(0);
    expect(blueprint.finalDeck.length).toBe(100);

    // Assert strict color identity
    for (const card of blueprint.finalDeck) {
      expect(isColorIdentityLegal(card.colors, commanderSidar.colors)).toBe(true);
    }
  });

  it('Journey 2: Semantic Functional Substitution (Rhystic Study -> Mystic Remora)', () => {
    const userBinder = [mysticRemora, fillerKnight];
    const substitutes = matchBinderSubstitutes(rhysticStudy, userBinder, commanderSidar.colors, 2);

    expect(substitutes.length).toBeGreaterThan(0);
    const topSub = substitutes[0];
    expect(topSub.addCard.name).toBe('Mystic Remora');
    expect(topSub.synergyScoreDelta).toBeGreaterThan(0.9); // High cosine similarity
    expect(topSub.costDeltaUsd).toBe(0);
  });

  it('Journey 3: Bracket Progression with strict $25 budget enforcement', () => {
    const userBinder = [ownedVodalianWaveKnight];
    const marketSingles = [budgetRemoval, { ...rhysticStudy, priceUsd: 45.0 }]; // Rhystic is over budget
    const blueprint = generateUpgradeBlueprint(baseDeck, userBinder, marketSingles, commanderSidar, 25.0, 7.0);

    expect(blueprint.totalSpentUsd).toBeLessThanOrEqual(25.0);
    expect(blueprint.targetedBuys.some((b) => b.addCard.name === 'Swords to Plowshares')).toBe(true);
    // Luxury card over $25 should be in stapleUpgrades wishlist, not bought
    expect(blueprint.stapleUpgrades.some((s) => s.addCard.name === 'Rhystic Study')).toBe(true);
    expect(blueprint.finalDeck.length).toBe(100);
  });

  it('Hybrid Search fuses dense vector and keyword rank via RRF', () => {
    const corpus = [commanderSidar, rhysticStudy, mysticRemora, fillerKnight, budgetRemoval];
    const results = hybridSearch('opponent casts noncreature draw', [0.88, 0.12, 0.82, 0.28], corpus, 3);

    expect(results.length).toBe(3);
    expect(results[0].card.name).toBe('Mystic Remora'); // Matches both dense embedding and keyword text
    expect(results[0].score).toBeGreaterThan(0);
  });

  it('Strictly rejects off-color cards for Commander color identity', () => {
    expect(isColorIdentityLegal(redIllegalCard.colors, commanderSidar.colors)).toBe(false);
    expect(isColorIdentityLegal(['W', 'U'], commanderSidar.colors)).toBe(true);
    expect(isColorIdentityLegal(['C'], commanderSidar.colors)).toBe(true);
  });
});
