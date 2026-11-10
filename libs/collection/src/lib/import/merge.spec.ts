import { describe, it, expect } from 'vitest';
import { mergeImports } from './merge';
import type { CollectionImport, ImportedDeck } from './types';

const deck = (id: string, name: string): ImportedDeck => ({
  id,
  name,
  format: 'Standard',
  mainDeck: [{ arenaId: 100, count: 4 }],
  sideboard: [],
  commandZone: [],
  companions: [],
});

const collection: CollectionImport = {
  format: 'grpid-json',
  entries: [
    { count: 4, arenaId: 73208 },
    { count: 2, arenaId: 96269 },
  ],
  warnings: ['from collection'],
  unrecognizedLines: ['{"foo":1}'],
};

const log: CollectionImport = {
  format: 'player-log',
  entries: [],
  wildcards: { common: 557, uncommon: 801, rare: 104, mythic: 84 },
  gems: 14120,
  gold: 17150,
  vaultProgress: 4.6,
  decks: [deck('d1', 'Mono Red'), deck('d2', 'Azorius')],
  warnings: ['from log'],
  unrecognizedLines: [],
};

describe('mergeImports', () => {
  it('combines a collection file with a Player.log', () => {
    const merged = mergeImports(collection, log);
    expect(merged).toEqual({
      format: 'grpid-json',
      entries: collection.entries,
      wildcards: log.wildcards,
      gems: 14120,
      gold: 17150,
      vaultProgress: 4.6,
      decks: log.decks,
      warnings: ['from collection', 'from log'],
      unrecognizedLines: ['{"foo":1}'],
    });
  });

  it('takes the format of the first import', () => {
    expect(mergeImports(log, collection).format).toBe('player-log');
  });

  it('concatenates entries without summing or de-duplicating them', () => {
    const merged = mergeImports(collection, collection);
    expect(merged.entries).toEqual([...collection.entries, ...collection.entries]);
  });

  it('lets later non-undefined inventory values win and keeps earlier ones otherwise', () => {
    const named: CollectionImport = {
      format: 'named-json',
      entries: [{ count: 1, name: 'Opt' }],
      wildcards: { common: 1, uncommon: 2, rare: 3, mythic: 4 },
      gems: 0,
      warnings: [],
      unrecognizedLines: [],
    };
    const logFirst = mergeImports(log, named);
    expect(logFirst.wildcards).toEqual({ common: 1, uncommon: 2, rare: 3, mythic: 4 });
    expect(logFirst.gems).toBe(0);
    expect(logFirst.gold).toBe(17150);
    expect(logFirst.vaultProgress).toBe(4.6);

    const logLast = mergeImports(named, log, collection);
    expect(logLast.wildcards).toEqual(log.wildcards);
    expect(logLast.gems).toBe(14120);
  });

  it('de-duplicates decks by id, keeping the later copy in the first position', () => {
    const newer: CollectionImport = { ...log, decks: [deck('d2', 'Azorius v2'), deck('d3', 'Golgari')] };
    const merged = mergeImports(log, newer);
    expect(merged.decks?.map((d) => [d.id, d.name])).toEqual([
      ['d1', 'Mono Red'],
      ['d2', 'Azorius v2'],
      ['d3', 'Golgari'],
    ]);
  });

  it('leaves optional fields unset when no import has them', () => {
    const merged = mergeImports(collection, collection);
    expect('wildcards' in merged).toBe(false);
    expect('decks' in merged).toBe(false);
    expect('gems' in merged).toBe(false);
    expect('gold' in merged).toBe(false);
    expect('vaultProgress' in merged).toBe(false);
  });

  it('does not share arrays or objects with its inputs', () => {
    const merged = mergeImports(collection, log);
    merged.entries[0]!.count = 99;
    merged.entries.push({ count: 1, name: 'Opt' });
    merged.wildcards!.rare = 0;
    merged.decks![0]!.mainDeck.push({ arenaId: 1, count: 1 });
    merged.warnings.push('x');
    expect(collection.entries).toEqual([
      { count: 4, arenaId: 73208 },
      { count: 2, arenaId: 96269 },
    ]);
    expect(log.wildcards!.rare).toBe(104);
    expect(log.decks![0]!.mainDeck).toHaveLength(1);
    expect(collection.warnings).toEqual(['from collection']);
  });

  it('returns a single import unchanged in content and an empty import for no arguments', () => {
    expect(mergeImports(log)).toEqual(log);
    expect(mergeImports()).toEqual({ format: 'arena-text', entries: [], warnings: [], unrecognizedLines: [] });
  });
});
