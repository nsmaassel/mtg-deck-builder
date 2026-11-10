import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { looksLikePlayerLog, parsePlayerLog } from './player-log';

const fixture = (name: string) => readFileSync(join(__dirname, '__fixtures__', name), 'utf-8');

const SAMPLE = fixture('player-log.sample.txt');
const DISABLED = fixture('player-log.detailed-logs-disabled.txt');

const HEADER = 'DETAILED LOGS: ENABLED\n[UnityCrossThreadLogger]5/1/2026 5:15:24 PM\n';

function startHook(payload: unknown, id = '00000000-0000-4000-8000-000000000001'): string {
  return `[UnityCrossThreadLogger]5/1/2026 5:15:24 PM\n<== StartHook(${id})\n${JSON.stringify(payload)}\n`;
}

function inventory(overrides: Record<string, number> = {}): Record<string, unknown> {
  return {
    SeqId: 1,
    Changes: [],
    Gems: 100,
    Gold: 200,
    TotalVaultProgress: 15,
    WildCardCommons: 1,
    WildCardUnCommons: 2,
    WildCardRares: 3,
    WildCardMythics: 4,
    CustomTokens: {},
    Boosters: [],
    ...overrides,
  };
}

describe('parsePlayerLog: real trimmed log', () => {
  it('reads wildcards, gems, gold and vault progress from the StartHook inventory', () => {
    const imp = parsePlayerLog(SAMPLE);
    expect(imp.format).toBe('player-log');
    expect(imp.wildcards).toEqual({ common: 557, uncommon: 801, rare: 104, mythic: 84 });
    expect(imp.gems).toBe(14120);
    expect(imp.gold).toBe(17150);
    expect(imp.vaultProgress).toBeCloseTo(4.6);
  });

  it('never fills entries and says the log has no collection', () => {
    const imp = parsePlayerLog(SAMPLE);
    expect(imp.entries).toEqual([]);
    expect(imp.unrecognizedLines).toEqual([]);
    expect(imp.warnings).toHaveLength(1);
    expect(imp.warnings[0]).toMatch(/never contains the card collection/i);
    expect(imp.warnings[0]).toMatch(/wildcards and saved decks/i);
  });

  it('joins deck summaries with their card lists', () => {
    const decks = parsePlayerLog(SAMPLE).decks ?? [];
    expect(decks.map((d) => [d.id, d.name, d.format])).toEqual([
      ['00000000-0000-4000-8000-00000000d001', 'Black Red Brawl', 'Brawl'],
      ['00000000-0000-4000-8000-00000000d002', 'Azorius Yorion Control (2)', 'Historic'],
    ]);

    const [brawl, yorion] = decks;
    expect(brawl!.commandZone).toEqual([{ arenaId: 82701, count: 1 }]);
    expect(brawl!.mainDeck).toHaveLength(44);
    expect(brawl!.mainDeck[0]).toEqual({ arenaId: 82647, count: 1 });
    expect(brawl!.mainDeck.reduce((sum, c) => sum + c.count, 0)).toBe(59);
    expect(brawl!.sideboard).toEqual([]);
    expect(brawl!.companions).toEqual([]);

    expect(yorion!.mainDeck.reduce((sum, c) => sum + c.count, 0)).toBe(80);
    expect(yorion!.sideboard).toHaveLength(11);
    expect(yorion!.sideboard[0]).toEqual({ arenaId: 90665, count: 1 });
    expect(yorion!.companions).toEqual([{ arenaId: 85582, count: 1 }]);
    expect(yorion!.commandZone).toEqual([]);
  });

  it('gives the same result with Windows line endings', () => {
    expect(parsePlayerLog(SAMPLE.replace(/\n/g, '\r\n'))).toEqual(parsePlayerLog(SAMPLE));
  });

  it('keeps the fixture free of account data', () => {
    expect(SAMPLE).not.toMatch(/accountid|personaid|displayname|screenname|playerid|bearer|access_?token|refresh_?token|@/i);
    const uuids = SAMPLE.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi) ?? [];
    expect(uuids.length).toBeGreaterThan(0);
    expect(uuids.every((id) => id.startsWith('00000000-0000-4000-8000-'))).toBe(true);
    expect(SAMPLE.length).toBeLessThan(15_000);
  });
});

