import { describe, it, expect } from 'vitest';
import { buildMetaSnapshot, cardFrequencies, finishRank } from './aggregate';
import type { BuildMetaOptions } from './aggregate';
import type { ClassificationKind, DeckClassification } from './classify';
import { slugify } from './names';
import type { DeckCardLine, TournamentDeck } from './types';

type Board = Record<string, number>;

const lines = (board: Board): DeckCardLine[] => Object.entries(board).map(([name, count]) => ({ name, count }));

const TYPICAL: Board = { 'Ember Whelp': 4, 'Cinder Bolt': 4, Mountain: 52 };
const VARIANT: Board = { 'Ember Whelp': 4, 'Ash Hound': 4, Mountain: 52 };
const SIDEBOARD: Board = { 'Smoke Screen': 15 };

interface ListOptions {
  colors?: string;
  kind?: ClassificationKind;
  main?: Board;
  side?: Board;
  result?: string;
  date?: string;
  uri?: string;
  player?: string;
  event?: string;
  /** `null` builds a list without an event link. */
  eventUri?: string | null;
  wins?: number;
  losses?: number;
}

// The aggregator only sees what `classify` returns, so the fixtures tag each list with its archetype directly.
const tags = new Map<TournamentDeck, DeckClassification>();
let serial = 0;

function list(archetype: string, options: ListOptions = {}): TournamentDeck {
  serial += 1;
  const deck: TournamentDeck = {
    player: options.player ?? `player-${serial}`,
    result: options.result ?? '9th Place',
    uri: options.uri ?? `https://decks.example/${serial}`,
    event: options.event ?? 'Challenge',
    ...(options.eventUri === null ? {} : { eventUri: options.eventUri ?? 'https://events.example/challenge' }),
    date: options.date ?? '2030-03-10',
    main: lines(options.main ?? TYPICAL),
    side: lines(options.side ?? SIDEBOARD),
    ...(options.wins === undefined ? {} : { wins: options.wins }),
    ...(options.losses === undefined ? {} : { losses: options.losses }),
  };
  tags.set(deck, {
    id: slugify(archetype),
    name: archetype,
    colors: [...(options.colors ?? 'R')],
    kind: options.kind ?? 'archetype',
  });
  return deck;
}

const many = (count: number, archetype: string, options: ListOptions = {}) =>
  Array.from({ length: count }, () => list(archetype, options));

function build(decks: TournamentDeck[], options: Partial<BuildMetaOptions> = {}) {
  return buildMetaSnapshot(decks, {
    format: 'standard',
    classify: (deck) => {
      const tag = tags.get(deck);
      if (!tag) throw new Error('untagged fixture');
      return tag;
    },
    generatedAt: '2030-03-11T00:00:00.000Z',
    ...options,
  });
}

describe('finishRank', () => {
  it('reads a placement', () => {
    expect(finishRank('1st Place')).toBe(1);
    expect(finishRank('2nd Place')).toBe(2);
    expect(finishRank('23rd Place')).toBe(23);
    expect(finishRank('733th Place')).toBe(733);
  });

  it('ranks an undefeated record with the top 8', () => {
    expect(finishRank('5-0')).toBe(8);
    expect(finishRank('6-0-1')).toBe(8);
  });

  it('leaves other results unranked', () => {
    expect(finishRank('4-1')).toBe(Number.POSITIVE_INFINITY);
    expect(finishRank('')).toBe(Number.POSITIVE_INFINITY);
  });
});

describe('cardFrequencies', () => {
  const decks = [
    list('A', { main: { Alpha: 4, Beta: 2 }, side: { Gamma: 2 } }),
    list('A', { main: { Alpha: 3 }, side: { Gamma: 1, Beta: 1 } }),
    list('A', { main: { Alpha: 4, Gamma: 1 }, side: {} }),
    list('A', { main: { Delta: 1 }, side: {} }),
  ];

  it('reports the share of lists playing a card and the average among those lists', () => {
    const cards = cardFrequencies(decks);
    expect(cards.find((card) => card.name === 'Alpha')).toEqual({
      name: 'Alpha',
      mainShare: 0.75,
      mainAvg: 3.67,
      sideShare: 0,
      sideAvg: 0,
    });
    expect(cards.find((card) => card.name === 'Beta')).toEqual({
      name: 'Beta',
      mainShare: 0.25,
      mainAvg: 2,
      sideShare: 0.25,
      sideAvg: 1,
    });
    expect(cards.find((card) => card.name === 'Gamma')).toEqual({
      name: 'Gamma',
      mainShare: 0.25,
      mainAvg: 1,
      sideShare: 0.5,
      sideAvg: 1.5,
    });
  });

  it('sorts by main-deck share, then sideboard share, then name', () => {
    expect(cardFrequencies(decks).map((card) => card.name)).toEqual(['Alpha', 'Gamma', 'Beta', 'Delta']);
  });

  it('adds up a card listed on two lines of one deck', () => {
    const split: TournamentDeck = { ...list('A'), main: [{ name: 'Alpha', count: 2 }, { name: 'Alpha', count: 1 }], side: [] };
    expect(cardFrequencies([split])).toEqual([{ name: 'Alpha', mainShare: 1, mainAvg: 3, sideShare: 0, sideAvg: 0 }]);
  });
});

