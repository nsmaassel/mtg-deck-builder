import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, it, expect } from 'vitest';
import {
  cacheSparsePaths,
  dedupeTournaments,
  detectFormat,
  parseTournament,
  readTournamentCache,
  selectWindow,
  unifyCardNames,
} from './cache-reader';
import type { Tournament } from './cache-reader';
import type { TournamentDeck } from './types';

type Board = Record<string, number>;

const rawCards = (board: Board) => Object.entries(board).map(([CardName, Count]) => ({ Count, CardName }));

/** Pads a main deck to 60 cards with a basic land. */
function sixty(board: Board): Board {
  const used = Object.values(board).reduce((sum, count) => sum + count, 0);
  return used >= 60 ? board : { ...board, Mountain: 60 - used };
}

function rawDeck(player: string, result: string, main: Board, side: Board = {}) {
  return {
    Date: null,
    Player: player,
    Result: result,
    AnchorUri: `https://decks.example/list/${encodeURIComponent(player)}`,
    Mainboard: rawCards(sixty(main)),
    Sideboard: rawCards(side),
  };
}

interface RawEvent {
  name?: string;
  date?: string | null;
  uri?: string;
  formats?: unknown;
  decks?: unknown[];
  standings?: unknown[] | null;
}

function rawTournament(event: RawEvent = {}) {
  return {
    Tournament: {
      Date: event.date === undefined ? '2030-03-10' : event.date,
      Name: event.name ?? 'Standard Challenge 32',
      Uri: event.uri ?? 'https://events.example/standard-challenge-1',
      Formats: event.formats === undefined ? 'Standard' : event.formats,
    },
    Decks: event.decks ?? [rawDeck('Ann', '1st Place', { 'Ember Whelp': 4 })],
    Rounds: [],
    Standings: event.standings === undefined ? [] : event.standings,
  };
}

const standing = (player: string, wins: number, losses: number, rank = 1) => ({
  Rank: rank,
  Player: player,
  Points: wins * 3,
  Wins: wins,
  Losses: losses,
  Draws: 0,
});

function parsed(event: RawEvent, file = 'site-a/2030/03/10/event.json'): Tournament {
  const tournament = parseTournament(rawTournament(event), file);
  if (!tournament) throw new Error('fixture did not parse');
  return tournament;
}

describe('detectFormat', () => {
  it('reads the Formats field', () => {
    expect(detectFormat('Standard', 'whatever.json')).toBe('standard');
    expect(detectFormat(' pioneer ', 'whatever.json')).toBe('pioneer');
  });

  it('falls back to the file name when the field is empty', () => {
    expect(detectFormat(null, 'standard-league-2030-03-1011129.json')).toBe('standard');
    expect(detectFormat('', 'recq-modern-big-city-open-462462-2030-03-10.json')).toBe('modern');
    expect(detectFormat(undefined, 'site-a/2030/03/10/weekly-legacy-night-99-2030-03-10.json')).toBe('legacy');
  });

  it('does not guess from an ambiguous or unrelated file name', () => {
    expect(detectFormat(null, 'duel-commander-league-2030-03-1011217.json')).toBeUndefined();
    expect(detectFormat(null, 'pauper-commander-monthly-2030-03-10.json')).toBeUndefined();
    expect(detectFormat(null, 'premodern-monthly-2030-03-10.json')).toBeUndefined();
    expect(detectFormat(null, 'limited-rc-super-qualifier-2030-03-1012853660.json')).toBeUndefined();
    expect(detectFormat(null, 'modern-and-legacy-weekend-2030-03-10.json')).toBeUndefined();
  });

  it('trusts a field that names another format', () => {
    expect(detectFormat('Commander', 'pauper-commander-monthly-2030-03-10.json')).toBeUndefined();
    expect(detectFormat('Duel Commander', 'standard-night.json')).toBeUndefined();
  });
});