describe('parsePlayerLog: detailed logs off or no login snapshot', () => {
  it('explains how to enable Detailed Logs when the log says they are disabled', () => {
    const imp = parsePlayerLog(DISABLED);
    expect(imp).toEqual({
      format: 'player-log',
      entries: [],
      warnings: [expect.stringContaining('Options → Account → Detailed Logs (Plugin Support)')],
      unrecognizedLines: [],
    });
    expect(imp.warnings[0]).toMatch(/restart Arena/i);
    expect(imp.warnings[0]).toMatch(/disabled/i);
  });

  it('returns nothing from a disabled log even if a StartHook follows', () => {
    const imp = parsePlayerLog(`DETAILED LOGS: DISABLED\n${startHook({ InventoryInfo: inventory() })}`);
    expect(imp.wildcards).toBeUndefined();
    expect(imp.decks).toBeUndefined();
    expect(imp.warnings).toHaveLength(1);
  });

  it('gives the same advice when there is no StartHook at all', () => {
    const imp = parsePlayerLog(`${HEADER}[UnityCrossThreadLogger]==> GetFormats {"id":"x","request":"{ }"}\n`);
    expect(imp.entries).toEqual([]);
    expect(imp.wildcards).toBeUndefined();
    expect(imp.decks).toBeUndefined();
    expect(imp.warnings).toHaveLength(1);
    expect(imp.warnings[0]).toContain('Options → Account → Detailed Logs (Plugin Support)');
    expect(imp.warnings[0]).toMatch(/restart Arena/i);
  });

  it.each(['', 'not a log', '\u0000\u0001\u0002<== StartHook(', '<== StartHook(abc)\n{"InventoryInfo":{"Gems":'])(
    'does not throw on %j',
    (input) => {
      const imp = parsePlayerLog(input);
      expect(imp.entries).toEqual([]);
      expect(imp.wildcards).toBeUndefined();
      expect(imp.warnings.length).toBeGreaterThan(0);
    },
  );
});

