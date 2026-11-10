import { describe, it, expect } from 'vitest';
import { CardIndexBuilder } from './builder';
import { CardIndex } from './card-index';
import { normalizeCardName, splitFaces } from './names';
import type { ScryfallPrinting, ScryfallTag } from './types';

const LEGAL_EVERYWHERE = {
  standard: 'legal', alchemy: 'legal', historic: 'legal', timeless: 'legal', pioneer: 'legal',
  brawl: 'legal', standardbrawl: 'legal', commander: 'legal', modern: 'legal',
};

function printing(overrides: Partial<ScryfallPrinting> & { name: string; oracle_id?: string }): ScryfallPrinting {
  return {
    oracle_id: `oracle-${overrides.name}`,
    layout: 'normal',
    set: 'tst',
    rarity: 'common',
    games: ['paper'],
    mana_cost: '{1}',
    cmc: 1,
    type_line: 'Instant',
    oracle_text: '',
    colors: [],
    color_identity: [],
    legalities: LEGAL_EVERYWHERE,
    ...overrides,
  };
}

function build(printings: ScryfallPrinting[], tags: ScryfallTag[] = [], disabledTags?: string[]): CardIndex {
  const builder = new CardIndexBuilder();
  for (const p of printings) builder.addPrinting(p);
  for (const t of tags) builder.addTag(t);
  return new CardIndex(builder.build({ builtAt: '2026-01-01T00:00:00Z' }), { disabledTags });
}

describe('normalizeCardName', () => {
  it.each([
    ['Lightning Bolt', 'lightning bolt'],
    ['  Lightning   Bolt ', 'lightning bolt'],
    ['Lim-Dûl’s Vault', "lim-dul's vault"],
    ['A-Omnath, Locus of Creation', 'omnath, locus of creation'],
    ['Fire/Ice', 'fire // ice'],
    ['Fire /// Ice', 'fire // ice'],
    ['Fire // Ice', 'fire // ice'],
  ])('folds %s', (input, expected) => {
    expect(normalizeCardName(input)).toBe(expected);
  });

  it('keeps a leading "A-" that is part of a real word boundary only when followed by space', () => {
    expect(normalizeCardName('A- Team')).toBe('a- team');
  });

  it('splits face names', () => {
    expect(splitFaces('Fable of the Mirror-Breaker // Reflection of Kiki-Jiki')).toEqual([
      'Fable of the Mirror-Breaker',
      'Reflection of Kiki-Jiki',
    ]);
    expect(splitFaces('Shock')).toEqual(['Shock']);
  });
});

