import { describe, it, expect } from 'vitest';
import { parseArchetypeRule, parseColorTable, parseFallbackRule } from './archetype-rules';
import type { ConditionType, FormatRules } from './archetype-rules';
import { classifyDeck, colorGroupName, deckColors, formatArchetypeName, otherClassification } from './classify';
import type { DeckCardLine } from './types';

type Board = Record<string, number>;

const lines = (board: Board): DeckCardLine[] => Object.entries(board).map(([name, count]) => ({ name, count }));
const deck = (main: Board, side: Board = {}) => ({ main: lines(main), side: lines(side) });

const colors = parseColorTable({
  Lands: [
    { Name: 'Plains', Color: 'W' },
    { Name: 'Island', Color: 'U' },
    { Name: 'Swamp', Color: 'B' },
    { Name: 'Mountain', Color: 'R' },
    { Name: 'Forest', Color: 'G' },
    { Name: 'Steam Grotto', Color: 'UR' },
    { Name: 'Prism Citadel', Color: 'WUBRG' },
  ],
  NonLands: [
    { Name: 'Sun Cleric', Color: 'W' },
    { Name: 'Tide Scholar', Color: 'U' },
    { Name: 'Grave Rat', Color: 'B' },
    { Name: 'Ember Whelp', Color: 'R' },
    { Name: 'Moss Bear', Color: 'G' },
    { Name: 'Storm Drake', Color: 'UR' },
    { Name: 'Lórien Sentry', Color: 'G' },
  ],
});

function rules(archetypes: unknown[], fallbacks: unknown[] = []): FormatRules {
  return {
    archetypes: archetypes.map(parseArchetypeRule),
    fallbacks: fallbacks.map(parseFallbackRule),
    colors,
    warnings: [],
  };
}

const RED_DECK = { Mountain: 20, 'Ember Whelp': 4, 'Cinder Bolt': 4, 'Ash Hound': 4 };

describe('deckColors', () => {
  it('needs both a land and a spell of a colour', () => {
    expect(deckColors(deck({ Mountain: 10, Island: 10, 'Ember Whelp': 4, 'Tide Scholar': 4 }), colors)).toEqual(['U', 'R']);
  });

  it('does not let lands decide the colours', () => {
    expect(deckColors(deck({ 'Steam Grotto': 4, 'Prism Citadel': 4, Mountain: 12, 'Ember Whelp': 4 }), colors)).toEqual(['R']);
  });

  it('does not count a splashed spell the mana base cannot cast', () => {
    expect(deckColors(deck({ Mountain: 20, 'Ember Whelp': 4, 'Moss Bear': 1 }), colors)).toEqual(['R']);
  });

  it('counts the sideboard too', () => {
    expect(deckColors(deck({ Mountain: 16, Island: 4, 'Ember Whelp': 4 }, { 'Tide Scholar': 2 }), colors)).toEqual(['U', 'R']);
  });

  it('is empty for a deck of unknown or colourless cards', () => {
    expect(deckColors(deck({ 'Dust Bowl Diner': 20, 'Scrap Golem': 4 }), colors)).toEqual([]);
  });

  it('finds cards whatever the accents, case or appended back face', () => {
    expect(deckColors(deck({ Forest: 20, 'lorien sentry // Sentry Awakened': 4 }), colors)).toEqual(['G']);
  });
});

