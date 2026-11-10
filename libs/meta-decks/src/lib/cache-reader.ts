/**
 * Reader for the community decklist cache (MTGODecklistCache layout):
 * `<source>/<yyyy>/<mm>/<dd>/<event>.json`, one published event per file.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cardKey, frontFaceKey, hasTwoFaces, normalizeCardName } from './names';
import type { DeckCardLine, MetaFormat, TournamentDeck } from './types';

export const META_FORMATS: readonly MetaFormat[] = ['standard', 'pioneer', 'modern', 'legacy', 'pauper', 'vintage'];

/** Cache folders holding the formats above: mtgo.com events and melee.gg tournaments. */
export const DEFAULT_CACHE_SOURCES: readonly string[] = ['mtgo.com_limited_data', 'melee.gg'];

/** Every supported format is a 60-card format; a shorter main deck is a list the source published incomplete. */
const MIN_MAIN_DECK = 60;

const DAY_MS = 86_400_000;
const BYTE_ORDER_MARK = 0xfeff;

export interface TournamentEvent {
  /** Event page on the publishing site; identifies the event across cache folders. */
  uri: string;
  name: string;
  /** ISO date (YYYY-MM-DD). */
  date: string;
  format: MetaFormat;
  /** Cache folder the file sits in: `mtgo.com_limited_data`, `melee.gg`… */
  source: string;
  /** Path of the file inside the cache. */
  file: string;
  /** False for leagues, which publish undefeated lists only. */
  hasStandings: boolean;
}

export interface Tournament {
  event: TournamentEvent;
  decks: TournamentDeck[];
  /** Lists left out because their main deck was published short. */
  incompleteDecks: number;
}

export interface CacheRead {
  /** Deduplicated, oldest first. */
  tournaments: Tournament[];
  filesRead: number;
  /** Files that repeated an event already read from another folder or date. */
  duplicateFiles: number;
  unreadableFiles: string[];
}

