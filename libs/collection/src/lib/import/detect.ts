import { hasArenaTextLine } from './arena-text';
import { looksLikeCollectionCsv } from './csv';
import { jsonFormatOf } from './json';
import { looksLikePlayerLog } from './player-log';
import { stripBom } from './shared';
import type { CollectionSourceFormat } from './types';

/**
 * Works out which kind of export the text is, or returns null when it is none of them.
 * The Player.log check comes first because a log excerpt can start with `[UnityCrossThreadLogger]`,
 * which would otherwise pass for the start of a JSON array.
 */
export function detectCollectionFormat(input: string): CollectionSourceFormat | null {
  if (typeof input !== 'string') return null;
  const text = stripBom(input);

  if (looksLikePlayerLog(text)) return 'player-log';

  const first = /\S/.exec(text)?.[0];
  if (first === '{' || first === '[') return jsonFormatOf(text);

  if (looksLikeCollectionCsv(text)) return 'csv';
  return hasArenaTextLine(text) ? 'arena-text' : null;
}