describe('colorGroupName', () => {
  it('names one colour', () => {
    expect(colorGroupName(['R'])).toBe('Mono-Red');
    expect(colorGroupName(['W'])).toBe('Mono-White');
  });

  it('names every guild', () => {
    const guilds: Record<string, string> = {
      WU: 'Azorius', WB: 'Orzhov', WR: 'Boros', WG: 'Selesnya', UB: 'Dimir',
      UR: 'Izzet', UG: 'Simic', BR: 'Rakdos', BG: 'Golgari', RG: 'Gruul',
    };
    for (const [letters, name] of Object.entries(guilds)) expect(colorGroupName([...letters])).toBe(name);
  });

  it('names every shard and wedge', () => {
    const trios: Record<string, string> = {
      WUB: 'Esper', WUR: 'Jeskai', WUG: 'Bant', WBR: 'Mardu', WBG: 'Abzan',
      WRG: 'Naya', UBR: 'Grixis', UBG: 'Sultai', URG: 'Temur', BRG: 'Jund',
    };
    for (const [letters, name] of Object.entries(trios)) expect(colorGroupName([...letters])).toBe(name);
  });

  it('names four, five and no colours', () => {
    expect(colorGroupName([...'WUBR'])).toBe('Four-Color');
    expect(colorGroupName([...'WUBRG'])).toBe('Five-Color');
    expect(colorGroupName([])).toBe('Colorless');
  });

  it('does not depend on the order of the letters', () => {
    expect(colorGroupName(['R', 'U'])).toBe('Izzet');
  });
});

describe('formatArchetypeName', () => {
  it('splits PascalCase and drops the Generic marker', () => {
    expect(formatArchetypeName('NeoformCombo', false, ['U', 'G'])).toBe('Neoform Combo');
    expect(formatArchetypeName('GenericControl', false, [])).toBe('Control');
    expect(formatArchetypeName('BTLValki', false, [])).toBe('BTL Valki');
    expect(formatArchetypeName('8Whack', false, [])).toBe('8 Whack');
  });

  it('leaves punctuation in authored names alone', () => {
    expect(formatArchetypeName("Death's Shadow", false, [])).toBe("Death's Shadow");
    expect(formatArchetypeName('Omni-Tell', false, [])).toBe('Omni-Tell');
  });

  it('capitalises words so differently cased rule files agree', () => {
    expect(formatArchetypeName('Gruul aggro', false, [])).toBe('Gruul Aggro');
  });

  it('prefixes the colours when the rule asks for them', () => {
    expect(formatArchetypeName('Prowess', true, ['U', 'R'])).toBe('Izzet Prowess');
    expect(formatArchetypeName('Aggro', true, ['R'])).toBe('Mono-Red Aggro');
    expect(formatArchetypeName('Prowess', false, ['U', 'R'])).toBe('Prowess');
  });

  it('writes a hard-coded mono colour the way the prefix does', () => {
    expect(formatArchetypeName('Mono Red Aggro', false, ['R'])).toBe('Mono-Red Aggro');
    expect(formatArchetypeName('MonoGreenDevotion', false, ['G'])).toBe('Mono-Green Devotion');
  });

  it('does not repeat a colour group the rule name already starts with', () => {
    expect(formatArchetypeName('Temur Battlecrier', true, ['U', 'R', 'G'])).toBe('Temur Battlecrier');
    expect(formatArchetypeName('Mono Red Aggro', true, ['R'])).toBe('Mono-Red Aggro');
    expect(formatArchetypeName('Temur Battlecrier', true, ['U', 'R'])).toBe('Izzet Temur Battlecrier');
  });

  it('adds no prefix to a colourless deck', () => {
    expect(formatArchetypeName('Artifacts', true, [])).toBe('Artifacts');
  });
});