export interface FormatWindow {
  format: MetaFormat;
  /** Inclusive ISO dates bounding the window; `to` is the newest event found. */
  from: string;
  to: string;
  events: TournamentEvent[];
  decks: TournamentDeck[];
  incompleteDecks: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function isMetaFormat(value: string): value is MetaFormat {
  return (META_FORMATS as readonly string[]).includes(value);
}

// File-name words that mean "not one of our formats" even when a format word sits next to them.
const OTHER_FORMAT_WORDS = new Set(['commander', 'brawl', 'limited', 'sealed', 'draft', 'cube']);

/**
 * The format of an event file. The `Formats` field wins whenever it is set;
 * some files carry `null`, and only then is the file name consulted.
 */
export function detectFormat(formats: unknown, fileName: string): MetaFormat | undefined {
  const declared = text(formats).toLowerCase();
  if (declared !== '') return isMetaFormat(declared) ? declared : undefined;

  const baseName = fileName.slice(fileName.lastIndexOf('/') + 1).toLowerCase();
  const words = baseName.replace(/\.json$/, '').split(/[^a-z0-9]+/);
  if (words.some((word) => OTHER_FORMAT_WORDS.has(word))) return undefined;
  const named = [...new Set(words.filter(isMetaFormat))];
  return named.length === 1 ? named[0] : undefined;
}

function isoDate(value: unknown): string | undefined {
  return /^\d{4}-\d{2}-\d{2}/.exec(text(value))?.[0];
}

function dateFromPath(file: string): string | undefined {
  const inFolders = /(?:^|\/)(\d{4})\/(\d{2})\/(\d{2})\//.exec(file);
  if (inFolders) return `${inFolders[1]}-${inFolders[2]}-${inFolders[3]}`;
  return /\d{4}-\d{2}-\d{2}/.exec(file)?.[0];
}

function mergeLines(lines: readonly DeckCardLine[]): DeckCardLine[] {
  const byKey = new Map<string, DeckCardLine>();
  for (const line of lines) {
    const existing = byKey.get(cardKey(line.name));
    if (existing) existing.count += line.count;
    else byKey.set(cardKey(line.name), { name: line.name, count: line.count });
  }
  return [...byKey.values()];
}

function parseBoard(value: unknown): DeckCardLine[] {
  if (!Array.isArray(value)) return [];
  const lines: DeckCardLine[] = [];
  for (const entry of value) {
    if (!isRecord(entry)) continue;
    const name = normalizeCardName(text(entry['CardName']));
    const count = entry['Count'];
    if (name === '' || typeof count !== 'number' || !Number.isInteger(count) || count <= 0) continue;
    lines.push({ name, count });
  }
  return mergeLines(lines);
}

function cardCount(lines: readonly DeckCardLine[]): number {
  return lines.reduce((sum, line) => sum + line.count, 0);
}

interface MatchRecord {
  wins: number;
  losses: number;
}

function parseStandings(value: unknown): Map<string, MatchRecord> {
  const records = new Map<string, MatchRecord>();
  if (!Array.isArray(value)) return records;
  for (const entry of value) {
    if (!isRecord(entry)) continue;
    const player = text(entry['Player']).toLowerCase();
    const wins = entry['Wins'];
    const losses = entry['Losses'];
    if (player === '' || typeof wins !== 'number' || typeof losses !== 'number') continue;
    if (!records.has(player)) records.set(player, { wins, losses });
  }
  return records;
}

/**
 * Normalises one cache file. Returns nothing for a file of another shape or
 * of a format this library does not cover.
 */
export function parseTournament(json: unknown, file: string): Tournament | undefined {
  if (!isRecord(json)) return undefined;
  const info = json['Tournament'];
  const rawDecks = json['Decks'];
  if (!isRecord(info) || !Array.isArray(rawDecks)) return undefined;

  const format = detectFormat(info['Formats'], file);
  const date = isoDate(info['Date']) ?? dateFromPath(file);
  if (format === undefined || date === undefined) return undefined;

  const name = text(info['Name']);
  const uri = text(info['Uri']) || file;
  const standings = parseStandings(json['Standings']);

  const decks: TournamentDeck[] = [];
  let incompleteDecks = 0;
  for (const raw of rawDecks) {
    if (!isRecord(raw)) continue;
    const main = parseBoard(raw['Mainboard']);
    if (cardCount(main) < MIN_MAIN_DECK) {
      incompleteDecks += 1;
      continue;
    }
    const player = text(raw['Player']);
    const record = standings.get(player.toLowerCase());
    decks.push({
      player,
      result: text(raw['Result']),
      uri: text(raw['AnchorUri']),
      event: name,
      eventUri: uri,
      date,
      main,
      side: parseBoard(raw['Sideboard']),
      ...(record ? { wins: record.wins, losses: record.losses } : {}),
    });
  }

  return {
    event: { uri, name, date, format, source: file.split('/')[0] ?? '', file, hasStandings: standings.size > 0 },
    decks,
    incompleteDecks,
  };
}

function eventKey(uri: string): string {
  return uri.toLowerCase().replace(/\/+$/, '');
}

function deckIdentity(deck: TournamentDeck): string {
  const main = deck.main.map((line) => `${line.count} ${cardKey(line.name)}`).sort();
  return `${deck.player.toLowerCase()}|${main.join('|')}`;
}

// Plain code-unit order: unlike localeCompare it is the same on every machine.
function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function byDateThenFile(a: Tournament, b: Tournament): number {
  return compareText(a.event.date, b.event.date) || compareText(a.event.file, b.event.file);
}

// The fullest copy leads; among equals the first path, so the result does not depend on read order.
function byCompleteness(a: Tournament, b: Tournament): number {
  return (
    b.decks.length - a.decks.length ||
    Number(b.event.hasStandings) - Number(a.event.hasStandings) ||
    compareText(a.event.file, b.event.file)
  );
}

function mergeCopies(copies: Tournament[]): Tournament {
  const [lead, ...others] = [...copies].sort(byCompleteness);
  if (lead === undefined) throw new Error('mergeCopies needs at least one tournament');
  if (others.length === 0) return lead;

  // A league page is re-scraped as lists are added and filed under the later date: the first date is the event's.
  const date = copies.map((copy) => copy.event.date).sort()[0] ?? lead.event.date;
  const seen = new Set(lead.decks.map(deckIdentity));
  const decks = [...lead.decks];
  for (const other of others) {
    for (const deck of other.decks) {
      if (seen.has(deckIdentity(deck))) continue;
      seen.add(deckIdentity(deck));
      decks.push(deck);
    }
  }
  return {
    event: { ...lead.event, date },
    decks: decks.map((deck) => ({ ...deck, event: lead.event.name, eventUri: lead.event.uri, date })),
    incompleteDecks: Math.max(...copies.map((copy) => copy.incompleteDecks)),
  };
}

/**
 * One tournament per event link. The cache stores some events twice (mtgo.com
 * files also appear under the melee.gg folder) and re-files updated league
 * pages under a later date.
 */
export function dedupeTournaments(tournaments: readonly Tournament[]): Tournament[] {
  const copiesByEvent = new Map<string, Tournament[]>();
  for (const tournament of tournaments) {
    const key = eventKey(tournament.event.uri);
    const copies = copiesByEvent.get(key);
    if (copies) copies.push(tournament);
    else copiesByEvent.set(key, [tournament]);
  }
  return [...copiesByEvent.values()].map(mergeCopies).sort(byDateThenFile);
}

function rewriteBoard(lines: readonly DeckCardLine[], canonical: ReadonlyMap<string, string>): DeckCardLine[] {
  return mergeLines(lines.map((line) => ({ name: canonical.get(line.name) ?? line.name, count: line.count })));
}

export interface UnifyOptions {
  /**
   * Card keys of names written the mtgo.com way (front face only, split cards
   * in full), such as the keys of a rules colour table. Settles the two-faced
   * names that no list in the set happens to write the short way.
   */
  knownCards?: ReadonlySet<string>;
}

/**
 * Gives every card one name across the lists. melee.gg appends the back face
 * of double-faced cards (`Front // Back`) where mtgo.com prints the front face
 * only, which would otherwise split one card into two rows of a frequency
 * table. A real split card is never listed by one half, so it keeps its name.
 */
export function unifyCardNames(decks: readonly TournamentDeck[], options: UnifyOptions = {}): TournamentDeck[] {
  const { knownCards } = options;
  const uses = new Map<string, number>();
  for (const deck of decks) {
    for (const line of [...deck.main, ...deck.side]) uses.set(line.name, (uses.get(line.name) ?? 0) + 1);
  }

  const spellings = new Map<string, string>();
  for (const [name, count] of uses) {
    const current = spellings.get(cardKey(name));
    const currentCount = current === undefined ? -1 : (uses.get(current) ?? 0);
    if (count > currentCount || (count === currentCount && current !== undefined && name < current)) {
      spellings.set(cardKey(name), name);
    }
  }

  const frontFace = (name: string): string | undefined => {
    if (!hasTwoFaces(name)) return undefined;
    const listedAlone = spellings.get(frontFaceKey(name));
    if (listedAlone !== undefined) return listedAlone;
    const knownByFrontOnly = knownCards?.has(frontFaceKey(name)) === true && !knownCards.has(cardKey(name));
    return knownByFrontOnly ? name.slice(0, name.indexOf(' // ')) : undefined;
  };

  const canonical = new Map<string, string>();
  for (const name of uses.keys()) {
    const spelling = spellings.get(cardKey(name)) ?? name;
    canonical.set(name, frontFace(spelling) ?? spelling);
  }

  return decks.map((deck) => ({
    ...deck,
    main: rewriteBoard(deck.main, canonical),
    side: rewriteBoard(deck.side, canonical),
  }));
}

function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

export interface WindowOptions {
  format: MetaFormat;
  /** Length of the window in days, counting both end dates. */
  days: number;
  /** Ignore events dated later than this ISO date (a mistyped future date would otherwise move the window). */
  notAfter?: string;
  /** See `UnifyOptions.knownCards`. */
  knownCards?: ReadonlySet<string>;
}

/**
 * The lists of one format in the `days` days up to its newest event. The
 * window ends at the newest event rather than today because the cache is
 * updated in weekly batches.
 */
export function selectWindow(tournaments: readonly Tournament[], options: WindowOptions): FormatWindow | undefined {
  const { format, days, notAfter, knownCards } = options;
  const candidates = tournaments.filter(
    (t) => t.event.format === format && t.decks.length > 0 && (notAfter === undefined || t.event.date <= notAfter),
  );
  const to = candidates.map((t) => t.event.date).sort().at(-1);
  if (to === undefined) return undefined;

  const from = addDays(to, -(Math.max(1, days) - 1));
  const inWindow = candidates.filter((t) => t.event.date >= from).sort(byDateThenFile);
  return {
    format,
    from,
    to,
    events: inWindow.map((t) => t.event),
    decks: unifyCardNames(
      inWindow.flatMap((t) => t.decks),
      { knownCards },
    ),
    incompleteDecks: inWindow.reduce((sum, t) => sum + t.incompleteDecks, 0),
  };
}

function listJsonFiles(dir: string, prefix = ''): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const path = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
    if (entry.isDirectory()) files.push(...listJsonFiles(join(dir, entry.name), path));
    else if (entry.isFile() && entry.name.toLowerCase().endsWith('.json')) files.push(path);
  }
  return files.sort();
}

