/**
 * Builds the combo list the API loads at start-up: which cards make a combo,
 * what it does, and where it is legal.
 *
 * The combos are Commander Spellbook's (https://commanderspellbook.com). They
 * publish every variant as one bulk file and ask tools to read that instead
 * of calling their API, to name themselves in the User-Agent, to fetch it at
 * most daily, and to credit them with a link back. The steps of a combo are
 * not kept here: the UI links to its Commander Spellbook page for those.
 *
 * Usage: npx tsx --tsconfig tsconfig.json scripts/data/build-combos.ts [options]
 *   --out data/generated/combos.json.gz        output file
 *   --cache .cache/combos                      where the download is kept; reused while younger than 24 hours
 *   --cards data/generated/card-index.json.gz  card index (pnpm data:cards): which cards exist and where each is legal
 *   --offline                                  do not touch the network; use the cached download whatever its age
 *   --refresh                                  download again even though the cached copy is fresh (they ask for one fetch a day at most)
 */
import {
  closeSync,
  createReadStream,
  createWriteStream,
  existsSync,
  mkdirSync,
  openSync,
  readSync,
  renameSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { setFlagsFromString } from 'node:v8';
import { runInNewContext } from 'node:vm';
import { createGunzip, createGzip, gzipSync } from 'node:zlib';
import type { CardIndex } from '@mtg/card-index';
import { CardIndexMissingError, loadCardIndex } from '@mtg/card-index/node';
import { COMMANDER_SPELLBOOK_URL, CombosBuilder, JsonArraySplitter } from '@mtg/combos';
import type { CombosFile, SpellbookVariant } from '@mtg/combos';
import { loadCombos } from '@mtg/combos/node';

const VARIANTS_URL = 'https://json.commanderspellbook.com/variants.json.gz';
const HEADERS = { 'User-Agent': 'mtg-deck-builder/1.0 (+https://github.com/nsmaassel/mtg-deck-builder)' };
const MAX_DOWNLOAD_AGE_MS = 24 * 60 * 60 * 1000;
const UNKNOWN_CARDS_SHOWN = 5;

interface Options {
  out: string;
  cache: string;
  cards: string | undefined;
  offline: boolean;
  refresh: boolean;
}

class UsageError extends Error {}

function parseArgs(argv: string[]): Options {
  const options: Options = {
    out: 'data/generated/combos.json.gz',
    cache: '.cache/combos',
    cards: undefined,
    offline: false,
    refresh: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index] ?? '';
    const equals = arg.indexOf('=');
    const flag = equals === -1 ? arg : arg.slice(0, equals);
    const inline = equals === -1 ? undefined : arg.slice(equals + 1);
    const value = (): string => {
      const next = inline ?? argv[(index += 1)];
      if (next === undefined || next === '') throw new UsageError(`${flag} needs a value`);
      return next;
    };

    switch (flag) {
      case '--out':
        options.out = value();
        break;
      case '--cache':
        options.cache = value();
        break;
      case '--cards':
        options.cards = value();
        break;
      case '--offline':
        options.offline = true;
        break;
      case '--refresh':
        options.refresh = true;
        break;
      default:
        throw new UsageError(`unknown option ${arg}`);
    }
  }

  if (options.offline && options.refresh) throw new UsageError('--offline and --refresh cannot be used together');
  return options;
}

function megabytes(bytes: number): string {
  return `${(bytes / 1_000_000).toFixed(1)} MB`;
}

function loadCards(path: string | undefined): CardIndex {
  try {
    return loadCardIndex(path);
  } catch (err) {
    if (!(err instanceof CardIndexMissingError)) throw err;
    throw new Error(`${err.message}\nThe combos are checked against it: it says which cards exist and where each is legal.`);
  }
}

/** Returns the local copy of the bulk file, downloading it unless a recent enough copy is cached. */
async function ensureVariantsFile(options: Options): Promise<string> {
  const target = join(options.cache, 'variants.json.gz');
  const ageMs = existsSync(target) ? Date.now() - statSync(target).mtimeMs : undefined;
  const age = ageMs === undefined ? '' : `${(ageMs / 3_600_000).toFixed(1)} h old`;

  if (options.offline) {
    if (ageMs === undefined) throw new Error(`--offline: no download at ${target}`);
    console.log(`Using ${target} (${age})`);
    return target;
  }
  if (ageMs !== undefined && ageMs < MAX_DOWNLOAD_AGE_MS && !options.refresh) {
    console.log(`Using ${target} (${age}; fetched again once it is a day old)`);
    return target;
  }

  console.log(`Downloading ${VARIANTS_URL}`);
  mkdirSync(options.cache, { recursive: true });
  const res = await fetch(VARIANTS_URL, { headers: HEADERS });
  if (!res.ok || !res.body) throw new Error(`Download failed: ${res.status} ${res.statusText}`);
  const body = Readable.fromWeb(res.body as never);
  const partial = `${target}.part`;
  if (res.headers.has('content-encoding')) {
    // The server sends the file as a gzip-encoded JSON response, so fetch has already unzipped it:
    // what arrives is the full 730 MB. Zip it again rather than keep that in the cache.
    await pipeline(body, createGzip(), createWriteStream(partial));
  } else {
    await pipeline(body, createWriteStream(partial));
  }
  renameSync(partial, target);
  console.log(`  saved ${megabytes(statSync(target).size)} to ${target}`);
  return target;
}

function isGzipped(path: string): boolean {
  const head = Buffer.alloc(2);
  const fd = openSync(path, 'r');
  try {
    readSync(fd, head, 0, 2, 0);
  } finally {
    closeSync(fd);
  }
  return head[0] === 0x1f && head[1] === 0x8b;
}