describe('parseTournament', () => {
  it('normalises a deck', () => {
    const tournament = parsed({
      date: '2030-03-10T14:00:00+00:00',
      decks: [rawDeck('Ann', '1st Place', { 'Ember Whelp': 4, 'Cinder Bolt': 4 }, { 'Tide Scholar': 2 })],
    });
    expect(tournament.event).toMatchObject({
      uri: 'https://events.example/standard-challenge-1',
      name: 'Standard Challenge 32',
      date: '2030-03-10',
      format: 'standard',
      source: 'site-a',
      file: 'site-a/2030/03/10/event.json',
    });
    expect(tournament.decks).toHaveLength(1);
    expect(tournament.decks[0]).toEqual({
      player: 'Ann',
      result: '1st Place',
      uri: 'https://decks.example/list/Ann',
      event: 'Standard Challenge 32',
      eventUri: 'https://events.example/standard-challenge-1',
      date: '2030-03-10',
      main: [
        { name: 'Ember Whelp', count: 4 },
        { name: 'Cinder Bolt', count: 4 },
        { name: 'Mountain', count: 52 },
      ],
      side: [{ name: 'Tide Scholar', count: 2 }],
    });
  });

  it('joins the standings onto decks by player, ignoring case and stray spaces', () => {
    const tournament = parsed({
      decks: [rawDeck('Ann', '1st Place', {}), rawDeck('bob ', '2nd Place', {}), rawDeck('Cy', '3rd Place', {})],
      standings: [standing('ANN', 6, 1), standing('Bob', 5, 2, 2)],
    });
    expect(tournament.event.hasStandings).toBe(true);
    expect(tournament.decks.map((deck) => [deck.player, deck.wins, deck.losses])).toEqual([
      ['Ann', 6, 1],
      ['bob', 5, 2],
      ['Cy', undefined, undefined],
    ]);
  });

  it('leaves league lists without a record', () => {
    const tournament = parsed({ name: 'Standard League', decks: [rawDeck('Ann', '5-0', {})], standings: null });
    expect(tournament.event.hasStandings).toBe(false);
    expect(tournament.decks[0]).not.toHaveProperty('wins');
    expect(tournament.decks[0]).not.toHaveProperty('losses');
  });

  it('drops lists that were published incomplete and counts them', () => {
    const short = { ...rawDeck('Bob', '2nd Place', {}), Mainboard: rawCards({ 'Ember Whelp': 4, Mountain: 20 }) };
    const empty = { ...rawDeck('Cy', '3rd Place', {}), Mainboard: [] };
    const tournament = parsed({ decks: [rawDeck('Ann', '1st Place', {}), short, empty] });
    expect(tournament.decks.map((deck) => deck.player)).toEqual(['Ann']);
    expect(tournament.incompleteDecks).toBe(2);
  });

  it('merges repeated lines and normalises the separator of two-faced names', () => {
    const deck = {
      ...rawDeck('Ann', '1st Place', {}),
      Mainboard: [
        { Count: 2, CardName: 'Wax/Wane' },
        { Count: 30, CardName: 'Mountain' },
        { Count: 2, CardName: 'Wax // Wane' },
        { Count: 26, CardName: ' Mountain ' },
      ],
    };
    expect(parsed({ decks: [deck] }).decks[0]?.main).toEqual([
      { name: 'Wax // Wane', count: 4 },
      { name: 'Mountain', count: 56 },
    ]);
  });

  it('takes the date from the cache path when the event has none', () => {
    expect(parsed({ date: null }, 'site-a/2030/03/12/event.json').event.date).toBe('2030-03-12');
  });

  it('uses the file name when the format field is empty', () => {
    const tournament = parsed({ formats: null }, 'site-a/2030/03/10/pioneer-league-2030-03-1011137.json');
    expect(tournament.event.format).toBe('pioneer');
  });

  it('ignores other formats and files of another shape', () => {
    expect(parseTournament(rawTournament({ formats: 'Commander' }), 'site-a/2030/03/10/event.json')).toBeUndefined();
    expect(parseTournament({ unrelated: true }, 'site-a/2030/03/10/standard-event.json')).toBeUndefined();
    expect(parseTournament('nope', 'site-a/2030/03/10/standard-event.json')).toBeUndefined();
  });
});

