import { describe, it, expect } from 'vitest';
import type { Format } from '@mtg/card-index';
import { parseDeckText } from './deck-text';
import { craftCost, planDeck } from './plan';
import type { PlanOptions } from './plan';
import { TextModel } from './similarity';
import { buildTestCombos, buildTestIndex, collectionOf, oracleId } from './testing/fixtures';
import type { DeckLine, Wildcards } from './types';

const index = buildTestIndex();
const text = new TextModel(index);
const combos = buildTestCombos(index);

function plan(deckText: string, owned: Record<string, number>, wildcards?: Wildcards, options?: PlanOptions, format: Format = 'standard') {
  return planDeck(parseDeckText(deckText), collectionOf(owned, wildcards), index, format, text, options);
}

const total = (lines: DeckLine[]) => lines.reduce((sum, l) => sum + l.count, 0);
const NO_WILDCARDS: Wildcards = { common: 0, uncommon: 0, rare: 0, mythic: 0 };

describe('planDeck', () => {
  it('returns the list unchanged when every card is owned', () => {
    const result = plan('4 Shock\n4 Opt\n10 Island\n', { Shock: 4, Opt: 4 });
    expect(result.steps).toEqual([]);
    expect(result.fidelity).toBe(1);
    expect(result.deck.main).toEqual([
      { name: 'Shock', count: 4 },
      { name: 'Opt', count: 4 },
      { name: 'Island', count: 10 },
    ]);
  });

  it('fills missing cards from the collection and keeps the deck the same size', () => {
    const result = plan('4 Slickshot Show-Off\n4 Lightning Strike\n12 Mountain\n', {
      'Crackling Cyclops': 4,
      Shock: 4,
    });
    expect(total(result.deck.main)).toBe(20);
    expect(result.steps.map(s => [s.action, s.count, s.target, s.substitute?.card.name])).toEqual([
      ['substitute', 4, 'Slickshot Show-Off', 'Crackling Cyclops'],
      ['substitute', 4, 'Lightning Strike', 'Shock'],
    ]);
    expect(result.fidelity).toBeGreaterThan(0.6);
    expect(result.fidelity).toBeLessThan(1);
    expect(result.wildcardsSpent).toEqual(NO_WILDCARDS);
    expect(result.wildcardsLeft).toBeUndefined();
  });

  it('never hands the same spare copy to two missing cards', () => {
    const result = plan('4 Lightning Strike\n4 Abrade\n', { Shock: 4 });
    const shocks = result.steps.filter(s => s.substitute?.card.name === 'Shock').reduce((n, s) => n + s.count, 0);
    expect(shocks).toBe(4);
    expect(result.deck.main.find(l => l.name === 'Shock')?.count).toBe(4);
    expect(result.steps.some(s => s.action === 'unfilled')).toBe(true);
  });

  it('splits one missing card across several stand-ins when no single one has enough copies', () => {
    const result = plan('4 Lightning Strike\n', { Shock: 2, Abrade: 4 });
    const fills = result.steps.filter(s => s.action === 'substitute');
    expect(fills.reduce((n, s) => n + s.count, 0)).toBe(4);
    expect(new Set(fills.map(s => s.substitute?.card.name)).size).toBe(2);
  });

  it('spends wildcards on the card with no real stand-in first', () => {
    // Sheoldred has nothing like it in the collection; Go for the Throat has Cut Down.
    const result = plan(
      '2 Sheoldred, the Apocalypse\n2 Go for the Throat\n',
      { 'Cut Down': 4, 'Gray Merchant': 4 },
      { common: 0, uncommon: 2, rare: 0, mythic: 2 },
    );
    const crafts = result.steps.filter(s => s.action === 'craft');
    expect(crafts[0]).toMatchObject({ target: 'Sheoldred, the Apocalypse', count: 2, craftRarity: 'mythic' });
    expect(result.wildcardsSpent.mythic).toBe(2);
    expect(result.wildcardsLeft?.mythic).toBe(0);
    expect(result.deck.main.find(l => l.name === 'Sheoldred, the Apocalypse')?.count).toBe(2);
  });

  it('keeps the wildcard when a near-equivalent card is already owned', () => {
    const result = plan('4 Opt\n', { Consider: 4 }, { common: 4, uncommon: 0, rare: 0, mythic: 0 });
    expect(result.steps).toEqual([
      expect.objectContaining({ action: 'substitute', target: 'Opt', count: 4 }),
    ]);
    expect(result.steps[0]?.substitute?.card.name).toBe('Consider');
    expect(result.wildcardsLeft?.common).toBe(4);
  });

  it('does not let one spare playset excuse two crafts', () => {
    // Consider is a near-equivalent for Opt, but there are only 2 spare copies for 4 missing cards
    // across two boards. The first 2 are covered; the other 2 are worth their wildcards.
    const result = plan('Deck\n2 Opt\n\nSideboard\n2 Opt\n', { Consider: 2 }, { common: 4, uncommon: 0, rare: 0, mythic: 0 });
    const crafted = result.steps.filter(s => s.action === 'craft').reduce((n, s) => n + s.count, 0);
    const swapped = result.steps.filter(s => s.action === 'substitute').reduce((n, s) => n + s.count, 0);
    expect([crafted, swapped]).toEqual([2, 2]);
    expect(result.steps.some(s => s.action === 'unfilled')).toBe(false);
    expect(result.wildcardsLeft?.common).toBe(2);
  });

  it('crafts as far as the inventory goes and substitutes the rest', () => {
    const result = plan(
      '4 Sheoldred, the Apocalypse\n',
      { 'Vampire Nighthawk': 4 },
      { common: 0, uncommon: 0, rare: 0, mythic: 1 },
    );
    expect(result.steps.map(s => [s.action, s.count, s.substitute?.card.name])).toEqual([
      ['craft', 1, undefined],
      ['substitute', 3, 'Vampire Nighthawk'],
    ]);
    expect(result.deck.main).toEqual([
      { name: 'Sheoldred, the Apocalypse', count: 1 },
      { name: 'Vampire Nighthawk', count: 3 },
    ]);
    expect(result.steps[0]?.note).toMatch(/Vampire Nighthawk/);
  });

  it('never spends more wildcards than the collection has', () => {
    const result = plan('4 Sheoldred, the Apocalypse\n4 Slickshot Show-Off\n', {}, { common: 0, uncommon: 0, rare: 2, mythic: 1 });
    expect(result.wildcardsSpent).toEqual({ common: 0, uncommon: 0, rare: 2, mythic: 1 });
    expect(result.wildcardsLeft).toEqual(NO_WILDCARDS);
  });

  it('keeps every wildcard when asked not to craft', () => {
    const result = plan('2 Sheoldred, the Apocalypse\n', { 'Vampire Nighthawk': 4 }, { common: 9, uncommon: 9, rare: 9, mythic: 9 }, { craft: 'none' });
    expect(result.steps.some(s => s.action === 'craft')).toBe(false);
    expect(result.wildcardsLeft).toEqual({ common: 9, uncommon: 9, rare: 9, mythic: 9 });
  });

  it('refuses to replace a commander', () => {
    const result = plan('Commander\n1 Niv-Mizzet, Parun\n\nDeck\n1 Opt\n', { Opt: 1, Shock: 1 }, undefined, undefined, 'brawl');
    expect(result.steps).toEqual([
      expect.objectContaining({ action: 'unfilled', board: 'commander', target: 'Niv-Mizzet, Parun' }),
    ]);
    expect(result.deck.commander).toEqual([]);
  });

  it('crafts a missing commander before anything else', () => {
    const result = plan(
      'Commander\n1 Niv-Mizzet, Parun\n\nDeck\n1 Slickshot Show-Off\n',
      {},
      { common: 0, uncommon: 0, rare: 1, mythic: 0 },
      undefined,
      'brawl',
    );
    expect(result.steps[0]).toMatchObject({ action: 'craft', target: 'Niv-Mizzet, Parun' });
    expect(result.deck.commander).toEqual([{ name: 'Niv-Mizzet, Parun', count: 1 }]);
  });

  it('fills a missing dual land with basics when nothing better is owned', () => {
    const result = plan('4 Steam Vents\n4 Shock\n4 Opt\n', { Shock: 4, Opt: 4 });
    const lands = result.steps.filter(s => s.target === 'Steam Vents');
    expect(lands.every(s => s.action === 'substitute')).toBe(true);
    expect(lands.reduce((n, s) => n + s.count, 0)).toBe(4);
    expect(total(result.deck.main)).toBe(12);
  });

  it('reports unknown and illegal cards as unfilled instead of dropping them silently', () => {
    const result = plan('2 Not A Real Card\n4 Shock\n', { Shock: 4 });
    expect(result.steps).toEqual([
      expect.objectContaining({ action: 'unfilled', target: 'Not A Real Card', count: 2 }),
    ]);
    expect(total(result.deck.main)).toBe(4);
  });

  it('writes the result in Arena import format using Arena card names', () => {
    const result = plan('Deck\n2 Callous Sell-Sword // Burn Together\n\nSideboard\n1 Negate\n', {
      'Callous Sell-Sword // Burn Together': 2,
      Negate: 1,
    });
    expect(result.arenaText).toBe('Deck\n2 Callous Sell-Sword\n\nSideboard\n1 Negate\n');
  });

  it('names the companion again in the export when it is in the final sideboard', () => {
    const deckText = 'Companion\n1 Negate\n\nDeck\n4 Shock\n\nSideboard\n1 Negate\n2 Opt\n';
    const owned = plan(deckText, { Shock: 4, Negate: 1, Opt: 2 });
    expect(owned.arenaText).toBe('Companion\n1 Negate\n\nDeck\n4 Shock\n\nSideboard\n1 Negate\n2 Opt\n');
    expect(owned.gap.totalCards).toBe(7);

    // Without the card there is no companion to name.
    const missing = plan(deckText, { Shock: 4, Opt: 2 }, undefined, { candidatesPerCard: 0 });
    expect(missing.arenaText.startsWith('Companion')).toBe(false);
  });

  it('keeps every stand-in it found for each missing card, owned and craftable', () => {
    const result = plan('4 Slickshot Show-Off\n4 Shock\n', { Shock: 4, 'Tempest Angler': 4 });
    const slickshot = result.gap.cards.find(c => c.name === 'Slickshot Show-Off')!;
    const found = result.standIns.get(slickshot)!;
    expect(found.map(s => [s.card.name, s.source])).toEqual(
      expect.arrayContaining([['Tempest Angler', 'owned'], ['Crackling Cyclops', 'craft']]),
    );
    expect(result.standIns.has(result.gap.cards.find(c => c.name === 'Shock')!)).toBe(false);
  });

  it('prefers the stand-in the archetype actually plays', () => {
    // Elvish Mystic and Fyndhorn Elves are the same card in all but name.
    const owned = { 'Elvish Mystic': 2, 'Fyndhorn Elves': 2 };
    const chosen = (options?: PlanOptions) =>
      plan('2 Llanowar Elves\n', owned, undefined, options).steps.map(s => s.substitute?.card.name);

    expect(chosen()).toEqual(['Elvish Mystic']);
    const usage = { archetype: 'Mono-Green', mainShare: (id: string) => (id === oracleId('Fyndhorn Elves') ? 0.7 : 0), sideShare: () => 0 };
    expect(chosen({ usage })).toEqual(['Fyndhorn Elves']);
  });
});

