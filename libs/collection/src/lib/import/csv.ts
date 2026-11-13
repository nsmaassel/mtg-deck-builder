import { clip, collectUnrecognized, eachLine, emptyImport, stripBom, toPositiveInteger } from './shared';
import type { CollectionEntry, CollectionImport } from './types';

export interface CsvRecord {
  fields: string[];
  /** The record as written, for reporting rows that could not be read. */
  raw: string;
}

/**
 * Minimal RFC 4180 reader: quoted fields may hold the delimiter, line breaks and `""` for a quote.
 * Lenient about what real exports get wrong: an unterminated quote runs to the end of the input,
 * and text after a closing quote is kept.
 */
export function readCsv(input: string, delimiter: string): CsvRecord[] {
  const records: CsvRecord[] = [];
  const end = input.length;
  let pos = 0;

  while (pos < end) {
    const recordStart = pos;
    const fields: string[] = [];

    for (;;) {
      let field = '';
      if (input[pos] === '"') {
        pos += 1;
        for (;;) {
          const quote = input.indexOf('"', pos);
          if (quote === -1) {
            field += input.slice(pos);
            pos = end;
            break;
          }
          field += input.slice(pos, quote);
          pos = quote + 1;
          if (input[pos] !== '"') break;
          field += '"';
          pos += 1;
        }
      }
      const plainStart = pos;
      while (pos < end && input[pos] !== delimiter && input[pos] !== '\n' && input[pos] !== '\r') pos += 1;
      fields.push(field + input.slice(plainStart, pos));

      if (input[pos] !== delimiter) break;
      pos += 1;
    }

    records.push({ fields, raw: input.slice(recordStart, pos) });
    pos += input[pos] === '\r' && input[pos + 1] === '\n' ? 2 : 1;
  }
  return records;
}

// Headers are compared lowercased with spaces, underscores, hyphens and dots removed. Earlier
// aliases win when a file has several candidates. The lists go beyond the exports seen so far on
// purpose: Untapped's premium CSV export has not been seen, and a near-miss header should still import.
const COLUMN_ALIASES = {
  // `printcount` first: Untapped.gg writes one row per printing with both `Count` (copies of the
  // card across all its printings, repeated on every row) and `PrintCount` (copies of this
  // printing). Rows are summed, so only the second adds up to what the player owns.
  count: ['printcount', 'count', 'quantity', 'qty', 'owned', 'amount', 'copies', 'numberowned', 'quantityowned'],
  name: ['name', 'card', 'cardname', 'title'],
  set: ['edition', 'editioncode', 'set', 'setcode', 'expansion', 'expansioncode'],
  number: ['collectornumber', 'cardnumber', 'number', 'cn'],
  arenaId: ['arenaid', 'grpid', 'mtgaid', 'id'],
} as const;

type Column = keyof typeof COLUMN_ALIASES;
type ColumnMap = Record<Column, number>;

function normalizeHeader(header: string): string {
  return header.toLowerCase().replace(/[\s_\-.]/g, '');
}

function mapColumns(headers: string[]): ColumnMap {
  const normalized = headers.map(normalizeHeader);
  const find = (aliases: readonly string[]): number => {
    for (const alias of aliases) {
      const index = normalized.indexOf(alias);
      if (index !== -1) return index;
    }
    return -1;
  };
  return {
    count: find(COLUMN_ALIASES.count),
    name: find(COLUMN_ALIASES.name),
    set: find(COLUMN_ALIASES.set),
    number: find(COLUMN_ALIASES.number),
    arenaId: find(COLUMN_ALIASES.arenaId),
  };
}

const DELIMITERS = [',', ';', '\t'];

/** Picks the candidate that occurs most often outside quotes in the header line. Comma wins ties. */
function sniffDelimiter(headerLine: string): string {
  const counts = new Map<string, number>(DELIMITERS.map((d) => [d, 0]));
  let quoted = false;
  for (const ch of headerLine) {
    if (ch === '"') quoted = !quoted;
    else if (!quoted && counts.has(ch)) counts.set(ch, (counts.get(ch) ?? 0) + 1);
  }
  let best = ',';
  for (const delimiter of DELIMITERS) {
    if ((counts.get(delimiter) ?? 0) > (counts.get(best) ?? 0)) best = delimiter;
  }
  return best;
}

