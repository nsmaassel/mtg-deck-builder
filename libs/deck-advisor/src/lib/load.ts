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

export interface LoadedAdvisor {
  data: AdvisorData;
  /** Snapshot files that were skipped, with the reason. */
  warnings: string[];
}

/**
 * Read the generated data the advisor runs on. The card index is required
 * (throws `CardIndexMissingError`). Meta snapshots are optional: a format
 * without one has no meta to show, and an unreadable file is skipped with a
 * warning rather than taking the advisor down.
 */
export function loadAdvisorData(options: LoadAdvisorOptions = {}): LoadedAdvisor {
  const index = loadCardIndex(options.cardIndexPath);
  const meta = new Map<string, MetaSnapshot>();
  const warnings: string[] = [];

  const metaDir = resolve(options.metaDir ?? process.env['META_DIR'] ?? DEFAULT_META_DIR);
  if (existsSync(metaDir)) {
    for (const file of readdirSync(metaDir).filter(f => f.endsWith('.json')).sort()) {
      try {
        const snapshot = JSON.parse(readFileSync(join(metaDir, file), 'utf8')) as MetaSnapshot;
        if (typeof snapshot.format !== 'string' || !Array.isArray(snapshot.archetypes)) {
          throw new Error('not a meta snapshot');
        }
        meta.set(snapshot.format, snapshot);
      } catch (err) {
        warnings.push(`Skipped meta snapshot ${file}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  return { data: { index, text: new TextModel(index), meta }, warnings };
}
