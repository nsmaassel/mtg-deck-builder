import { describe, it, expect } from 'vitest';
import { DECK_THEME_SHARE, MAX_DECK_THEMES, profileDeckThemes, themeFit } from './deck-themes';
import { buildFixtureIndex } from './testing/fixtures';
import type { FixtureCard } from './testing/fixtures';

const CARDS: FixtureCard[] = [
  { name: 'Slickshot Show-Off', cost: '{1}{R}', type: 'Creature — Bird Wizard', tags: ['prowess-like'] },
  { name: 'Monastery Swiftspear', cost: '{R}', type: 'Creature — Human Monk', tags: ['prowess-like'] },
  { name: 'Guttersnipe', cost: '{2}{R}', type: 'Creature — Goblin Shaman', tags: ['synergy-instant', 'synergy-sorcery'] },
  { name: 'Opt', cost: '{U}', type: 'Instant', tags: ['cantrip', 'draw'] },
  { name: 'Shock', cost: '{R}', type: 'Instant', tags: ['burn', 'removal'] },
  { name: 'Hulking Raptor', cost: '{2}{G}', type: 'Creature — Dinosaur' },
  { name: 'Viscera Seer', cost: '{B}', type: 'Creature — Vampire Wizard', tags: ['free-sacrifice-outlet', 'sacrifice-outlet-creature'] },
  { name: 'Lord of Atlantis', cost: '{U}{U}', type: 'Creature — Merfolk', tags: ['typal', 'typal-merfolk', 'anthem'] },
  { name: 'Merfolk Mistbinder', cost: '{G}{U}', type: 'Creature — Merfolk Shaman', tags: ['typal', 'typal-merfolk', 'anthem'] },
  { name: 'Silvergill Adept', cost: '{1}{U}', type: 'Creature — Merfolk Wizard', tags: ['draw'] },
  { name: 'Island', type: 'Basic Land — Island' },
];
const index = buildFixtureIndex(CARDS);
const deck = (list: Record<string, number>) =>
  Object.entries(list).map(([name, count]) => ({ card: index.byName(name)!, count }));

describe('profileDeckThemes', () => {
  it('reads a theme from the cards that reward it, counted by copies, lands aside', () => {
    const themes = profileDeckThemes(deck({ 'Slickshot Show-Off': 4, 'Monastery Swiftspear': 4, Opt: 4, Shock: 4, 'Hulking Raptor': 4, Island: 20 }));
    expect(themes.map(theme => theme.slug)).toEqual(['spellslinger']);
    // 8 of 20 spells at signal weight 0.7 is well past the share that makes a theme certain.
    expect(themes[0]).toMatchObject({ name: 'Spellslinger', weight: expect.closeTo(0.93, 2), because: '8 of its cards reward casting spells' });
  });

  it('ignores a theme only a card or two points at', () => {
    const themes = profileDeckThemes(deck({ Guttersnipe: 1, 'Hulking Raptor': 4, 'Silvergill Adept': 4, Opt: 3 }));
    expect(1 / 12).toBeLessThan(DECK_THEME_SHARE);
    expect(themes).toEqual([]);
  });

  it('finds the creature type a list cares about', () => {
    const themes = profileDeckThemes(deck({ 'Lord of Atlantis': 4, 'Merfolk Mistbinder': 4, 'Silvergill Adept': 4, Opt: 4 }));
    expect(themes[0]).toMatchObject({ slug: 'typal', name: 'Merfolk Typal', because: '8 of its cards care about Merfolk', creatureTypes: ['Merfolk'] });
  });

  it('keeps the strongest few and returns nothing for an empty list', () => {
    expect(profileDeckThemes([])).toEqual([]);
    expect(profileDeckThemes(deck({ Island: 20 }))).toEqual([]);
    const everything = profileDeckThemes(deck(Object.fromEntries(CARDS.map(card => [card.name, 4]))));
    expect(everything.length).toBeLessThanOrEqual(MAX_DECK_THEMES);
  });
});

describe('themeFit', () => {
  const themes = profileDeckThemes(deck({ 'Slickshot Show-Off': 4, 'Monastery Swiftspear': 4, Opt: 4, Shock: 4 }));
  const fit = (name: string) => themeFit(themes, index.byName(name)!);

  it('says how much the themes want a card, and why', () => {
    expect(fit('Guttersnipe')).toMatchObject({ fit: expect.closeTo(0.9, 2), want: { reason: 'Cares about instants or sorceries' } });
    expect(fit('Opt').want?.reason).toBe('Cantrip: an instant or sorcery that replaces itself');
    expect(fit('Guttersnipe').fit).toBeGreaterThan(fit('Shock').fit);
  });

  it('is zero for a card no theme wants, and for a list with no themes', () => {
    expect(fit('Hulking Raptor')).toEqual({ fit: 0 });
    expect(themeFit([], index.byName('Guttersnipe')!)).toEqual({ fit: 0 });
  });
});
