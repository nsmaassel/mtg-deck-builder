import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TextModel } from '@mtg/deck-advisor';
import type { AdvisorData } from '@mtg/deck-advisor';
import { ComboIndex, CombosBuilder } from '@mtg/combos';
import { buildCommanderTestIndex } from '@mtg/commander-recs/testing';
import { buildApp } from '../app.js';

// ---------------------------------------------------------------------------
// vi.hoisted ensures these vi.fn() instances are available when vi.mock
// factory functions are evaluated (factories are hoisted before other code).
// ---------------------------------------------------------------------------
const mocks = vi.hoisted(() => ({
  getCardByName: vi.fn(),
  assessPowerLevel: vi.fn(),
}));

// Scryfall is only asked to spell a commander name the index does not know.
vi.mock('@mtg/scryfall', () => ({
  getCardByName: mocks.getCardByName,
  ScryfallError: class ScryfallError extends Error {
    constructor(msg?: string, public readonly status?: number) { super(msg ?? 'Scryfall error'); this.name = 'ScryfallError'; }
  },
  ScryfallNotFoundError: class ScryfallNotFoundError extends Error {
    constructor(msg?: string) { super(msg ?? 'Not found'); this.name = 'ScryfallNotFoundError'; }
  },
}));

// The power assessment has its own tests; here it is watched for what the route hands it.
vi.mock('@mtg/power-level', async importOriginal => ({
  ...(await importOriginal<typeof import('@mtg/power-level')>()),
  assessPowerLevel: mocks.assessPowerLevel,
}));

