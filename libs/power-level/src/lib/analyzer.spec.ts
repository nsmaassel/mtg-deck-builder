import { describe, it, expect } from 'vitest';
import { assessPowerLevel, ESTIMATE } from './analyzer';
import { bracketMethod } from './method';
import type { DeckList, DeckAnalysis } from '@mtg/deck-builder';

/** Cards these tests treat as Game Changers. Real decks carry the flag from Scryfall's card data. */
const GAME_CHANGERS = new Set(["jeweled lotus", "mana crypt", "thassa's oracle", "demonic consultation", "dockside extortionist", "demonic tutor", "vampiric tutor", "fierce guardianship", "rhystic study", "smothering tithe", "cyclonic rift", "force of will", "mana drain"]);

/** What these tests' cards do that the brackets single out. Real decks carry it from Scryfall's Tagger tags. */
const TRAITS: Record<string, Array<'tutor' | 'mass-land-denial' | 'extra-turn'>> = {
  'demonic tutor': ['tutor'],
  'vampiric tutor': ['tutor'],
  armageddon: ['mass-land-denial'],
  'time warp': ['extra-turn'],
  'temporal manipulation': ['extra-turn'],
  'capture of jingzhou': ['extra-turn'],
};

function makeDeck(cardNames: string[], rampCmcs: number[] = []): DeckList {
  const makeCard = (name: string, slot: string, cmc = 2) =>
    ({
      name,
      quantity: 1 as const,
      ownedInCollection: true,
      popularity: 0.5,
      synergy: 0.1,
      score: 0.5,
      slot,
      cmc,
      type_line: 'Sorcery',
      usdPrice: null,
      reasons: [],
      gameChanger: GAME_CHANGERS.has(name.toLowerCase()),
      traits: TRAITS[name.toLowerCase()],
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

/** `popularity` is how widely played the deck's spells are on average, 0–100: what brackets 1 to 3 turn on. */
function makeAnalysis(avgCmc = 3.0, popularity = 35): DeckAnalysis {
  return {
    commanderName: 'Test Commander',
    manaCurve: { 2: 20, 3: 30, 4: 10 },
    colorDistribution: { G: 40 },
    averageCmc: avgCmc,
    // Deliberately at odds with the popularity: the coverage is shown to people, not scored.
    topPicksCoveragePercent: 100 - popularity,
    averagePopularityPercent: popularity,
    themes: [],
  };
}

describe('assessPowerLevel', () => {
  it('returns Bracket 1 for a deck with no game changers, no tutors, and spells few decks play', () => {
    const deck = makeDeck(['Llanowar Elves', 'Rampant Growth', 'Farseek']);
    const analysis = makeAnalysis(3.0, 20);
    const result = assessPowerLevel(deck, analysis);
    expect(result.bracket).toBe(1);
    expect(result.label).toBe('Exhibition');
    expect(result.score).toBe(2);
  });

  it('returns Bracket 2 for a deck of moderately played spells', () => {
    const deck = makeDeck(['Sol Ring', 'Arcane Signet', 'Command Tower']);
    const analysis = makeAnalysis(3.0, 34);
    const result = assessPowerLevel(deck, analysis);
    expect(result.bracket).toBe(2);
    expect(result.label).toBe('Core');
  });

  it('returns Bracket 3 for a deck of widely played spells, and says what it went by', () => {
    const deck = makeDeck(['Sol Ring', 'Arcane Signet', 'Command Tower']);
    const result = assessPowerLevel(deck, makeAnalysis(3.0, 45));
    expect(result.bracket).toBe(3);
    expect(result.explanation.join(' ')).toMatch(/average 45 out of 100 for how widely they are played across Commander/);
  });

  it('goes by the deck\'s own cards, not by how close the deck is to our picks', () => {
    const deck = makeDeck(['Llanowar Elves', 'Rampant Growth', 'Farseek']);
    // Every one of our picks, but spells nobody plays: casual.
    expect(assessPowerLevel(deck, { ...makeAnalysis(3.0, 20), topPicksCoveragePercent: 100 }).bracket).toBe(1);
    // None of our picks, but staples throughout: well tuned.
    expect(assessPowerLevel(deck, { ...makeAnalysis(3.0, 45), topPicksCoveragePercent: 0 }).bracket).toBe(3);
  });

  it('takes the combos it is handed, at the bracket Commander Spellbook gives each', () => {
    const combo = { id: 'c1', uses: ['Dramatic Reversal', 'Isochron Scepter'], cardCount: 2, produces: ['Infinite mana'] };
    const three = { id: 'c2', uses: ['A', 'B', 'C'], cardCount: 3, produces: ['Infinite tokens'] };
    const casual = makeDeck(['Llanowar Elves', 'Rampant Growth', 'Farseek']);

    const without = assessPowerLevel(casual, makeAnalysis(3.0, 20));
    expect(without).toMatchObject({ bracket: 1, signals: { twoCardComboCount: 0, combos: [] } });

    const withCombo = assessPowerLevel(casual, makeAnalysis(3.0, 20), undefined, undefined, [combo, three]);
    expect(withCombo).toMatchObject({ bracket: 3, signals: { twoCardComboCount: 1 } });
    expect(withCombo.signals.combos).toHaveLength(2);

    // A fast combo is Bracket 4 by itself; one that no bracket rules out does not count at all.
    const fast = assessPowerLevel(casual, makeAnalysis(3.0, 20), undefined, undefined, [{ ...combo, bracket: 4 }]);
    expect(fast.bracket).toBe(4);
    expect(fast.findings[0]).toMatchObject({ basis: 'rule', bracket: 4 });
    expect(fast.findings[0]!.text).toContain('Dramatic Reversal + Isochron Scepter');
    const harmless = assessPowerLevel(casual, makeAnalysis(3.0, 20), undefined, undefined, [{ ...combo, bracket: 1 }]);
    expect(harmless).toMatchObject({ bracket: 1, signals: { twoCardComboCount: 0 } });
  });

  it('returns Bracket 3 when a Game Changer is present', () => {
    const deck = makeDeck(['Rhystic Study', 'Arcane Signet', 'Rampant Growth']);
    const analysis = makeAnalysis(3.0, 50);
    const result = assessPowerLevel(deck, analysis);
    expect(result.bracket).toBe(3);
    expect(result.label).toBe('Upgraded');
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
      { name: 'Rhystic Study', popularity: 0.63, slot: 'draw', gameChanger: true },
      { name: 'Cyclonic Rift', popularity: 0.61, slot: 'interaction', gameChanger: true },
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

  it('finds cheap tutors by the trait the card data gives them, not by name', () => {
    const deck = makeDeck(['Demonic Tutor', 'Vampiric Tutor', 'Diabolic Tutor']);
    const result = assessPowerLevel(deck, makeAnalysis(2.5, 55));
    expect(result.signals.tutors).toEqual(['Demonic Tutor', 'Vampiric Tutor']);
  });

  it('puts mass land denial in Bracket 4 as a rule of the brackets', () => {
    const result = assessPowerLevel(makeDeck(['Armageddon']), makeAnalysis(3, 20));
    expect(result.bracket).toBe(4);
    expect(result.signals.massLandDenial).toEqual(['Armageddon']);
    expect(result.findings[0]).toMatchObject({ basis: 'rule', bracket: 4 });
    expect(result.findings[0]!.text).toContain('Armageddon');
  });

  it('reads two extra-turn cards as enough to chain turns, and one as fine from Bracket 2', () => {
    const one = assessPowerLevel(makeDeck(['Time Warp']), makeAnalysis(3, 20));
    expect(one.bracket).toBe(2);

    const two = assessPowerLevel(makeDeck(['Time Warp', 'Temporal Manipulation']), makeAnalysis(3, 20));
    expect(two.bracket).toBe(4);
    // How many cards make a chain is our reading, not a published number.
    expect(two.findings[0]).toMatchObject({ basis: 'estimate', bracket: 4 });
  });

  it('counts a combo as two-card when two cards besides the commander make it, and not when it takes more', () => {
    const casual = makeDeck(['Llanowar Elves']);
    const line = { id: 'c3', uses: ['Test Commander', 'A', 'B'], cardCount: 3, produces: ['Infinite tokens'], bracket: 3 as const };
    const withCommander = assessPowerLevel(casual, makeAnalysis(3, 20), undefined, undefined, [{ ...line, besidesCommander: 2 }]);
    expect(withCommander).toMatchObject({ bracket: 3, signals: { twoCardComboCount: 1 } });
    const threeCards = assessPowerLevel(casual, makeAnalysis(3, 20), undefined, undefined, [line]);
    expect(threeCards).toMatchObject({ bracket: 1, signals: { twoCardComboCount: 0 } });
  });

  it('puts a slow or minor two-card combo at Bracket 2, as an estimate', () => {
    const combo = { id: 'c4', uses: ['A', 'B'], cardCount: 2, produces: ['Infinite scry'], bracket: 2 as const };
    const result = assessPowerLevel(makeDeck(['Llanowar Elves']), makeAnalysis(3, 20), undefined, undefined, [combo]);
    expect(result.bracket).toBe(2);
    expect(result.findings[0]).toMatchObject({ basis: 'estimate', bracket: 2 });
  });

  it('suggests taking out what Brackets 1 to 3 rule out, not only Game Changers', () => {
    const combo = { id: 'c5', uses: ['Combo A', 'Combo B'], cardCount: 2, produces: ['Infinite mana'], bracket: 4 as const };
    const deck = makeDeck(['Armageddon', 'Time Warp', 'Temporal Manipulation', 'Combo A', 'Combo B']);
    const result = assessPowerLevel(deck, makeAnalysis(3, 20), 3, [], [combo]);
    expect(result.targetSuggestions!.map(suggestion => suggestion.remove)).toEqual(['Armageddon', 'Temporal Manipulation', 'Combo A']);
  });

  it('marks each reason as a rule or an estimate, rules first, and the bracket is the highest', () => {
    const result = assessPowerLevel(makeDeck(['Rhystic Study']), makeAnalysis(3, 45));
    expect(result.bracket).toBe(3);
    expect(result.findings.map(finding => finding.basis)).toEqual(['rule', 'estimate']);
    expect(result.findings[0]!.text).toContain('Brackets 1 and 2 allow none');
    expect(result.explanation).toEqual(result.findings.map(finding => finding.text));
  });

  it('computes fast mana ratio from ramp slot CMC', () => {
    // 2 of 4 ramp cards are fast (CMC 0 or 1)
    const deck = makeDeck(['Some Card'], [0, 1, 2, 3]);
    const analysis = makeAnalysis(3.0, 30);
    const result = assessPowerLevel(deck, analysis);
    expect(result.signals.fastManaRatio).toBe(0.5);
  });
});

describe('bracketMethod', () => {
  it('links every signal to where its data comes from', () => {
    const method = bracketMethod({ cardDataDate: '2026-11-13', gameChangerCount: 53 });
    expect(method.official.sources.every(source => source.url.startsWith('https://magic.wizards.com/'))).toBe(true);
    expect(method.official.brackets.map(row => row.bracket)).toEqual([1, 2, 3, 4, 5]);
    for (const signal of method.signals) expect(signal.source.url).toMatch(/^https:\/\//);
    expect(method.signals.find(signal => signal.name === 'Game Changers')!.source.url).toContain('is%3Agamechanger');
    expect(method.gameChangerCount).toBe(53);
  });

  it('prints the numbers the assessment runs on', () => {
    const text = bracketMethod().estimate.join(' ');
    expect(text).toContain(`average ${ESTIMATE.staplesWellTuned} or more`);
    expect(text).toContain(`${ESTIMATE.gameChangersCedh} or more Game Changers`);
  });
});