describe('planDeck and combos', () => {
  const DECK = '4 Opt\n4 Shock\n4 Negate\n12 Island\n';
  const OWNED = { Opt: 4, 'Lightning Strike': 4, 'Essence Scatter': 4 };

  it('says which combo the list loses when a stand-in takes a combo piece\'s place', () => {
    const result = plan(DECK, OWNED, undefined, { combos });
    const shock = result.steps.find(step => step.target === 'Shock')!;
    expect(shock).toMatchObject({ action: 'substitute', substitute: { card: { name: 'Lightning Strike' } } });
    expect(shock.comboLost).toBe('Without Shock the deck loses its combo with Opt (infinite damage).');
    // Negate is in no combo.
    expect(result.steps.find(step => step.target === 'Negate')!.comboLost).toBeUndefined();
  });

  it('spends the wildcards on the combo piece, however close its stand-in', () => {
    const wildcards = { ...NO_WILDCARDS, common: 4 };
    const without = plan(DECK, OWNED, wildcards);
    const withCombos = plan(DECK, OWNED, wildcards, { combos });
    const crafted = (result: typeof without) => result.steps.filter(step => step.action === 'craft').map(step => step.target);
    expect(crafted(withCombos)).toEqual(['Shock']);
    expect(withCombos.steps.find(step => step.action === 'craft')!.note).toBe(
      "Worth the wildcard: it is part of the deck's combo with Opt (infinite damage), and no other card keeps that.",
    );
    expect(withCombos.steps.some(step => step.comboLost)).toBe(false);
    // Without the combo data nothing marks Shock out: Lightning Strike is close enough to keep the wildcards.
    expect(crafted(without)).toEqual([]);
  });

  it('does not count a combo that needs more than its named cards as one the list would lose', () => {
    // Shock + Lightning Strike is a combo only beside two sacrifice outlets.
    const result = plan('4 Shock\n4 Lightning Strike\n12 Mountain\n', { Shock: 4, Abrade: 4 }, undefined, { combos });
    expect(result.steps.find(step => step.target === 'Lightning Strike')!.comboLost).toBeUndefined();
  });

  it('leaves a combo alone that the copies owned still make', () => {
    const wildcards = { ...NO_WILDCARDS, common: 4 };
    const result = plan(DECK, { ...OWNED, Shock: 2 }, wildcards, { combos });
    expect(result.steps.some(step => step.comboLost)).toBe(false);
    expect(result.steps.filter(step => step.action === 'craft')).toEqual([]);
  });

  it('gives a combo piece no priority when its other half is missing too', () => {
    const wildcards = { ...NO_WILDCARDS, common: 4 };
    const result = plan(DECK, { 'Lightning Strike': 4, 'Essence Scatter': 4, Consider: 4 }, wildcards, { combos });
    for (const step of result.steps.filter(s => s.action === 'craft')) expect(step.note).not.toMatch(/combo/);
  });

  it('points out a stand-in that finishes a combo with cards already held', () => {
    const result = plan('4 Opt\n4 Lightning Strike\n12 Island\n', { Opt: 4, Shock: 4 }, undefined, { combos });
    const step = result.steps.find(s => s.target === 'Lightning Strike')!;
    expect(step.substitute!.card.name).toBe('Shock');
    expect(step.substitute!.reasons).toContain('Finishes a combo with Opt (infinite damage)');
  });

  it('claims no combo that needs more than its named cards, or cards the player lacks', () => {
    // Shock + Lightning Strike also needs two sacrifice outlets; Opt is not owned here.
    const result = plan('4 Opt\n4 Lightning Strike\n4 Negate\n12 Island\n', { 'Lightning Strike': 4, Shock: 4 }, undefined, { combos });
    for (const stand of [...result.standIns.values()].flat()) {
      expect(stand.reasons.join(' ')).not.toMatch(/combo/);
    }
  });
});

