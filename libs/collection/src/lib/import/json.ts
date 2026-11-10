import { clip, collectUnrecognized, emptyImport, isRecord, toInteger, toPositiveInteger } from './shared';
import type { CollectionEntry, CollectionImport, Wildcards } from './types';

export type JsonFormat = 'grpid-json' | 'named-json';

// Keys are compared lowercased with punctuation removed, so `grpId`, `grpid`, `arena_id` and `Arena Id` all match.
const ID_KEYS = ['grpid', 'arenaid', 'mtgaid', 'id'];
const ID_LIST_KEYS = ['arenaids', 'grpids'];
const COUNT_KEYS = ['owned', 'qty', 'quantity', 'count', 'amount'];
const NAME_KEYS = ['name', 'cardname', 'title'];
const SET_KEYS = ['setcode', 'set', 'edition', 'expansioncode'];
const NUMBER_KEYS = ['collectornumber', 'cn'];

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function normalizeKeys(row: Record<string, unknown>): Map<string, unknown> {
  const fields = new Map<string, unknown>();
  for (const [key, value] of Object.entries(row)) {
    const normalized = normalizeKey(key);
    if (!fields.has(normalized)) fields.set(normalized, value);
  }
  return fields;
}

function pick(fields: Map<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    const value = fields.get(key);
    if (value !== undefined && value !== null) return value;
  }
  return undefined;
}

function pickText(fields: Map<string, unknown>, keys: string[]): string | undefined {
  const value = pick(fields, keys);
  if (typeof value === 'number') return String(value);
  if (typeof value !== 'string') return undefined;
  return value.trim() || undefined;
}

function rowName(fields: Map<string, unknown>): string | undefined {
  const value = pick(fields, NAME_KEYS);
  return typeof value === 'string' ? value.trim() || undefined : undefined;
}

function rowArenaId(fields: Map<string, unknown>): number | undefined {
  const id = toPositiveInteger(pick(fields, ID_KEYS));
  if (id !== undefined) return id;
  // A list holds one id per printing of the same card. The row's count already covers all of
  // them, so only the first is kept.
  const ids = pick(fields, ID_LIST_KEYS);
  return Array.isArray(ids) ? toPositiveInteger(ids[0]) : undefined;
}

/** Returns the entry, `'ignored'` for a row with a count of zero or less, or null for an unreadable row. */
function readRow(row: unknown): CollectionEntry | 'ignored' | null {
  if (!isRecord(row)) return null;
  const fields = normalizeKeys(row);

  const count = toInteger(pick(fields, COUNT_KEYS));
  if (count === undefined) return null;
  if (count <= 0) return 'ignored';

  const name = rowName(fields);
  const arenaId = rowArenaId(fields);
  if (name === undefined && arenaId === undefined) return null;

  const entry: CollectionEntry = { count };
  if (name !== undefined) entry.name = name;
  if (arenaId !== undefined) entry.arenaId = arenaId;
  const set = pickText(fields, SET_KEYS);
  if (set !== undefined) entry.set = set;
  const collectorNumber = pickText(fields, NUMBER_KEYS);
  if (collectorNumber !== undefined) entry.collectorNumber = collectorNumber;
  return entry;
}

function readWildcards(value: unknown): Wildcards | undefined {
  if (!isRecord(value)) return undefined;
  const fields = normalizeKeys(value);
  const rarities = ['common', 'uncommon', 'rare', 'mythic'].map((key) => toInteger(fields.get(key)));
  if (rarities.every((n) => n === undefined)) return undefined;
  const [common = 0, uncommon = 0, rare = 0, mythic = 0] = rarities;
  return { common, uncommon, rare, mythic };
}

/** The card rows of a parsed file: a bare array, or the `cards` array of a wrapper object. */
function rowsOf(value: unknown): unknown[] | undefined {
  if (Array.isArray(value)) return value;
  if (isRecord(value) && Array.isArray(value['cards'])) return value['cards'];
  return undefined;
}

function hasName(row: unknown): boolean {
  return isRecord(row) && rowName(normalizeKeys(row)) !== undefined;
}

function sniffFormat(input: string): JsonFormat {
  return /"(?:name|card_?name|title)"\s*:/i.test(input.slice(0, 100_000)) ? 'named-json' : 'grpid-json';
}

function tryParse(input: string): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(input) as unknown };
  } catch {
    return { ok: false };
  }
}

/** Which JSON flavour the text is. Text that is not valid JSON is classified by the keys it mentions. */
export function jsonFormatOf(input: string): JsonFormat {
  const parsed = tryParse(input);
  if (!parsed.ok) return sniffFormat(input);
  return rowsOf(parsed.value)?.some(hasName) ? 'named-json' : 'grpid-json';
}

export function parseCollectionJson(input: string, format?: JsonFormat): CollectionImport {
  const parsed = tryParse(input);
  if (!parsed.ok) {
    const imp = emptyImport(format ?? sniffFormat(input));
    imp.warnings.push(
      input.trim() === ''
        ? 'Nothing to import: the input is empty.'
        : 'This looks like JSON but it is not complete or not valid. Copy the whole file and try again.',
    );
    return imp;
  }

  const { value } = parsed;
  const imp = emptyImport(format ?? 'grpid-json');
  const unrecognized = collectUnrecognized();
  const rows = rowsOf(value);

  if (rows) {
    if (format === undefined && rows.some(hasName)) imp.format = 'named-json';
    for (const row of rows) {
      const entry = readRow(row);
      if (entry === null) unrecognized.add(JSON.stringify(row));
      else if (entry !== 'ignored') imp.entries.push(entry);
    }
  } else if (isRecord(value) && typeof value['error'] === 'string') {
    // mtga-tracker-daemon answers every failed memory read with {"error": "<exception text>"}.
    imp.warnings.push(
      `The collection reader reported an error instead of a collection: "${clip(value['error'])}". ` +
        'Make sure Arena is running and logged in, then export again.',
    );
    return imp;
  } else if (isRecord(value)) {
    // A bare {"<grpId>": count} map, possibly under a `cards` key.
    const map = isRecord(value['cards']) ? value['cards'] : value;
    for (const [key, raw] of Object.entries(map)) {
      const arenaId = /^\d+$/.test(key) ? toPositiveInteger(key) : undefined;
      const count = toInteger(raw);
      if (arenaId === undefined || count === undefined) unrecognized.add(`${JSON.stringify(key)}: ${JSON.stringify(raw)}`);
      else if (count > 0) imp.entries.push({ count, arenaId });
    }
  }

  if (isRecord(value)) {
    const wildcards = readWildcards(value['wildcards']);
    if (wildcards) imp.wildcards = wildcards;
  }

  unrecognized.writeTo(imp);
  if (imp.entries.length === 0) imp.warnings.push('No cards were found in this JSON.');
  return imp;
}
