import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildApp } from '../app.js';

// ---------------------------------------------------------------------------
// vi.hoisted ensures these vi.fn() instances are available when vi.mock
// factory functions are evaluated (factories are hoisted before other code).
// ---------------------------------------------------------------------------
const mocks = vi.hoisted(() => ({
  getCardByName: vi.fn(),
  getCommanderData: vi.fn(),
  assessPowerLevel: vi.fn(),
  assessPowerLevelWithCombos: vi.fn(),
}));

vi.mock('@mtg/scryfall', () => ({
  getCardByName: mocks.getCardByName,
  ScryfallNotFoundError: class ScryfallNotFoundError extends Error {
    constructor(msg?: string) { super(msg ?? 'Not found'); this.name = 'ScryfallNotFoundError'; }
  },
}));

vi.mock('@mtg/edhrec', () => ({
  getCommanderData: mocks.getCommanderData,
  EDHRecNotFoundError: class EDHRecNotFoundError extends Error {
    constructor(msg?: string) { super(msg ?? 'Not found'); this.name = 'EDHRecNotFoundError'; }
  },
}));

vi.mock('@mtg/power-level', () => ({
  assessPowerLevel: mocks.assessPowerLevel,
  assessPowerLevelWithCombos: mocks.assessPowerLevelWithCombos,
}));

