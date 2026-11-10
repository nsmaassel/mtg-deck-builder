import { describe, it, expect } from 'vitest';
import type { Format } from '@mtg/card-index';
import { parseDeckText } from './deck-text';
import { craftCost, planDeck, rankDecks } from './plan';
import type { PlanOptions } from './plan';
import { TextModel } from './similarity';
import { buildTestIndex, collectionOf } from './testing/fixtures';
import type { DeckLine, Wildcards } from './types';

const index = buildTestIndex();
const text = new TextModel(index);

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

  it('prefers the stand-in the archetype actually plays', () => {
    // Elvish Mystic and Fyndhorn Elves are the same card in all but name.
    const owned = { 'Elvish Mystic': 2, 'Fyndhorn Elves': 2 };
    const chosen = (options?: PlanOptions) =>
      plan('2 Llanowar Elves\n', owned, undefined, options).steps.map(s => s.substitute?.card.name);

    expect(chosen()).toEqual(['Elvish Mystic']);
    const usage = { archetype: 'Mono-Green', mainShare: (n: string) => (n === 'Fyndhorn Elves' ? 0.7 : 0), sideShare: () => 0 };
    expect(chosen({ usage })).toEqual(['Fyndhorn Elves']);
  });
});

describe('rankDecks', () => {
  const decks = [
    { id: 'expensive', text: '4 Sheoldred, the Apocalypse\n4 Slickshot Show-Off\n' },
    { id: 'owned', text: '4 Shock\n4 Opt\n' },
    { id: 'cheap', text: '4 Shock\n2 Go for the Throat\n' },
  ];

  it('puts decks the player can already build first, then the cheapest to finish', () => {
    const ranked = rankDecks(decks, d => parseDeckText(d.text), collectionOf({ Shock: 4, Opt: 4 }), index, 'standard');
    expect(ranked.map(r => r.item.id)).toEqual(['owned', 'cheap', 'expensive']);
    expect(ranked[0]?.cost).toBe(0);
    expect(ranked[2]?.cost).toBe(craftCost({ common: 0, uncommon: 0, rare: 4, mythic: 4 }));
  });

  it('counts a deck the wildcard inventory covers as buildable', () => {
    const collection = collectionOf({ Shock: 4 }, { common: 0, uncommon: 2, rare: 0, mythic: 0 });
    const ranked = rankDecks(decks, d => parseDeckText(d.text), collection, index, 'standard');
    expect(ranked.map(r => r.item.id).slice(0, 2).sort()).toEqual(['cheap', 'owned'].sort());
    expect(ranked.find(r => r.item.id === 'cheap')?.gap.craftable).toBe(true);
  });
});

describe('craftCost', () => {
  it('weighs rares and mythics far above commons and uncommons', () => {
    expect(craftCost({ common: 0, uncommon: 0, rare: 1, mythic: 0 })).toBe(1);
    expect(craftCost({ common: 0, uncommon: 0, rare: 0, mythic: 1 })).toBe(2);
    expect(craftCost({ common: 10, uncommon: 0, rare: 0, mythic: 0 })).toBeLessThan(1);
  });
});