vi.mock('@mtg/ai-advisor', () => ({
  explainDeck: vi.fn().mockResolvedValue({ explanation: 'test', keyCards: [], suggestedUpgrades: [] }),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const index = buildCommanderTestIndex();
const advisor: AdvisorData = { index, text: new TextModel(index), meta: new Map() };

function makePowerLevelResult(bracket: 1 | 2 | 3 | 4 | 5 = 2, targetSuggestions?: unknown[]) {
  const labels = { 1: 'Exhibition', 2: 'Core', 3: 'Enhanced', 4: 'Optimized', 5: 'cEDH' } as const;
  return {
    bracket,
    score: bracket * 2,
    label: labels[bracket],
    signals: {
      gameChangers: [],
      tierATutors: [],
      tierBTutors: [],
      avgCmc: 2.5,
      interactionCount: 8,
      topPicksCoverage: 40,
      averagePopularity: 35,
      fastManaRatio: 0.05,
      combos: [],
      twoCardComboCount: 0,
    },
    explanation: ['No game changers detected.'],
    targetSuggestions: targetSuggestions ?? [],
  };
}

const SAMPLE_COLLECTION = [
  '1 Sol Ring',
  '1 Arcane Signet',
  '1 Command Tower',
  '1 Lightning Bolt',
  '1 Goblin Chieftain',
  '1 Counterspell',
  '1 Hill Ogre 60',
  '4 Plains',
  '4 Island',
  '4 Swamp',
  '4 Forest',
  '4 Mountain',
].join('\n');

const COMMANDER_NAME = 'Krenko, Mob Boss';

interface DeckCardBody {
  name: string;
  ownedInCollection: boolean;
  popularity: number;
  synergy: number;
  reasons: string[];
  type_line: string;
  usdPrice: number | null;
}

interface BuildBody {
  deck: { commander: DeckCardBody; slots: Record<string, DeckCardBody[]>; totalCards: number };
  analysis: { averageCmc: number; topPicksCoveragePercent: number; themes: Array<{ slug: string; name: string }> };
  gaps: { missingCards: Array<{ name: string; popularity: number; reasons: string[]; wouldFillSlot: string }> };
  powerLevel: { targetSuggestions: Array<{ remove: string }> };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /api/decks/build-from-commander', () => {
  let app: ReturnType<typeof buildApp>;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = buildApp({ advisor });
    await app.ready();

    const { ScryfallNotFoundError } = await import('@mtg/scryfall');
    mocks.getCardByName.mockRejectedValue(new ScryfallNotFoundError('not found'));
    // buildDeck (in the deck-builder lib) assesses once; the route assesses again with swap candidates and combos.
    mocks.assessPowerLevel.mockReturnValue(makePowerLevelResult());
  });

  const build = (payload: Record<string, unknown>) =>
    app.inject({ method: 'POST', url: '/api/decks/build-from-commander', payload });

  it('returns 200 with a 100-card deck for a valid request', async () => {
    const res = await build({ collectionText: SAMPLE_COLLECTION, commanderName: COMMANDER_NAME });

    expect(res.statusCode).toBe(200);
    const body = res.json<BuildBody>();
    expect(body.deck).toBeDefined();
    expect(body.deck.totalCards).toBe(100);
    expect(body.analysis).toBeDefined();
    expect(body.gaps).toBeDefined();
    expect(body.powerLevel).toBeDefined();
  });

  it('builds from the local card index without asking anyone else', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const res = await build({ collectionText: SAMPLE_COLLECTION, commanderName: COMMANDER_NAME });

    expect(res.statusCode).toBe(200);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(mocks.getCardByName).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('returns correct deck shape: commander + slots + analysis fields', async () => {
    const res = await build({ collectionText: SAMPLE_COLLECTION, commanderName: COMMANDER_NAME });

    expect(res.statusCode).toBe(200);
    const body = res.json<BuildBody>();
    expect(body.deck.commander.name).toBe(COMMANDER_NAME);
    expect(Object.keys(body.deck.slots).sort()).toEqual(['draw', 'flex', 'interaction', 'lands', 'ramp', 'synergy', 'winConditions']);
    expect(body.analysis.averageCmc).toBeTypeOf('number');
    expect(body.analysis.topPicksCoveragePercent).toBeTypeOf('number');
    expect(body.analysis.themes.map(theme => theme.slug)).toEqual(['typal', 'tokens']);
  });

  it('says for every card how widely it is played, how well it fits and why it is there', async () => {
    const res = await build({ collectionText: SAMPLE_COLLECTION, commanderName: COMMANDER_NAME });
    const body = res.json<BuildBody>();
    const cards = Object.values(body.deck.slots).flat();

    for (const card of cards) {
      expect(card.popularity).toBeGreaterThanOrEqual(0);
      expect(card.popularity).toBeLessThanOrEqual(1);
      expect(card.synergy).toBeGreaterThanOrEqual(0);
      expect(card.reasons.length).toBeGreaterThanOrEqual(1);
      // No per-commander inclusion figure exists any more, so none may be claimed.
      expect(Object.keys(card).filter(key => /inclusion/i.test(key))).toEqual([]);
    }
    const solRing = cards.find(card => card.name === 'Sol Ring')!;
    expect(solRing).toMatchObject({ popularity: 1, synergy: 0, reasons: ['Mana rock'], ownedInCollection: true });
    const matron = cards.find(card => card.name === 'Goblin Matron')!;
    expect(matron.synergy).toBeGreaterThan(0.8);
    expect(matron.ownedInCollection).toBe(false);
    expect(matron.usdPrice).toBe(1);
  });

  it('uses the owned cards that fit and leaves out the ones that cannot go in the deck', async () => {
    const res = await build({ collectionText: SAMPLE_COLLECTION, commanderName: COMMANDER_NAME });
    const names = Object.values(res.json<BuildBody>().deck.slots).flat().map(card => card.name);

    expect(names).toEqual(expect.arrayContaining(['Sol Ring', 'Arcane Signet', 'Lightning Bolt', 'Goblin Chieftain', 'Command Tower']));
    // Blue, so outside Krenko's colour identity however many copies are owned.
    expect(names).not.toContain('Counterspell');
  });

  it('builds only from the collection in owned-only mode, scoring cards no top list reaches', async () => {
    const res = await build({ collectionText: SAMPLE_COLLECTION, commanderName: COMMANDER_NAME, options: { mode: 'owned-only' } });

    expect(res.statusCode).toBe(200);
    const cards = Object.values(res.json<BuildBody>().deck.slots).flat();
    expect(cards.filter(card => !card.ownedInCollection)).toEqual([]);
    expect(cards.map(card => card.name)).toEqual(expect.arrayContaining(['Hill Ogre 60', 'Goblin Chieftain', 'Sol Ring']));
  });

  it('lists the cards to get with a reason each, not an inclusion figure', async () => {
    const res = await build({ collectionText: SAMPLE_COLLECTION, commanderName: COMMANDER_NAME });
    const { gaps } = res.json<BuildBody>();

    expect(gaps.missingCards.length).toBeGreaterThan(0);
    for (const card of gaps.missingCards) {
      expect(card.reasons.length).toBeGreaterThanOrEqual(1);
      expect(card.popularity).toBeTypeOf('number');
      expect(Object.keys(card).filter(key => /inclusion/i.test(key))).toEqual([]);
    }
    expect(gaps.missingCards.map(card => card.name)).not.toContain('Sol Ring');
  });

  it('offers recommendations that are not in the deck as swap candidates', async () => {
    const res = await build({ collectionText: SAMPLE_COLLECTION, commanderName: COMMANDER_NAME, options: { targetBracket: 1 } });
    expect(res.statusCode).toBe(200);

    const [deck, , targetBracket, candidates] = mocks.assessPowerLevel.mock.calls.at(-1) as [
      BuildBody['deck'], unknown, number, Array<{ name: string; popularity: number; synergy: number; slot: string }>,
    ];
    expect(targetBracket).toBe(1);
    const inDeck = new Set(Object.values(deck.slots).flat().map(card => card.name));
    expect(candidates.length).toBeGreaterThan(0);
    for (const candidate of candidates) {
      expect(inDeck.has(candidate.name)).toBe(false);
      expect(candidate.popularity).toBeTypeOf('number');
      expect(candidate.slot).toBeTypeOf('string');
    }
  });

  it('includes powerLevel.targetSuggestions when targetBracket is specified', async () => {
    const suggestions = [
      {
        remove: 'Underworld Breach',
        removeReason: 'Game changer — too strong for Bracket 1',
        removeSlot: 'winConditions',
        alternatives: [{ name: 'Mob Rule 5', popularity: 0.19, synergy: 0, slot: 'winConditions' }],
      },
    ];
    mocks.assessPowerLevel.mockReturnValue(makePowerLevelResult(3, suggestions));

    const res = await build({ collectionText: SAMPLE_COLLECTION, commanderName: COMMANDER_NAME, options: { targetBracket: 1 } });

    expect(res.statusCode).toBe(200);
    const body = res.json<BuildBody>();
    expect(body.powerLevel.targetSuggestions).toHaveLength(1);
    expect(body.powerLevel.targetSuggestions[0]?.remove).toBe('Underworld Breach');
  });

  it('reports what a build aimed at a bracket did, and nothing of the kind without a target', async () => {
    mocks.assessPowerLevel.mockReturnValue(makePowerLevelResult(3));
    const aimed = await build({ collectionText: SAMPLE_COLLECTION, commanderName: COMMANDER_NAME, options: { targetBracket: 1 } });
    expect(aimed.json<{ bracketTuning?: unknown }>().bracketTuning).toMatchObject({ target: 1, reached: 3, untuned: 3 });

    const plain = await build({ collectionText: SAMPLE_COLLECTION, commanderName: COMMANDER_NAME });
    expect(plain.json<{ bracketTuning?: unknown }>().bracketTuning).toBeUndefined();
  });

  it('responds 200 with a 100-card deck when collectionText is omitted (new player path)', async () => {
    const res = await build({ commanderName: COMMANDER_NAME });

    expect(res.statusCode).toBe(200);
    const body = res.json<BuildBody>();
    expect(body.deck).toBeDefined();
    expect(body.deck.totalCards).toBe(100);
    expect(body.analysis).toBeDefined();
    expect(body.gaps).toBeDefined();
    expect(body.powerLevel).toBeDefined();
    // Nothing holds the build back, so it is exactly the deck we would pick.
    expect(body.analysis.topPicksCoveragePercent).toBe(100);
  });

  it('responds 200 with a 100-card deck when collectionText is empty string (new player path)', async () => {
    const res = await build({ collectionText: '', commanderName: COMMANDER_NAME });

    expect(res.statusCode).toBe(200);
    const body = res.json<BuildBody>();
    expect(body.deck.totalCards).toBe(100);
  });

  it('builds a different deck for another commander in the same colours', async () => {
    const synergyOf = async (commanderName: string) =>
      (await build({ commanderName })).json<BuildBody>().deck.slots['synergy']!.map(card => card.name);
    const krenko = await synergyOf(COMMANDER_NAME);
    const zada = await synergyOf('Zada, Hedron Grinder');

    expect(krenko.filter(name => zada.includes(name)).length).toBeLessThanOrEqual(3);
  });

  it('responds 400 when collection text is completely unparseable', async () => {
    const res = await build({ collectionText: 'this is not a valid collection at all!!!', commanderName: COMMANDER_NAME });

    expect(res.statusCode).toBe(400);
  });

  it('responds 400 when collection has no non-basic-land cards', async () => {
    const res = await build({ collectionText: '4 Plains\n4 Island\n4 Forest', commanderName: COMMANDER_NAME });

    expect(res.statusCode).toBe(400);
    const body = res.json<{ error: string }>();
    expect(body.error).toMatch(/Invalid collection/i);
  });

  it('returns 404 when the commander is in neither the card index nor Scryfall', async () => {
    const res = await build({ collectionText: SAMPLE_COLLECTION, commanderName: 'Totally Fake Commander' });

    expect(res.statusCode).toBe(404);
    const body = res.json<{ error: string }>();
    expect(body.error).toMatch(/Commander not found/i);
    expect(mocks.getCardByName).toHaveBeenCalledWith('Totally Fake Commander');
  });

  it('asks Scryfall for the spelling of a commander name the index does not know as typed', async () => {
    mocks.getCardByName.mockResolvedValueOnce({ name: COMMANDER_NAME });

    const res = await build({ collectionText: SAMPLE_COLLECTION, commanderName: 'krenko mob boss' });

    expect(res.statusCode).toBe(200);
    expect(res.json<BuildBody>().deck.commander.name).toBe(COMMANDER_NAME);
  });

  it('returns 404 when Scryfall knows a commander that the card index does not have yet', async () => {
    mocks.getCardByName.mockResolvedValueOnce({ name: 'Printed Last Week, the Newest' });

    const res = await build({ collectionText: SAMPLE_COLLECTION, commanderName: 'printed last week' });

    expect(res.statusCode).toBe(404);
  });

  it('returns 422 when commander is not legal in Commander format', async () => {
    const res = await build({ collectionText: SAMPLE_COLLECTION, commanderName: 'Black Lotus' });

    expect(res.statusCode).toBe(422);
    const body = res.json<{ error: string }>();
    expect(body.error).toMatch(/not legal/i);
  });

  it('returns a friendly 502 when Scryfall is down (5xx) during commander lookup', async () => {
    const { ScryfallError } = await import('@mtg/scryfall');
    mocks.getCardByName.mockRejectedValueOnce(new ScryfallError('Scryfall API error: Service Unavailable', 503));

    const res = await build({ collectionText: SAMPLE_COLLECTION, commanderName: 'krenko mob boss' });

    expect(res.statusCode).toBe(502);
    const body = res.json<{ error: string; message: string }>();
    expect(body.error).toMatch(/temporarily unavailable/i);
    expect(body.message).toBeTruthy();
  });

  it('succeeds with budget mode and budgetMaxPrice', async () => {
    const res = await build({
      collectionText: SAMPLE_COLLECTION,
      commanderName: COMMANDER_NAME,
      options: { mode: 'budget', budgetMaxPrice: 2 },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json<BuildBody>();
    expect(body.deck.totalCards).toBe(100);
    const bought = Object.values(body.deck.slots).flat().filter(card => !card.ownedInCollection && card.type_line !== 'Basic Land');
    for (const card of bought) expect(card.usdPrice).toBeLessThanOrEqual(2);
    // Owned, so in the deck whatever it costs.
    expect(Object.values(body.deck.slots).flat().map(card => card.name)).toContain('Goblin Chieftain');
  });

  it('responds 400 when owned-only mode is used without a collection', async () => {
    const res = await build({ collectionText: '', commanderName: COMMANDER_NAME, options: { mode: 'owned-only' } });

    expect(res.statusCode).toBe(400);
    const body = res.json<{ error: string }>();
    expect(body.error).toMatch(/owned only/i);
  });
});

describe('Commander Builder without a card index', () => {
  const bare = () => buildApp();

  it('answers 503 and says how to build the data', async () => {
    const app = bare();
    const responses = await Promise.all([
      app.inject({ method: 'POST', url: '/api/decks/build-from-commander', payload: { commanderName: COMMANDER_NAME } }),
      app.inject({ method: 'POST', url: '/api/decks/build-from-theme', payload: { collectionText: '', theme: 'typal' } }),
      app.inject({ method: 'GET', url: '/api/commanders/search?q=krenko' }),
    ]);

    for (const res of responses) {
      expect(res.statusCode).toBe(503);
      const body = res.json<{ error: string; message: string }>();
      expect(body.error).toMatch(/not built/i);
      expect(body.message).toMatch(/pnpm data:cards/);
    }
    expect(mocks.getCardByName).not.toHaveBeenCalled();
  });

  it('leaves the rest of the server working', async () => {
    const app = bare();
    expect((await app.inject({ method: 'GET', url: '/health' })).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: '/api/themes' })).statusCode).toBe(200);
    const parsed = await app.inject({ method: 'POST', url: '/api/collection/parse', payload: { collectionText: SAMPLE_COLLECTION } });
    expect(parsed.statusCode).toBe(200);
  });
});