function firstNonEmptyLine(input: string): string | undefined {
  for (const line of eachLine(input)) {
    if (line.trim() !== '') return line;
  }
  return undefined;
}

const MAX_HEADER_LENGTH = 2000;

/**
 * True when the first non-empty line is a header row we can import from: a card name or Arena id
 * column plus at least one other column we understand.
 */
export function looksLikeCollectionCsv(input: string): boolean {
  const headerLine = firstNonEmptyLine(stripBom(input));
  if (headerLine === undefined || headerLine.length > MAX_HEADER_LENGTH) return false;

  const header = readCsv(headerLine, sniffDelimiter(headerLine))[0];
  if (!header || header.fields.length < 2) return false;

  const columns = mapColumns(header.fields);
  const recognized = Object.values(columns).filter((index) => index !== -1).length;
  return recognized >= 2 && (columns.name !== -1 || columns.arenaId !== -1);
}

function parseCount(cell: string): number | undefined {
  const digits = /^([+-]?\d{1,15})(?:\.0+)?x?$/i.exec(cell)?.[1];
  return digits === undefined ? undefined : parseInt(digits, 10);
}

export function parseCollectionCsv(input: string): CollectionImport {
  const imp = emptyImport('csv');
  const text = stripBom(input);
  const headerLine = firstNonEmptyLine(text);
  if (headerLine === undefined) {
    imp.warnings.push('Nothing to import: the input is empty.');
    return imp;
  }

  const delimiter = sniffDelimiter(headerLine);
  const records = readCsv(text, delimiter);
  const isBlank = (record: CsvRecord) => record.fields.every((field) => field.trim() === '');
  const headerIndex = records.findIndex((record) => !isBlank(record));
  const header = records[headerIndex];
  if (!header) {
    imp.warnings.push('Nothing to import: the input is empty.');
    return imp;
  }

  const columns = mapColumns(header.fields);
  if (columns.name === -1 && columns.arenaId === -1) {
    const found = header.fields.slice(0, 30).map((field) => clip(field.trim(), 40));
    imp.warnings.push(
      `No card name or Arena id column was found, so nothing could be imported. Columns in this file: ${found.join(', ')}.`,
    );
    return imp;
  }
  if (columns.count === -1) {
    imp.warnings.push('No count column was found, so every row was counted as one copy.');
  }
  if (delimiter === ';' && header.fields.map(normalizeHeader).join(';') === 'count;name;edition;collectornumber;rarity') {
    imp.warnings.push(
      'This looks like an MTG Arena Tool export, which leaves out basic lands and, ' +
        'unless "export digital" was ticked, digital-only cards.',
    );
  }

  const unrecognized = collectUnrecognized();
  for (const record of records.slice(headerIndex + 1)) {
    if (isBlank(record)) continue;
    const cell = (index: number): string => (index === -1 ? '' : (record.fields[index] ?? '').trim());

    const count = columns.count === -1 ? 1 : parseCount(cell(columns.count));
    const name = cell(columns.name);
    const arenaId = toPositiveInteger(cell(columns.arenaId));
    if (count === undefined || (name === '' && arenaId === undefined)) {
      unrecognized.add(record.raw);
      continue;
    }
    if (count <= 0) continue;

    const entry: CollectionEntry = { count };
    if (name !== '') entry.name = name;
    if (arenaId !== undefined) entry.arenaId = arenaId;
    const set = cell(columns.set);
    if (set !== '') entry.set = set;
    const collectorNumber = cell(columns.number);
    if (collectorNumber !== '') entry.collectorNumber = collectorNumber;
    imp.entries.push(entry);
  }

  unrecognized.writeTo(imp);
  if (imp.entries.length === 0) imp.warnings.push('No card rows were found in this CSV.');
  return imp;
}
