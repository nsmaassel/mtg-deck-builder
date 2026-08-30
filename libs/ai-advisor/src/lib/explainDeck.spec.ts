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

const VALID_ADVICE_PAYLOAD = {
  explanation: 'This is a proliferate-focused deck. Key synergies include Atraxa + planeswalkers and Atraxa + +1/+1 counters. Top upgrade: Doubling Season.',
  keyCards: ['Sol Ring', 'Proliferate Engine'],
  suggestedUpgrades: ['Doubling Season', 'Vorinclex, Monstrous Raider'],
};

const VALID_ANTHROPIC_RESPONSE = {
  content: [{
    type: 'text',
    text: JSON.stringify(VALID_ADVICE_PAYLOAD),
  }],
};

const VALID_GEMINI_RESPONSE = {
  candidates: [{
    content: {
      parts: [{
        text: JSON.stringify(VALID_ADVICE_PAYLOAD),
      }],
    },
  }],
};

describe('explainDeck', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    delete process.env['GEMINI_API_KEY'];
    delete process.env['GOOGLE_API_KEY'];
    delete process.env['ANTHROPIC_API_KEY'];
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env['GEMINI_API_KEY'];
    delete process.env['GOOGLE_API_KEY'];
    delete process.env['ANTHROPIC_API_KEY'];
  });

  describe('Fallback behavior', () => {
    it('returns fallback result when no API keys are provided', async () => {
      const result = await explainDeck(MOCK_DECK_INPUT, {});
      expect(result.explanation).toContain("Atraxa, Praetors' Voice");
      expect(result.keyCards).toEqual([]);
      expect(result.suggestedUpgrades).toEqual([]);
    });

    it('returns fallback when specified provider has no API key', async () => {
      const result = await explainDeck(MOCK_DECK_INPUT, { provider: 'gemini' });
      expect(result.explanation).toBeTruthy();
      expect(result.keyCards).toEqual([]);
      expect(result.suggestedUpgrades).toEqual([]);
    });

    it('returns fallback when anthropic provider has no API key', async () => {
      const result = await explainDeck(MOCK_DECK_INPUT, { provider: 'anthropic' });
      expect(result.explanation).toBeTruthy();
      expect(result.keyCards).toEqual([]);
      expect(result.suggestedUpgrades).toEqual([]);
    });
  });

  describe('Gemini Provider (Default Workhorse)', () => {
    it('calls Gemini generateContent API and parses structured response', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(VALID_GEMINI_RESPONSE),
      } as unknown as Response);

      const result = await explainDeck(MOCK_DECK_INPUT, {
        provider: 'gemini',
        apiKey: 'gemini-test-key',
      });

      expect(fetch).toHaveBeenCalledWith(
        'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.7-flash:generateContent',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'x-goog-api-key': 'gemini-test-key',
            'Content-Type': 'application/json',
          }),
        }),
      );
      expect(result.explanation).toContain('proliferate');
      expect(result.keyCards).toContain('Sol Ring');
      expect(result.suggestedUpgrades).toContain('Doubling Season');
    });

    it('auto-detects Gemini provider from GEMINI_API_KEY env var', async () => {
      process.env['GEMINI_API_KEY'] = 'env-gemini-key';
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(VALID_GEMINI_RESPONSE),
      } as unknown as Response);

      const result = await explainDeck(MOCK_DECK_INPUT);

      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/models/gemini-3.7-flash:generateContent'),
        expect.objectContaining({
          headers: expect.objectContaining({
            'x-goog-api-key': 'env-gemini-key',
          }),
        }),
      );
      expect(result.keyCards).toContain('Sol Ring');
    });

    it('auto-detects Gemini provider from GOOGLE_API_KEY env var', async () => {
      process.env['GOOGLE_API_KEY'] = 'env-google-key';
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(VALID_GEMINI_RESPONSE),
      } as unknown as Response);

      const result = await explainDeck(MOCK_DECK_INPUT);

      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/models/gemini-3.7-flash:generateContent'),
        expect.objectContaining({
          headers: expect.objectContaining({
            'x-goog-api-key': 'env-google-key',
          }),
        }),
      );
      expect(result.keyCards).toContain('Sol Ring');
    });

    it('supports custom Gemini model and baseUrl', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(VALID_GEMINI_RESPONSE),
      } as unknown as Response);

      await explainDeck(MOCK_DECK_INPUT, {
        provider: 'gemini',
        apiKey: 'test-key',
        model: 'gemini-2.5-flash',
        baseUrl: 'http://localhost:8080/v1beta',
      });

      expect(fetch).toHaveBeenCalledWith(
        'http://localhost:8080/v1beta/models/gemini-2.5-flash:generateContent',
        expect.any(Object),
      );
    });

    it('strips markdown code fences from Gemini JSON response', async () => {
      const fencedResponse = {
        candidates: [{
          content: {
            parts: [{
              text: '```json\n' + JSON.stringify(VALID_ADVICE_PAYLOAD) + '\n```',
            }],
          },
        }],
      };

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(fencedResponse),
      } as unknown as Response);

      const result = await explainDeck(MOCK_DECK_INPUT, {
        provider: 'gemini',
        apiKey: 'test-key',
      });
      expect(result.explanation).toContain('proliferate');
    });

    it('throws AiAdvisorError on Gemini non-200 API response', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        status: 429,
        text: () => Promise.resolve('RESOURCE_EXHAUSTED'),
      } as unknown as Response);

      await expect(
        explainDeck(MOCK_DECK_INPUT, { provider: 'gemini', apiKey: 'test-key' }),
      ).rejects.toThrow(AiAdvisorError);
    });

    it('throws AiAdvisorError when Gemini response has no text content', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ candidates: [{ content: { parts: [] } }] }),
      } as unknown as Response);

      await expect(
        explainDeck(MOCK_DECK_INPUT, { provider: 'gemini', apiKey: 'test-key' }),
      ).rejects.toThrow('Gemini response contained no text content');
    });

    it('throws AiAdvisorError when Gemini returns invalid JSON shape', async () => {
      const invalidShapeResponse = {
        candidates: [{
          content: {
            parts: [{
              text: JSON.stringify({ wrongField: 'hello' }),
            }],
          },
        }],
      };

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(invalidShapeResponse),
      } as unknown as Response);

      await expect(
        explainDeck(MOCK_DECK_INPUT, { provider: 'gemini', apiKey: 'test-key' }),
      ).rejects.toThrow('AI response shape invalid');
    });

    it('throws AiAdvisorError when Gemini returns non-JSON text', async () => {
      const malformedResponse = {
        candidates: [{
          content: {
            parts: [{
              text: 'This is plain text, not JSON at all.',
            }],
          },
        }],
      };

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(malformedResponse),
      } as unknown as Response);

      await expect(
        explainDeck(MOCK_DECK_INPUT, { provider: 'gemini', apiKey: 'test-key' }),
      ).rejects.toThrow('Failed to parse AI response as JSON');
    });
  });

  describe('Anthropic Provider', () => {
    it('calls Anthropic API when provider is explicitly anthropic', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(VALID_ANTHROPIC_RESPONSE),
      } as unknown as Response);

      const result = await explainDeck(MOCK_DECK_INPUT, {
        provider: 'anthropic',
        apiKey: 'anthropic-test-key',
      });

      expect(fetch).toHaveBeenCalledWith(
        'https://api.anthropic.com/v1/messages',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'x-api-key': 'anthropic-test-key',
            'anthropic-version': '2023-06-01',
          }),
        }),
      );
      expect(result.explanation).toContain('proliferate');
    });

    it('auto-detects Anthropic from ANTHROPIC_API_KEY when no Gemini keys present', async () => {
      process.env['ANTHROPIC_API_KEY'] = 'sk-ant-test';
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(VALID_ANTHROPIC_RESPONSE),
      } as unknown as Response);

      const result = await explainDeck(MOCK_DECK_INPUT);

      expect(fetch).toHaveBeenCalledWith(
        'https://api.anthropic.com/v1/messages',
        expect.objectContaining({
          headers: expect.objectContaining({
            'x-api-key': 'sk-ant-test',
          }),
        }),
      );
      expect(result.keyCards).toContain('Sol Ring');
    });

    it('supports custom Anthropic model and baseUrl', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(VALID_ANTHROPIC_RESPONSE),
      } as unknown as Response);

      await explainDeck(MOCK_DECK_INPUT, {
        provider: 'anthropic',
        apiKey: 'test-key',
        model: 'claude-sonnet-4-6',
        baseUrl: 'http://localhost:9000',
      });

      expect(fetch).toHaveBeenCalledWith(
        'http://localhost:9000/v1/messages',
        expect.objectContaining({
          body: expect.stringContaining('claude-sonnet-4-6'),
        }),
      );
    });

    it('throws AiAdvisorError on Anthropic 401 response', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: () => Promise.resolve('Unauthorized'),
      } as unknown as Response);

      await expect(
        explainDeck(MOCK_DECK_INPUT, { provider: 'anthropic', apiKey: 'bad-key' }),
      ).rejects.toThrow(AiAdvisorError);
    });

    it('throws AiAdvisorError when Anthropic response has no text content', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ content: [] }),
      } as unknown as Response);

      await expect(
        explainDeck(MOCK_DECK_INPUT, { provider: 'anthropic', apiKey: 'test-key' }),
      ).rejects.toThrow('Anthropic response contained no text content');
    });
  });

  describe('Multi-provider Priority & Resolution', () => {
    it('prioritizes Gemini over Anthropic when both env vars exist', async () => {
      process.env['GEMINI_API_KEY'] = 'env-gemini-key';
      process.env['ANTHROPIC_API_KEY'] = 'env-anthropic-key';

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(VALID_GEMINI_RESPONSE),
      } as unknown as Response);

      await explainDeck(MOCK_DECK_INPUT);

      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('googleapis.com'),
        expect.any(Object),
      );
    });

    it('honors explicit provider=anthropic even when GEMINI_API_KEY is present', async () => {
      process.env['GEMINI_API_KEY'] = 'env-gemini-key';
      process.env['ANTHROPIC_API_KEY'] = 'env-anthropic-key';

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(VALID_ANTHROPIC_RESPONSE),
      } as unknown as Response);

      await explainDeck(MOCK_DECK_INPUT, { provider: 'anthropic' });

      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('anthropic.com'),
        expect.any(Object),
      );
    });
  });
});