describe('parsePlayerLog: picking the snapshot', () => {
  it('uses the last StartHook in the file', () => {
    const log =
      HEADER +
      startHook({ InventoryInfo: inventory({ WildCardRares: 3, Gems: 100 }), DeckSummaries: [], Decks: {} }) +
      '[UnityCrossThreadLogger]==> RankGetCombinedRankInfo {"id":"y","request":"{}"}\n' +
      startHook({ InventoryInfo: inventory({ WildCardRares: 9, Gems: 500 }), DeckSummaries: [], Decks: {} });
    const imp = parsePlayerLog(log);
    expect(imp.wildcards).toEqual({ common: 1, uncommon: 2, rare: 9, mythic: 4 });
    expect(imp.gems).toBe(500);
    expect(imp.decks).toEqual([]);
  });

  it('treats inventory keys the client left out as zero', () => {
    const inv = inventory();
    delete inv['WildCardRares'];
    delete inv['WildCardMythics'];
    delete inv['TotalVaultProgress'];
    const imp = parsePlayerLog(HEADER + startHook({ InventoryInfo: inv }));
    expect(imp.wildcards).toEqual({ common: 1, uncommon: 2, rare: 0, mythic: 0 });
    expect(imp.vaultProgress).toBe(0);
  });

  it('divides TotalVaultProgress by ten', () => {
    const imp = parsePlayerLog(HEADER + startHook({ InventoryInfo: inventory({ TotalVaultProgress: 437 }) }));
    expect(imp.vaultProgress).toBeCloseTo(43.7);
  });

  it('prefers a later InventoryInfo over the StartHook one', () => {
    const log =
      HEADER +
      startHook({ InventoryInfo: inventory(), DeckSummaries: [], Decks: {} }) +
      '[UnityCrossThreadLogger]5/1/2026 5:20:00 PM\n<== EventJoin(00000000-0000-4000-8000-000000000002)\n' +
      `${JSON.stringify({
        Course: { CourseId: 'c', CardPool: [], CardStyles: [] },
        InventoryInfo: inventory({ SeqId: 4, Gems: 50, WildCardRares: 2, WildCardCommons: 11 }),
      })}\n`;
    const imp = parsePlayerLog(log);
    expect(imp.wildcards).toEqual({ common: 11, uncommon: 2, rare: 2, mythic: 4 });
    expect(imp.gems).toBe(50);
  });

  it('prefers a later DTO_InventoryInfo as well', () => {
    const log =
      HEADER +
      startHook({ InventoryInfo: inventory() }) +
      '<== BotDraftDraftPick(00000000-0000-4000-8000-000000000003)\n' +
      `${JSON.stringify({
        CurrentModule: 'BotDraft',
        Payload: '{"Result":"Success","PickedCards":["1","2"]}',
        DTO_InventoryInfo: inventory({ SeqId: 7, WildCardMythics: 40 }),
      })}\n`;
    expect(parsePlayerLog(log).wildcards).toEqual({ common: 1, uncommon: 2, rare: 3, mythic: 40 });
  });

  it('uses the newest of several later inventories', () => {
    const later = (rares: number) => `<== EventJoin(x)\n${JSON.stringify({ InventoryInfo: inventory({ WildCardRares: rares }) })}\n`;
    const log = HEADER + startHook({ InventoryInfo: inventory() }) + later(20) + later(21);
    expect(parsePlayerLog(log).wildcards?.rare).toBe(21);
  });

  it('ignores an InventoryInfo that came before the last StartHook', () => {
    const log =
      HEADER +
      startHook({ InventoryInfo: inventory({ WildCardRares: 1 }) }) +
      `<== EventJoin(x)\n${JSON.stringify({ InventoryInfo: inventory({ WildCardRares: 99 }) })}\n` +
      startHook({ InventoryInfo: inventory({ WildCardRares: 5 }) });
    expect(parsePlayerLog(log).wildcards?.rare).toBe(5);
  });

  it('skips later InventoryInfo mentions that are not inventory objects', () => {
    const log =
      HEADER +
      startHook({ InventoryInfo: inventory({ WildCardRares: 5 }) }) +
      `<== EventJoin(x)\n${JSON.stringify({ InventoryInfo: inventory({ WildCardRares: 6 }) })}\n` +
      '[UnityCrossThreadLogger]{"note":"\\"InventoryInfo\\":{\\"WildCardRares\\":70}"}\n' +
      '[UnityCrossThreadLogger]"InventoryInfo": null\n' +
      '[UnityCrossThreadLogger]{"InventoryInfo":{"Unrelated":true}}\n' +
      '[UnityCrossThreadLogger]{"InventoryInfo":{"WildCardRares":8\n';
    expect(parsePlayerLog(log).wildcards?.rare).toBe(6);
  });

  it('falls back to the previous StartHook when the last one is cut off, and says so', () => {
    const log =
      HEADER +
      startHook({ InventoryInfo: inventory({ WildCardRares: 3 }) }) +
      '<== StartHook(00000000-0000-4000-8000-000000000009)\n{"InventoryInfo":{"SeqId":1,"Gems":10,"WildCardRa';
    const imp = parsePlayerLog(log);
    expect(imp.wildcards?.rare).toBe(3);
    expect(imp.warnings.some((w) => /cut off/i.test(w))).toBe(true);
  });
});

