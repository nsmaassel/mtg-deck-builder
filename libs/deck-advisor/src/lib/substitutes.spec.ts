import { describe, it, expect } from 'vitest';
import type { Format } from '@mtg/card-index';
import { TextModel, tagOverlap, tokenizeRulesText } from './similarity';
import { suggestSubstitutes } from './substitutes';
import type { SubstituteContext, SubstituteOptions } from './substitutes';
import { buildTestIndex, collectionOf, oracleId } from './testing/fixtures';
import type { ArchetypeUsage } from './types';

const index = buildTestIndex();
const text = new TextModel(index);

interface Setup {
  owned: Record<string, number>;
  colors: string[];
  format?: Format;
  inDeck?: Record<string, number>;
  usage?: ArchetypeUsage;
}

function suggest(target: string, setup: Setup, options?: SubstituteOptions) {
  const ctx: SubstituteContext = {
    index,
    format: setup.format ?? 'standard',
    collection: collectionOf(setup.owned),
    colors: setup.colors,
    inDeck: new Map(Object.entries(setup.inDeck ?? {}).map(([name, n]) => [oracleId(name), n])),
    usage: setup.usage,
    text,
  };
  return suggestSubstitutes(index.byName(target)!, ctx, options);
}

const names = (subs: ReturnType<typeof suggest>) => subs.map(s => s.card.name);

