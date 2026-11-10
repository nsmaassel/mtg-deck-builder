import { describe, it, expect } from 'vitest';
import { importCollection } from './import';
import { shrinkPlayerLog } from './shrink';

const HEADER = 'Mono path[0] = C:/Program Files/MTGA\nDETAILED LOGS: ENABLED\n[UnityCrossThreadLogger]Version: 2026.58\n';
const NOISE = '[UnityCrossThreadLogger]==> RankGetCombinedRankInfo {"id":"x","request":"{}"}\n'.repeat(400);

function startHook(id: string, wildcards: { rare: number }, deckName = 'Izzet'): string {
  const payload = {
    InventoryInfo: { Gems: 100, Gold: 200, TotalVaultProgress: 431, WildCardCommons: 5, WildCardRares: wildcards.rare },
    DeckSummaries: [{ DeckId: 'd1', Name: deckName, Attributes: [{ name: 'Format', value: 'Standard' }] }],
    Decks: { d1: { MainDeck: [{ cardId: 1001, quantity: 4 }], Sideboard: [], CommandZone: [], Companions: [] } },
    Cosmetics: { filler: 'x'.repeat(2000) },
  };
  return `[UnityCrossThreadLogger]11/9/2026 9:00:00 PM\n<== StartHook(${id})\n${JSON.stringify(payload)}\n`;
}

const laterInventory = (rare: number) =>
  `<== EventJoin(abc)\n{"Course":{},"InventoryInfo":{"Gems":90,"Gold":200,"WildCardCommons":5,"WildCardRares":${rare}}}\n`;

describe('shrinkPlayerLog', () => {
  it('imports to the same result as the whole log', () => {
    const log = HEADER + NOISE + startHook('one', { rare: 2 }) + NOISE + startHook('two', { rare: 7 }, 'Dimir') + NOISE;
    const shrunk = shrinkPlayerLog(log);
    expect(importCollection(shrunk)).toEqual(importCollection(log));
    expect(importCollection(shrunk).wildcards?.rare).toBe(7);
    expect(importCollection(shrunk).decks?.[0]?.name).toBe('Dimir');
  });

  it('is much smaller than the log and drops everything between snapshots', () => {
    const log = HEADER + NOISE + startHook('one', { rare: 2 }) + NOISE.repeat(20);
    const shrunk = shrinkPlayerLog(log);
    expect(shrunk.length).toBeLessThan(log.length / 10);
    expect(shrunk).not.toContain('RankGetCombinedRankInfo {"id":"x","request":"{}"}\n[UnityCrossThreadLogger]==> RankGetCombinedRankInfo'.repeat(20));
  });

  it('keeps inventory updates that follow the last login', () => {
    const log = HEADER + startHook('one', { rare: 2 }) + NOISE + laterInventory(1) + NOISE + laterInventory(0) + NOISE;
    const shrunk = shrinkPlayerLog(log);
    expect(importCollection(shrunk)).toEqual(importCollection(log));
    expect(importCollection(shrunk).gems).toBe(90);
  });

  it('keeps an earlier login so a cut-off newest one can be skipped', () => {
    const truncated = '[UnityCrossThreadLogger]\n<== StartHook(three)\n{"InventoryInfo":{"Gems":1,"WildCardRa';
    const log = HEADER + startHook('one', { rare: 2 }) + NOISE + truncated;
    const shrunk = shrinkPlayerLog(log);
    expect(importCollection(shrunk)).toEqual(importCollection(log));
    expect(importCollection(shrunk).wildcards?.rare).toBe(2);
  });

  it('keeps the detailed-logs warning for a log without login data', () => {
    const disabled = 'Mono path\nDETAILED LOGS: DISABLED\n[UnityCrossThreadLogger]Something\n' + NOISE;
    expect(importCollection(shrinkPlayerLog(disabled)).warnings).toEqual(importCollection(disabled).warnings);
    expect(shrinkPlayerLog(disabled).length).toBeLessThan(5000);
  });

  it('copes with CRLF line endings and with input that is not a log', () => {
    const log = (HEADER + startHook('one', { rare: 3 }) + NOISE).replace(/\n/g, '\r\n');
    expect(importCollection(shrinkPlayerLog(log)).wildcards?.rare).toBe(3);
    expect(shrinkPlayerLog('')).toBe('');
    expect(shrinkPlayerLog('4 Lightning Bolt\n')).toBe('4 Lightning Bolt\n');
  });
});