describe('GET /api/themes', () => {
  it('lists the themes a commander can be profiled with', async () => {
    const res = await buildApp({ advisor }).inject({ method: 'GET', url: '/api/themes' });

    expect(res.statusCode).toBe(200);
    const { themes } = res.json<{ themes: Array<{ slug: string; displayName: string; description: string }> }>();
    expect(themes.map(theme => theme.slug)).toEqual(
      expect.arrayContaining(['typal', 'tokens', 'voltron', 'control', 'combo', 'stompy', 'reanimator', 'aristocrats', 'spellslinger', 'artifacts', 'enchantress']),
    );
    for (const theme of themes) {
      expect(theme.displayName).toBeTruthy();
      expect(theme.description).toBeTruthy();
    }
  });
});

describe('POST /api/decks/build-from-theme', () => {
  const suggest = (theme: string) =>
    buildApp({ advisor }).inject({ method: 'POST', url: '/api/decks/build-from-theme', payload: { collectionText: '', theme } });

  it('suggests commanders whose profile has the theme, most played first', async () => {
    const res = await suggest('typal');

    expect(res.statusCode).toBe(200);
    const body = res.json<{ suggestedCommanders: Array<{ name: string; edhrec_rank: number | null; colorIdentity: string[] }> }>();
    expect(body.suggestedCommanders.map(commander => commander.name)).toEqual([
      'Krenko, Mob Boss',
      'Ezuri, Renegade Leader',
      "Kykar, Wind's Fury",
    ]);
    expect(body.suggestedCommanders[0]).toEqual({ name: 'Krenko, Mob Boss', edhrec_rank: 1090, colorIdentity: ['R'] });
  });

  it('accepts a theme by its display name', async () => {
    const res = await suggest('Spellslinger');

    expect(res.statusCode).toBe(200);
    const body = res.json<{ theme: { slug: string }; suggestedCommanders: Array<{ name: string }> }>();
    expect(body.theme.slug).toBe('spellslinger');
    expect(body.suggestedCommanders.map(commander => commander.name)).toContain('Zada, Hedron Grinder');
  });

  it('returns 404 for a theme that does not exist', async () => {
    const res = await suggest('no-such-theme');

    expect(res.statusCode).toBe(404);
    expect(res.json<{ error: string }>().error).toMatch(/Theme not found/i);
  });
});