describe('suggestSubstitutes', () => {
  it('ranks a card that does the same job above one that merely costs the same', () => {
    const subs = suggest('Go for the Throat', {
      owned: { 'Cut Down': 4, Duress: 4, 'Vampire Nighthawk': 4 },
      colors: ['B'],
    });
    expect(subs[0]?.card.name).toBe('Cut Down');
    expect(subs[0]?.quality).toBe('close');
    expect(subs[0]?.source).toBe('owned');
    expect(subs[0]?.reasons[0]).toMatch(/^Same job: removal/);
  });

  it('never suggests the missing card itself', () => {
    const subs = suggest('Shock', { owned: { Shock: 2, 'Lightning Strike': 4 }, colors: ['R'] });
    expect(names(subs)).not.toContain('Shock');
    expect(names(subs)).toContain('Lightning Strike');
  });

  it('only offers cards the deck\'s colours can cast', () => {
    const subs = suggest('Lightning Strike', { owned: { 'Cut Down': 4, Shock: 4 }, colors: ['R'] });
    expect(names(subs)).toEqual(['Shock']);
  });

  it('offers a hybrid card to a deck with either of its colours', () => {
    const subs = suggest('Slickshot Show-Off', { owned: { 'Tempest Angler': 4 }, colors: ['R'] });
    expect(names(subs)).toContain('Tempest Angler');
  });

  it('only offers cards legal in the format', () => {
    const standard = suggest('Opt', { owned: { Brainstorm: 4, Consider: 4 }, colors: ['U'] });
    expect(names(standard)).toEqual(['Consider']);
    const historic = suggest('Opt', { owned: { Brainstorm: 4, Consider: 4 }, colors: ['U'], format: 'historic' });
    expect(names(historic)).toContain('Brainstorm');
  });

  it('counts copies already in the deck against what is spare', () => {
    const setup = { owned: { Shock: 4 }, colors: ['R'] };
    expect(suggest('Lightning Strike', { ...setup, inDeck: { Shock: 1 } })[0]?.available).toBe(3);
    expect(suggest('Lightning Strike', { ...setup, inDeck: { Shock: 4 } })).toEqual([]);
  });

  it('respects the singleton rule in Brawl', () => {
    const setup = { owned: { Shock: 4, 'Lightning Strike': 4 }, colors: ['U', 'R'], format: 'brawl' as const };
    const subs = suggest('Abrade', { ...setup, inDeck: { Shock: 1 } }, { sources: ['owned'] });
    expect(names(subs)).toEqual(['Lightning Strike']);
    expect(subs[0]?.available).toBe(1);
  });

  it('holds commander decks to colour identity, not just casting cost', () => {
    // The adventure half makes Callous Sell-Sword red as well as black.
    const subs = suggest('Go for the Throat', {
      owned: { 'Callous Sell-Sword // Burn Together': 1, 'Cut Down': 1 },
      colors: ['B'],
      format: 'brawl',
    }, { sources: ['owned'] });
    expect(names(subs)).toEqual(['Cut Down']);
  });

  it('replaces lands with lands and spells with spells', () => {
    const owned = { 'Izzet Guildgate': 4, Opt: 4, Shock: 4 };
    expect(names(suggest('Steam Vents', { owned, colors: ['U', 'R'] }, { sources: ['owned'] }))
      .every(n => index.byName(n)!.typeLine.includes('Land'))).toBe(true);
    expect(names(suggest('Lightning Strike', { owned, colors: ['U', 'R'] }))
      .some(n => index.byName(n)!.typeLine.includes('Land'))).toBe(false);
  });

  it('prefers a land that makes both colours untapped, then tapped duals, then basics', () => {
    const subs = suggest('Steam Vents', {
      owned: { 'Spirebluff Canal': 4, 'Izzet Guildgate': 4 },
      colors: ['U', 'R'],
    }, { sources: ['owned'], limit: 10 });
    expect(names(subs).slice(0, 2)).toEqual(['Spirebluff Canal', 'Izzet Guildgate']);
    expect(names(subs)).toEqual(expect.arrayContaining(['Island', 'Mountain']));
    expect(subs.find(s => s.card.name === 'Izzet Guildgate')?.reasons).toContain('Enters tapped');
    expect(subs.find(s => s.card.name === 'Island')?.reasons[0]).toMatch(/Makes blue mana only/);
  });

  it('offers basic lands even when the collection lists none', () => {
    const subs = suggest('Steam Vents', { owned: {}, colors: ['U', 'R'] }, { sources: ['owned'] });
    expect(names(subs).sort()).toEqual(['Island', 'Mountain']);
  });

  it('keeps off-colour dual lands out', () => {
    const subs = suggest('Steam Vents', { owned: { 'Watery Grave': 4 }, colors: ['U', 'R'] }, { sources: ['owned'] });
    expect(names(subs)).not.toContain('Watery Grave');
  });

  it('marks down a land whose coloured mana is restricted', () => {
    const subs = suggest('Steam Vents', {
      owned: { 'Secluded Courtyard': 4, 'Izzet Guildgate': 4 },
      colors: ['U', 'R'],
    }, { sources: ['owned'] });
    const courtyard = subs.find(s => s.card.name === 'Secluded Courtyard');
    const guildgate = subs.find(s => s.card.name === 'Izzet Guildgate');
    expect(guildgate!.score).toBeGreaterThan(courtyard!.score);
    expect(courtyard?.reasons).toContain('Its coloured mana comes with a restriction or a cost');
  });

  it('suggests a cheaper craft only when it is a lower rarity and not already spare', () => {
    const subs = suggest('Slickshot Show-Off', { owned: {}, colors: ['R'] }, { sources: ['craft'] });
    expect(names(subs)).toContain('Crackling Cyclops');
    const cyclops = subs.find(s => s.card.name === 'Crackling Cyclops')!;
    expect(cyclops.source).toBe('craft');
    expect(cyclops.craftRarity).toBe('common');
    expect(cyclops.reasons).toContain('Costs a common wildcard instead of a rare');

    // A common has nothing cheaper to craft instead.
    expect(suggest('Shock', { owned: {}, colors: ['R'] }, { sources: ['craft'] })).toEqual([]);
  });

  it('lists an owned card once, as owned, when both sources are asked for', () => {
    const subs = suggest('Slickshot Show-Off', { owned: { 'Crackling Cyclops': 4 }, colors: ['R'] });
    expect(subs.filter(s => s.card.name === 'Crackling Cyclops').map(s => s.source)).toEqual(['owned']);
  });

  it('says what a stand-in fails to do and calls it weak when it misses the point of the card', () => {
    const subs = suggest('Soul-Guide Lantern', {
      owned: { 'Bagel and Schmear': 4 },
      colors: ['U'],
    }, { sources: ['owned'] });
    expect(subs[0]?.card.name).toBe('Bagel and Schmear');
    expect(subs[0]?.quality).toBe('weak');
    expect(subs[0]?.reasons).toContain('Does not cover: hate graveyard');
  });

  it('puts the card that does the primary job first', () => {
    const subs = suggest('Soul-Guide Lantern', {
      owned: { 'Bagel and Schmear': 4, 'Ghost Vacuum': 1 },
      colors: ['U'],
    }, { sources: ['owned'] });
    expect(names(subs)[0]).toBe('Ghost Vacuum');
  });

  it('uses archetype evidence to break ties between equally similar cards', () => {
    const usage: ArchetypeUsage = {
      archetype: 'Azorius Control',
      mainShare: name => (name === 'Negate' ? 0.6 : 0),
      sideShare: () => 0,
    };
    // Two counterspells at the same cost standing in for a cantrip: nothing separates them but usage.
    const setup = { owned: { Negate: 4, 'Essence Scatter': 4 }, colors: ['U'] };
    const options = { sources: ['owned' as const], minScore: 0 };
    const without = suggest('Opt', setup, options);
    const withUsage = suggest('Opt', { ...setup, usage }, options);

    expect(names(without)).toEqual(['Essence Scatter', 'Negate']);
    expect(names(withUsage)).toEqual(['Negate', 'Essence Scatter']);
    expect(withUsage[0]?.reasons).toContain('In 60% of Azorius Control main decks');
    expect(without.flatMap(s => s.reasons).join(' ')).not.toMatch(/main decks/);
  });

  it('falls back to rules text for cards nobody has tagged', () => {
    const subs = suggest('Hulking Raptor', { owned: { 'Crackling Cyclops': 4, Opt: 4 }, colors: ['U', 'R'] }, { sources: ['owned'], minScore: 0 });
    expect(subs[0]?.card.name).toBe('Crackling Cyclops');
    expect(subs[0]?.breakdown.role).toBe(0);
  });

  it('honours limit and minScore', () => {
    const setup = { owned: { Shock: 4, 'Lightning Strike': 4, Abrade: 4, 'Crackling Cyclops': 4 }, colors: ['R'] };
    expect(suggest('Slickshot Show-Off', setup, { limit: 1 })).toHaveLength(1);
    expect(suggest('Slickshot Show-Off', setup, { minScore: 0.99 })).toEqual([]);
  });

  it('is deterministic', () => {
    const setup = { owned: { Shock: 4, 'Lightning Strike': 4, Abrade: 4, Opt: 4, Negate: 4 }, colors: ['U', 'R'] };
    expect(names(suggest('Go for the Throat', { ...setup, colors: ['U', 'B', 'R'] })))
      .toEqual(names(suggest('Go for the Throat', { ...setup, colors: ['U', 'B', 'R'] })));
  });
});

