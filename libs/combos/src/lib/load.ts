import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { ComboIndex } from './combo-index';
import type { CombosFile } from './types';

export const DEFAULT_COMBOS_PATH = 'data/generated/combos.json.gz';

export class CombosMissingError extends Error {
  constructor(path: string) {
    super(`Combos not found at ${path}. Build them with: pnpm data:combos`);
    this.name = 'CombosMissingError';
  }
}

/** Read the combos written by `scripts/data/build-combos.ts` (`.json` or `.json.gz`). */
export function loadCombos(path = process.env['COMBOS_PATH'] ?? DEFAULT_COMBOS_PATH): ComboIndex {
  const absolute = resolve(path);
  if (!existsSync(absolute)) throw new CombosMissingError(absolute);
  const raw = readFileSync(absolute);
  const json = absolute.endsWith('.gz') ? gunzipSync(raw).toString('utf8') : raw.toString('utf8');
  return ComboIndex.fromFile(JSON.parse(json) as CombosFile);
}
