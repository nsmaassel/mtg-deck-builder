import type { CollectionImport, CollectionSourceFormat } from './types';

export const MAX_UNRECOGNIZED_LINES = 50;
const MAX_UNRECOGNIZED_LENGTH = 200;

export function emptyImport(format: CollectionSourceFormat): CollectionImport {
  return { format, entries: [], warnings: [], unrecognizedLines: [] };
}

export function clip(text: string, max = MAX_UNRECOGNIZED_LENGTH): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

export interface UnrecognizedLines {
  add(line: string): void;
  /** Moves the kept lines onto the import, with a warning when some had to be dropped. */
  writeTo(imp: CollectionImport): void;
}

export function collectUnrecognized(): UnrecognizedLines {
  const kept: string[] = [];
  let total = 0;
  return {
    add(line) {
      total += 1;
      if (kept.length < MAX_UNRECOGNIZED_LINES) kept.push(clip(line));
    },
    writeTo(imp) {
      imp.unrecognizedLines = kept;
      if (total > kept.length) {
        imp.warnings.push(`${total} lines could not be read. Only the first ${kept.length} are listed.`);
      }
    },
  };
}

export function stripBom(input: string): string {
  return input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
}

/** Yields lines one at a time (LF, CRLF or lone CR) so callers can stop early on large inputs. */
export function* eachLine(input: string): Generator<string> {
  const lineBreak = /\r\n|\n|\r/g;
  let start = 0;
  for (let match = lineBreak.exec(input); match; match = lineBreak.exec(input)) {
    yield input.slice(start, match.index);
    start = match.index + match[0].length;
  }
  yield input.slice(start);
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Reads a whole number from a JSON number or a numeric string. */
export function toInteger(value: unknown): number | undefined {
  if (typeof value === 'number') return Number.isSafeInteger(value) ? value : undefined;
  if (typeof value !== 'string' || !/^\s*[+-]?\d{1,15}\s*$/.test(value)) return undefined;
  return parseInt(value, 10);
}

export function toPositiveInteger(value: unknown): number | undefined {
  const n = toInteger(value);
  return n !== undefined && n > 0 ? n : undefined;
}
