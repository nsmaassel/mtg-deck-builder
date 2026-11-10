import { describe, it, expect } from 'vitest';
import { TextModel } from '@mtg/deck-advisor';
import type { AdvisorData, DeckCheck, MetaView } from '@mtg/deck-advisor';
import { buildTestIndex, oracleId } from '@mtg/deck-advisor/testing';
import type { MetaArchetype, MetaSnapshot, TournamentDeck } from '@mtg/meta-decks/types';
import { buildApp } from '../app';

const index = buildTestIndex();

function list(player: string, main: Record<string, number>, side: Record<string, number> = {}): TournamentDeck {
  const lines = (cards: Record<string, number>) => Object.entries(cards).map(([name, count]) => ({ name, count }));
  return {
    player, result: '1st Place', uri: `https://example.test/${player}`, event: 'Test Challenge', date: '2026-11-01',
    main: lines(main), side: lines(side), wins: 6, losses: 1,
  };
}

function archetype(id: string, name: string, colors: string[], representative: TournamentDeck, metaShare: number, extra: Partial<MetaArchetype> = {}): MetaArchetype {
  return {
    id, name, colors, deckCount: Math.round(metaShare * 100), metaShare, matchWins: 60, matchLosses: 40, winRate: 0.6,
    cards: representative.main.map(l => ({ name: l.name, mainShare: 1, mainAvg: l.count, sideShare: 0, sideAvg: 0 })),
    representative, otherLists: [], ...extra,
  };
}

const izzet = archetype('izzet-prowess', 'Izzet Prowess', ['U', 'R'], list('alice', {
  'Slickshot Show-Off': 4, Shock: 4, Opt: 4, 'Steam Vents': 4, Island: 4, Mountain: 4,
}, { Negate: 2 }), 0.3, {
  // Half the lists play Crackling Cyclops where this one plays something else.
  cards: [
    { name: 'Slickshot Show-Off', mainShare: 1, mainAvg: 4, sideShare: 0, sideAvg: 0 },
    { name: 'Shock', mainShare: 1, mainAvg: 4, sideShare: 0, sideAvg: 0 },
    { name: 'Crackling Cyclops', mainShare: 0.5, mainAvg: 3, sideShare: 0, sideAvg: 0 },
    { name: 'Steam Vents', mainShare: 1, mainAvg: 4, sideShare: 0, sideAvg: 0 },
  ],
});
const monoBlack = archetype('mono-black-midrange', 'Mono-Black Midrange', ['B'], list('bob', {
  'Sheoldred, the Apocalypse': 4, 'Go for the Throat': 4, 'Cut Down': 4, Swamp: 12,
}), 0.5);

const snapshot: MetaSnapshot = {
  format: 'standard', generatedAt: '2026-11-09T00:00:00Z', from: '2026-10-01', to: '2026-11-08',
  eventCount: 12, totalDecks: 100, minMatchesForWinRate: 50, fieldWinRate: 0.55,
  archetypes: [monoBlack, izzet],
  sources: [{ name: 'Test cache', url: 'https://example.test', note: 'Hand-written fixture.' }],
};

const advisor: AdvisorData = { index, text: new TextModel(index), meta: new Map([['standard', snapshot]]) };
const app = () => buildApp({ advisor });

const cards = (owned: Record<string, number>) =>
  Object.fromEntries(Object.entries(owned).map(([name, n]) => [oracleId(name), n]));

async function post<T>(url: string, payload: unknown, instance = app()): Promise<{ status: number; body: T }> {
  const response = await instance.inject({ method: 'POST', url, payload: payload as object });
  return { status: response.statusCode, body: JSON.parse(response.body) as T };
}

describe('GET /api/advisor/status', () => {
  it('describes the data the advisor is running on', async () => {
    const response = await app().inject({ method: 'GET', url: '/api/advisor/status' });
    const body = JSON.parse(response.body) as { ready: boolean; cards: { count: number }; meta: Array<{ format: string }>; formats: Array<{ key: string }> };
    expect(body.ready).toBe(true);
    expect(body.cards.count).toBe(index.size);
    expect(body.meta.map(m => m.format)).toEqual(['standard']);
    expect(body.formats.map(f => f.key)).toContain('brawl');
  });

  it('reports not ready, and other advisor routes answer 503, when the card index is not built', async () => {
    const bare = buildApp();
    const status = await bare.inject({ method: 'GET', url: '/api/advisor/status' });
    expect(JSON.parse(status.body)).toMatchObject({ ready: false });

    const check = await post<{ error: string; message: string }>('/api/advisor/deck/check', { deckText: '4 Shock', format: 'standard' }, bare);
    expect(check.status).toBe(503);
    expect(check.body.message).toMatch(/pnpm data:cards/);
  });
});

