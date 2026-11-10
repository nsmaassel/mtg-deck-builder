/**
 * Builds the per-format meta snapshots the API loads at start-up: archetypes
 * with meta share, tournament win rate, card frequencies and lists to copy.
 *
 * Inputs are third-party community data, cloned into the cache directory at
 * build time and never committed:
 *   - decklists: https://github.com/Jiliac/MTGODecklistCache (mtgo.com and melee.gg events)
 *   - archetype definitions: MTGOFormatData (repository and branch are options)
 *
 * Usage: npx tsx --tsconfig tsconfig.json scripts/data/build-meta.ts [options]
 *   --format standard,pioneer    formats to build; repeatable or a comma list (default standard,pioneer)
 *   --days 45                    window length in days; the window ends at the newest event found
 *   --out data/generated/meta    output directory, one <format>.json per format
 *   --cache .cache/meta-sources  where the sources are cloned
 *   --rules-repo owner/name      GitHub repository of the archetype definitions
 *   --rules-branch name          branch of that repository
 *   --min-decks 3                archetypes with fewer lists are folded into an Other bucket
 *   --min-matches 50             matches an archetype needs before its win rate is reported
 *   --offline                    do not touch the network; use what is already in the cache
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import {
  META_FORMATS,
  buildMetaSnapshot,
  cacheSparsePaths,
  classifyDeck,
  loadFormatRules,
  readTournamentCache,
  selectWindow,
  slugify,
} from '@mtg/meta-decks';
import type {
  ClassificationKind,
  FormatRules,
  FormatWindow,
  MetaFormat,
  MetaSnapshot,
  MetaSource,
} from '@mtg/meta-decks';

const DECKLIST_REPO = 'Jiliac/MTGODecklistCache';
const DECKLIST_BRANCH = 'master';

// The branch with the newest Standard definitions when this was written (2026-11): the upstream
// Badaro/MTGOFormatData stopped at 2026-09, its maintainer's fork keeps updating this branch.
const DEFAULT_RULES_REPO = 'Jiliac/MTGOFormatData';
const DEFAULT_RULES_BRANCH = 'july-26';

const USER_AGENT_SUFFIX = 'mtg-deck-builder-build-meta/0.1 (+https://github.com/nsmaassel/mtg-deck-builder)';

const DAY_MS = 86_400_000;
const STALE_AFTER_DAYS = 14;
const TOP_ARCHETYPES = 10;

interface Options {
  formats: MetaFormat[];
  days: number;
  out: string;
  cache: string;
  rulesRepo: string;
  rulesBranch: string;
  minDecks: number;
  minMatches: number;
  offline: boolean;
}

class UsageError extends Error {}

function isMetaFormat(value: string): value is MetaFormat {
  return (META_FORMATS as readonly string[]).includes(value);
}

function positiveInteger(flag: string, value: string): number {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1) throw new UsageError(`${flag} needs a whole number of 1 or more`);
  return number;
}

function parseArgs(argv: string[]): Options {
  const options: Options = {
    formats: [],
    days: 45,
    out: 'data/generated/meta',
    cache: '.cache/meta-sources',
    rulesRepo: DEFAULT_RULES_REPO,
    rulesBranch: DEFAULT_RULES_BRANCH,
    minDecks: 3,
    minMatches: 50,
    offline: false,
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
      case '--format':
        for (const name of value().split(',')) {
          const format = name.trim().toLowerCase();
          if (!isMetaFormat(format)) {
            throw new UsageError(`unknown format "${name}" (known: ${META_FORMATS.join(', ')})`);
          }
          if (!options.formats.includes(format)) options.formats.push(format);
        }
        break;
      case '--days':
        options.days = positiveInteger(flag, value());
        break;
      case '--out':
        options.out = value();
        break;
      case '--cache':
        options.cache = value();
        break;
      case '--rules-repo':
        options.rulesRepo = value();
        break;
      case '--rules-branch':
        options.rulesBranch = value();
        break;
      case '--min-decks':
        options.minDecks = positiveInteger(flag, value());
        break;
      case '--min-matches':
        options.minMatches = positiveInteger(flag, value());
        break;
      case '--offline':
        options.offline = true;
        break;
      default:
        throw new UsageError(`unknown option ${arg}`);
    }
  }

  if (options.formats.length === 0) options.formats = ['standard', 'pioneer'];
  // Both values end up in git arguments and a directory name.
  if (!/^[\w.-]+\/[\w.-]+$/.test(options.rulesRepo)) throw new UsageError('--rules-repo must look like owner/name');
  if (!/^\w[\w./-]*$/.test(options.rulesBranch)) throw new UsageError('--rules-branch is not a valid branch name');
  return options;
}

let gitVersion: string | undefined;

function git(args: string[], repoDir?: string): string {
  gitVersion ??= execFileSync('git', ['--version'], { encoding: 'utf8' }).trim().split(' ').pop() ?? '';
  return execFileSync('git', args, {
    cwd: repoDir,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
    env: {
      ...process.env,
      GIT_TERMINAL_PROMPT: '0',
      GIT_HTTP_USER_AGENT: `git/${gitVersion} ${USER_AGENT_SUFFIX}`,
      // The cache lives inside this repository's working tree. Without a ceiling, a git command run
      // in a cache folder that is not (or no longer) a clone would act on this repository instead.
      ...(repoDir === undefined ? {} : { GIT_CEILING_DIRECTORIES: dirname(resolve(repoDir)) }),
    },
  }).trim();
}

function isClone(dir: string): boolean {
  return existsSync(join(dir, '.git'));
}

function requireCloneOrNothing(dir: string): void {
  if (existsSync(dir) && !isClone(dir)) {
    throw new Error(`${dir} exists but is not a git clone; remove it and run again`);
  }
}

/** Moves a shallow clone to the tip of its branch without ever merging: the old tip is unrelated history. */
function updateToBranchTip(dir: string, branch: string): void {
  git(['fetch', '--quiet', '--depth', '1', 'origin', branch], dir);
  git(['checkout', '--quiet', '--detach', 'FETCH_HEAD'], dir);
}

