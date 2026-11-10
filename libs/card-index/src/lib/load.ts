import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { CardIndex } from './card-index';
import type { CardIndexFile } from './types';

export const DEFAULT_CARD_INDEX_PATH = 'data/generated/card-index.json.gz';

export class CardIndexMissingError extends Error {
  constructor(path: string) {
    super(`Card index not found at ${path}. Build it with: pnpm data:cards`);
    this.name = 'CardIndexMissingError';
  }
}

/** Comma-separated tag slugs or ids to hide, the kill switch Scryfall asks tag consumers to have. */
function disabledTagsFromEnv(): string[] {
  return (process.env['MTG_DISABLED_TAGS'] ?? '').split(',').map(s => s.trim()).filter(Boolean);
}

/** Read a card index written by `scripts/data/build-card-index.ts` (`.json` or `.json.gz`). */
export function loadCardIndex(path = process.env['CARD_INDEX_PATH'] ?? DEFAULT_CARD_INDEX_PATH): CardIndex {
  const absolute = resolve(path);
  if (!existsSync(absolute)) throw new CardIndexMissingError(absolute);
  const raw = readFileSync(absolute);
  const json = absolute.endsWith('.gz') ? gunzipSync(raw).toString('utf8') : raw.toString('utf8');
  return new CardIndex(JSON.parse(json) as CardIndexFile, { disabledTags: disabledTagsFromEnv() });
}