describe('tagOverlap', () => {
  it('is 1 for identical tag sets and 0 for disjoint ones', () => {
    const shock = index.byName('Shock')!;
    expect(tagOverlap(shock, index.byName('Lightning Strike')!, index).score).toBeCloseTo(1);
    expect(tagOverlap(shock, index.byName('Opt')!, index).score).toBe(0);
  });

  it('lists what only the first card does', () => {
    const overlap = tagOverlap(index.byName('Soul-Guide Lantern')!, index.byName('Bagel and Schmear')!, index);
    expect(overlap.missing).toEqual(['hate-graveyard']);
    expect(overlap.shared.sort()).toEqual(['draw', 'egg']);
  });

  it('returns nothing for an untagged card', () => {
    expect(tagOverlap(index.byName('Hulking Raptor')!, index.byName('Shock')!, index))
      .toEqual({ score: 0, shared: [], missing: [] });
  });
});

describe('TextModel', () => {
  it('finds near-identical rules text more similar than unrelated text', () => {
    const strike = index.byName('Lightning Strike')!;
    const near = text.similarity(strike, index.byName('Shock')!);
    const far = text.similarity(strike, index.byName('Llanowar Elves')!);
    expect(near).toBeGreaterThan(0.3);
    expect(near).toBeGreaterThan(far);
    expect(text.similarity(strike, strike)).toBeCloseTo(1);
  });

  it('ignores card names, reminder text and specific numbers', () => {
    const terms = tokenizeRulesText({
      name: 'Sheoldred, the Apocalypse',
      oracleText: 'Whenever Sheoldred attacks, it deals 3 damage (This is reminder text.) and gets +2/+2. {T}: Add {G}.',
    });
    expect(terms).toContain('selfname');
    expect(terms).not.toContain('sheoldred');
    expect(terms).not.toContain('reminder');
    expect(terms).toContain('num');
    expect(terms).toContain('ptvalue');
    expect(terms).toContain('tapsymbol');
    expect(terms).toContain('manasymbol');
    expect(terms).toContain('deals num');
  });
});
