import { MAX_THEMES, THEME_THRESHOLD, THEMES, TYPAL, typalWants } from './themes';
import type { CardTest } from './types';

const hasCondition = (test: CardTest) =>
  Boolean(test.tags?.length || test.type || test.text || test.keyword || test.minCmc !== undefined || test.maxCmc !== undefined);

describe('theme table', () => {
  it('gives every theme a unique slug, a name and a description', () => {
    const slugs = [TYPAL, ...THEMES].map(theme => theme.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const theme of [TYPAL, ...THEMES]) {
      expect(theme.name).not.toBe('');
      expect(theme.description).not.toBe('');
    }
  });

  it('covers the archetypes the builder has always offered, and the ones added with local data', () => {
    const slugs = [TYPAL, ...THEMES].map(theme => theme.slug);
    for (const slug of [
      'tokens', 'voltron', 'control', 'combo', 'stompy', 'reanimator', 'aristocrats', 'spellslinger', 'artifacts', 'enchantress',
      'typal', 'counters', 'lifegain', 'lands', 'graveyard', 'mill', 'wheels', 'blink',
    ]) {
      expect(slugs).toContain(slug);
    }
  });

  it.each(THEMES.map(theme => [theme.slug, theme] as const))('%s: signals and wants are well formed', (_slug, theme) => {
    expect(theme.signals.length).toBeGreaterThan(0);
    expect(theme.wants.length).toBeGreaterThan(0);
    // A theme nothing can switch on would sit in the table unnoticed.
    const reachable = theme.signals.reduce((sum, signal) => sum + signal.weight, 0);
    expect(reachable).toBeGreaterThanOrEqual(THEME_THRESHOLD);

    for (const signal of theme.signals) {
      expect(signal.weight).toBeGreaterThan(0);
      expect(signal.weight).toBeLessThanOrEqual(1);
      expect(hasCondition(signal)).toBe(true);
      // `says` completes "a commander that …".
      expect(signal.says).toMatch(/^[a-z+]/);
      expect(signal.says).not.toMatch(/\.$/);
    }
    for (const want of theme.wants) {
      expect(want.weight).toBeGreaterThan(0);
      expect(want.weight).toBeLessThanOrEqual(1);
      expect(hasCondition(want)).toBe(true);
      expect(want.reason).toMatch(/^[A-Z+]/);
      expect(want.reason).not.toMatch(/\.$/);
    }
  });

  it('keeps a commander to a handful of themes', () => {
    expect(MAX_THEMES).toBeGreaterThanOrEqual(2);
    expect(MAX_THEMES).toBeLessThanOrEqual(5);
  });
});

describe('typalWants', () => {
  it('wants creatures of the type and the cards that reward it', () => {
    const wants = typalWants('typal-goblin', 'Goblin', 'Goblins');
    expect(wants.map(want => want.reason)).toEqual(
      expect.arrayContaining(['Goblin', 'Cares about Goblins', 'Goblin that cares about Goblins']),
    );
    const plainGoblin = wants.find(want => want.reason === 'Goblin')!;
    expect(plainGoblin.type!.test('Creature — Goblin Warrior')).toBe(true);
    expect(plainGoblin.type!.test('Creature — Hobgoblin')).toBe(false);
    // The type has to be a subtype, not a word in the card's supertypes.
    expect(plainGoblin.type!.test('Goblin')).toBe(false);
  });

  it('wants only the payoffs for a type the commander merely makes tokens of', () => {
    const wants = typalWants('typal-spirit', 'Spirit', 'Spirits', true);
    expect(wants.some(want => want.type)).toBe(false);
    expect(wants.map(want => want.reason)).toContain('Cares about Spirits');
  });
});