vi.mock('@mtg/ai-advisor', () => ({
  explainDeck: vi.fn().mockResolvedValue({ explanation: 'test', keyCards: [], suggestedUpgrades: [] }),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeScryfallCard(name: string, overrides: Record<string, unknown> = {}) {
  return {
    name,
    cmc: 2,
    type_line: 'Creature — Goblin Warrior',
    color_identity: ['R'],
    colors: ['R'],
    oracle_text: '',
    legalities: { commander: 'legal', standard: 'not_legal' },
    prices: { usd: '1.00', usd_foil: null },
    image_uris: { small: 'https://example.com/img.jpg', normal: 'https://example.com/img.jpg' },
    ...overrides,
  };
}

/** Returns minimal EDHRec data with enough cards to fill all deck slots. */
function makeEdhrecData(commanderName: string) {
  // Need enough cards for: ramp(10), interaction(10), draw(10), winCon(5), synergy(25), lands(36), flex(3) = 99
  // TAG_TO_LABEL: manaartifacts→ramp, instants→interaction, sorceries→synergy,
  //               creatures→synergy, enchantments→synergy, gamechangers→winConditions, lands→lands
  const slotDefs: Array<{ label: string; count: number }> = [
    { label: 'manaartifacts', count: 15 },   // → ramp slot (need ≥10)
    { label: 'instants', count: 15 },         // → interaction slot (need ≥10)
    { label: 'sorceries', count: 15 },        // → synergy (draw cards etc.)
    { label: 'creatures', count: 30 },        // → synergy slot (need ≥25)
    { label: 'enchantments', count: 15 },     // → synergy slot
    { label: 'gamechangers', count: 10 },     // → winConditions slot (need ≥5)
    { label: 'lands', count: 40 },            // → lands slot (need ≥36)
  ];

  const cards: Array<{
    name: string; label: string; inclusion: number;
    synergy: number; type_line: string; color_identity: string[];
  }> = [];

  let i = 0;
  for (const { label, count } of slotDefs) {
    for (let j = 0; j < count; j++) {
      cards.push({
        name: `${label} Card ${i++}`,
        label,
        inclusion: 50 + (i % 30),
        synergy: 0.1,
        type_line: label === 'lands' ? 'Land' : label === 'creatures' ? 'Creature' : 'Instant',
        color_identity: ['R'],
      });
    }
  }

  return { commander: commanderName, cardlist: cards };
}

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
      staplesCoverage: 40,
      fastManaRatio: 0.05,
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
  '1 Counterspell',
  '1 Swords to Plowshares',
  '1 Cultivate',
  '1 Kodama\'s Reach',
  '1 Rampant Growth',
  '1 Rhystic Study',
  '4 Plains',
  '4 Island',
  '4 Swamp',
  '4 Forest',
  '4 Mountain',
].join('\n');

const COMMANDER_NAME = 'Krenko, Mob Boss';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /api/decks/build-from-commander', () => {
  let app: ReturnType<typeof buildApp>;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = buildApp();
    await app.ready();

    mocks.getCardByName.mockImplementation((name: string) =>
      Promise.resolve(makeScryfallCard(name)),
    );
    mocks.getCommanderData.mockResolvedValue(makeEdhrecData(COMMANDER_NAME));
    // buildDeck (in deck-builder lib) calls assessPowerLevel synchronously
    mocks.assessPowerLevel.mockReturnValue(makePowerLevelResult());
    // The route then enhances with combo detection via assessPowerLevelWithCombos
    mocks.assessPowerLevelWithCombos.mockResolvedValue(makePowerLevelResult());
  });

  it('returns 200 with a 100-card deck for a valid request', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/decks/build-from-commander',
      payload: { collectionText: SAMPLE_COLLECTION, commanderName: COMMANDER_NAME },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json<{ deck: { totalCards: number }; analysis: unknown; gaps: unknown; powerLevel: unknown }>();
    expect(body.deck).toBeDefined();
    expect(body.deck.totalCards).toBe(100);
    expect(body.analysis).toBeDefined();
    expect(body.gaps).toBeDefined();
    expect(body.powerLevel).toBeDefined();
  });

  it('returns correct deck shape: commander + slots + analysis fields', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/decks/build-from-commander',
      payload: { collectionText: SAMPLE_COLLECTION, commanderName: COMMANDER_NAME },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json<{
      deck: { commander: { name: string }; slots: Record<string, unknown[]>; totalCards: number };
      analysis: { averageCmc: number; staplesCoveragePercent: number };
    }>();
    expect(body.deck.commander.name).toBe(COMMANDER_NAME);
    expect(typeof body.deck.slots).toBe('object');
    expect(body.analysis.averageCmc).toBeTypeOf('number');
    expect(body.analysis.staplesCoveragePercent).toBeTypeOf('number');
  });

  it('includes powerLevel.targetSuggestions when targetBracket is specified', async () => {
    const suggestions = [
      {
        remove: 'Rhystic Study',
        removeReason: 'Game changer — too strong for Bracket 1',
        removeSlot: 'draw',
        alternatives: [{ name: 'Harmonize', inclusion: 40, synergy: 0.1, slot: 'draw' }],
      },
    ];
    mocks.assessPowerLevelWithCombos.mockResolvedValue(makePowerLevelResult(3, suggestions));

    const res = await app.inject({
      method: 'POST',
      url: '/api/decks/build-from-commander',
      payload: {
        collectionText: SAMPLE_COLLECTION,
        commanderName: COMMANDER_NAME,
        options: { targetBracket: 1 },
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json<{ powerLevel: { targetSuggestions: Array<{ remove: string }> } }>();
    expect(body.powerLevel.targetSuggestions).toHaveLength(1);
    expect(body.powerLevel.targetSuggestions[0]?.remove).toBe('Rhystic Study');
  });

  it('returns 400 when collection has no non-basic-land cards', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/decks/build-from-commander',
      payload: { collectionText: '4 Plains\n4 Island\n4 Forest', commanderName: COMMANDER_NAME },
    });

    expect(res.statusCode).toBe(400);
    const body = res.json<{ error: string }>();
    expect(body.error).toMatch(/Invalid collection/i);
  });

  it('returns 400 when collection text is completely unparseable', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/decks/build-from-commander',
      payload: { collectionText: 'this is not a valid collection at all!!!', commanderName: COMMANDER_NAME },
    });

    expect(res.statusCode).toBe(400);
  });

  it('returns 404 when commander is not found on Scryfall', async () => {
    const { ScryfallNotFoundError } = await import('@mtg/scryfall');
    mocks.getCardByName.mockRejectedValueOnce(new ScryfallNotFoundError('not found'));

    const res = await app.inject({
      method: 'POST',
      url: '/api/decks/build-from-commander',
      payload: { collectionText: SAMPLE_COLLECTION, commanderName: 'Totally Fake Commander' },
    });

    expect(res.statusCode).toBe(404);
    const body = res.json<{ error: string }>();
    expect(body.error).toMatch(/Commander not found/i);
  });

  it('returns 404 when commander is not found on EDHRec', async () => {
    const { EDHRecNotFoundError } = await import('@mtg/edhrec');
    mocks.getCommanderData.mockRejectedValueOnce(new EDHRecNotFoundError('not on edhrec'));

    const res = await app.inject({
      method: 'POST',
      url: '/api/decks/build-from-commander',
      payload: { collectionText: SAMPLE_COLLECTION, commanderName: COMMANDER_NAME },
    });

    expect(res.statusCode).toBe(404);
    const body = res.json<{ error: string }>();
    expect(body.error).toMatch(/EDHRec/i);
  });

  it('returns 422 when commander is not legal in Commander format', async () => {
    mocks.getCardByName.mockResolvedValueOnce(
      makeScryfallCard(COMMANDER_NAME, { legalities: { commander: 'banned', standard: 'not_legal' } }),
    );

    const res = await app.inject({
      method: 'POST',
      url: '/api/decks/build-from-commander',
      payload: { collectionText: SAMPLE_COLLECTION, commanderName: COMMANDER_NAME },
    });

    expect(res.statusCode).toBe(422);
    const body = res.json<{ error: string }>();
    expect(body.error).toMatch(/not legal/i);
  });

  it('succeeds with budget mode and budgetMaxPrice', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/decks/build-from-commander',
      payload: {
        collectionText: SAMPLE_COLLECTION,
        commanderName: COMMANDER_NAME,
        options: { mode: 'budget', budgetMaxPrice: 2 },
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json<{ deck: { totalCards: number } }>();
    expect(body.deck.totalCards).toBe(100);
  });

  it('responds 400 for missing required fields (no collectionText)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/decks/build-from-commander',
      payload: { commanderName: COMMANDER_NAME }, // missing collectionText
    });

    expect(res.statusCode).toBe(400);
  });
});