describe('CardIndexBuilder', () => {
  it('merges printings of one card and takes the lowest Arena rarity as the craft cost', () => {
    const index = build([
      printing({ name: 'Lightning Strike', rarity: 'uncommon', games: ['paper', 'arena'], arena_id: 100 }),
      printing({ name: 'Lightning Strike', rarity: 'common', games: ['paper', 'arena'], arena_id: 200 }),
      printing({ name: 'Lightning Strike', rarity: 'rare', games: ['paper'] }),
    ]);
    expect(index.size).toBe(1);
    const card = index.byName('lightning strike')!;
    expect(card.onArena).toBe(true);
    expect(card.arenaRarity).toBe('common');
    expect(card.arenaIds).toEqual([100, 200]);
    expect(index.byArenaId(200)).toBe(card);
  });

  it('does not let a paper-only printing set the Arena rarity', () => {
    const index = build([
      printing({ name: 'Counterspell', rarity: 'common', games: ['paper'] }),
      printing({ name: 'Counterspell', rarity: 'uncommon', games: ['arena'], arena_id: 7 }),
    ]);
    const card = index.byName('Counterspell')!;
    expect(card.arenaRarity).toBe('uncommon');
    expect(card.rarity).toBe('common');
  });

  it('marks cards without an Arena printing as off Arena', () => {
    const card = build([printing({ name: 'Mana Crypt', rarity: 'mythic' })]).byName('Mana Crypt')!;
    expect(card.onArena).toBe(false);
    expect(card.arenaRarity).toBeUndefined();
  });

  it('skips tokens, art cards and cards legal nowhere', () => {
    const nowhere = Object.fromEntries(Object.keys(LEGAL_EVERYWHERE).map(k => [k, 'not_legal']));
    const index = build([
      printing({ name: 'Goblin', layout: 'token' }),
      printing({ name: 'Art Card', layout: 'art_series' }),
      printing({ name: 'Silly Card', legalities: nowhere }),
      printing({ name: 'Shock' }),
    ]);
    expect(index.all().map(c => c.name)).toEqual(['Shock']);
  });

  it('records legal, restricted and banned formats separately', () => {
    const card = build([
      printing({
        name: 'Channel',
        legalities: { ...LEGAL_EVERYWHERE, timeless: 'restricted', historic: 'banned', standard: 'not_legal' },
      }),
    ]).byName('Channel')!;
    expect(card.legal).toContain('timeless');
    expect(card.restricted).toEqual(['timeless']);
    expect(card.banned).toEqual(['historic']);
    expect(card.legal).not.toContain('historic');
    expect(card.legal).not.toContain('standard');
  });

  it('reads multi-faced cards from their faces and finds them by front face', () => {
    const index = build([
      printing({
        name: 'Fable of the Mirror-Breaker // Reflection of Kiki-Jiki',
        layout: 'transform',
        mana_cost: undefined,
        oracle_text: undefined,
        colors: undefined,
        type_line: 'Enchantment — Saga // Enchantment Creature — Goblin Shaman',
        color_identity: ['R'],
        card_faces: [
          { name: 'Fable of the Mirror-Breaker', mana_cost: '{2}{R}', oracle_text: 'Chapter text', colors: ['R'] },
          { name: 'Reflection of Kiki-Jiki', mana_cost: '', oracle_text: 'Copy text', colors: ['R'] },
        ],
      }),
    ]);
    const card = index.byName('Fable of the Mirror-Breaker')!;
    expect(card.manaCost).toBe('{2}{R}');
    expect(card.colors).toEqual(['R']);
    expect(card.oracleText).toContain('Chapter text');
    expect(card.oracleText).toContain('Copy text');
    expect(index.byName('Reflection of Kiki-Jiki')).toBe(card);
    expect(index.byName('fable of the mirror-breaker // reflection of kiki-jiki')).toBe(card);
  });

  it('takes the oracle id of a reversible card from its faces', () => {
    const index = build([
      printing({
        name: 'Zndrsplt // Zndrsplt',
        oracle_id: undefined,
        layout: 'reversible_card',
        card_faces: [{ oracle_id: 'rev-1', name: 'Zndrsplt' }, { oracle_id: 'rev-1', name: 'Zndrsplt' }],
      }),
    ]);
    expect(index.get('rev-1')?.name).toBe('Zndrsplt // Zndrsplt');
  });

  it('treats Through the Omenpaths as an Arena set and resolves its Arena names', () => {
    const index = build([
      printing({ name: 'Iron Spider, Stark Upgrade', set: 'spm', rarity: 'rare', games: ['paper'] }),
      printing({
        name: 'Iron Spider, Stark Upgrade', set: 'om1', rarity: 'rare', games: ['mtgo'],
        printed_name: 'Fizik, Etherium Mechanic',
      }),
    ]);
    const card = index.byName('Fizik, Etherium Mechanic')!;
    expect(card.name).toBe('Iron Spider, Stark Upgrade');
    expect(card.onArena).toBe(true);
    expect(card.arenaName).toBe('Fizik, Etherium Mechanic');
  });

  it('uses the front face as the Arena name of a double-faced card, but both halves of a split card', () => {
    const index = build([
      printing({ name: 'Bonecrusher Giant // Stomp', layout: 'adventure', games: ['arena'] }),
      printing({ name: 'Fire // Ice', layout: 'split', games: ['arena'] }),
      printing({ name: 'Delver of Secrets // Insectile Aberration', layout: 'transform', games: ['paper'] }),
    ]);
    expect(index.byName('Bonecrusher Giant')?.arenaName).toBe('Bonecrusher Giant');
    expect(index.byName('Fire // Ice')?.arenaName).toBeUndefined();
    expect(index.byName('Delver of Secrets')?.arenaName).toBeUndefined();
  });

  it('never lets a flavour name shadow a real card of that name', () => {
    const index = build([
      printing({ name: 'Zeta', flavor_name: 'Alpha' }),
      printing({ name: 'Alpha' }),
    ]);
    expect(index.byName('Alpha')?.name).toBe('Alpha');
  });

  it('keeps the cheapest real paper price', () => {
    const card = build([
      printing({ name: 'Sol Ring', prices: { usd: '3.50' } }),
      printing({ name: 'Sol Ring', prices: { usd: '1.25' } }),
      printing({ name: 'Sol Ring', prices: { usd: '0.10' }, oversized: true }),
      printing({ name: 'Sol Ring', prices: { usd: null } }),
    ]).byName('Sol Ring')!;
    expect(card.usd).toBe(1.25);
  });

  it('flags basic lands and game changers', () => {
    const index = build([
      printing({ name: 'Island', type_line: 'Basic Land — Island' }),
      printing({ name: 'Rhystic Study', game_changer: true }),
    ]);
    expect(index.byName('Island')?.isBasicLand).toBe(true);
    expect(index.byName('Rhystic Study')?.gameChanger).toBe(true);
    expect(index.byName('Rhystic Study')?.isBasicLand).toBe(false);
  });
});