describe('classifyDeck conditions', () => {
  const MAIN_A = { 'Card A': 4, Filler: 56 };
  const cases: Array<[ConditionType, string[], Board, Board, boolean]> = [
    ['InMainboard', ['Card A'], MAIN_A, {}, true],
    ['InMainboard', ['Card A'], { Filler: 60 }, { 'Card A': 2 }, false],
    ['InSideboard', ['Card A'], { Filler: 60 }, { 'Card A': 2 }, true],
    ['InSideboard', ['Card A'], MAIN_A, {}, false],
    ['InMainOrSideboard', ['Card A'], MAIN_A, {}, true],
    ['InMainOrSideboard', ['Card A'], { Filler: 60 }, { 'Card A': 1 }, true],
    ['InMainOrSideboard', ['Card A'], { Filler: 60 }, {}, false],
    ['OneOrMoreInMainboard', ['Card A', 'Card B'], { 'Card B': 1, Filler: 59 }, {}, true],
    ['OneOrMoreInMainboard', ['Card A', 'Card B'], { Filler: 60 }, { 'Card B': 1 }, false],
    ['OneOrMoreInSideboard', ['Card A', 'Card B'], { Filler: 60 }, { 'Card B': 1 }, true],
    ['OneOrMoreInSideboard', ['Card A', 'Card B'], { 'Card B': 1, Filler: 59 }, {}, false],
    ['OneOrMoreInMainOrSideboard', ['Card A', 'Card B'], { Filler: 60 }, { 'Card B': 1 }, true],
    ['OneOrMoreInMainOrSideboard', ['Card A', 'Card B'], { Filler: 60 }, {}, false],
    ['TwoOrMoreInMainboard', ['Card A', 'Card B', 'Card C'], { 'Card A': 1, 'Card C': 1, Filler: 58 }, {}, true],
    ['TwoOrMoreInMainboard', ['Card A', 'Card B', 'Card C'], { 'Card A': 4, Filler: 56 }, { 'Card B': 1 }, false],
    ['TwoOrMoreInSideboard', ['Card A', 'Card B', 'Card C'], { Filler: 60 }, { 'Card A': 1, 'Card B': 1 }, true],
    ['TwoOrMoreInSideboard', ['Card A', 'Card B', 'Card C'], { 'Card A': 1, Filler: 59 }, { 'Card B': 1 }, false],
    ['TwoOrMoreInMainOrSideboard', ['Card A', 'Card B', 'Card C'], { 'Card A': 1, Filler: 59 }, { 'Card B': 1 }, true],
    ['TwoOrMoreInMainOrSideboard', ['Card A', 'Card B', 'Card C'], { 'Card A': 4, Filler: 56 }, {}, false],
    ['DoesNotContain', ['Card A'], { Filler: 60 }, {}, true],
    ['DoesNotContain', ['Card A'], MAIN_A, {}, false],
    ['DoesNotContain', ['Card A'], { Filler: 60 }, { 'Card A': 1 }, false],
    ['DoesNotContainMainboard', ['Card A'], { Filler: 60 }, { 'Card A': 1 }, true],
    ['DoesNotContainMainboard', ['Card A'], MAIN_A, {}, false],
    ['DoesNotContainSideboard', ['Card A'], MAIN_A, {}, true],
    ['DoesNotContainSideboard', ['Card A'], { Filler: 60 }, { 'Card A': 1 }, false],
  ];

  it.each(cases)('%s %j with main %j side %j → %s', (type, cards, main, side, expected) => {
    const set = rules([{ Name: 'Target', Conditions: [{ Type: type, Cards: cards }] }]);
    expect(classifyDeck(deck(main, side), set).kind === 'archetype').toBe(expected);
  });

  it('requires every condition of a rule', () => {
    const set = rules([
      {
        Name: 'Whelps',
        Conditions: [
          { Type: 'InMainboard', Cards: ['Ember Whelp'] },
          { Type: 'DoesNotContain', Cards: ['Tide Scholar'] },
        ],
      },
    ]);
    expect(classifyDeck(deck(RED_DECK), set).name).toBe('Whelps');
    expect(classifyDeck(deck(RED_DECK, { 'Tide Scholar': 1 }), set).kind).toBe('other');
  });

  it('counts copies of one card once for TwoOrMore', () => {
    const set = rules([{ Name: 'Pair', Conditions: [{ Type: 'TwoOrMoreInMainboard', Cards: ['Ember Whelp', 'Ash Hound'] }] }]);
    expect(classifyDeck(deck({ Mountain: 20, 'Ember Whelp': 4 }), set).kind).toBe('other');
    expect(classifyDeck(deck({ Mountain: 20, 'Ember Whelp': 1, 'Ash Hound': 1 }), set).kind).toBe('archetype');
  });

  it('reads only the first card of a single-card condition, as the reference parser does', () => {
    const set = rules([{ Name: 'Whelps', Conditions: [{ Type: 'InMainboard', Cards: ['Ember Whelp', 'Not In Deck'] }] }]);
    expect(classifyDeck(deck(RED_DECK), set).name).toBe('Whelps');
    const avoid = rules([{ Name: 'Avoid', Conditions: [{ Type: 'DoesNotContain', Cards: ['Not In Deck', 'Ember Whelp'] }] }]);
    expect(classifyDeck(deck(RED_DECK), avoid).name).toBe('Avoid');
  });

  it('skips a condition without cards', () => {
    const set = rules([
      {
        Name: 'Whelps',
        Conditions: [
          { Type: 'InMainboard', Cards: [] },
          { Type: 'InMainboard', Cards: ['Ember Whelp'] },
        ],
      },
    ]);
    expect(classifyDeck(deck(RED_DECK), set).name).toBe('Whelps');
  });

  it('matches names across case, accents and appended back faces', () => {
    const set = rules([
      {
        Name: 'Sentries',
        Conditions: [
          { Type: 'InMainboard', Cards: ['lorien sentry'] },
          { Type: 'InMainboard', Cards: ['Tide Scholar // Deep Study'] },
          { Type: 'InMainboard', Cards: ['Annex'] },
        ],
      },
    ]);
    const list = deck({ Forest: 20, 'Lórien Sentry': 4, 'Tide Scholar': 4, 'Annex // Chamber': 2 });
    expect(classifyDeck(list, set).name).toBe('Sentries');
  });
});

