import { parseArenaText } from './arena-text';
import { parseCollectionCsv } from './csv';
import { detectCollectionFormat } from './detect';
import { parseCollectionJson } from './json';
import { parsePlayerLog } from './player-log';
import { stripBom } from './shared';
import type { CollectionImport, CollectionSourceFormat } from './types';

export interface ImportCollectionOptions {
  /** Skip detection and read the input as this format. */
  format?: CollectionSourceFormat;
}

function parseAs(text: string, format: CollectionSourceFormat): CollectionImport {
  switch (format) {
    case 'arena-text':
      return parseArenaText(text);
    case 'grpid-json':
    case 'named-json':
      return parseCollectionJson(text, format);
    case 'csv':
      return parseCollectionCsv(text);
    case 'player-log':
      return parsePlayerLog(text);
    default:
      throw new Error(`Unknown collection format: ${String(format)}`);
  }
}

/**
 * Reads a collection export in any supported format. Bad input never throws: whatever could be
 * read is returned, with the rest in `unrecognizedLines` and an explanation in `warnings`.
 * Only an unknown explicit `opts.format` throws.
 */
export function importCollection(input: string, opts: ImportCollectionOptions = {}): CollectionImport {
  const text = typeof input === 'string' ? stripBom(input) : '';
  if (opts.format !== undefined) return parseAs(text, opts.format);

  const detected = detectCollectionFormat(text);
  if (detected !== null) return parseAs(text, detected);

  // Unknown input is reported in the arena-text shape, which lists the lines it could not read.
  const warning =
    text.trim() === ''
      ? 'Nothing to import: the input is empty.'
      : 'This is not a format we can read. Supported: an Arena-style card list, ' +
        'a collection JSON or CSV export from a tracker, or Player.log.';
  return { ...parseArenaText(text), warnings: [warning] };
}