describe('dedupeTournaments', () => {
  it('keeps one copy of an event stored under two source folders', () => {
    const a = parsed({ decks: [rawDeck('Ann', '5-0', {}), rawDeck('Bob', '5-0', { 'Ember Whelp': 4 })] }, 'site-b/2030/03/10/e.json');
    const b = parsed({ decks: [rawDeck('Ann', '5-0', {}), rawDeck('Bob', '5-0', { 'Ember Whelp': 4 })] }, 'site-a/2030/03/10/e.json');
    const result = dedupeTournaments([a, b]);
    expect(result).toHaveLength(1);
    expect(result[0]?.event.file).toBe('site-a/2030/03/10/e.json');
    expect(result[0]?.decks.map((deck) => deck.player)).toEqual(['Ann', 'Bob']);
  });

  it('merges a later re-scrape of the same event and keeps the first date', () => {
    const first = parsed({ date: '2030-03-10', decks: [rawDeck('Ann', '5-0', {})] }, 'site-a/2030/03/10/e.json');
    const later = parsed(
      { date: '2030-03-13', decks: [rawDeck('Ann', '5-0', {}), rawDeck('Bob', '5-0', { 'Ember Whelp': 4 })] },
      'site-a/2030/03/13/e.json',
    );
    const result = dedupeTournaments([first, later]);
    expect(result).toHaveLength(1);
    expect(result[0]?.event.date).toBe('2030-03-10');
    expect(result[0]?.decks.map((deck) => [deck.player, deck.date])).toEqual([
      ['Ann', '2030-03-10'],
      ['Bob', '2030-03-10'],
    ]);
  });

  it('adds lists only one copy of the event has', () => {
    const a = parsed({ decks: [rawDeck('Ann', '5-0', {}), rawDeck('Bob', '5-0', { 'Ember Whelp': 4 })] }, 'site-a/2030/03/10/e.json');
    const b = parsed({ decks: [rawDeck('Cy', '5-0', { 'Tide Scholar': 4 })] }, 'site-a/2030/03/11/e.json');
    expect(dedupeTournaments([a, b])[0]?.decks.map((deck) => deck.player)).toEqual(['Ann', 'Bob', 'Cy']);
  });

  it('keeps two lists the same player registered in one event', () => {
    const a = parsed({ decks: [rawDeck('Ann', '5-0', {}), rawDeck('Ann', '5-0', { 'Ember Whelp': 4 })] }, 'site-a/2030/03/10/e.json');
    const b = parsed({ decks: [rawDeck('Ann', '5-0', {})] }, 'site-b/2030/03/10/e.json');
    expect(dedupeTournaments([a, b])[0]?.decks).toHaveLength(2);
  });

  it('treats events with different links as different, even with the same name and date', () => {
    const a = parsed({ uri: 'https://events.example/challenge-1' }, 'site-a/2030/03/10/a.json');
    const b = parsed({ uri: 'https://events.example/challenge-2' }, 'site-a/2030/03/10/b.json');
    expect(dedupeTournaments([b, a]).map((t) => t.event.uri)).toEqual([
      'https://events.example/challenge-1',
      'https://events.example/challenge-2',
    ]);
  });
});