describe('planDeck and themes', () => {
  const DECK = '4 Slickshot Show-Off\n4 Tempest Angler\n4 Opt\n12 Island\n';

  it('reads what a list is built around from its own cards', () => {
    expect(plan(DECK, {}).themes).toEqual([
      { slug: 'spellslinger', name: 'Spellslinger', because: '8 of its cards reward casting spells' },
    ]);
    expect(plan('4 Hulking Raptor\n4 Llanowar Elves\n12 Forest\n', {}).themes).toEqual([]);
  });

  it('takes a commander deck\'s themes from its commander', () => {
    const result = plan('Commander\n1 Niv-Mizzet, Parun\n\nDeck\n1 Opt\n1 Shock\n', {}, undefined, undefined, 'brawl');
    for (const theme of result.themes) expect(theme.because).toMatch(/^its commander /);
  });

  it('judges a stand-in for a card that serves the theme on serving it too', () => {
    const result = plan(DECK, { 'Tempest Angler': 4, Opt: 4, 'Crackling Cyclops': 4, 'Vampire Nighthawk': 4, 'Hulking Raptor': 4 });
    const stands = [...result.standIns.values()].flat();
    const cyclops = stands.find(stand => stand.card.name === 'Crackling Cyclops')!;
    expect(cyclops.breakdown.fit).toBe(1);
    expect(cyclops.reasons).toContain("Fits the deck's Spellslinger theme: rewards casting spells");
    const raptor = stands.find(stand => stand.card.name === 'Hulking Raptor');
    if (raptor) {
      expect(raptor.breakdown.fit).toBe(0);
      expect(raptor.reasons).toContain("Does nothing for the deck's Spellslinger theme, which the original serves");
      expect(raptor.score).toBeLessThan(cyclops.score);
    }
  });
});

describe('craftCost', () => {
  it('weighs rares and mythics far above commons and uncommons', () => {
    expect(craftCost({ common: 0, uncommon: 0, rare: 1, mythic: 0 })).toBe(1);
    expect(craftCost({ common: 0, uncommon: 0, rare: 0, mythic: 1 })).toBe(2);
    expect(craftCost({ common: 10, uncommon: 0, rare: 0, mythic: 0 })).toBeLessThan(1);
  });
});