describe('classifyDeck naming and colours', () => {
  it('returns id, display name, colours and kind', () => {
    const set = rules([{ Name: 'Whelps', IncludeColorInName: true, Conditions: [{ Type: 'InMainboard', Cards: ['Ember Whelp'] }] }]);
    expect(classifyDeck(deck(RED_DECK), set)).toEqual({
      id: 'mono-red-whelps',
      name: 'Mono-Red Whelps',
      colors: ['R'],
      kind: 'archetype',
    });
  });

  it('uses the name of a matching variant', () => {
    const set = rules([
      {
        Name: 'Whelps',
        IncludeColorInName: true,
        Conditions: [{ Type: 'InMainboard', Cards: ['Ember Whelp'] }],
        Variants: [
          { Name: 'HoundWhelps', IncludeColorInName: false, Conditions: [{ Type: 'InMainboard', Cards: ['Ash Hound'] }] },
        ],
      },
    ]);
    expect(classifyDeck(deck(RED_DECK), set).name).toBe('Hound Whelps');
    expect(classifyDeck(deck({ Mountain: 20, 'Ember Whelp': 4 }), set).name).toBe('Mono-Red Whelps');
  });

  it('never matches a variant when its archetype does not match', () => {
    const set = rules([
      {
        Name: 'Scholars',
        Conditions: [{ Type: 'InMainboard', Cards: ['Tide Scholar'] }],
        Variants: [{ Name: 'HoundScholars', Conditions: [{ Type: 'InMainboard', Cards: ['Ash Hound'] }] }],
      },
    ]);
    expect(classifyDeck(deck(RED_DECK), set).kind).toBe('other');
  });
});

describe('classifyDeck conflicts', () => {
  const simple = { Name: 'Simple', Conditions: [{ Type: 'InMainboard', Cards: ['Ember Whelp'] }] };
  const detailed = {
    Name: 'Detailed',
    Conditions: [
      { Type: 'InMainboard', Cards: ['Ember Whelp'] },
      { Type: 'InMainboard', Cards: ['Ash Hound'] },
    ],
  };

  it('prefers the rule with fewer conditions', () => {
    expect(classifyDeck(deck(RED_DECK), rules([detailed, simple])).name).toBe('Simple');
    expect(classifyDeck(deck(RED_DECK), rules([simple, detailed])).name).toBe('Simple');
  });

  it('counts the conditions of a matched variant as well', () => {
    const withVariant = {
      Name: 'Base',
      Conditions: [{ Type: 'InMainboard', Cards: ['Ember Whelp'] }],
      Variants: [{ Name: 'Variant', Conditions: [{ Type: 'InMainboard', Cards: ['Ash Hound'] }, { Type: 'InMainboard', Cards: ['Mountain'] }] }],
    };
    expect(classifyDeck(deck(RED_DECK), rules([withVariant, detailed])).name).toBe('Detailed');
  });

  it('takes the first rule in file order when two are equally simple', () => {
    const twin = { Name: 'Twin', Conditions: [{ Type: 'InMainboard', Cards: ['Ash Hound'] }] };
    expect(classifyDeck(deck(RED_DECK), rules([twin, simple])).name).toBe('Twin');
    expect(classifyDeck(deck(RED_DECK), rules([simple, twin])).name).toBe('Simple');
  });
});