function ensureDecklists(options: Options, today: string): string {
  const dir = join(options.cache, 'decklists');
  if (options.offline) {
    if (!existsSync(join(dir, 'Tournaments'))) throw new Error(`--offline: no decklists in ${dir}`);
    return dir;
  }

  // Month folders only: a full checkout of the cache is several hundred megabytes, a full clone more.
  const paths = cacheSparsePaths({ until: today, days: options.days });
  requireCloneOrNothing(dir);
  if (isClone(dir)) {
    console.log(`Updating decklists in ${dir}`);
    updateToBranchTip(dir, DECKLIST_BRANCH);
  } else {
    console.log(`Cloning ${DECKLIST_REPO} (sparse) into ${dir}`);
    mkdirSync(options.cache, { recursive: true });
    const url = `https://github.com/${DECKLIST_REPO}.git`;
    git(['clone', '--quiet', '--depth', '1', '--filter=blob:none', '--sparse', '--branch', DECKLIST_BRANCH, url, dir]);
  }
  git(['sparse-checkout', 'set', ...paths], dir);
  return dir;
}

function ensureRules(options: Options): string {
  const dir = join(options.cache, `rules-${slugify(`${options.rulesRepo}-${options.rulesBranch}`)}`);
  if (options.offline) {
    if (!existsSync(join(dir, 'Formats'))) throw new Error(`--offline: no archetype rules in ${dir}`);
    return dir;
  }

  requireCloneOrNothing(dir);
  if (isClone(dir)) {
    console.log(`Updating archetype rules in ${dir}`);
    updateToBranchTip(dir, options.rulesBranch);
  } else {
    console.log(`Cloning ${options.rulesRepo}@${options.rulesBranch} into ${dir}`);
    mkdirSync(options.cache, { recursive: true });
    const url = `https://github.com/${options.rulesRepo}.git`;
    git(['clone', '--quiet', '--depth', '1', '--branch', options.rulesBranch, url, dir]);
  }
  return dir;
}

/** Short hash and date of the checked-out commit, for the attribution note and the summary. */
function describeCommit(dir: string): string | undefined {
  if (!isClone(dir)) return undefined;
  try {
    return git(['log', '-1', '--format=%h, %cs'], dir);
  } catch {
    return undefined;
  }
}

function percent(share: number): string {
  return `${(share * 100).toFixed(1)}%`;
}

function sizeOf(path: string): string {
  const bytes = statSync(path).size;
  return bytes >= 1_000_000 ? `${(bytes / 1_000_000).toFixed(2)} MB` : `${Math.round(bytes / 1000)} kB`;
}

function printSummary(
  snapshot: MetaSnapshot,
  window: FormatWindow,
  matched: Record<ClassificationKind, number>,
  rulesLabel: string,
): void {
  const total = snapshot.totalDecks;
  const leagues = window.events.filter((event) => !event.hasStandings).length;
  const leagueLists = window.decks.filter((deck) => deck.wins === undefined).length;
  const others = snapshot.archetypes.filter((archetype) => archetype.isOther);
  const otherLists = others.reduce((sum, archetype) => sum + archetype.deckCount, 0);
  const share = (count: number) => (total === 0 ? '0.0%' : percent(count / total));

  console.log(
    `\n${snapshot.format.toUpperCase()}  events ${snapshot.from} → ${snapshot.to} ` +
      `(window ${window.from} → ${window.to})`,
  );
  console.log(
    `  events ${snapshot.eventCount} (${leagues} without standings) · lists ${total} ` +
      `(${leagueLists} without a match record) · incomplete lists skipped ${window.incompleteDecks}`,
  );
  console.log(`  rules ${rulesLabel}`);
  console.log(
    `  matched by rule ${share(matched.archetype)} · by fallback ${share(matched.fallback)} · ` +
      `unmatched ${share(matched.other)}`,
  );
  if (snapshot.fieldWinRate !== undefined) {
    // Not 50%: mtgo.com events publish only their top finishers' lists and standings.
    console.log(
      `  win rate of all lists with a record ${percent(snapshot.fieldWinRate)} (the baseline for the column below)`,
    );
  }

  console.log('   #  archetype                        lists   share  win rate  matches');
  snapshot.archetypes.slice(0, TOP_ARCHETYPES).forEach((archetype, index) => {
    const matches = archetype.matchWins + archetype.matchLosses;
    const winRate = archetype.winRate === undefined ? '—' : percent(archetype.winRate);
    console.log(
      `  ${String(index + 1).padStart(2)}  ${archetype.name.padEnd(30)} ${String(archetype.deckCount).padStart(7)} ` +
        `${percent(archetype.metaShare).padStart(7)} ${winRate.padStart(9)} ${String(matches).padStart(8)}`,
    );
  });
  console.log(
    `  ${snapshot.archetypes.length - others.length} archetypes · Other buckets: ${others.length} with ` +
      `${otherLists} lists, ${share(otherLists)} of the field (unmatched lists plus archetypes under the minimum)`,
  );
}