describe('buildMetaSnapshot shares', () => {
  const decks = [
    ...many(6, 'Mono-Red Whelps'),
    ...many(3, 'Izzet Scholars', { colors: 'UR' }),
    list('Dimir Other', { colors: 'UB', kind: 'other' }),
  ];

  it('counts lists per archetype and sorts by share', () => {
    const snapshot = build(decks);
    expect(snapshot.totalDecks).toBe(10);
    expect(snapshot.archetypes.map((a) => [a.id, a.name, a.deckCount, a.metaShare])).toEqual([
      ['mono-red-whelps', 'Mono-Red Whelps', 6, 0.6],
      ['izzet-scholars', 'Izzet Scholars', 3, 0.3],
      ['dimir-other', 'Dimir Other', 1, 0.1],
    ]);
    expect(snapshot.archetypes.reduce((sum, a) => sum + a.metaShare, 0)).toBeCloseTo(1, 6);
  });

  it('carries the colours and marks only the Other buckets', () => {
    const snapshot = build(decks);
    expect(snapshot.archetypes.map((a) => [a.colors.join(''), a.isOther])).toEqual([
      ['R', undefined],
      ['UR', undefined],
      ['UB', true],
    ]);
  });

  it('keeps enough precision for small shares to add up', () => {
    const snapshot = build([...many(4, 'Alpha'), ...many(3, 'Beta')]);
    expect(snapshot.archetypes.map((a) => a.metaShare)).toEqual([0.571429, 0.428571]);
  });

  it('breaks a share tie by name', () => {
    const snapshot = build([...many(3, 'Zeta'), ...many(3, 'Alpha')]);
    expect(snapshot.archetypes.map((a) => a.name)).toEqual(['Alpha', 'Zeta']);
  });

  it('keeps ids unique when two names slug alike', () => {
    const snapshot = build([...many(3, 'Death Taxes'), ...many(4, 'Death & Taxes')]);
    expect(snapshot.archetypes.map((a) => [a.name, a.id])).toEqual([
      ['Death & Taxes', 'death-taxes'],
      ['Death Taxes', 'death-taxes-2'],
    ]);
  });

  it('uses the most common colours of an archetype whose lists differ', () => {
    const snapshot = build([
      list('Domain', { colors: 'WUBRG' }),
      list('Domain', { colors: 'WUBRG' }),
      list('Domain', { colors: 'UBRG' }),
    ]);
    expect(snapshot.archetypes[0]?.colors).toEqual(['W', 'U', 'B', 'R', 'G']);
  });
});

