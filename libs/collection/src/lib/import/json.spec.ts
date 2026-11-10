import { describe, it, expect } from 'vitest';
import { jsonFormatOf, parseCollectionJson } from './json';

describe('parseCollectionJson: grpId sources', () => {
  it('reads mtga-tracker-daemon /cards (F1)', () => {
    const imp = parseCollectionJson(
      '{"cards":[{"grpId":73208,"owned":4},{"grpId":96269,"owned":2},{"grpId":102646,"owned":3}],"elapsedTime":187}',
    );
    expect(imp.format).toBe('grpid-json');
    expect(imp.entries).toEqual([
      { count: 4, arenaId: 73208 },
      { count: 2, arenaId: 96269 },
      { count: 3, arenaId: 102646 },
    ]);
    expect(imp.warnings).toEqual([]);
    expect(imp.unrecognizedLines).toEqual([]);
    expect(imp.wildcards).toBeUndefined();
  });

  it('reads mtga-reader readCollection (F2)', () => {
    const imp = parseCollectionJson('{"count":3512,"cards":[{"grpId":73208,"qty":4}]}');
    expect(imp.format).toBe('grpid-json');
    expect(imp.entries).toEqual([{ count: 4, arenaId: 73208 }]);
  });

  it('reads the MTGA Collection Reader manual snapshot shapes (F3)', () => {
    expect(
      parseCollectionJson('{"schemaVersion":1,"source":"manual-import","cards":[{"arenaId":102646,"quantity":3}]}').entries,
    ).toEqual([{ count: 3, arenaId: 102646 }]);
    expect(parseCollectionJson('[{"grpId":102646,"owned":3}]').entries).toEqual([{ count: 3, arenaId: 102646 }]);
    expect(parseCollectionJson('{"102646":3}').entries).toEqual([{ count: 3, arenaId: 102646 }]);
  });

  it('reads the Untapped API shape', () => {
    const imp = parseCollectionJson('{"cards":[{"grpid":90001,"quantity":2},{"grpid":90002,"quantity":1}]}');
    expect(imp.format).toBe('grpid-json');
    expect(imp.entries).toEqual([
      { count: 2, arenaId: 90001 },
      { count: 1, arenaId: 90002 },
    ]);
  });

  it('is liberal about id and count key names', () => {
    const imp = parseCollectionJson(
      '[{"arena_id":1,"count":1},{"id":2,"qty":2},{"GrpId":3,"Quantity":3},{"grpId":"4","owned":"4"}]',
    );
    expect(imp.entries).toEqual([
      { count: 1, arenaId: 1 },
      { count: 2, arenaId: 2 },
      { count: 3, arenaId: 3 },
      { count: 4, arenaId: 4 },
    ]);
  });

  it('ignores rows and map entries with a count of zero or less', () => {
    expect(parseCollectionJson('{"cards":[{"grpId":1,"owned":0},{"grpId":2,"owned":-1},{"grpId":3,"owned":2}]}').entries).toEqual([
      { count: 2, arenaId: 3 },
    ]);
    const map = parseCollectionJson('{"100":0,"101":4}');
    expect(map.entries).toEqual([{ count: 4, arenaId: 101 }]);
    expect(map.unrecognizedLines).toEqual([]);
  });

  it('turns a daemon error payload into an empty import with the error quoted', () => {
    const imp = parseCollectionJson('{"error":"Object reference not set to an instance of an object."}');
    expect(imp.format).toBe('grpid-json');
    expect(imp.entries).toEqual([]);
    expect(imp.warnings).toHaveLength(1);
    expect(imp.warnings[0]).toContain('Object reference not set to an instance of an object.');
  });

  it('keeps rows it cannot read, capped at 50', () => {
    const rows = Array.from({ length: 70 }, (_, i) => ({ foo: i }));
    const imp = parseCollectionJson(JSON.stringify({ cards: [{ grpId: 5, owned: 1 }, ...rows, 'nope', { grpId: 6 }] }));
    expect(imp.entries).toEqual([{ count: 1, arenaId: 5 }]);
    expect(imp.unrecognizedLines).toHaveLength(50);
    expect(imp.unrecognizedLines[0]).toBe('{"foo":0}');
    expect(imp.warnings.some((w) => w.includes('72'))).toBe(true);
  });
});

