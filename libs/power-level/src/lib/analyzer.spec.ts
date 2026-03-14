import { describe, it, expect } from 'vitest';
import { assessPowerLevel } from './analyzer';
import type { DeckList, DeckAnalysis } from '@mtg/deck-builder';

function makeDeck(cardNames: string[], rampCmcs: number[] = []): DeckList {
  const makeCard = (name: string, slot: string, cmc = 2) =>
    ({
      name,
      quantity: 1 as const,
      ownedInCollection: true,
      edhrec_inclusion: 50,
      edhrec_synergy: 0.1,
      score: 0.5,
      slot,
      cmc,
      type_line: 'Sorcery',
      usdPrice: null,
    } as import('@mtg/deck-builder').DeckCard);

  const rampCards = rampCmcs.map((cmc, i) => makeCard(`Ramp Card ${i}`, 'ramp', cmc));
  const interactionCards = Array.from({ length: 10 }, (_, i) => makeCard(`Interaction ${i}`, 'interaction'));
  const synergyCards = cardNames.map(n => makeCard(n, 'synergy'));
  const landCards = Array.from({ length: 36 }, (_, i) => makeCard(`Forest ${i}`, 'lands', 0));

  return {
    commander: makeCard('Test Commander', 'synergy', 3),
    slots: {
      ramp: rampCards,
      draw: Array.from({ length: 10 }, (_, i) => makeCard(`Draw ${i}`, 'draw')),
      interaction: interactionCards,
      winConditions: Array.from({ length: 5 }, (_, i) => makeCard(`Win ${i}`, 'winConditions')),
      synergy: synergyCards,
      lands: landCards,
      flex: [],
    },
    totalCards: 1 + rampCards.length + 10 + interactionCards.length + 5 + cardNames.length + landCards.length,
  };
}

function makeAnalysis(avgCmc = 3.0, staples = 50): DeckAnalysis {
  return {
    commanderName: 'Test Commander',
    manaCurve: { 2: 20, 3: 30, 4: 10 },
    colorDistribution: { G: 40 },
    averageCmc: avgCmc,
    staplesCoveragePercent: staples,
  };
}

