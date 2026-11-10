import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, it, expect } from 'vitest';
import {
  loadFormatRules,
  parseArchetypeRule,
  parseColorTable,
  parseFallbackRule,
  parseLenientJson,
} from './archetype-rules';

describe('parseLenientJson', () => {
  it('accepts trailing commas, comments and a byte-order mark', () => {
    const text = String.fromCharCode(0xfeff) + '{ // header\n "Cards": ["Ember Whelp", "Tide Scholar",], /* note */ "Name": "Whelps", }';
    expect(parseLenientJson(text)).toEqual({ Cards: ['Ember Whelp', 'Tide Scholar'], Name: 'Whelps' });
  });

  it('leaves slashes and commas inside strings alone', () => {
    const text = '{ "Cards": ["Wax // Wane", "Sly, the \\"Fox\\" ,]"] }';
    expect(parseLenientJson(text)).toEqual({ Cards: ['Wax // Wane', 'Sly, the "Fox" ,]'] });
  });

  it('still rejects text that is not JSON', () => {
    expect(() => parseLenientJson('{ "Name": }')).toThrow();
  });
});

describe('parseArchetypeRule', () => {
  it('reads name, colour flag, conditions and variants', () => {
    const rule = parseArchetypeRule({
      Name: 'Whelps',
      IncludeColorInName: true,
      Conditions: [{ Type: 'InMainboard', Cards: ['Ember Whelp'] }],
      Variants: [
        { Name: 'StormWhelps', IncludeColorInName: false, Conditions: [{ Type: 'InSideboard', Cards: ['Storm Drake'] }] },
      ],
    });
    expect(rule.name).toBe('Whelps');
    expect(rule.includeColorInName).toBe(true);
    expect(rule.conditions).toHaveLength(1);
    expect(rule.conditions[0]?.type).toBe('InMainboard');
    expect(rule.conditions[0]?.cards).toEqual(['Ember Whelp']);
    expect(rule.variants.map((v) => v.name)).toEqual(['StormWhelps']);
    expect(rule.variants[0]?.includeColorInName).toBe(false);
  });

  it('matches condition types and property names without regard to case', () => {
    const rule = parseArchetypeRule({
      name: 'Whelps',
      conditions: [{ type: 'OneorMoreInMainboard', cards: ['Ember Whelp', 'Tide Scholar'] }],
    });
    expect(rule.conditions[0]?.type).toBe('OneOrMoreInMainboard');
    expect(rule.includeColorInName).toBe(false);
  });

  it('tests only the first card of a single-card condition', () => {
    const rule = parseArchetypeRule({
      Name: 'Whelps',
      Conditions: [
        { Type: 'InMainboard', Cards: ['Ember Whelp', 'Tide Scholar'] },
        { Type: 'OneOrMoreInMainboard', Cards: ['Ember Whelp', 'Tide Scholar'] },
      ],
    });
    expect([...rule.conditions[0]!.keys]).toEqual(['ember whelp']);
    expect([...rule.conditions[1]!.keys].sort()).toEqual(['ember whelp', 'tide scholar']);
  });

  it('indexes a two-faced card under its front face as well', () => {
    const rule = parseArchetypeRule({
      Name: 'Scholars',
      Conditions: [{ Type: 'InMainboard', Cards: ['Tide Scholar // Deep Study'] }],
    });
    expect([...rule.conditions[0]!.keys].sort()).toEqual(['tide scholar', 'tide scholar // deep study']);
  });

  it('rejects an unknown condition type', () => {
    expect(() =>
      parseArchetypeRule({ Name: 'Whelps', Conditions: [{ Type: 'ThreeOrMoreInMainboard', Cards: ['Ember Whelp'] }] }),
    ).toThrow(/ThreeOrMoreInMainboard/);
  });

  it('rejects an archetype without conditions or without a name', () => {
    expect(() => parseArchetypeRule({ Name: 'Whelps', Conditions: [] })).toThrow(/no conditions/);
    expect(() => parseArchetypeRule({ Conditions: [{ Type: 'InMainboard', Cards: ['Ember Whelp'] }] })).toThrow(/name/i);
  });
});

describe('parseFallbackRule', () => {
  it('reads the common cards', () => {
    const rule = parseFallbackRule({ Name: 'Control', IncludeColorInName: true, CommonCards: ['Tide Scholar', 'Deep Study'] });
    expect(rule.name).toBe('Control');
    expect(rule.includeColorInName).toBe(true);
    expect(rule.commonCards).toEqual(['Tide Scholar', 'Deep Study']);
    expect(rule.keys.has('deep study')).toBe(true);
  });

  it('rejects a fallback without common cards', () => {
    expect(() => parseFallbackRule({ Name: 'Control', CommonCards: [] })).toThrow(/no common cards/);
  });
});