describe('classifyDeck fallbacks', () => {
  const aggro = { Name: 'Aggro', IncludeColorInName: true, CommonCards: ['Ember Whelp', 'Ash Hound', 'Cinder Bolt'] };
  const control = { Name: 'GenericControl', IncludeColorInName: true, CommonCards: ['Tide Scholar', 'Deep Study'] };

  it('is used only when no archetype matches', () => {
    const whelps = { Name: 'Whelps', Conditions: [{ Type: 'InMainboard', Cards: ['Ember Whelp'] }] };
    expect(classifyDeck(deck(RED_DECK), rules([whelps], [aggro]))).toMatchObject({ name: 'Whelps', kind: 'archetype' });
    expect(classifyDeck(deck(RED_DECK), rules([], [aggro]))).toMatchObject({ name: 'Mono-Red Aggro', kind: 'fallback' });
  });

  it('picks the fallback sharing the most copies', () => {
    const list = deck({ Mountain: 10, Island: 10, 'Ember Whelp': 2, 'Tide Scholar': 4, 'Deep Study': 4 });
    expect(classifyDeck(list, rules([], [aggro, control])).name).toBe('Izzet Control');
  });

  it('breaks an overlap tie towards the fallback with fewer common cards', () => {
    const list = deck({ Mountain: 10, Island: 10, 'Ember Whelp': 4, 'Tide Scholar': 4 });
    expect(classifyDeck(list, rules([], [aggro, control])).name).toBe('Izzet Control');
    expect(classifyDeck(list, rules([], [control, aggro])).name).toBe('Izzet Control');
  });

  it('needs the shared copies to exceed a tenth of the number of distinct cards', () => {
    const tenLines: Board = { Mountain: 20, A: 4, B: 4, C: 4, D: 4, E: 4, F: 4, G: 4, H: 4, 'Ember Whelp': 1 };
    expect(classifyDeck(deck(tenLines), rules([], [aggro])).kind).toBe('other');
    expect(classifyDeck(deck({ ...tenLines, 'Ember Whelp': 2 }), rules([], [aggro])).kind).toBe('fallback');
  });

  it('counts sideboard cards towards the overlap', () => {
    const list = deck({ Island: 20, 'Tide Scholar': 4 }, { 'Ember Whelp': 3, 'Ash Hound': 3 });
    expect(classifyDeck(list, rules([], [aggro, control])).name).toBe('Mono-Blue Aggro');
  });
});

describe('unmatched lists', () => {
  it('go to the Other bucket of their colours', () => {
    const empty = rules([]);
    expect(classifyDeck(deck({ Mountain: 10, Island: 10, 'Ember Whelp': 4, 'Tide Scholar': 4 }), empty)).toEqual({
      id: 'izzet-other',
      name: 'Izzet Other',
      colors: ['U', 'R'],
      kind: 'other',
    });
    expect(classifyDeck(deck(RED_DECK), empty).name).toBe('Mono-Red Other');
    expect(classifyDeck(deck({ 'Dust Bowl Diner': 20, 'Scrap Golem': 40 }), empty).name).toBe('Colorless Other');
  });

  it('names the five-colour bucket', () => {
    expect(otherClassification([...'WUBRG'])).toEqual({
      id: 'five-color-other',
      name: 'Five-Color Other',
      colors: ['W', 'U', 'B', 'R', 'G'],
      kind: 'other',
    });
  });
});