describe('parsePlayerLog: decks', () => {
  const summary = (id: string, name: string, format?: string) => ({
    DeckId: id,
    Name: name,
    Attributes: [
      { name: 'Version', value: '3' },
      { name: 'LastPlayed', value: '"2026-04-29T23:51:38.7247251-07:00"' },
      ...(format ? [{ name: 'Format', value: format }] : []),
    ],
    DeckTileId: 1,
    DeckArtId: 0,
  });

  it('accepts the older DeckSummariesV2 key', () => {
    const log =
      HEADER +
      startHook({
        InventoryInfo: inventory(),
        DeckSummariesV2: [summary('d1', 'Mono Red', 'Standard')],
        Decks: {
          d1: {
            MainDeck: [
              { cardId: 100, quantity: 4 },
              { cardId: 101, quantity: 20 },
            ],
            Sideboard: [{ cardId: 102, quantity: 2 }],
            CommandZone: [],
            Companions: [],
            CardSkins: [],
          },
        },
      });
    expect(parsePlayerLog(log).decks).toEqual([
      {
        id: 'd1',
        name: 'Mono Red',
        format: 'Standard',
        mainDeck: [
          { arenaId: 100, count: 4 },
          { arenaId: 101, count: 20 },
        ],
        sideboard: [{ arenaId: 102, count: 2 }],
        commandZone: [],
        companions: [],
      },
    ]);
  });

  it('tolerates missing zones, a missing Format attribute and broken card rows', () => {
    const log =
      HEADER +
      startHook({
        InventoryInfo: inventory(),
        DeckSummaries: [summary('d1', 'No Format'), summary('d2', 'Orphan', 'Historic'), { Name: 'no id' }, 'junk'],
        Decks: {
          d1: { MainDeck: [{ cardId: 100, quantity: 4 }, { cardId: 'x', quantity: 1 }, { cardId: 101, quantity: 0 }, null] },
        },
      });
    expect(parsePlayerLog(log).decks).toEqual([
      {
        id: 'd1',
        name: 'No Format',
        mainDeck: [{ arenaId: 100, count: 4 }],
        sideboard: [],
        commandZone: [],
        companions: [],
      },
    ]);
  });

  it('flags decks the client marks as net decks', () => {
    const log =
      HEADER +
      startHook({
        InventoryInfo: inventory(),
        DeckSummaries: [{ ...summary('d1', '?=?Loc/Decks/Precon/Precon_EPP2023_BR', 'Alchemy'), IsNetDeck: true }, summary('d2', 'Mine', 'Standard')],
        Decks: { d1: { MainDeck: [] }, d2: { MainDeck: [] } },
      });
    const decks = parsePlayerLog(log).decks ?? [];
    expect(decks.map((d) => d.isNetDeck)).toEqual([true, undefined]);
  });

  it('returns no wildcards but still reads decks when the snapshot has no inventory', () => {
    // The inventory from before the last login belongs to an older session and must not leak in.
    const log =
      HEADER +
      `<== EventJoin(x)\n${JSON.stringify({ InventoryInfo: inventory({ WildCardRares: 99 }) })}\n` +
      startHook({ DeckSummaries: [summary('d1', 'Mine', 'Standard')], Decks: { d1: { MainDeck: [] } } });
    const imp = parsePlayerLog(log);
    expect(imp.wildcards).toBeUndefined();
    expect(imp.gems).toBeUndefined();
    expect(imp.decks).toHaveLength(1);
  });
});

describe('parsePlayerLog: large input', () => {
  it('reads a 40 MB log without scanning it line by line', () => {
    const filler = '[UnityCrossThreadLogger]STATE CHANGED {"old":"None","new":"ConnectedToMatchDoor"}\n';
    const half = filler.repeat(Math.ceil(20_000_000 / filler.length));
    const log =
      HEADER +
      startHook({ InventoryInfo: inventory({ WildCardRares: 1 }) }) +
      half +
      startHook({ InventoryInfo: inventory({ WildCardRares: 7 }) }) +
      half;
    expect(log.length).toBeGreaterThan(40_000_000);

    const started = Date.now();
    const imp = parsePlayerLog(log);
    expect(Date.now() - started).toBeLessThan(5000);
    expect(imp.wildcards?.rare).toBe(7);
  });
});

describe('looksLikePlayerLog', () => {
  it('recognises the client markers', () => {
    expect(looksLikePlayerLog(SAMPLE)).toBe(true);
    expect(looksLikePlayerLog(DISABLED)).toBe(true);
    expect(looksLikePlayerLog('[UnityCrossThreadLogger]5/1/2026 4:57:16 PM\n')).toBe(true);
    expect(looksLikePlayerLog('<== StartHook(131e62ff)\n{}')).toBe(true);
    expect(looksLikePlayerLog('DETAILED LOGS: ENABLED\n')).toBe(true);
  });

  it('rejects everything else', () => {
    expect(looksLikePlayerLog('')).toBe(false);
    expect(looksLikePlayerLog('4 Lightning Bolt (M21) 161')).toBe(false);
    expect(looksLikePlayerLog('{"cards":[]}')).toBe(false);
  });
});