describe('unifyCardNames', () => {
  const list = (main: Board, side: Board = {}): TournamentDeck => ({
    player: 'Ann',
    result: '5-0',
    uri: '',
    event: 'League',
    date: '2030-03-10',
    main: Object.entries(main).map(([name, count]) => ({ name, count })),
    side: Object.entries(side).map(([name, count]) => ({ name, count })),
  });

  it('drops an appended back face when other lists name the card by its front face', () => {
    const decks = unifyCardNames([
      list({ 'Tide Scholar': 4 }),
      list({ 'Tide Scholar // Deep Study': 3 }, { 'Tide Scholar // Deep Study': 1 }),
    ]);
    expect(decks[1]?.main).toEqual([{ name: 'Tide Scholar', count: 3 }]);
    expect(decks[1]?.side).toEqual([{ name: 'Tide Scholar', count: 1 }]);
  });

  it('keeps a split card whose halves are never listed alone', () => {
    const decks = unifyCardNames([list({ 'Wax // Wane': 4 }), list({ 'Wax // Wane': 2 })]);
    expect(decks.map((deck) => deck.main[0]?.name)).toEqual(['Wax // Wane', 'Wax // Wane']);
  });

  it('settles on the most common spelling of a name', () => {
    const decks = unifyCardNames([
      list({ 'Lórien Sentry': 4 }),
      list({ 'Lórien Sentry': 4 }),
      list({ 'Lorien sentry': 4 }),
    ]);
    expect(decks.map((deck) => deck.main[0]?.name)).toEqual(['Lórien Sentry', 'Lórien Sentry', 'Lórien Sentry']);
  });

  it('merges lines that become the same card', () => {
    const decks = unifyCardNames([list({ 'Tide Scholar': 2, 'Tide Scholar // Deep Study': 2 })]);
    expect(decks[0]?.main).toEqual([{ name: 'Tide Scholar', count: 4 }]);
  });

  it('does not modify its input', () => {
    const input = [list({ 'Tide Scholar': 4 }), list({ 'Tide Scholar // Deep Study': 4 })];
    unifyCardNames(input);
    expect(input[1]?.main[0]?.name).toBe('Tide Scholar // Deep Study');
  });

  describe('with a list of known card names', () => {
    // As a rules colour table has them: front faces, split cards in full plus an alias for their first half.
    const knownCards = new Set(['tide scholar', 'wax // wane', 'wax']);

    it('drops a back face no list in the window leaves out', () => {
      const decks = unifyCardNames([list({ 'Tide Scholar // Deep Study': 4 })], { knownCards });
      expect(decks[0]?.main).toEqual([{ name: 'Tide Scholar', count: 4 }]);
    });

    it('keeps a name the list knows in full', () => {
      const decks = unifyCardNames([list({ 'Wax // Wane': 4 })], { knownCards });
      expect(decks[0]?.main).toEqual([{ name: 'Wax // Wane', count: 4 }]);
    });

    it('keeps a two-faced name it does not know at all', () => {
      const decks = unifyCardNames([list({ 'Odd Relic // Odder Relic': 4 })], { knownCards });
      expect(decks[0]?.main).toEqual([{ name: 'Odd Relic // Odder Relic', count: 4 }]);
    });
  });
});

describe('selectWindow', () => {
  const event = (date: string, uri: string, formats = 'Standard', file = `site-a/${uri}.json`) =>
    parsed({ date, uri: `https://events.example/${uri}`, formats, decks: [rawDeck(`P-${uri}`, '5-0', {})] }, file);

  const tournaments = [
    event('2030-03-10', 'new'),
    event('2030-03-01', 'edge'),
    event('2030-02-28', 'old'),
    event('2030-03-20', 'pioneer', 'Pioneer'),
  ];

  it('ends at the newest event of the format and spans the requested days', () => {
    const window = selectWindow(tournaments, { format: 'standard', days: 10 });
    expect(window).toMatchObject({ format: 'standard', from: '2030-03-01', to: '2030-03-10' });
    expect(window?.events.map((e) => e.date)).toEqual(['2030-03-01', '2030-03-10']);
    expect(window?.decks.map((deck) => deck.player)).toEqual(['P-edge', 'P-new']);
  });

  it('ignores events dated after the cut-off', () => {
    const window = selectWindow(tournaments, { format: 'standard', days: 10, notAfter: '2030-03-05' });
    expect(window).toMatchObject({ from: '2030-02-20', to: '2030-03-01' });
    expect(window?.events.map((e) => e.date)).toEqual(['2030-02-28', '2030-03-01']);
  });

  it('returns nothing for a format without events', () => {
    expect(selectWindow(tournaments, { format: 'modern', days: 10 })).toBeUndefined();
  });

  it('counts the incomplete lists it left out and unifies card names', () => {
    const short = { ...rawDeck('Bob', '2nd Place', {}), Mainboard: rawCards({ Mountain: 20 }) };
    const mixed = [
      parsed({ uri: 'https://events.example/a', decks: [rawDeck('Ann', '1st Place', { 'Tide Scholar': 4 }), short] }),
      parsed({ uri: 'https://events.example/b', decks: [rawDeck('Cy', '1st Place', { 'Tide Scholar // Deep Study': 4 })] }),
    ];
    const window = selectWindow(mixed, { format: 'standard', days: 5 });
    expect(window?.incompleteDecks).toBe(1);
    expect(window?.decks.map((deck) => deck.main[0]?.name)).toEqual(['Tide Scholar', 'Tide Scholar']);
  });

  it('passes known card names on to the unification', () => {
    const only = [parsed({ decks: [rawDeck('Cy', '1st Place', { 'Tide Scholar // Deep Study': 4 })] })];
    const plain = selectWindow(only, { format: 'standard', days: 5 });
    const informed = selectWindow(only, { format: 'standard', days: 5, knownCards: new Set(['tide scholar']) });
    expect(plain?.decks[0]?.main[0]?.name).toBe('Tide Scholar // Deep Study');
    expect(informed?.decks[0]?.main[0]?.name).toBe('Tide Scholar');
  });
});