describe('parseCollectionJson: named sources', () => {
  it('reads the MTGA Deck Advisor export with wildcards as one entry per name (F6)', () => {
    const imp = parseCollectionJson(
      '{"exported_at":"2026-11-09T21:00:00+00:00","wildcards":{"common":120,"uncommon":64,"rare":6,"mythic":11},' +
        '"cards":[{"count":4,"name":"Lightning Bolt","arena_ids":[100,101]}]}',
    );
    expect(imp.format).toBe('named-json');
    expect(imp.entries).toEqual([{ count: 4, name: 'Lightning Bolt', arenaId: 100 }]);
    expect(imp.wildcards).toEqual({ common: 120, uncommon: 64, rare: 6, mythic: 11 });
  });

  it('leaves wildcards unset when the Deck Advisor export has them as null', () => {
    const imp = parseCollectionJson('{"wildcards":null,"cards":[{"count":2,"name":"Bonecrusher Giant","arena_ids":[70123]}]}');
    expect(imp.wildcards).toBeUndefined();
    expect(imp.entries).toEqual([{ count: 2, name: 'Bonecrusher Giant', arenaId: 70123 }]);
  });

  it('keeps Deck Advisor rows with an empty name by id', () => {
    const imp = parseCollectionJson(
      '{"wildcards":null,"cards":[{"count":3,"name":"","arena_ids":[555]},{"count":1,"name":"Opt","arena_ids":[]}]}',
    );
    expect(imp.format).toBe('named-json');
    expect(imp.entries).toEqual([
      { count: 3, arenaId: 555 },
      { count: 1, name: 'Opt' },
    ]);
  });

  it('reads the NthPhantom10 JSON export (F4)', () => {
    const imp = parseCollectionJson(
      JSON.stringify(
        {
          export_date: '2026-11-09T21:00:00',
          total_unique: 3512,
          total_cards: 9120,
          database_size: 98000,
          cards: [
            {
              count: 4,
              name: 'Luminarch Aspirant',
              set: 'ZNR',
              collector_number: '24',
              rarity: 'rare',
              mana_cost: '{1}{W}',
              type_line: 'Creature — Human Cleric',
              oracle_text: 'At the beginning of combat on your turn, put a +1/+1 counter on target creature you control.',
              arena_ids: [73208],
            },
          ],
        },
        null,
        2,
      ),
    );
    expect(imp.format).toBe('named-json');
    expect(imp.entries).toEqual([
      { count: 4, name: 'Luminarch Aspirant', arenaId: 73208, set: 'ZNR', collectorNumber: '24' },
    ]);
    expect(imp.wildcards).toBeUndefined();
  });

  it('reads MTGA Collection Reader row arrays with either key spelling (F3)', () => {
    const imp = parseCollectionJson(
      '[{"name":"Luminarch Aspirant","quantity":4,"set_code":"ZNR","collector_number":"24"},' +
        '{"name":"Lightning Bolt","count":2,"set":"FCA","cn":40}]',
    );
    expect(imp.format).toBe('named-json');
    expect(imp.entries).toEqual([
      { count: 4, name: 'Luminarch Aspirant', set: 'ZNR', collectorNumber: '24' },
      { count: 2, name: 'Lightning Bolt', set: 'FCA', collectorNumber: '40' },
    ]);
  });

  it('fills missing wildcard rarities with zero', () => {
    const imp = parseCollectionJson('{"wildcards":{"rare":6},"cards":[{"count":1,"name":"Opt"}]}');
    expect(imp.wildcards).toEqual({ common: 0, uncommon: 0, rare: 6, mythic: 0 });
  });
});

describe('parseCollectionJson: bad input', () => {
  it.each([
    ['empty string', ''],
    ['truncated object', '{"cards":[{"grpId":73208,"owned":4},{"grpId":9'],
    ['truncated array', '[{"grpId":102646,"owned":3},'],
    ['not JSON at all', '{this is not json}'],
  ])('does not throw on %s and explains itself', (_label, input) => {
    const imp = parseCollectionJson(input);
    expect(imp.entries).toEqual([]);
    expect(imp.warnings.length).toBeGreaterThan(0);
  });

  it.each(['null', '42', '"text"', 'true', '[]', '{}', '{"cards":[]}', '{"cards":"nope"}', '[1,2,3]', '[null]'])(
    'returns an empty import with a warning for %s',
    (input) => {
      const imp = parseCollectionJson(input);
      expect(imp.entries).toEqual([]);
      expect(imp.warnings.length).toBeGreaterThan(0);
    },
  );

  it('uses the format it is told to use', () => {
    expect(parseCollectionJson('{"cards":[{"grpId":1,"owned":1}]}', 'named-json').format).toBe('named-json');
    expect(parseCollectionJson('[{"name":"Opt","count":1}]', 'grpid-json').format).toBe('grpid-json');
  });
});

describe('jsonFormatOf', () => {
  it('tells grpId rows and id maps from named rows', () => {
    expect(jsonFormatOf('{"cards":[{"grpId":73208,"owned":4}]}')).toBe('grpid-json');
    expect(jsonFormatOf('[{"grpId":102646,"owned":3}]')).toBe('grpid-json');
    expect(jsonFormatOf('{"102646":3}')).toBe('grpid-json');
    expect(jsonFormatOf('{"error":"boom"}')).toBe('grpid-json');
    expect(jsonFormatOf('{"cards":[{"count":4,"name":"Lightning Bolt","arena_ids":[100,101]}]}')).toBe('named-json');
    expect(jsonFormatOf('[{"name":"Opt","quantity":4}]')).toBe('named-json');
  });

  it('falls back to sniffing the text when the JSON is cut off', () => {
    expect(jsonFormatOf('{"cards":[{"grpId":73208,"owned":4},{"grp')).toBe('grpid-json');
    expect(jsonFormatOf('{"cards":[{"count":4,"name":"Lightning Bolt","arena_ids":[100,')).toBe('named-json');
  });
});