describe('tags', () => {
  const cards = [printing({ name: 'Shock' }), printing({ name: 'Murder' }), printing({ name: 'Opt' })];
  const tags: ScryfallTag[] = [
    { id: 't-removal', slug: 'removal', taggings: [] },
    { id: 't-burn', slug: 'burn', parent_ids: ['t-removal'], taggings: [{ oracle_id: 'oracle-Shock' }] },
    { id: 't-kill', slug: 'creature-kill', parent_ids: ['t-removal'], taggings: [{ oracle_id: 'oracle-Murder' }] },
    { id: 't-solo', slug: 'only-one-card', taggings: [{ oracle_id: 'oracle-Opt' }] },
    { id: 't-ghost', slug: 'unknown-card', taggings: [{ oracle_id: 'no-such-card' }, { oracle_id: 'nor-this' }] },
  ];

  it('gives a card its ancestor tags', () => {
    const index = build(cards, tags);
    expect(index.byName('Shock')?.tags).toEqual(['removal']);
    expect(index.byName('Murder')?.tags).toEqual(['removal']);
  });

  it('drops tags that only one indexed card carries', () => {
    const index = build(cards, tags);
    expect(index.byName('Opt')?.tags).toEqual([]);
    expect(index.tagCount('burn')).toBe(0);
    expect(index.tagCount('removal')).toBe(2);
  });

  it('weights rare tags above common ones', () => {
    const index = build(
      [...cards, printing({ name: 'Bolt' })],
      [
        { id: 'a', slug: 'common-tag', taggings: ['Shock', 'Murder', 'Opt', 'Bolt'].map(n => ({ oracle_id: `oracle-${n}` })) },
        { id: 'b', slug: 'rare-tag', taggings: ['Shock', 'Bolt'].map(n => ({ oracle_id: `oracle-${n}` })) },
      ],
    );
    expect(index.tagWeight('rare-tag')).toBeGreaterThan(index.tagWeight('common-tag'));
    expect(index.tagWeight('missing')).toBe(0);
  });

  it('survives a cycle in the tag hierarchy', () => {
    const index = build(cards, [
      { id: 'x', slug: 'x', parent_ids: ['y'], taggings: [{ oracle_id: 'oracle-Shock' }, { oracle_id: 'oracle-Murder' }] },
      { id: 'y', slug: 'y', parent_ids: ['x'], taggings: [] },
    ]);
    expect(index.byName('Shock')?.tags.sort()).toEqual(['x', 'y']);
  });

  it('hides tags disabled at load time, by slug or id', () => {
    expect(build(cards, tags, ['removal']).byName('Shock')?.tags).toEqual([]);
    expect(build(cards, tags, ['t-removal']).byName('Shock')?.tags).toEqual([]);
  });
});

describe('trivia tags', () => {
  const cards = [printing({ name: 'Steam Vents' }), printing({ name: 'Blood Crypt' }), printing({ name: 'Opt' })];
  const both = [{ oracle_id: 'oracle-Steam Vents' }, { oracle_id: 'oracle-Blood Crypt' }];
  const tags: ScryfallTag[] = [
    { id: 'cycle', slug: 'cycle', taggings: [] },
    { id: 'dual', slug: 'dual-land', taggings: [] },
    { id: 'names', slug: 'card-names', taggings: [] },
    { id: 'blue', slug: 'blue-effect', taggings: both },
    { id: 'allit', slug: 'alliteration', parent_ids: ['names'], taggings: both },
    { id: 'shock', slug: 'shockland', parent_ids: ['dual', 'cycle'], taggings: [] },
    { id: 'cyc-rav', slug: 'cycle-rav-shockland', parent_ids: ['shock'], taggings: both },
    { id: 'counter', slug: 'counterspell', parent_ids: ['blue'], taggings: both },
    { id: 'uniq', slug: 'unique-mana-cost', taggings: both },
  ];

  it('drops naming, cycle and colour-pie trivia but keeps what the card does', () => {
    const index = build(cards, tags);
    expect(index.byName('Steam Vents')?.tags.sort()).toEqual(['counterspell', 'dual-land', 'shockland']);
  });

  it('passes a trivia tag\'s cards up to its functional ancestors', () => {
    // Only the cycle tag is applied directly; shockland and dual-land arrive through it.
    const index = build(cards, tags.filter(t => ['cycle', 'dual', 'shock', 'cyc-rav'].includes(t.id)));
    expect(index.byName('Blood Crypt')?.tags.sort()).toEqual(['dual-land', 'shockland']);
  });

  it('lets a killed tag contribute nothing, ancestors included', () => {
    const builder = new CardIndexBuilder();
    for (const p of cards) builder.addPrinting(p);
    for (const t of tags) builder.addTag(t);
    const index = new CardIndex(builder.build({ disabledTagIds: ['cyc-rav'] }));
    expect(index.byName('Blood Crypt')?.tags.sort()).toEqual(['counterspell']);
  });

  it('reports configured noise slugs the tag data lacks, and can keep everything', () => {
    const builder = new CardIndexBuilder();
    for (const p of cards) builder.addPrinting(p);
    for (const t of tags) builder.addTag(t);
    expect(builder.buildWithReport().unknownNoiseSlugs).toContain('draft-signpost');
    expect(builder.buildWithReport().unknownNoiseSlugs).not.toContain('cycle');

    const raw = new CardIndex(builder.build({ keepNoiseTags: true }));
    expect(raw.byName('Steam Vents')?.tags).toContain('alliteration');
  });
});

describe('CardIndex', () => {
  it('rejects an index file from another version', () => {
    const file = { ...new CardIndexBuilder().build(), version: 2 };
    expect(() => new CardIndex(file as never)).toThrow(/Unsupported card index version/);
  });
});
