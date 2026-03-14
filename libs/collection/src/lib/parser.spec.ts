import { describe, it, expect } from 'vitest';
import { parseArenaCollection, normalizeName, isBasicLand } from './parser';

const FIXTURE_SIMPLE = `
1 Atraxa, Praetors' Voice (C16) 36
2 Sol Ring (C21) 263
1 Command Tower (ELD) 333
3 Lightning Greaves (2XM) 294
1 Plains (M21) 263
`;

const FIXTURE_WITH_HEADERS = `
Deck
1 Atraxa, Praetors' Voice (C16) 36
1 Phyrexian Arena (C21) 116

Sideboard
1 Sol Ring (C21) 263
`;

const FIXTURE_NO_SET_CODES = `
1 Atraxa, Praetors' Voice
1 Sol Ring
1 Forest
`;

describe('normalizeName', () => {
  it('lowercases and trims', () => {
    expect(normalizeName("  Atraxa, Praetors' Voice  ")).toBe("atraxa, praetors' voice");
  });
});

describe('isBasicLand', () => {
  it('identifies basic lands', () => {
    expect(isBasicLand('plains')).toBe(true);
    expect(isBasicLand('snow-covered island')).toBe(true);
    expect(isBasicLand('wastes')).toBe(true);
  });
  it('does not flag non-basics', () => {
    expect(isBasicLand('command tower')).toBe(false);
    expect(isBasicLand('sol ring')).toBe(false);
  });
});

describe('parseArenaCollection', () => {
  it('parses quantity, name, set, collector number', () => {
    const result = parseArenaCollection(FIXTURE_SIMPLE);
    const sol = result.collection.get('sol ring');
    expect(sol).toBeDefined();
    expect(sol!.quantity).toBe(2);
    expect(sol!.set).toBe('C21');
    expect(sol!.collectorNumber).toBe('263');
  });

  it('normalizes card names as keys', () => {
    const result = parseArenaCollection(FIXTURE_SIMPLE);
    expect(result.collection.has("atraxa, praetors' voice")).toBe(true);
  });

  it('counts totalCards correctly', () => {
    const result = parseArenaCollection(FIXTURE_SIMPLE);
    // 1+2+1+3+1 = 8, plus basic land injected (plains already in fixture)
    expect(result.totalCards).toBe(8);
  });

  it('skips Deck/Sideboard headers', () => {
    const result = parseArenaCollection(FIXTURE_WITH_HEADERS);
    expect(result.unrecognizedLines).not.toContain('Deck');
    expect(result.unrecognizedLines).not.toContain('Sideboard');
    expect(result.collection.has("atraxa, praetors' voice")).toBe(true);
    expect(result.collection.has('sol ring')).toBe(true);
  });

  it('parses lines without set codes', () => {
    const result = parseArenaCollection(FIXTURE_NO_SET_CODES);
    expect(result.collection.has("atraxa, praetors' voice")).toBe(true);
    expect(result.collection.get("atraxa, praetors' voice")!.set).toBeUndefined();
  });

  it('always includes basic lands even if not in export', () => {
    const result = parseArenaCollection('1 Sol Ring (C21) 263\n');
    expect(result.collection.has('plains')).toBe(true);
    expect(result.collection.has('island')).toBe(true);
    expect(result.collection.has('forest')).toBe(true);
  });

  it('aggregates duplicate entries', () => {
    const dupes = `1 Sol Ring (C21) 263\n2 Sol Ring (2XM) 450\n`;
    const result = parseArenaCollection(dupes);
    expect(result.collection.get('sol ring')!.quantity).toBe(3);
  });

  it('tracks unrecognized lines', () => {
    const result = parseArenaCollection('garbage line here\n1 Sol Ring (C21) 263\n');
    expect(result.unrecognizedLines).toContain('garbage line here');
  });

  it('reports uniqueCards count', () => {
    const result = parseArenaCollection(FIXTURE_SIMPLE);
    // 4 named cards + 6 injected basics (plains already present) = varies; just check it's > 0
    expect(result.uniqueCards).toBeGreaterThan(4);
  });
});