describe('GET /api/advisor/collection/sample', () => {
  it('returns a made-up collection with wildcards for the chosen profile', async () => {
    const response = await app().inject({ method: 'GET', url: '/api/advisor/collection/sample?profile=veteran' });
    const body = JSON.parse(response.body) as { label: string; uniqueCards: number; collection: { cards: Record<string, number>; wildcards: Record<string, number> } };
    expect(response.statusCode).toBe(200);
    expect(body.label).toBe('Veteran');
    expect(body.collection.cards[oracleId('Shock')]).toBe(4);
    expect(body.uniqueCards).toBe(Object.keys(body.collection.cards).length);
    expect(body.collection.wildcards['rare']).toBeGreaterThan(0);
  });

  it('rejects a profile it does not have, including names every object has', async () => {
    for (const profile of ['whale', 'toString', 'constructor']) {
      const response = await app().inject({ method: 'GET', url: `/api/advisor/collection/sample?profile=${profile}` });
      expect(response.statusCode).toBe(400);
    }
  });
});

describe('POST /api/advisor/collection/import', () => {
  it('imports an Arena-style list and returns the collection keyed by card', async () => {
    const { status, body } = await post<{
      formats: string[]; totalCards: number; uniqueCards: number; unresolved: { count: number; sample: string[] };
      collection: { cards: Record<string, number> };
    }>('/api/advisor/collection/import', { texts: ['4 Shock (FDN) 200\n2 Opt\n1 Card That Does Not Exist\n'] });
    expect(status).toBe(200);
    expect(body.formats).toEqual(['arena-text']);
    expect(body.totalCards).toBe(6);
    expect(body.uniqueCards).toBe(2);
    expect(body.collection.cards[oracleId('Shock')]).toBe(4);
    expect(body.unresolved).toEqual({ count: 1, sample: ['Card That Does Not Exist'] });
  });

  it('resolves grpId JSON from a tracker and merges wildcards from a second input', async () => {
    const shockId = index.byName('Shock')!.arenaIds[0]!;
    const { status, body } = await post<{
      formats: string[]; wildcards: Record<string, number>; collection: { cards: Record<string, number>; wildcards: Record<string, number> };
    }>('/api/advisor/collection/import', {
      texts: [
        JSON.stringify({ cards: [{ grpId: shockId, owned: 3 }] }),
        JSON.stringify({ wildcards: { common: 10, uncommon: 5, rare: 2, mythic: 1 }, cards: [{ count: 1, name: 'Opt' }] }),
      ],
    });
    expect(status).toBe(200);
    expect(body.formats).toEqual(['grpid-json', 'named-json']);
    expect(body.collection.cards).toEqual({ [oracleId('Shock')]: 3, [oracleId('Opt')]: 1 });
    expect(body.collection.wildcards).toEqual({ common: 10, uncommon: 5, rare: 2, mythic: 1 });
  });

  it('rejects input that matches nothing', async () => {
    const { status, body } = await post<{ error: string }>('/api/advisor/collection/import', { texts: ['hello there\nnot a list\n'] });
    expect(status).toBe(400);
    expect(body.error).toBe('No cards recognised');
  });

  it('rejects a body without texts', async () => {
    expect((await post('/api/advisor/collection/import', {})).status).toBe(400);
    expect((await post('/api/advisor/collection/import', { texts: ['  '] })).status).toBe(400);
  });
});

