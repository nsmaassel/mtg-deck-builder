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

const PARSED_EXPLANATION = {
  explanation: 'This is a proliferate-focused deck. Key synergies include Atraxa + planeswalkers and Atraxa + +1/+1 counters. Top upgrade: Doubling Season.',
  keyCards: ['Sol Ring', 'Proliferate Engine'],
  suggestedUpgrades: ['Doubling Season', 'Vorinclex, Monstrous Raider'],
};

/** Native Gemini generateContent envelope (candidates → content.parts[].text). */
const VALID_GEMINI_RESPONSE = {
  candidates: [{
    content: {
      role: 'model',
      parts: [{ text: JSON.stringify(PARSED_EXPLANATION) }],
    },
    finishReason: 'STOP',
    index: 0,
  }],
};

const VALID_ANTHROPIC_RESPONSE = {
  content: [{
    type: 'text',
    text: JSON.stringify(PARSED_EXPLANATION),
  }],
};

function mockFetchOk(payload: unknown): void {
  vi.mocked(fetch).mockResolvedValueOnce({
    ok: true,
    json: () => Promise.resolve(payload),
  } as unknown as Response);
}

function requestBody(): Record<string, unknown> {
  const init = vi.mocked(fetch).mock.calls[0]?.[1] as RequestInit;
  return JSON.parse(init.body as string) as Record<string, unknown>;
}

