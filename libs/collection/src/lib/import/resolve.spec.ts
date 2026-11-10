import { describe, it, expect } from 'vitest';
import { resolveCollection } from './resolve';
import type { CardLookup, CardRef, CollectionEntry, CollectionImport } from './types';

const BOLT: CardRef = { oracleId: 'oracle-bolt', name: 'Lightning Bolt' };
const OPT: CardRef = { oracleId: 'oracle-opt', name: 'Opt' };
const FIRE_ICE: CardRef = { oracleId: 'oracle-fire-ice', name: 'Fire // Ice' };

function stubLookup(): CardLookup & { calls: string[] } {
  const byId = new Map<number, CardRef>([
    [100, BOLT],
    [101, BOLT],
    [200, OPT],
  ]);
  const byName = new Map<string, CardRef>([
    ['lightning bolt', BOLT],
    ['opt', OPT],
    ['fire // ice', FIRE_ICE],
  ]);
  const calls: string[] = [];
  return {
    calls,
    byArenaId(arenaId) {
      calls.push(`id:${arenaId}`);
      return byId.get(arenaId);
    },
    byName(name) {
      calls.push(`name:${name}`);
      return byName.get(name.toLowerCase());
    },
  };
}

const imp = (entries: CollectionEntry[]): CollectionImport => ({
  format: 'arena-text',
  entries,
  warnings: [],
  unrecognizedLines: [],
});

describe('resolveCollection', () => {
  it('resolves by Arena id', () => {
    const resolved = resolveCollection(imp([{ count: 4, arenaId: 100 }, { count: 2, arenaId: 200 }]), stubLookup());
    expect(resolved.owned).toEqual(
      new Map([
        ['oracle-bolt', 4],
        ['oracle-opt', 2],
      ]),
    );
    expect(resolved.names).toEqual(
      new Map([
        ['oracle-bolt', 'Lightning Bolt'],
        ['oracle-opt', 'Opt'],
      ]),
    );
    expect(resolved.unresolved).toEqual([]);
    expect(resolved.totalCards).toBe(6);
    expect(resolved.uniqueCards).toBe(2);
  });

  it('resolves by name when there is no id', () => {
    const resolved = resolveCollection(imp([{ count: 3, name: 'Fire // Ice', set: 'MH2', collectorNumber: '290' }]), stubLookup());
    expect(resolved.owned).toEqual(new Map([['oracle-fire-ice', 3]]));
    expect(resolved.names.get('oracle-fire-ice')).toBe('Fire // Ice');
  });

  it('trusts the name over the id when both are given', () => {
    // 200 is Opt's Arena id, but the row says Lightning Bolt: the number is some other tool's own key.
    const lookup = stubLookup();
    const resolved = resolveCollection(imp([{ count: 4, name: 'Lightning Bolt', arenaId: 200 }]), lookup);
    expect(lookup.calls).toEqual(['name:Lightning Bolt']);
    expect(resolved.owned).toEqual(new Map([['oracle-bolt', 4]]));
  });

  it('falls back to the id when the name is unknown', () => {
    const lookup = stubLookup();
    const resolved = resolveCollection(imp([{ count: 4, name: 'Blitzschlag', arenaId: 100 }]), lookup);
    expect(lookup.calls).toEqual(['name:Blitzschlag', 'id:100']);
    expect(resolved.owned).toEqual(new Map([['oracle-bolt', 4]]));
  });

  it('sums copies across printings and entries without clamping', () => {
    const resolved = resolveCollection(
      imp([
        { count: 4, arenaId: 100 },
        { count: 3, arenaId: 101 },
        { count: 2, name: 'lightning bolt' },
        { count: 40, name: 'Opt' },
      ]),
      stubLookup(),
    );
    expect(resolved.owned.get('oracle-bolt')).toBe(9);
    expect(resolved.owned.get('oracle-opt')).toBe(40);
    expect(resolved.totalCards).toBe(49);
    expect(resolved.uniqueCards).toBe(2);
    expect(resolved.names.get('oracle-bolt')).toBe('Lightning Bolt');
  });

  it('collects entries that match no card and leaves them out of the totals', () => {
    const unknownId: CollectionEntry = { count: 2, arenaId: 424242 };
    const unknownName: CollectionEntry = { count: 1, name: 'Totally Made Up Card' };
    const neither: CollectionEntry = { count: 5 };
    const resolved = resolveCollection(imp([unknownId, { count: 4, arenaId: 100 }, unknownName, neither]), stubLookup());
    expect(resolved.unresolved).toEqual([unknownId, unknownName, neither]);
    expect(resolved.totalCards).toBe(4);
    expect(resolved.uniqueCards).toBe(1);
  });

  it('returns empty maps for an empty import', () => {
    const resolved = resolveCollection(imp([]), stubLookup());
    expect(resolved.owned.size).toBe(0);
    expect(resolved.names.size).toBe(0);
    expect(resolved.unresolved).toEqual([]);
    expect(resolved.totalCards).toBe(0);
    expect(resolved.uniqueCards).toBe(0);
  });

  it('keeps a name for every owned key', () => {
    const resolved = resolveCollection(
      imp([{ count: 1, arenaId: 200 }, { count: 1, name: 'Fire // Ice' }, { count: 1, name: 'Lightning Bolt', arenaId: 101 }]),
      stubLookup(),
    );
    expect([...resolved.names.keys()].sort()).toEqual([...resolved.owned.keys()].sort());
  });
});
