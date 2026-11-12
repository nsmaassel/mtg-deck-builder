import { commandersForTheme, findCommanders, listThemes, profileCommander } from './profile';
import { buildCommanderTestIndex } from './testing/fixtures';

const index = buildCommanderTestIndex();
const card = (name: string) => {
  const found = index.byName(name);
  if (!found) throw new Error(`fixture has no ${name}`);
  return found;
};
const themesOf = (name: string) => profileCommander(index, card(name)).themes;

describe('profileCommander', () => {
  it('reads a typal commander from its tags', () => {
    const profile = profileCommander(index, card('Krenko, Mob Boss'));
    expect(profile.identity).toEqual(['R']);
    expect(profile.format).toBe('commander');

    const [typal, tokens] = profile.themes;
    expect(typal).toMatchObject({
      slug: 'typal',
      name: 'Goblin Typal',
      weight: 1,
      because: 'cares about Goblins',
      creatureTypes: ['Goblin'],
    });
    // Making tokens alone would not switch Tokens on; making ever more of them does.
    expect(tokens).toMatchObject({ slug: 'tokens', because: 'makes creature tokens' });
    expect(tokens!.weight).toBeLessThan(1);
  });

  it('reads a spellslinger commander, and does not call it typal for its own creature type', () => {
    const themes = themesOf('Zada, Hedron Grinder');
    expect(themes.map(theme => theme.slug)).toEqual(['spellslinger']);
    expect(themes[0]!.because).toBe('cares about instants or sorceries');
  });

  it('finds the creature type of an untagged commander in its rules text', () => {
    const [typal] = themesOf('Ezuri, Renegade Leader');
    expect(typal).toMatchObject({ slug: 'typal', creatureTypes: ['Elf'], because: 'cares about Elves' });
  });

  it('does not take a subtype that other kinds of card share for a creature type', () => {
    expect(themesOf("Go-Shintai of Life's Origin").map(theme => theme.slug)).not.toContain('typal');
  });

  it('wants the payoffs, not every creature, of a type the commander only makes tokens of', () => {
    const typal = themesOf("Kykar, Wind's Fury").find(theme => theme.slug === 'typal')!;
    expect(typal.creatureTypes).toEqual(['Spirit']);
    expect(typal.wants.some(want => want.type)).toBe(false);
    expect(typal.wants.map(want => want.reason)).toContain('Cares about Spirits');
  });

  it('puts typal ahead of whatever else the commander does', () => {
    expect(themesOf("Kykar, Wind's Fury").map(theme => theme.slug)).toEqual(['typal', 'spellslinger']);
  });

  it('finds no theme on a commander that does nothing a theme listens for', () => {
    expect(themesOf('Isamaru, Hound of Konda')).toEqual([]);
    expect(themesOf('Squee, Goblin Nabob')).toEqual([]);
  });

  it('carries the format it was asked for', () => {
    expect(profileCommander(index, card('Krenko, Mob Boss'), { format: 'brawl' }).format).toBe('brawl');
  });
});

describe('listThemes', () => {
  it('lists every theme once, typal included, without the matching rules', () => {
    const themes = listThemes();
    expect(themes.map(theme => theme.slug)).toEqual(expect.arrayContaining(['typal', 'tokens', 'aristocrats', 'spellslinger']));
    expect(new Set(themes.map(theme => theme.slug)).size).toBe(themes.length);
    expect(Object.keys(themes[0]!).sort()).toEqual(['description', 'name', 'slug']);
  });
});

describe('commandersForTheme', () => {
  it('returns the commanders whose profile has the theme, most played first', () => {
    const names = commandersForTheme(index, 'typal').map(commander => commander.name);
    expect(names).toEqual(['Krenko, Mob Boss', 'Ezuri, Renegade Leader', "Kykar, Wind's Fury"]);
  });

  it('leaves out cards that cannot be a commander, even when they fit the theme', () => {
    const names = commandersForTheme(index, 'spellslinger').map(commander => commander.name);
    expect(names).toEqual(['Niv-Mizzet, Parun', "Kykar, Wind's Fury", 'Zada, Hedron Grinder']);
    expect(names).not.toContain('Guttersnipe');
  });

  it('honours the limit and the format', () => {
    expect(commandersForTheme(index, 'typal', { limit: 1 }).map(commander => commander.name)).toEqual(['Krenko, Mob Boss']);
    expect(commandersForTheme(index, 'typal', { format: 'brawl' })).toEqual([]);
  });

  it('returns nothing for a theme that does not exist', () => {
    expect(commandersForTheme(index, 'no-such-theme')).toEqual([]);
  });
});

describe('findCommanders', () => {
  it('matches part of a name whatever the case and punctuation', () => {
    expect(findCommanders(index, 'krenko mob').map(commander => commander.name)).toEqual(['Krenko, Mob Boss']);
    expect(findCommanders(index, "KYKAR, WIND'S").map(commander => commander.name)).toEqual(["Kykar, Wind's Fury"]);
  });

  it('returns only cards that can be a commander, most played first', () => {
    const names = findCommanders(index, 'goblin').map(commander => commander.name);
    expect(names).toEqual(['Squee, Goblin Nabob']);
    expect(findCommanders(index, 'e', { limit: 2 }).map(commander => commander.name)).toEqual([
      'Purphoros, God of the Forge',
      'Niv-Mizzet, Parun',
    ]);
  });

  it('returns nothing for an empty query', () => {
    expect(findCommanders(index, '  ')).toEqual([]);
  });
});