export interface ReadCacheOptions {
  /** Keep only these formats; every supported format when omitted. */
  formats?: readonly MetaFormat[];
}

/** Reads every event file under `rootDir` (the cache's `Tournaments` folder, or any part of it). */
export function readTournamentCache(rootDir: string, options: ReadCacheOptions = {}): CacheRead {
  const wanted = new Set<MetaFormat>(options.formats ?? META_FORMATS);
  const parsed: Tournament[] = [];
  const unreadableFiles: string[] = [];
  const files = listJsonFiles(rootDir);

  for (const file of files) {
    let json: unknown;
    try {
      const text = readFileSync(join(rootDir, file), 'utf8');
      json = JSON.parse(text.charCodeAt(0) === BYTE_ORDER_MARK ? text.slice(1) : text);
    } catch {
      unreadableFiles.push(file);
      continue;
    }
    const tournament = parseTournament(json, file);
    if (tournament && wanted.has(tournament.event.format)) parsed.push(tournament);
  }

  const tournaments = dedupeTournaments(parsed);
  return { tournaments, filesRead: files.length, duplicateFiles: parsed.length - tournaments.length, unreadableFiles };
}

export interface SparsePathOptions {
  /** ISO date the window can end on at the latest (today). */
  until: string;
  days: number;
  sources?: readonly string[];
  /** Extra days before the window, because its end is the newest event in the cache, not `until`. */
  slackDays?: number;
}

/**
 * The month folders of the cache repository a window can touch, for a sparse
 * checkout: a full checkout of the repository is far larger than a build needs.
 */
export function cacheSparsePaths(options: SparsePathOptions): string[] {
  const { until, days, sources = DEFAULT_CACHE_SOURCES, slackDays = 14 } = options;
  const months = new Set<string>();
  for (let day = addDays(until, -(days + slackDays)); day <= until; day = addDays(day, 1)) {
    months.add(`${day.slice(0, 4)}/${day.slice(5, 7)}`);
  }
  return sources.flatMap((source) => [...months].map((month) => `Tournaments/${source}/${month}`));
}
