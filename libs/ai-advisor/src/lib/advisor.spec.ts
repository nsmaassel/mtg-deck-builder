import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { explainDeck, AiAdvisorError } from './advisor';
import type { ExplainDeckInput } from './types';

const MOCK_DECK_INPUT: ExplainDeckInput = {
  commanderName: "Atraxa, Praetors' Voice",
  deck: {
    commander: {
      name: "Atraxa, Praetors' Voice",
      quantity: 1,
      ownedInCollection: true,
      edhrec_inclusion: 0,
      edhrec_synergy: 0,
      score: 1,
      slot: 'synergy',
      cmc: 4,
      type_line: 'Legendary Creature',
      usdPrice: 12,
    },
    slots: {
      ramp: [{ name: 'Sol Ring', quantity: 1, ownedInCollection: true, edhrec_inclusion: 95, edhrec_synergy: 0.3, score: 0.85, slot: 'ramp', cmc: 1, type_line: 'Artifact', usdPrice: 1 }],
      draw: [],
      interaction: [],
      winConditions: [],
      synergy: [],
      lands: [],
      flex: [],
    },
    totalCards: 2,
  },
  missingStaples: [{ name: 'Doubling Season', wouldFillSlot: 'synergy' }],
};

const VALID_API_RESPONSE = {
  content: [{
    type: 'text',
    text: JSON.stringify({
      explanation: 'This is a proliferate-focused deck. Key synergies include Atraxa + planeswalkers and Atraxa + +1/+1 counters. Top upgrade: Doubling Season.',
      keyCards: ['Sol Ring', 'Proliferate Engine'],
      suggestedUpgrades: ['Doubling Season', 'Vorinclex, Monstrous Raider'],
    }),
  }],
};

describe('explainDeck', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env['ANTHROPIC_API_KEY'];
  });

  it('returns fallback result when no API key provided', async () => {
    const result = await explainDeck(MOCK_DECK_INPUT, {});
    expect(result.explanation).toContain("Atraxa, Praetors' Voice");
    expect(result.keyCards).toEqual([]);
    expect(result.suggestedUpgrades).toEqual([]);
  });

  it('returns fallback when ANTHROPIC_API_KEY env var is missing', async () => {
    delete process.env['ANTHROPIC_API_KEY'];
    const result = await explainDeck(MOCK_DECK_INPUT);
    expect(result.explanation).toBeTruthy();
    expect(Array.isArray(result.keyCards)).toBe(true);
  });

  it('calls Anthropic API and parses response correctly', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(VALID_API_RESPONSE),
    } as unknown as Response);

    const result = await explainDeck(MOCK_DECK_INPUT, { apiKey: 'test-key' });

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/v1/messages'),
      expect.objectContaining({ method: 'POST' }),
    );
    expect(result.explanation).toContain('proliferate');
    expect(result.keyCards).toContain('Sol Ring');
    expect(result.suggestedUpgrades).toContain('Doubling Season');
  });

  it('strips markdown code fences from AI response', async () => {
    const fencedResponse = {
      content: [{
        type: 'text',
        text: '```json\n' + JSON.stringify({
          explanation: 'Great deck.',
          keyCards: ['Card A'],
          suggestedUpgrades: ['Card B'],
        }) + '\n```',
      }],
    };

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(fencedResponse),
    } as unknown as Response);

    const result = await explainDeck(MOCK_DECK_INPUT, { apiKey: 'test-key' });
    expect(result.explanation).toBe('Great deck.');
  });

  it('throws AiAdvisorError on non-200 API response', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: () => Promise.resolve('Unauthorized'),
    } as unknown as Response);

    await expect(explainDeck(MOCK_DECK_INPUT, { apiKey: 'bad-key' })).rejects.toThrow(AiAdvisorError);
  });

  it('throws AiAdvisorError when AI returns malformed JSON', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ content: [{ type: 'text', text: 'not json at all' }] }),
    } as unknown as Response);

    await expect(explainDeck(MOCK_DECK_INPUT, { apiKey: 'test-key' })).rejects.toThrow(AiAdvisorError);
  });

  it('uses custom baseUrl when provided', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(VALID_API_RESPONSE),
    } as unknown as Response);

    await explainDeck(MOCK_DECK_INPUT, { apiKey: 'test-key', baseUrl: 'http://localhost:9999' });

    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:9999/v1/messages',
      expect.any(Object),
    );
  });
});
