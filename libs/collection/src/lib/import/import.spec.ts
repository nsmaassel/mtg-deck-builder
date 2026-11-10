import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { importCollection } from './import';
import type { CollectionSourceFormat } from './types';

const fixture = (name: string) => readFileSync(join(__dirname, '__fixtures__', name), 'utf-8');

describe('importCollection', () => {
  it('detects and reads Arena text', () => {
    const imp = importCollection('4 Lightning Bolt (M21) 161\n4x Luminarch Aspirant (ZNR) #24 [rare]\n2 Bonecrusher Giant\n');
    expect(imp.format).toBe('arena-text');
    expect(imp.entries).toEqual([
      { count: 4, name: 'Lightning Bolt', set: 'M21', collectorNumber: '161' },
      { count: 4, name: 'Luminarch Aspirant', set: 'ZNR', collectorNumber: '24' },
      { count: 2, name: 'Bonecrusher Giant' },
    ]);
  });

  it('detects and reads grpId JSON', () => {
    const imp = importCollection('{"cards":[{"grpId":73208,"owned":4}],"elapsedTime":187}');
    expect(imp.format).toBe('grpid-json');
    expect(imp.entries).toEqual([{ count: 4, arenaId: 73208 }]);
  });

  it('detects and reads named JSON with wildcards', () => {
    const imp = importCollection(
      '{"wildcards":{"common":120,"uncommon":64,"rare":6,"mythic":11},"cards":[{"count":4,"name":"Lightning Bolt","arena_ids":[100,101]}]}',
    );
    expect(imp.format).toBe('named-json');
    expect(imp.entries).toEqual([{ count: 4, name: 'Lightning Bolt', arenaId: 100 }]);
    expect(imp.wildcards).toEqual({ common: 120, uncommon: 64, rare: 6, mythic: 11 });
  });

  it('detects and reads CSV', () => {
    const imp = importCollection('﻿Quantity,Name,Edition Code,Collector Number\n4,"Momo, Friendly Flier",TLA,29\n');
    expect(imp.format).toBe('csv');
    expect(imp.entries).toEqual([{ count: 4, name: 'Momo, Friendly Flier', set: 'TLA', collectorNumber: '29' }]);
  });

  it('detects and reads a Player.log', () => {
    const imp = importCollection(fixture('player-log.sample.txt'));
    expect(imp.format).toBe('player-log');
    expect(imp.entries).toEqual([]);
    expect(imp.wildcards).toEqual({ common: 557, uncommon: 801, rare: 104, mythic: 84 });
    expect(imp.decks).toHaveLength(2);
  });

  it('honours an explicit format over detection', () => {
    const csvLooking = 'Count,Name\n4,Opt\n';
    const asText = importCollection(csvLooking, { format: 'arena-text' });
    expect(asText.format).toBe('arena-text');
    expect(asText.entries).toEqual([]);
    expect(asText.unrecognizedLines).toEqual(['Count,Name', '4,Opt']);

    expect(importCollection('[{"name":"Opt","count":1}]', { format: 'grpid-json' }).format).toBe('grpid-json');
    expect(importCollection('4 Opt', { format: 'player-log' }).format).toBe('player-log');
    expect(importCollection('4 Opt', { format: 'csv' }).format).toBe('csv');
  });

  it('throws only for an unknown explicit format', () => {
    expect(() => importCollection('4 Opt', { format: 'xml' as CollectionSourceFormat })).toThrow(/xml/);
  });

  it('falls back to an empty arena-text import with a warning when nothing is recognised', () => {
    const imp = importCollection('hello there\nthis is not a collection\n');
    expect(imp.format).toBe('arena-text');
    expect(imp.entries).toEqual([]);
    expect(imp.unrecognizedLines).toEqual(['hello there', 'this is not a collection']);
    expect(imp.warnings).toHaveLength(1);
  });

  it('says so when the input is empty', () => {
    for (const input of ['', '  \n\n']) {
      const imp = importCollection(input);
      expect(imp.entries).toEqual([]);
      expect(imp.unrecognizedLines).toEqual([]);
      expect(imp.warnings).toHaveLength(1);
      expect(imp.warnings[0]).toMatch(/empty/i);
    }
  });

  const garbage: [string, string][] = [
    ['empty string', ''],
    ['binary-ish text', '\u0000\u0001\u0002PK\u0003\u0004��\u0000\u0008\n\u0000\u0000�\r\n��,;\t"\u0000'],
    ['truncated JSON object', '{"cards":[{"grpId":73208,"owned":4},{"grpId":9'],
    ['truncated JSON array', '[{"name":"Opt","quantity":'],
    ['lone bracket', '['],
    ['lone quote', '"'],
    ['CSV header with an open quote', 'Count,"Name\n4,Opt'],
    ['truncated Player.log', 'DETAILED LOGS: ENABLED\n<== StartHook(abc)\n{"InventoryInfo":{"Gems":1'],
    ['one very long line', 'x'.repeat(300_000)],
  ];

  it.each(garbage)('never throws on %s', (_label, input) => {
    const imp = importCollection(input);
    expect(imp.entries).toEqual([]);
    expect(imp.warnings.length).toBeGreaterThan(0);
    expect(imp.unrecognizedLines.length).toBeLessThanOrEqual(50);
  });

  it.each(garbage)('never throws on %s under any explicit format', (_label, input) => {
    const formats: CollectionSourceFormat[] = ['arena-text', 'grpid-json', 'named-json', 'csv', 'player-log'];
    for (const format of formats) {
      const imp = importCollection(input, { format });
      expect(imp.format).toBe(format);
      expect(imp.entries).toEqual([]);
      expect(imp.unrecognizedLines.length).toBeLessThanOrEqual(50);
    }
  });

  it('copes with a non-string input from untyped callers', () => {
    const imp = importCollection(undefined as unknown as string);
    expect(imp.entries).toEqual([]);
    expect(imp.warnings).toHaveLength(1);
  });
});
