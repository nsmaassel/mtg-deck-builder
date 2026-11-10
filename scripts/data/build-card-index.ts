/**
 * Build the card index from Scryfall's bulk data.
 *
 * Downloads the `default_cards` and `oracle_tags` bulk files (gzipped JSON
 * Lines), folds ~120k printings into one record per card, and writes
 * data/generated/card-index.json.gz. Scryfall asks bulk consumers to fetch at
 * most daily, so downloads are cached by the bulk file's `updated_at`.
 *
 * Usage: npx tsx --tsconfig tsconfig.json scripts/data/build-card-index.ts
 *          [--out data/generated/card-index.json.gz] [--cache .cache/scryfall]
 *          [--cards <file.jsonl.gz>] [--tags <file.jsonl.gz>]   use local files, no network
 *          [--disable-tags <id,id>]                              Scryfall tag ids to leave out
 */
import { createReadStream, createWriteStream, existsSync, mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createGunzip, gzipSync } from 'node:zlib';
import { CardIndexBuilder } from '@mtg/card-index';
import type { ScryfallPrinting, ScryfallTag } from '@mtg/card-index';

const BULK_INDEX_URL = 'https://api.scryfall.com/bulk-data';
// Scryfall requires both headers and asks clients to name themselves.
const HEADERS = {
  'User-Agent': 'mtg-deck-builder/1.0 (https://github.com/nsmaassel/mtg-deck-builder)',
  Accept: 'application/json;q=0.9,*/*;q=0.8',
};

interface BulkEntry {
  type: string;
  updated_at: string;
  jsonl_download_uri?: string;
  download_uri?: string;
}

function parseArgs(argv: string[]): Record<string, string> {
  const args: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    if (!key?.startsWith('--')) continue;
    const value = argv[i + 1];
    if (value === undefined || value.startsWith('--')) throw new Error(`Missing value for ${key}`);
    args[key.slice(2)] = value;
    i++;
  }
  return args;
}

async function fetchBulkEntries(): Promise<BulkEntry[]> {
  const res = await fetch(BULK_INDEX_URL, { headers: HEADERS });
  if (!res.ok) throw new Error(`Scryfall bulk-data listing failed: ${res.status} ${res.statusText}`);
  const body = (await res.json()) as { data: BulkEntry[] };
  return body.data;
}

/** Download a bulk file unless the same `updated_at` is already cached. Returns the local path. */
async function ensureBulkFile(entry: BulkEntry, cacheDir: string): Promise<string> {
  const url = entry.jsonl_download_uri ?? entry.download_uri;
  if (!url) throw new Error(`Scryfall bulk entry "${entry.type}" has no download URL`);
  if (!url.endsWith('.jsonl.gz')) {
    throw new Error(`Expected a gzipped JSON Lines file for "${entry.type}", got ${url}`);
  }
  const stamp = entry.updated_at.replace(/[^0-9]/g, '').slice(0, 14);
  const target = join(cacheDir, `${entry.type}-${stamp}.jsonl.gz`);
  if (existsSync(target)) {
    console.log(`  ${entry.type}: cached (${entry.updated_at})`);
    return target;
  }
  console.log(`  ${entry.type}: downloading ${url}`);
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok || !res.body) throw new Error(`Download failed for ${entry.type}: ${res.status} ${res.statusText}`);
  const partial = `${target}.part`;
  await pipeline(Readable.fromWeb(res.body as never), createWriteStream(partial));
  renameSync(partial, target);
  return target;
}

async function* readJsonLines<T>(path: string): AsyncGenerator<T> {
  const lines = createInterface({ input: createReadStream(path).pipe(createGunzip()), crlfDelay: Infinity });
  for await (const line of lines) {
    if (line.trim()) yield JSON.parse(line) as T;
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const out = resolve(args['out'] ?? 'data/generated/card-index.json.gz');
  const cacheDir = resolve(args['cache'] ?? '.cache/scryfall');
  mkdirSync(cacheDir, { recursive: true });
  mkdirSync(dirname(out), { recursive: true });

  let cardsPath = args['cards'];
  let tagsPath = args['tags'];
  let cardsUpdatedAt: string | undefined;
  let tagsUpdatedAt: string | undefined;

  if (!cardsPath || !tagsPath) {
    console.log('Reading Scryfall bulk-data listing');
    const entries = await fetchBulkEntries();
    const find = (type: string): BulkEntry => {
      const entry = entries.find(e => e.type === type);
      if (!entry) throw new Error(`Scryfall no longer lists a "${type}" bulk file`);
      return entry;
    };
    if (!cardsPath) {
      const entry = find('default_cards');
      cardsPath = await ensureBulkFile(entry, cacheDir);
      cardsUpdatedAt = entry.updated_at;
    }
    if (!tagsPath) {
      const entry = find('oracle_tags');
      tagsPath = await ensureBulkFile(entry, cacheDir);
      tagsUpdatedAt = entry.updated_at;
    }
  }

  const builder = new CardIndexBuilder();
  let printings = 0;
  for await (const printing of readJsonLines<ScryfallPrinting>(cardsPath)) {
    builder.addPrinting(printing);
    printings++;
  }
  let tags = 0;
  for await (const tag of readJsonLines<ScryfallTag>(tagsPath)) {
    builder.addTag(tag);
    tags++;
  }

  const { file, unknownNoiseSlugs } = builder.buildWithReport({
    cardsUpdatedAt,
    tagsUpdatedAt,
    disabledTagIds: (args['disable-tags'] ?? '').split(',').map(s => s.trim()).filter(Boolean),
  });
  if (unknownNoiseSlugs.length) {
    console.warn(
      `Tag filter names ${unknownNoiseSlugs.length} tag(s) Scryfall no longer has (renamed?): ${unknownNoiseSlugs.join(', ')}`,
    );
  }
  const json = JSON.stringify(file);
  writeFileSync(out, out.endsWith('.gz') ? gzipSync(json, { level: 9 }) : json);

  const onArena = file.cards.filter(c => c.ar !== undefined).length;
  const tagged = file.cards.filter(c => c.g?.length).length;
  console.log(
    `Read ${printings} printings and ${tags} tags -> ${file.cards.length} cards ` +
      `(${onArena} on Arena, ${tagged} tagged, ${file.tags.length} tags kept)`,
  );
  console.log(`Wrote ${out} (${(json.length / 1e6).toFixed(1)} MB JSON)`);
}

main().catch(err => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