describe('assessPowerLevel', () => {
  it('returns Bracket 1 for a deck with no game changers, no tutors, low staples', () => {
    const deck = makeDeck(['Llanowar Elves', 'Rampant Growth', 'Farseek']);
    const analysis = makeAnalysis(3.0, 20);
    const result = assessPowerLevel(deck, analysis);
    expect(result.bracket).toBe(1);
    expect(result.label).toBe('Exhibition');
    expect(result.score).toBe(2);
  });

  it('returns Bracket 2 for a deck with moderate staple coverage', () => {
    const deck = makeDeck(['Sol Ring', 'Arcane Signet', 'Command Tower']);
    const analysis = makeAnalysis(3.0, 45);
    const result = assessPowerLevel(deck, analysis);
    expect(result.bracket).toBe(2);
    expect(result.label).toBe('Core');
  });

  it('returns Bracket 3 when a Game Changer is present', () => {
    const deck = makeDeck(['Rhystic Study', 'Arcane Signet', 'Rampant Growth']);
    const analysis = makeAnalysis(3.0, 50);
    const result = assessPowerLevel(deck, analysis);
    expect(result.bracket).toBe(3);
    expect(result.label).toBe('Enhanced');
    expect(result.signals.gameChangers).toContain('Rhystic Study');
  });

  it('returns Bracket 4 when 4+ Game Changers are present', () => {
    const deck = makeDeck([
      'Rhystic Study',
      'Smothering Tithe',
      'Cyclonic Rift',
      'Fierce Guardianship',
      'Dockside Extortionist',
    ]);
    const analysis = makeAnalysis(2.8, 65);
    const result = assessPowerLevel(deck, analysis);
    expect(result.bracket).toBe(4);
    expect(result.label).toBe('Optimized');
    expect(result.signals.gameChangers.length).toBeGreaterThanOrEqual(4);
  });

  it('returns Bracket 5 for cEDH-level density', () => {
    const deck = makeDeck([
      "Thassa's Oracle",
      'Demonic Consultation',
      'Jeweled Lotus',
      'Mana Crypt',
      'Dockside Extortionist',
      'Fierce Guardianship',
      'Force of Will',
      'Mana Drain',
      'Demonic Tutor',
      'Vampiric Tutor',
    ]);
    const analysis = makeAnalysis(1.8, 80);
    const result = assessPowerLevel(deck, analysis);
    expect(result.bracket).toBe(5);
    expect(result.label).toBe('cEDH');
  });

  it('includes targetSuggestions when targetBracket differs from actual', () => {
    const deck = makeDeck(['Rhystic Study', 'Smothering Tithe', 'Cyclonic Rift', 'Fierce Guardianship', 'Jeweled Lotus']);
    const analysis = makeAnalysis(2.9, 65);
    const result = assessPowerLevel(deck, analysis, 2);
    expect(result.targetSuggestions).toBeDefined();
    expect(result.targetSuggestions!.length).toBeGreaterThan(0);
    // Each suggestion is a SwapSuggestion with a remove field
    expect(result.targetSuggestions![0]).toHaveProperty('remove');
    expect(result.targetSuggestions![0]).toHaveProperty('removeReason');
    expect(result.targetSuggestions![0]).toHaveProperty('alternatives');
  });

  it('does not include targetSuggestions when already at target bracket', () => {
    const deck = makeDeck(['Llanowar Elves', 'Rampant Growth']);
    const analysis = makeAnalysis(3.0, 20);
    const result = assessPowerLevel(deck, analysis, 1);
    expect(result.targetSuggestions).toBeUndefined();
  });

  it('provides power-up suggestions when target is higher than actual', () => {
    const deck = makeDeck(['Llanowar Elves', 'Rampant Growth']);
    const analysis = makeAnalysis(3.0, 20);
    // Supply a candidate pool including a Game Changer
    const candidates = [
      { name: 'Rhystic Study', inclusion: 72, label: 'draw' },
      { name: 'Cyclonic Rift', inclusion: 65, label: 'interaction' },
    ];
    const result = assessPowerLevel(deck, analysis, 3, candidates);
    expect(result.targetSuggestions).toBeDefined();
    // Should suggest adding Rhystic Study or Cyclonic Rift
    const suggestedNames = result.targetSuggestions!.flatMap(s => s.alternatives.map(a => a.name));
    expect(suggestedNames.some(n => ['Rhystic Study', 'Cyclonic Rift'].includes(n))).toBe(true);
  });

  it('exposes game changer names in signals', () => {
    const deck = makeDeck(['Demonic Tutor', 'Rhystic Study']);
    const analysis = makeAnalysis(2.5, 55);
    const result = assessPowerLevel(deck, analysis);
    expect(result.signals.gameChangers).toContain('Demonic Tutor');
    expect(result.signals.gameChangers).toContain('Rhystic Study');
  });

  it('correctly identifies Tier-A tutors in signals', () => {
    const deck = makeDeck(['Demonic Tutor', 'Vampiric Tutor']);
    const analysis = makeAnalysis(2.5, 55);
    const result = assessPowerLevel(deck, analysis);
    expect(result.signals.tierATutors).toContain('Demonic Tutor');
    expect(result.signals.tierATutors).toContain('Vampiric Tutor');
  });

  it('computes fast mana ratio from ramp slot CMC', () => {
    // 2 of 4 ramp cards are fast (CMC 0 or 1)
    const deck = makeDeck(['Some Card'], [0, 1, 2, 3]);
    const analysis = makeAnalysis(3.0, 30);
    const result = assessPowerLevel(deck, analysis);
    expect(result.signals.fastManaRatio).toBe(0.5);
  });
});
