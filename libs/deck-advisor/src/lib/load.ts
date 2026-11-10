import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { loadCardIndex } from '@mtg/card-index/node';
import type { MetaSnapshot } from '@mtg/meta-decks/types';
import type { AdvisorData } from './service';
import { TextModel } from './similarity';

export const DEFAULT_META_DIR = 'data/generated/meta';

export interface LoadAdvisorOptions {
  /** Card index file; defaults to `CARD_INDEX_PATH`, then data/generated/card-index.json.gz. */
  cardIndexPath?: string;
  /** Directory of `<format>.json` meta snapshots; defaults to `META_DIR`, then data/generated/meta. */
  metaDir?: string;
}

/**
 * Read the generated data the advisor runs on. The card index is required
 * (throws `CardIndexMissingError`); meta snapshots are optional, and a format
 * without one simply has no meta to show.
 */
export function loadAdvisorData(options: LoadAdvisorOptions = {}): AdvisorData {
  const index = loadCardIndex(options.cardIndexPath);
  const meta = new Map<string, MetaSnapshot>();

  const metaDir = resolve(options.metaDir ?? process.env['META_DIR'] ?? DEFAULT_META_DIR);
  if (existsSync(metaDir)) {
    for (const file of readdirSync(metaDir).filter(f => f.endsWith('.json')).sort()) {
      const snapshot = JSON.parse(readFileSync(join(metaDir, file), 'utf8')) as MetaSnapshot;
      meta.set(snapshot.format, snapshot);
    }
  }

  return { index, text: new TextModel(index), meta };
}