describe('readTournamentCache', () => {
  const root = mkdtempSync(join(tmpdir(), 'meta-cache-'));
  afterAll(() => rmSync(root, { recursive: true, force: true }));

  const write = (path: string, value: unknown) => {
    const file = join(root, path);
    mkdirSync(join(file, '..'), { recursive: true });
    writeFileSync(file, typeof value === 'string' ? value : JSON.stringify(value));
  };

  write('site-a/2030/03/10/standard-challenge.json', rawTournament({ standings: [standing('Ann', 6, 1)] }));
  write('site-b/2030/03/10/standard-challenge.json', rawTournament({ standings: [standing('Ann', 6, 1)] }));
  write('site-a/2030/03/11/pioneer-league.json', rawTournament({ uri: 'https://events.example/p', formats: 'Pioneer' }));
  write('site-a/2030/03/11/modern-league.json', rawTournament({ uri: 'https://events.example/m', formats: 'Modern' }));
  write('site-a/2030/03/11/broken.json', '{ "Tournament": ');
  write('site-a/2030/03/11/readme.txt', 'not a tournament');
  write('.git/objects/pack.json', rawTournament({ uri: 'https://events.example/hidden' }));

  it('reads every tournament file under the directory once', () => {
    const cache = readTournamentCache(root);
    expect(cache.tournaments.map((t) => t.event.file)).toEqual([
      'site-a/2030/03/10/standard-challenge.json',
      'site-a/2030/03/11/modern-league.json',
      'site-a/2030/03/11/pioneer-league.json',
    ]);
    expect(cache.filesRead).toBe(5);
    expect(cache.duplicateFiles).toBe(1);
    expect(cache.unreadableFiles).toEqual(['site-a/2030/03/11/broken.json']);
    expect(cache.tournaments[0]?.decks[0]).toMatchObject({ player: 'Ann', wins: 6, losses: 1 });
  });

  it('keeps only the requested formats', () => {
    const cache = readTournamentCache(root, { formats: ['pioneer'] });
    expect(cache.tournaments.map((t) => t.event.format)).toEqual(['pioneer']);
  });
});

describe('cacheSparsePaths', () => {
  it('lists the month folders a window can touch, per source', () => {
    expect(cacheSparsePaths({ until: '2026-11-09', days: 45, sources: ['site-a', 'site-b'] })).toEqual([
      'Tournaments/site-a/2026/09',
      'Tournaments/site-a/2026/10',
      'Tournaments/site-a/2026/11',
      'Tournaments/site-b/2026/09',
      'Tournaments/site-b/2026/10',
      'Tournaments/site-b/2026/11',
    ]);
  });

  it('crosses a year boundary', () => {
    expect(cacheSparsePaths({ until: '2027-01-10', days: 30, sources: ['site-a'] })).toEqual([
      'Tournaments/site-a/2026/11',
      'Tournaments/site-a/2026/12',
      'Tournaments/site-a/2027/01',
    ]);
  });

  it('defaults to the two sources the pipeline reads', () => {
    expect(cacheSparsePaths({ until: '2026-11-09', days: 1, slackDays: 0 })).toEqual([
      'Tournaments/mtgo.com_limited_data/2026/11',
      'Tournaments/melee.gg/2026/11',
    ]);
  });
});