describe('parseColorTable', () => {
  it('lets later files override earlier ones and tolerates null sections', () => {
    const table = parseColorTable(
      {
        Lands: [{ Name: 'Prism Citadel', Color: 'C' }, { Name: 'Mountain', Color: 'R' }],
        NonLands: [{ Name: 'Storm Drake', Color: 'UR' }],
      },
      { Lands: [{ Name: 'Prism Citadel', Color: 'WUBRG' }], NonLands: null },
    );
    expect(table.lands.get('prism citadel')).toBe('WUBRG');
    expect(table.lands.get('mountain')).toBe('R');
    expect(table.nonLands.get('storm drake')).toBe('UR');
  });

  it('treats C as colourless and writes colours in WUBRG order', () => {
    const table = parseColorTable({
      Lands: [{ Name: 'Dust Bowl Diner', Color: 'C' }],
      NonLands: [{ Name: 'Odd Drake', Color: 'RU' }],
    });
    expect(table.lands.get('dust bowl diner')).toBe('');
    expect(table.nonLands.get('odd drake')).toBe('UR');
  });

  it('finds a two-faced card by its front face unless that name is a card of its own', () => {
    const table = parseColorTable({
      NonLands: [
        { Name: 'Tide Scholar // Deep Study', Color: 'U' },
        { Name: 'Wax // Wane', Color: 'WG' },
        { Name: 'Wax', Color: 'B' },
      ],
    });
    expect(table.nonLands.get('tide scholar')).toBe('U');
    expect(table.nonLands.get('wax')).toBe('B');
  });
});

describe('loadFormatRules', () => {
  const root = mkdtempSync(join(tmpdir(), 'meta-rules-'));
  afterAll(() => rmSync(root, { recursive: true, force: true }));

  const write = (path: string, value: unknown) => {
    const file = join(root, path);
    mkdirSync(join(file, '..'), { recursive: true });
    writeFileSync(file, typeof value === 'string' ? value : JSON.stringify(value));
  };

  write('card_colors.json', {
    Lands: [{ Name: 'Mountain', Color: 'R' }, { Name: 'Prism Citadel', Color: 'C' }],
    NonLands: [{ Name: 'Ember Whelp', Color: 'R' }],
  });
  write('Standard/color_overrides.json', '{ "Lands": [ { "Name": "Prism Citadel", "Color": "WUBRG" }, ], "NonLands": null }');
  write('Standard/Archetypes/Whelps.json', {
    Name: 'Whelps',
    IncludeColorInName: true,
    Conditions: [{ Type: 'InMainboard', Cards: ['Ember Whelp'] }],
  });
  write('Standard/Archetypes/alpha.json', {
    Name: 'Alpha',
    IncludeColorInName: false,
    Conditions: [{ Type: 'InMainboard', Cards: ['Tide Scholar'] }],
  });
  write('Standard/Archetypes/Broken.json', '{ "Name": "Broken", "Conditions": [] }');
  write('Standard/Archetypes/notes.txt', 'not a rule');
  write('Standard/Fallbacks/Control.json', { Name: 'Control', IncludeColorInName: true, CommonCards: ['Tide Scholar'] });
  write('Standard-20200101-20210101/Archetypes/Old.json', {
    Name: 'Old',
    Conditions: [{ Type: 'InMainboard', Cards: ['Ember Whelp'] }],
  });

  it('loads archetypes in file-name order, fallbacks and colours', () => {
    const rules = loadFormatRules(root, 'standard');
    expect(rules.archetypes.map((a) => a.name)).toEqual(['Alpha', 'Whelps']);
    expect(rules.fallbacks.map((f) => f.name)).toEqual(['Control']);
    expect(rules.colors.lands.get('prism citadel')).toBe('WUBRG');
    expect(rules.colors.nonLands.get('ember whelp')).toBe('R');
  });

  it('skips a broken rule file and says so', () => {
    const rules = loadFormatRules(root, 'standard');
    expect(rules.warnings).toHaveLength(1);
    expect(rules.warnings[0]).toMatch(/Broken\.json/);
  });

  it('fails clearly for a format without rules', () => {
    expect(() => loadFormatRules(root, 'pauper')).toThrow(/pauper/i);
  });
});