describe('buildMetaSnapshot win rate', () => {
  const whelps = [
    list('Whelps', { wins: 3, losses: 1 }),
    list('Whelps', { wins: 2, losses: 2 }),
    list('Whelps', { wins: 4, losses: 0 }),
    list('Whelps', { result: '5-0', event: 'League', eventUri: 'https://events.example/league' }),
  ];
  const scholars = [
    list('Scholars', { wins: 2, losses: 1 }),
    list('Scholars', { wins: 1, losses: 2 }),
    list('Scholars', { result: '5-0', event: 'League', eventUri: 'https://events.example/league' }),
  ];

  it('sums match records and reports a win rate from the minimum match count', () => {
    const snapshot = build([...whelps, ...scholars], { minMatchesForWinRate: 10 });
    expect(snapshot.minMatchesForWinRate).toBe(10);
    const [first, second] = snapshot.archetypes;
    expect(first).toMatchObject({ name: 'Whelps', deckCount: 4, matchWins: 9, matchLosses: 3, winRate: 0.75 });
    expect(second).toMatchObject({ name: 'Scholars', deckCount: 3, matchWins: 3, matchLosses: 3 });
    expect(second).not.toHaveProperty('winRate');
  });

  it('counts league lists for share but not for the match record', () => {
    const snapshot = build([...whelps, ...scholars], { minMatchesForWinRate: 1 });
    expect(snapshot.archetypes[0]).toMatchObject({ deckCount: 4, matchWins: 9, matchLosses: 3 });
    expect(snapshot.archetypes[1]).toMatchObject({ deckCount: 3, winRate: 0.5 });
  });

  it('never reports a win rate without matches', () => {
    const snapshot = build(many(3, 'Leaguers', { result: '5-0' }), { minMatchesForWinRate: 0 });
    expect(snapshot.archetypes[0]).toMatchObject({ matchWins: 0, matchLosses: 0 });
    expect(snapshot.archetypes[0]).not.toHaveProperty('winRate');
  });

  it('reports the win rate of the whole field as the baseline', () => {
    const snapshot = build([...whelps, ...scholars]);
    expect(snapshot.fieldWinRate).toBe(0.6667);
    expect(build(many(3, 'Leaguers', { result: '5-0' }))).not.toHaveProperty('fieldWinRate');
  });

  it('requires 50 matches by default', () => {
    const snapshot = build([...whelps, ...scholars]);
    expect(snapshot.minMatchesForWinRate).toBe(50);
    expect(snapshot.archetypes[0]).not.toHaveProperty('winRate');
  });
});

describe('buildMetaSnapshot representative', () => {
  it('picks the list closest to what the archetype plays', () => {
    const a = list('Whelps', { uri: 'https://decks.example/a' });
    const b = list('Whelps', { uri: 'https://decks.example/b' });
    const c = list('Whelps', { uri: 'https://decks.example/c', main: VARIANT });
    const [whelps] = build([c, b, a]).archetypes;
    expect(whelps?.representative).toBe(a);
    expect(whelps?.otherLists).toEqual([b, c]);
  });

  it('lets a top-8 finish outweigh a small difference in typicality', () => {
    const a = list('Whelps');
    const b = list('Whelps');
    const c = list('Whelps', { main: VARIANT, result: '3rd Place' });
    expect(build([a, b, c]).archetypes[0]?.representative).toBe(c);
  });

  it('treats a league 5-0 like a top-8 finish', () => {
    const a = list('Whelps');
    const b = list('Whelps');
    const c = list('Whelps', { main: VARIANT, result: '5-0' });
    expect(build([a, b, c]).archetypes[0]?.representative).toBe(c);
  });

  it('does not let a good finish rescue an unusual list', () => {
    const a = list('Whelps', { uri: 'https://decks.example/a' });
    const b = list('Whelps', { uri: 'https://decks.example/b' });
    const c = list('Whelps', { uri: 'https://decks.example/c' });
    const outlier = list('Whelps', { main: { 'Odd Relic': 30, Mountain: 30 }, result: '1st Place' });
    const [whelps] = build([outlier, a, b, c]).archetypes;
    expect(whelps?.representative).toBe(a);
    expect(whelps?.otherLists).toEqual([outlier, b, c]);
  });

  it('prefers the more recent of two equally typical lists', () => {
    const older = list('Whelps', { date: '2030-03-01', uri: 'https://decks.example/a' });
    const newer = list('Whelps', { date: '2030-03-10', uri: 'https://decks.example/b' });
    const variant = list('Whelps', { date: '2030-03-01', main: VARIANT });
    expect(build([older, newer, variant]).archetypes[0]?.representative).toBe(newer);
  });

  it('lets recency outweigh a small difference in typicality', () => {
    const a = list('Whelps', { date: '2030-03-01' });
    const b = list('Whelps', { date: '2030-03-01' });
    const recentVariant = list('Whelps', { date: '2030-03-10', main: VARIANT });
    expect(build([a, b, recentVariant]).archetypes[0]?.representative).toBe(recentVariant);
  });

  it('prefers a list a player can copy as is', () => {
    const noSideboard = list('Whelps', { uri: 'https://decks.example/a', side: {} });
    const bigSideboard = list('Whelps', { uri: 'https://decks.example/b', side: { 'Smoke Screen': 16 } });
    const complete = list('Whelps', { uri: 'https://decks.example/c' });
    expect(build([noSideboard, bigSideboard, complete]).archetypes[0]?.representative).toBe(complete);
  });

  it('lists the best finishes first, the most recent first among equals, and at most four', () => {
    const winner = list('Whelps', { result: '1st Place', date: '2030-03-10' });
    const oldLeague = list('Whelps', { result: '5-0', date: '2030-03-05' });
    const newLeague = list('Whelps', { result: '5-0', date: '2030-03-09' });
    const twelfth = list('Whelps', { result: '12th Place', date: '2030-03-10' });
    const second = list('Whelps', { result: '2nd Place', date: '2030-03-06' });
    const late = list('Whelps', { result: '40th Place', date: '2030-03-10' });
    const [whelps] = build([late, twelfth, oldLeague, second, newLeague, winner]).archetypes;
    expect(whelps?.representative).toBe(winner);
    expect(whelps?.otherLists).toEqual([second, newLeague, oldLeague, twelfth]);
  });

  it('honours the requested number of other lists', () => {
    const [whelps] = build(many(6, 'Whelps'), { otherLists: 2 }).archetypes;
    expect(whelps?.otherLists).toHaveLength(2);
  });

  it('gives the same snapshot whatever the order of the lists', () => {
    const decks = [
      ...many(4, 'Whelps'),
      list('Whelps', { main: VARIANT, result: '2nd Place', date: '2030-03-02' }),
      ...many(3, 'Scholars', { colors: 'UR', date: '2030-03-04', wins: 3, losses: 2 }),
      list('Brew', { colors: 'G' }),
      list('Brew', { colors: 'UG' }),
    ];
    const shuffled = [decks[7], decks[2], decks[9], decks[0], decks[5], decks[4], decks[8], decks[1], decks[6], decks[3]];
    expect(build(shuffled as TournamentDeck[])).toEqual(build(decks));
    expect(build([...decks].reverse())).toEqual(build(decks));
  });
});