describe('GET /api/commanders/search', () => {
  const search = (q: string) =>
    buildApp({ advisor }).inject({ method: 'GET', url: `/api/commanders/search?q=${encodeURIComponent(q)}` });

  it('finds commanders in the card index by part of their name', async () => {
    const res = await search('krenko');

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      commanders: [{ name: 'Krenko, Mob Boss', slug: 'krenko-mob-boss', colorIdentity: ['R'] }],
    });
    expect(mocks.getCardByName).not.toHaveBeenCalled();
  });

  it('returns only cards that can be a commander', async () => {
    const res = await search('goblin');

    expect(res.json<{ commanders: Array<{ name: string }> }>().commanders.map(commander => commander.name)).toEqual([
      'Squee, Goblin Nabob',
    ]);
  });

  it('returns an empty list when nothing matches', async () => {
    const res = await search('zzzz');

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ commanders: [] });
  });
});

describe('POST /api/decks/build-from-commander: commander checks and combos', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.assessPowerLevel.mockReturnValue(makePowerLevelResult());
  });

  it('returns 422 for a card that is legal in the format but cannot lead a deck', async () => {
    const app = buildApp({ advisor });
    const res = await app.inject({ method: 'POST', url: '/api/decks/build-from-commander', payload: { commanderName: 'Sol Ring' } });
    expect(res.statusCode).toBe(422);
    expect(res.json<{ error: string; message: string }>()).toMatchObject({ error: 'Not a commander' });
  });

  it('hands the power assessment the combos in the deck when combo data is loaded, and none when it is not', async () => {
    const id = (name: string) => index.byName(name)!.oracleId;
    const builder = new CombosBuilder(index);
    builder.add({
      id: 'ring-tremors',
      status: 'OK',
      uses: ['Sol Ring', 'Impact Tremors'].map(name => ({ card: { name, oracleId: id(name) }, quantity: 1 })),
      requires: [],
      produces: [{ feature: { name: 'Infinite damage', status: 'S' } }],
      identity: 'R',
      popularity: 10,
    });
    const combos = ComboIndex.fromFile(builder.build({ timestamp: '2026-11-12T00:00:00Z', version: 'test' }));

    const withCombos = buildApp({ advisor: { ...advisor, combos } });
    await withCombos.inject({ method: 'POST', url: '/api/decks/build-from-commander', payload: { commanderName: COMMANDER_NAME } });
    expect(mocks.assessPowerLevel.mock.calls.at(-1)![4]).toEqual([
      { id: 'ring-tremors', uses: ['Sol Ring', 'Impact Tremors'], cardCount: 2, produces: ['Infinite damage'] },
    ]);

    const without = buildApp({ advisor });
    await without.inject({ method: 'POST', url: '/api/decks/build-from-commander', payload: { commanderName: COMMANDER_NAME } });
    expect(mocks.assessPowerLevel.mock.calls.at(-1)![4]).toEqual([]);
  });
});
