import { emptyImport, isRecord, toInteger, toPositiveInteger } from './shared';
import type { CollectionImport, ImportedDeck, ImportedDeckCard } from './types';

const LOG_MARKERS = ['[UnityCrossThreadLogger]', '<== StartHook(', 'DETAILED LOGS:'];
const START_HOOK = '<== StartHook(';
const INVENTORY_KEY = 'InventoryInfo"';

// How far back to look when the newest candidate cannot be read (a log copied mid-write).
const MAX_START_HOOK_ATTEMPTS = 5;
const MAX_INVENTORY_ATTEMPTS = 25;

const ENABLE_DETAILED_LOGS =
  'In Arena, turn on Options → Account → Detailed Logs (Plugin Support), restart Arena, then import the new Player.log.';

const INVENTORY_NUMBER_KEYS = [
  'Gems',
  'Gold',
  'TotalVaultProgress',
  'WildCardCommons',
  'WildCardUnCommons',
  'WildCardRares',
  'WildCardMythics',
];

export function looksLikePlayerLog(input: string): boolean {
  return LOG_MARKERS.some((marker) => input.includes(marker));
}

function parseObject(text: string): Record<string, unknown> | undefined {
  try {
    const value: unknown = JSON.parse(text);
    return isRecord(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

interface StartHook {
  payload: Record<string, unknown>;
  /** Offset just past the payload line. */
  end: number;
  /** Newer StartHook responses that had to be passed over because they could not be read. */
  skipped: number;
}

/**
 * Finds the newest readable `<== StartHook(<id>)` response; its JSON is the line after the marker.
 * Works backwards with `lastIndexOf` so a 40 MB log is never split into lines.
 */
function findStartHook(log: string): StartHook | undefined {
  let at = log.lastIndexOf(START_HOOK);
  for (let skipped = 0; at !== -1 && skipped < MAX_START_HOOK_ATTEMPTS; skipped++) {
    const markerEnd = log.indexOf('\n', at);
    if (markerEnd !== -1) {
      let start = markerEnd + 1;
      while (log[start] === '\r' || log[start] === '\n') start += 1;
      const nextBreak = log.indexOf('\n', start);
      const end = nextBreak === -1 ? log.length : nextBreak;
      const payload = parseObject(log.slice(start, end));
      if (payload) return { payload, end, skipped };
    }
    at = at === 0 ? -1 : log.lastIndexOf(START_HOOK, at - 1);
  }
  return undefined;
}

/** Returns the balanced `{...}` that starts at `start`, looking no further than `limit`. */
function sliceObject(text: string, start: number, limit: number): string | undefined {
  let depth = 0;
  let inString = false;
  for (let i = start; i < limit; i++) {
    const code = text.charCodeAt(i);
    if (inString) {
      if (code === 92) i += 1; // backslash: skip the escaped character
      else if (code === 34) inString = false;
    } else if (code === 34) {
      inString = true;
    } else if (code === 123) {
      depth += 1;
    } else if (code === 125) {
      depth -= 1;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return undefined;
}

function isInventory(value: Record<string, unknown>): boolean {
  return INVENTORY_NUMBER_KEYS.some((key) => typeof value[key] === 'number');
}

/**
 * EventJoin and EventClaimPrize responses carry a fresh `InventoryInfo`, bot draft picks a
 * `DTO_InventoryInfo`. Returns the newest one found after offset `from`.
 */
function findLaterInventory(log: string, from: number): Record<string, unknown> | undefined {
  let at = log.lastIndexOf(INVENTORY_KEY);
  for (let attempt = 0; at >= from && attempt < MAX_INVENTORY_ATTEMPTS; attempt++) {
    const opening = /^\s*:\s*\{/.exec(log.slice(at + INVENTORY_KEY.length, at + INVENTORY_KEY.length + 16));
    if (opening) {
      const start = at + INVENTORY_KEY.length + opening[0].length - 1;
      const lineEnd = log.indexOf('\n', start);
      const text = sliceObject(log, start, lineEnd === -1 ? log.length : lineEnd);
      const inventory = text === undefined ? undefined : parseObject(text);
      if (inventory && isInventory(inventory)) return inventory;
    }
    at = at === 0 ? -1 : log.lastIndexOf(INVENTORY_KEY, at - 1);
  }
  return undefined;
}

function readCards(value: unknown): ImportedDeckCard[] {
  if (!Array.isArray(value)) return [];
  const cards: ImportedDeckCard[] = [];
  for (const row of value as unknown[]) {
    if (!isRecord(row)) continue;
    const arenaId = toPositiveInteger(row['cardId']);
    const count = toPositiveInteger(row['quantity']);
    if (arenaId !== undefined && count !== undefined) cards.push({ arenaId, count });
  }
  return cards;
}

function readFormat(attributes: unknown): string | undefined {
  if (!Array.isArray(attributes)) return undefined;
  for (const attribute of attributes as unknown[]) {
    if (isRecord(attribute) && attribute['name'] === 'Format' && typeof attribute['value'] === 'string') {
      return attribute['value'];
    }
  }
  return undefined;
}

/** Joins the deck summaries (name, format) with `Decks[DeckId]` (card lists). Summaries without a list are left out. */
function readDecks(hook: Record<string, unknown>): ImportedDeck[] {
  // The key was `DeckSummariesV2` until the April 2026 client.
  const summaries = hook['DeckSummaries'] ?? hook['DeckSummariesV2'];
  const lists = hook['Decks'];
  if (!Array.isArray(summaries) || !isRecord(lists)) return [];

  const decks: ImportedDeck[] = [];
  for (const summary of summaries as unknown[]) {
    if (!isRecord(summary)) continue;
    const id = summary['DeckId'];
    if (typeof id !== 'string') continue;
    const list = lists[id];
    if (!isRecord(list)) continue;

    const deck: ImportedDeck = {
      id,
      name: typeof summary['Name'] === 'string' ? summary['Name'] : '',
      mainDeck: readCards(list['MainDeck']),
      sideboard: readCards(list['Sideboard']),
      commandZone: readCards(list['CommandZone']),
      companions: readCards(list['Companions']),
    };
    const format = readFormat(summary['Attributes']);
    if (format !== undefined) deck.format = format;
    if (summary['IsNetDeck'] === true) deck.isNetDeck = true;
    decks.push(deck);
  }
  return decks;
}

export function parsePlayerLog(input: string): CollectionImport {
  const imp = emptyImport('player-log');

  if (input.includes('DETAILED LOGS: DISABLED')) {
    imp.warnings.push(`Detailed Logs are disabled, so this Player.log holds no wildcards or decks. ${ENABLE_DETAILED_LOGS}`);
    return imp;
  }
  if (!input.includes(START_HOOK)) {
    imp.warnings.push(`This Player.log has no login data (no StartHook response). ${ENABLE_DETAILED_LOGS}`);
    return imp;
  }

  const hook = findStartHook(input);
  if (!hook) {
    imp.warnings.push('The login data in this Player.log is cut off or unreadable. Close Arena, then copy Player.log again.');
    return imp;
  }
  if (hook.skipped > 0) {
    imp.warnings.push('The newest login data in this Player.log is cut off, so an earlier login in the same file was used.');
  }

  // The client leaves zero-valued keys out of InventoryInfo, so a missing key reads as 0.
  const hookInventory = hook.payload['InventoryInfo'];
  const inventory = findLaterInventory(input, hook.end) ?? (isRecord(hookInventory) ? hookInventory : undefined);
  if (inventory) {
    const amount = (key: string): number => toInteger(inventory[key]) ?? 0;
    imp.wildcards = {
      common: amount('WildCardCommons'),
      uncommon: amount('WildCardUnCommons'),
      rare: amount('WildCardRares'),
      mythic: amount('WildCardMythics'),
    };
    imp.gems = amount('Gems');
    imp.gold = amount('Gold');
    // Tenths of a percent.
    imp.vaultProgress = amount('TotalVaultProgress') / 10;
  }
  imp.decks = readDecks(hook.payload);

  imp.warnings.push('Player.log never contains the card collection: only wildcards and saved decks were imported.');
  return imp;
}