describe('explainDeck (multi-provider)', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    delete process.env['ANTHROPIC_API_KEY'];
    delete process.env['GEMINI_API_KEY'];
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env['ANTHROPIC_API_KEY'];
    delete process.env['GEMINI_API_KEY'];
  });

  describe('provider selection', () => {
    it('defaults to gemini when GEMINI_API_KEY is present', async () => {
      process.env['GEMINI_API_KEY'] = 'env-gemini-key';
      mockFetchOk(VALID_GEMINI_RESPONSE);

      const result = await explainDeck(MOCK_DECK_INPUT);

      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/v1beta/models/gemini-3.7-flash:generateContent'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'x-goog-api-key': 'env-gemini-key',
          }),
        }),
      );
      expect(result.keyCards).toContain('Sol Ring');
    });

    it('defaults to gemini over anthropic when both env keys are present', async () => {
      process.env['GEMINI_API_KEY'] = 'env-gemini-key';
      process.env['ANTHROPIC_API_KEY'] = 'env-anthropic-key';
      mockFetchOk(VALID_GEMINI_RESPONSE);

      await explainDeck(MOCK_DECK_INPUT);

      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('gemini-3.7-flash:generateContent'),
        expect.any(Object),
      );
    });

    it('defaults to anthropic when GEMINI_API_KEY is absent', async () => {
      mockFetchOk(VALID_ANTHROPIC_RESPONSE);

      await explainDeck(MOCK_DECK_INPUT, { apiKey: 'ant-key' });

      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/v1/messages'),
        expect.objectContaining({ method: 'POST' }),
      );
    });

    it('uses anthropic when provider is explicit even if GEMINI_API_KEY is set', async () => {
      process.env['GEMINI_API_KEY'] = 'env-gemini-key';
      mockFetchOk(VALID_ANTHROPIC_RESPONSE);

      await explainDeck(MOCK_DECK_INPUT, { provider: 'anthropic', apiKey: 'ant-key' });

      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/v1/messages'),
        expect.objectContaining({
          headers: expect.objectContaining({ 'x-api-key': 'ant-key' }),
        }),
      );
    });

    it('uses gemini when provider is explicit without GEMINI_API_KEY env', async () => {
      mockFetchOk(VALID_GEMINI_RESPONSE);

      await explainDeck(MOCK_DECK_INPUT, { provider: 'gemini', apiKey: 'g-key' });

      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('gemini-3.7-flash:generateContent'),
        expect.objectContaining({
          headers: expect.objectContaining({ 'x-goog-api-key': 'g-key' }),
        }),
      );
    });
  });

  describe('gemini', () => {
    it('parses structured JSON from the Gemini candidates envelope', async () => {
      mockFetchOk(VALID_GEMINI_RESPONSE);

      const result = await explainDeck(MOCK_DECK_INPUT, { provider: 'gemini', apiKey: 'g-key' });

      expect(result.explanation).toContain('proliferate');
      expect(result.keyCards).toEqual(['Sol Ring', 'Proliferate Engine']);
      expect(result.suggestedUpgrades).toContain('Doubling Season');
    });

    it('requests application/json with a responseSchema matching ExplainDeckResult', async () => {
      mockFetchOk(VALID_GEMINI_RESPONSE);

      await explainDeck(MOCK_DECK_INPUT, { provider: 'gemini', apiKey: 'g-key' });

      const body = requestBody();
      const generationConfig = body['generationConfig'] as Record<string, unknown>;
      const schema = generationConfig['responseSchema'] as Record<string, unknown>;
      const properties = schema['properties'] as Record<string, unknown>;

      expect(generationConfig['responseMimeType']).toBe('application/json');
      expect(schema['type']).toBe('OBJECT');
      expect(properties['explanation']).toEqual({ type: 'STRING' });
      expect(properties['keyCards']).toEqual({ type: 'ARRAY', items: { type: 'STRING' } });
      expect(properties['suggestedUpgrades']).toEqual({ type: 'ARRAY', items: { type: 'STRING' } });
      expect(schema['required']).toEqual(['explanation', 'keyCards', 'suggestedUpgrades']);
    });

    it('sends the deck prompt in Gemini contents.parts', async () => {
      mockFetchOk(VALID_GEMINI_RESPONSE);

      await explainDeck(MOCK_DECK_INPUT, { provider: 'gemini', apiKey: 'g-key' });

      const body = requestBody();
      const contents = body['contents'] as Array<{ role: string; parts: Array<{ text: string }> }>;
      expect(contents[0]?.role).toBe('user');
      expect(contents[0]?.parts[0]?.text).toContain("Atraxa, Praetors' Voice");
      expect(contents[0]?.parts[0]?.text).toContain('Sol Ring');
    });

    it('strips markdown code fences from Gemini text parts', async () => {
      mockFetchOk({
        candidates: [{
          content: {
            parts: [{
              text: '```json\n' + JSON.stringify({
                explanation: 'Great deck.',
                keyCards: ['Card A'],
                suggestedUpgrades: ['Card B'],
              }) + '\n```',
            }],
          },
        }],
      });

      const result = await explainDeck(MOCK_DECK_INPUT, { provider: 'gemini', apiKey: 'g-key' });
      expect(result.explanation).toBe('Great deck.');
    });

    it('uses custom baseUrl for the Gemini generateContent path', async () => {
      mockFetchOk(VALID_GEMINI_RESPONSE);

      await explainDeck(MOCK_DECK_INPUT, {
        provider: 'gemini',
        apiKey: 'g-key',
        baseUrl: 'http://localhost:9999',
      });

      expect(fetch).toHaveBeenCalledWith(
        'http://localhost:9999/v1beta/models/gemini-3.7-flash:generateContent',
        expect.any(Object),
      );
    });

    it('throws AiAdvisorError on non-200 Gemini responses', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        status: 429,
        text: () => Promise.resolve('RESOURCE_EXHAUSTED'),
      } as unknown as Response);

      await expect(
        explainDeck(MOCK_DECK_INPUT, { provider: 'gemini', apiKey: 'g-key' }),
      ).rejects.toThrow(AiAdvisorError);
    });

    it('throws AiAdvisorError when Gemini returns no text parts', async () => {
      mockFetchOk({ candidates: [{ content: { parts: [] } }] });

      await expect(
        explainDeck(MOCK_DECK_INPUT, { provider: 'gemini', apiKey: 'g-key' }),
      ).rejects.toThrow(AiAdvisorError);
    });

    it('throws AiAdvisorError when Gemini returns an empty candidates list', async () => {
      mockFetchOk({ candidates: [] });

      await expect(
        explainDeck(MOCK_DECK_INPUT, { provider: 'gemini', apiKey: 'g-key' }),
      ).rejects.toThrow(AiAdvisorError);
    });
  });

  describe('structured JSON validation', () => {
    it('throws AiAdvisorError when Gemini text is not JSON', async () => {
      mockFetchOk({
        candidates: [{ content: { parts: [{ text: 'not json at all' }] } }],
      });

      await expect(
        explainDeck(MOCK_DECK_INPUT, { provider: 'gemini', apiKey: 'g-key' }),
      ).rejects.toThrow(/Failed to parse AI response as JSON/);
    });

    it('throws AiAdvisorError when JSON is missing explanation', async () => {
      mockFetchOk({
        candidates: [{
          content: {
            parts: [{ text: JSON.stringify({ keyCards: ['A'], suggestedUpgrades: ['B'] }) }],
          },
        }],
      });

      await expect(
        explainDeck(MOCK_DECK_INPUT, { provider: 'gemini', apiKey: 'g-key' }),
      ).rejects.toThrow(/missing explanation\/keyCards\/suggestedUpgrades/);
    });

    it('throws AiAdvisorError when keyCards is not an array', async () => {
      mockFetchOk({
        candidates: [{
          content: {
            parts: [{
              text: JSON.stringify({
                explanation: 'ok',
                keyCards: 'Sol Ring',
                suggestedUpgrades: ['B'],
              }),
            }],
          },
        }],
      });

      await expect(
        explainDeck(MOCK_DECK_INPUT, { provider: 'gemini', apiKey: 'g-key' }),
      ).rejects.toThrow(AiAdvisorError);
    });

    it('throws AiAdvisorError when suggestedUpgrades is not an array', async () => {
      mockFetchOk({
        content: [{
          type: 'text',
          text: JSON.stringify({
            explanation: 'ok',
            keyCards: ['A'],
            suggestedUpgrades: 'Doubling Season',
          }),
        }],
      });

      await expect(
        explainDeck(MOCK_DECK_INPUT, { provider: 'anthropic', apiKey: 'ant-key' }),
      ).rejects.toThrow(AiAdvisorError);
    });

    it('coerces non-string array items to strings', async () => {
      mockFetchOk({
        candidates: [{
          content: {
            parts: [{
              text: JSON.stringify({
                explanation: 'ok',
                keyCards: [1, 'Sol Ring'],
                suggestedUpgrades: [true],
              }),
            }],
          },
        }],
      });

      const result = await explainDeck(MOCK_DECK_INPUT, { provider: 'gemini', apiKey: 'g-key' });
      expect(result.keyCards).toEqual(['1', 'Sol Ring']);
      expect(result.suggestedUpgrades).toEqual(['true']);
    });
  });

  describe('fallback', () => {
    it('returns fallback when gemini is selected and no key is available', async () => {
      const result = await explainDeck(MOCK_DECK_INPUT, { provider: 'gemini' });

      expect(fetch).not.toHaveBeenCalled();
      expect(result.explanation).toContain("Atraxa, Praetors' Voice");
      expect(result.explanation).toContain('GEMINI_API_KEY');
      expect(result.keyCards).toEqual([]);
      expect(result.suggestedUpgrades).toEqual([]);
    });

    it('returns fallback when anthropic is selected and no key is available', async () => {
      const result = await explainDeck(MOCK_DECK_INPUT, { provider: 'anthropic' });

      expect(fetch).not.toHaveBeenCalled();
      expect(result.explanation).toContain('ANTHROPIC_API_KEY');
    });
  });
});