describe('buildMetaSnapshot small archetypes', () => {
  const decks = [
    ...many(3, 'Mono-Red Whelps'),
    list('Rare Brew', { colors: 'UR' }),
    list('Rare Brew', { colors: 'R' }),
    list('Izzet Other', { colors: 'UR', kind: 'other' }),
  ];

  it('folds archetypes with fewer than three lists into the Other bucket of their own colours', () => {
    const snapshot = build(decks);
    expect(snapshot.archetypes.map((a) => [a.name, a.deckCount, a.isOther, a.colors.join('')])).toEqual([
      ['Mono-Red Whelps', 3, undefined, 'R'],
      ['Izzet Other', 2, true, 'UR'],
      ['Mono-Red Other', 1, true, 'R'],
    ]);
    expect(snapshot.archetypes.map((a) => a.id)).toEqual(['mono-red-whelps', 'izzet-other', 'mono-red-other']);
  });

  it('keeps them when the minimum is lowered', () => {
    const snapshot = build(decks, { minDecks: 2 });
    expect(snapshot.archetypes.map((a) => [a.name, a.deckCount])).toEqual([
      ['Mono-Red Whelps', 3],
      ['Rare Brew', 2],
      ['Izzet Other', 1],
    ]);
  });

  it('never folds an Other bucket away', () => {
    const snapshot = build([list('Dimir Other', { colors: 'UB', kind: 'other' })]);
    expect(snapshot.archetypes.map((a) => a.name)).toEqual(['Dimir Other']);
  });
});

describe('buildMetaSnapshot envelope', () => {
  it('describes the window, the events and the sources', () => {
    const sources = [{ name: 'Example cache', url: 'https://cache.example', note: 'made-up lists' }];
    const snapshot = build(
      [
        list('Whelps', { date: '2030-03-02', eventUri: 'https://events.example/1' }),
        list('Whelps', { date: '2030-03-02', eventUri: 'https://events.example/1' }),
        list('Whelps', { date: '2030-03-09', eventUri: 'https://events.example/2' }),
        list('Whelps', { date: '2030-03-05', event: 'Local Open', eventUri: null }),
      ],
      { sources, format: 'pioneer' },
    );
    expect(snapshot).toMatchObject({
      format: 'pioneer',
      generatedAt: '2030-03-11T00:00:00.000Z',
      from: '2030-03-02',
      to: '2030-03-09',
      eventCount: 3,
      totalDecks: 4,
      sources,
    });
  });

  it('stamps the build time when none is given', () => {
    const snapshot = build(many(3, 'Whelps'), { generatedAt: undefined });
    expect(Number.isNaN(Date.parse(snapshot.generatedAt))).toBe(false);
  });

  it('builds an empty snapshot from no lists', () => {
    expect(build([])).toMatchObject({ from: '', to: '', eventCount: 0, totalDecks: 0, archetypes: [], sources: [] });
  });
});