/**
 * Passes the bulk file's variants to `onVariant` one at a time and returns its top-level stamps.
 * The file is 730 MB of JSON, more than one string can hold, so it is never whole in memory.
 */
async function readVariants(
  path: string,
  onVariant: (variant: SpellbookVariant) => void,
): Promise<{ timestamp: string; version: string }> {
  const splitter = new JsonArraySplitter('variants');
  try {
    const file = createReadStream(path);
    // Checked rather than assumed: a copy put in the cache by hand may be the plain JSON.
    const bytes: AsyncIterable<Buffer> = isGzipped(path) ? file.pipe(createGunzip()) : file;
    for await (const chunk of bytes) {
      for (const text of splitter.push(chunk)) onVariant(JSON.parse(text) as SpellbookVariant);
    }
    splitter.end();
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(`Could not read ${path}: ${reason}\nIf the download is damaged, run again with --refresh.`);
  }
  if (!splitter.found) {
    throw new Error(`${path} has no "variants" array: Commander Spellbook may have changed the layout of the file`);
  }

  const stamp = (key: string): string => {
    const value = splitter.scalars.get(key);
    return typeof value === 'string' ? value : '';
  };
  return { timestamp: stamp('timestamp'), version: stamp('version') };
}

/** Runs a full garbage collection. `pnpm data:combos` does not start node with --expose-gc, so the flag is set here. */
function collectGarbage(): void {
  if (!global.gc) {
    setFlagsFromString('--expose-gc');
    global.gc = runInNewContext('gc') as NonNullable<typeof global.gc>;
  }
  global.gc();
}

/** Loads the written file the way the API will and reports what keeping it costs. */
function measureLoad(path: string, expectedSize: number): string {
  collectGarbage();
  const before = process.memoryUsage();
  const started = performance.now();
  const combos = loadCombos(path);
  const elapsed = performance.now() - started;
  collectGarbage();
  const after = process.memoryUsage();

  if (combos.size !== expectedSize) {
    throw new Error(`${path} loads as ${combos.size} combos, expected ${expectedSize}`);
  }
  const held = after.heapUsed + after.arrayBuffers - (before.heapUsed + before.arrayBuffers);
  return (
    `${megabytes(held)} of heap and typed arrays once loaded (${Math.round(elapsed)} ms to load; ` +
    `process resident memory ${megabytes(before.rss)} before, ${megabytes(after.rss)} after)`
  );
}

function printSummary(builder: CombosBuilder, file: CombosFile): void {
  const { dropped } = builder;
  const line = (count: number, label: string): void => console.log(`  ${String(count).padStart(7)}  ${label}`);

  console.log(`\nCommander Spellbook bulk file: version ${file.source.version || '?'}, ${file.source.timestamp || 'no timestamp'}`);
  console.log(`Read ${builder.read} variants, kept ${builder.kept} combos. Left out:`);
  line(dropped.status, 'not published (status other than OK)');
  line(dropped['no-cards'], 'no specific card');
  line(dropped['unknown-card'], `a card the card index does not have (${builder.unknownCards.size} such cards)`);
  if (builder.unknownCards.size > 0) {
    const worst = [...builder.unknownCards].sort((a, b) => b[1] - a[1]).slice(0, UNKNOWN_CARDS_SHOWN);
    console.log(`           most often: ${worst.map(([name, count]) => `${name} (${count})`).join(', ')}`);
  }

  console.log('Combos legal per format:');
  file.formats.forEach((format, bit) => {
    line(file.combos.filter(combo => (combo.l & (1 << bit)) !== 0).length, format);
  });
  line(file.combos.filter(combo => combo.l === 0).length, '(no format)');

  console.log('Of the combos kept:');
  line(file.combos.filter(combo => combo.r !== undefined).length, 'also need a generic requirement');
  line(file.combos.filter(combo => combo.m !== undefined).length, 'need a card as the commander');
  line(file.combos.filter(combo => combo.n !== undefined).length, 'need more than one copy of a card');
  console.log(
    `Tables: ${file.cards.length} cards, ${file.requirements.length} generic requirements, ` +
      `${file.features.length} results, ${file.bracketTags.length} bracket tags`,
  );
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const out = resolve(options.out);

  // First, as it needs no network: without the card index there is nothing to check the combos against.
  const cards = loadCards(options.cards);
  console.log(`Card index: ${cards.size} cards, built ${cards.builtAt}`);

  const variantsPath = await ensureVariantsFile(options);
  const builder = new CombosBuilder(cards);
  const upstream = await readVariants(variantsPath, variant => builder.add(variant));
  if (!upstream.timestamp || !upstream.version) {
    console.warn('The bulk file no longer carries a timestamp and version; the combos file will not say how old its data is');
  }

  const file = builder.build(upstream);
  const json = JSON.stringify(file);
  mkdirSync(dirname(out), { recursive: true });
  // Written beside the target and moved into place, so a reader never sees half a file.
  writeFileSync(`${out}.part`, out.endsWith('.gz') ? gzipSync(json, { level: 9 }) : json);
  renameSync(`${out}.part`, out);

  printSummary(builder, file);
  console.log(`Wrote ${out} (${megabytes(statSync(out).size)}; ${megabytes(json.length)} of JSON)`);
  console.log(`Index: ${measureLoad(out, file.combos.length)}`);
  console.log(`Combo data: Commander Spellbook, ${COMMANDER_SPELLBOOK_URL}`);
}

main().catch(err => {
  if (err instanceof UsageError) {
    console.error(`${err.message}\nSee the header of scripts/data/build-combos.ts for the options.`);
    process.exit(2);
  }
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