describe('POST /api/advisor/deck/check', () => {
  it('reports the gap, stand-ins and a buildable list for a pasted deck', async () => {
    const { status, body } = await post<DeckCheck>('/api/advisor/deck/check', {
      deckText: 'Deck\n4 Slickshot Show-Off\n4 Shock\n8 Mountain\n',
      format: 'standard',
      collection: { cards: cards({ Shock: 4, 'Crackling Cyclops': 4 }) },
    });
    expect(status).toBe(200);
    expect(body.colors).toEqual(['R']);
    expect(body.summary).toMatchObject({ totalCards: 16, ownedCards: 12, wildcardsNeeded: { rare: 4 } });

    const slickshot = body.cards.find(c => c.name === 'Slickshot Show-Off')!;
    expect(slickshot.status).toBe('missing');
    expect(slickshot.substitutes[0]).toMatchObject({ source: 'owned', quality: 'close' });
    expect(slickshot.substitutes[0]?.card.name).toBe('Crackling Cyclops');
    // The response carries what the UI shows, not the whole card record.
    expect(slickshot.card).not.toHaveProperty('oracleText');

    expect(body.plan.arenaText).toBe('Deck\n4 Shock\n8 Mountain\n4 Crackling Cyclops\n');
    expect(body.plan.fidelity).toBeGreaterThan(0.9);
  });

  it('works without a collection: everything but basics is missing', async () => {
    const { status, body } = await post<DeckCheck>('/api/advisor/deck/check', { deckText: '4 Shock\n4 Mountain\n', format: 'standard' });
    expect(status).toBe(200);
    expect(body.summary.ownedCards).toBe(4);
    expect(body.summary.wildcardsNeeded.common).toBe(4);
  });

  it('spends the wildcards sent with the collection', async () => {
    const { body } = await post<DeckCheck>('/api/advisor/deck/check', {
      deckText: '2 Sheoldred, the Apocalypse\n',
      format: 'standard',
      collection: { cards: {}, wildcards: { mythic: 2 } },
    });
    expect(body.summary.craftable).toBe(true);
    expect(body.plan.wildcardsSpent.mythic).toBe(2);
    expect(body.plan.wildcardsLeft).toEqual({ common: 0, uncommon: 0, rare: 0, mythic: 0 });
  });

  it('accepts Arena format names', async () => {
    const { status, body } = await post<DeckCheck>('/api/advisor/deck/check', {
      deckText: 'Commander\n1 Niv-Mizzet, Parun\n\nDeck\n1 Opt\n', format: 'HistoricBrawl',
    });
    expect(status).toBe(200);
    expect(body.format).toBe('brawl');
    expect(body.colors).toEqual(['U', 'R']);
  });

  it('rejects an unknown format, an empty list and an oversized list', async () => {
    expect((await post('/api/advisor/deck/check', { deckText: '4 Shock', format: 'tiny-leaders' })).status).toBe(400);
    expect((await post('/api/advisor/deck/check', { deckText: '4 Shock', format: 'constructor' })).status).toBe(400);
    const empty = await post<{ error: string }>('/api/advisor/deck/check', { deckText: 'just words', format: 'standard' });
    expect(empty.status).toBe(400);
    expect(empty.body.error).toBe('No cards in the decklist');
    expect((await post('/api/advisor/deck/check', { deckText: 'x'.repeat(30_000), format: 'standard' })).status).toBe(400);
  });

  it('rejects a malformed collection', async () => {
    const { status } = await post('/api/advisor/deck/check', {
      deckText: '4 Shock', format: 'standard', collection: { cards: { [oracleId('Shock')]: -1 } },
    });
    expect(status).toBe(400);
  });
});

describe('POST /api/advisor/meta', () => {
  it('lists archetypes by popularity without a collection', async () => {
    const { status, body } = await post<MetaView>('/api/advisor/meta', { format: 'standard' });
    expect(status).toBe(200);
    expect(body.archetypes.map(a => a.id)).toEqual(['mono-black-midrange', 'izzet-prowess']);
    expect(body.archetypes[0]).toMatchObject({ winRate: 0.6, matches: 100 });
    expect(body.archetypes[0]?.gap).toBeUndefined();
    expect(body.archetypes[0]?.keyCards).toEqual(['Sheoldred, the Apocalypse', 'Go for the Throat', 'Cut Down']);
    expect(body.sources[0]?.name).toBe('Test cache');
    expect(body.fieldWinRate).toBe(0.55);
    expect(body.archetypes.every(a => a.isFringe === false)).toBe(true);
  });

  it('puts the archetype the collection is closest to first', async () => {
    const { body } = await post<MetaView>('/api/advisor/meta', {
      format: 'standard',
      collection: { cards: cards({ 'Slickshot Show-Off': 4, Shock: 4, Opt: 4, 'Steam Vents': 2, Negate: 2 }) },
    });
    expect(body.archetypes.map(a => a.id)).toEqual(['izzet-prowess', 'mono-black-midrange']);
    expect(body.archetypes[0]?.gap).toMatchObject({ wildcardsNeeded: { common: 0, uncommon: 0, rare: 2, mythic: 0 }, cost: 2 });
  });

  it('answers 404 with the formats that do have data', async () => {
    const { status, body } = await post<{ message: string }>('/api/advisor/meta', { format: 'historic' });
    expect(status).toBe(404);
    expect(body.message).toMatch(/standard/);
  });
});

describe('POST /api/advisor/meta/check', () => {
  it('checks the archetype\'s list and lets its other lists inform the stand-ins', async () => {
    const { status, body } = await post<{ archetype: { name: string; lists: unknown[] }; check: DeckCheck }>('/api/advisor/meta/check', {
      format: 'standard',
      archetypeId: 'izzet-prowess',
      collection: { cards: cards({ Shock: 4, Opt: 4, 'Crackling Cyclops': 4, 'Tempest Angler': 4 }) },
    });
    expect(status).toBe(200);
    expect(body.archetype.name).toBe('Izzet Prowess');
    expect(body.check.archetype).toBe('Izzet Prowess');

    const slickshot = body.check.cards.find(c => c.name === 'Slickshot Show-Off')!;
    expect(slickshot.substitutes[0]?.card.name).toBe('Crackling Cyclops');
    expect(slickshot.substitutes[0]?.reasons).toContain('In 50% of Izzet Prowess main decks');
  });

  it('answers 404 for an archetype or list that does not exist', async () => {
    expect((await post('/api/advisor/meta/check', { format: 'standard', archetypeId: 'nope' })).status).toBe(404);
    expect((await post('/api/advisor/meta/check', { format: 'standard', archetypeId: 'izzet-prowess', list: 7 })).status).toBe(404);
  });
});