function main(): void {
  const options = parseArgs(process.argv.slice(2));
  const now = Date.now();
  const today = new Date(now).toISOString().slice(0, 10);
  // A day of slack: an event on the far side of the date line is not in the future.
  const notAfter = new Date(now + DAY_MS).toISOString().slice(0, 10);

  const decklistDir = ensureDecklists(options, today);
  const rulesDir = ensureRules(options);
  const rulesCommit = describeCommit(rulesDir);
  const rulesLabel = `${options.rulesRepo}@${options.rulesBranch}${rulesCommit ? ` (${rulesCommit})` : ''}`;

  const sources: MetaSource[] = [
    {
      name: 'MTGODecklistCache',
      url: `https://github.com/${DECKLIST_REPO}`,
      note: 'Community cache of decklists published on mtgo.com and melee.gg.',
    },
    {
      name: 'MTGOFormatData',
      url: `https://github.com/${options.rulesRepo}/tree/${options.rulesBranch}`,
      note:
        'Community archetype definitions, applied with the matching rules of MTGOArchetypeParser' +
        (rulesCommit ? ` (definitions at commit ${rulesCommit}).` : '.'),
    },
  ];

  const cache = readTournamentCache(join(decklistDir, 'Tournaments'), { formats: options.formats });
  console.log(
    `Read ${cache.filesRead} cache files: ${cache.tournaments.length} events of the requested formats, ` +
      `${cache.duplicateFiles} duplicate files merged, ${cache.unreadableFiles.length} unreadable`,
  );

  const generatedAt = new Date(now).toISOString();
  let failed = false;
  mkdirSync(options.out, { recursive: true });

  for (const format of options.formats) {
    let rules: FormatRules;
    try {
      rules = loadFormatRules(join(rulesDir, 'Formats'), format);
    } catch (error) {
      console.error(`\n${format.toUpperCase()}: ${error instanceof Error ? error.message : String(error)}`);
      failed = true;
      continue;
    }
    // The colour table doubles as the list of card names in the spelling the rules expect.
    const knownCards = new Set([...rules.colors.lands.keys(), ...rules.colors.nonLands.keys()]);
    const window = selectWindow(cache.tournaments, { format, days: options.days, notAfter, knownCards });
    if (!window || window.decks.length === 0) {
      console.error(`\n${format.toUpperCase()}: no events in the cache, nothing written`);
      failed = true;
      continue;
    }

    const matched: Record<ClassificationKind, number> = { archetype: 0, fallback: 0, other: 0 };
    const snapshot = buildMetaSnapshot(window.decks, {
      format,
      classify: (deck) => {
        const archetype = classifyDeck(deck, rules);
        matched[archetype.kind] += 1;
        return archetype;
      },
      minMatchesForWinRate: options.minMatches,
      minDecks: options.minDecks,
      sources,
      generatedAt,
    });

    const file = join(options.out, `${format}.json`);
    // Written beside the target and moved into place, so a reader never sees half a snapshot.
    writeFileSync(`${file}.part`, `${JSON.stringify(snapshot)}\n`);
    renameSync(`${file}.part`, file);

    const ruleCounts = `${rules.archetypes.length} archetypes, ${rules.fallbacks.length} fallbacks`;
    printSummary(snapshot, window, matched, `${rulesLabel}: ${ruleCounts}`);
    for (const warning of rules.warnings) console.warn(`  rules: ${warning}`);
    const age = Math.round((Date.parse(today) - Date.parse(snapshot.to)) / DAY_MS);
    if (age > STALE_AFTER_DAYS) {
      console.warn(`  newest event is ${age} days old: the decklist cache may have stopped updating`);
    }
    console.log(`  wrote ${file} (${sizeOf(file)})`);
  }

  if (failed) process.exitCode = 1;
}

try {
  main();
} catch (error) {
  if (error instanceof UsageError) {
    console.error(`${error.message}\nSee the header of scripts/data/build-meta.ts for the options.`);
    process.exitCode = 2;
  } else {
    throw error;
  }
}
