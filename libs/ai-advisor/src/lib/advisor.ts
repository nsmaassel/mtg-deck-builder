import type { DeckCard } from '@mtg/deck-builder';
import type { ExplainDeckInput, ExplainDeckResult, AiAdvisorOptions, AiProvider } from './types';
import { ExplainDeckResultSchema } from './schemas';

const DEFAULT_ANTHROPIC_BASE_URL = 'https://api.anthropic.com';
const DEFAULT_ANTHROPIC_MODEL = 'claude-haiku-4-5';

const DEFAULT_GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
const DEFAULT_GEMINI_MODEL = 'gemini-3.7-flash';

function buildPrompt(input: ExplainDeckInput): string {
  const { deck, commanderName, missingStaples = [] } = input;

  const slotSummary = Object.entries(deck.slots)
    .map(([slot, cards]) => {
      const names = (cards as DeckCard[]).map(c => c.name).join(', ');
      return `${slot.toUpperCase()}: ${names || '(none)'}`;
    })
    .join('\n');

  const upgradeHints = missingStaples.slice(0, 5)
    .map(c => `- ${c.name} (fills ${c.wouldFillSlot})`)
    .join('\n');

  return `You are a Magic: The Gathering Commander format expert. Analyze this Commander deck and provide a concise explanation.

COMMANDER: ${commanderName}

DECK BY SLOT:
${slotSummary}

TOP MISSING STAPLES (not owned):
${upgradeHints || '(none provided)'}

Respond in valid JSON with this exact structure:
{
  "explanation": "3-4 paragraphs covering deck strategy, key synergies, and upgrade priorities",
  "keyCards": ["card name 1", "card name 2", "card name 3"],
  "suggestedUpgrades": ["upgrade card 1", "upgrade card 2", "upgrade card 3"]
}

Requirements:
- explanation must cover: win condition/strategy, key synergies (name at least 2 specific card pairs), and top upgrade priorities
- keyCards: 3-5 most important non-commander cards in the deck
- suggestedUpgrades: 3-5 specific card names that would strengthen the deck
- Be specific — name actual cards, not generic categories`;
}

/** Call the Google Gemini API (generateContent). Returns raw text or throws. */
async function callGemini(
  prompt: string,
  apiKey: string,
  baseUrl: string,
  model: string,
): Promise<string> {
  const url = `${baseUrl.replace(/\/+$/, '')}/models/${model}:generateContent`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'OBJECT',
          properties: {
            explanation: { type: 'STRING' },
            keyCards: {
              type: 'ARRAY',
              items: { type: 'STRING' },
            },
            suggestedUpgrades: {
              type: 'ARRAY',
              items: { type: 'STRING' },
            },
          },
          required: ['explanation', 'keyCards', 'suggestedUpgrades'],
        },
        temperature: 0.2,
      },
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new AiAdvisorError(`Gemini API error ${response.status}: ${body}`);
  }

  const json = (await response.json()) as {
    candidates?: Array<{
      content?: {
        parts?: Array<{ text?: string }>;
      };
    }>;
  };

  const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new AiAdvisorError('Gemini response contained no text content');
  }

  return text;
}

/** Call the Anthropic Messages API. Returns raw text or throws. */
async function callAnthropic(
  prompt: string,
  apiKey: string,
  baseUrl: string,
  model: string,
): Promise<string> {
  const url = `${baseUrl.replace(/\/+$/, '')}/v1/messages`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new AiAdvisorError(`Anthropic API error ${response.status}: ${body}`);
  }

  const json = (await response.json()) as {
    content?: Array<{ type: string; text?: string }>;
  };

  const text = json.content?.find(b => b.type === 'text')?.text;
  if (!text) {
    throw new AiAdvisorError('Anthropic response contained no text content');
  }

  return text;
}

/** Graceful fallback when AI is unavailable */
function buildFallbackResult(commanderName: string): ExplainDeckResult {
  return {
    explanation: `This deck is built around ${commanderName} as the commander. The deck follows a synergy-focused strategy typical for this commander archetype, with supporting ramp, card draw, interaction, and win conditions selected from your collection. For detailed strategic analysis, ensure your GEMINI_API_KEY or ANTHROPIC_API_KEY is configured.`,
    keyCards: [],
    suggestedUpgrades: [],
  };
}

export class AiAdvisorError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AiAdvisorError';
  }
}

function resolveProviderAndKey(options: AiAdvisorOptions): {
  provider: AiProvider | null;
  apiKey: string;
} {
  if (options.provider === 'gemini') {
    const key = options.apiKey ?? process.env['GEMINI_API_KEY'] ?? process.env['GOOGLE_API_KEY'] ?? '';
    return { provider: key ? 'gemini' : null, apiKey: key };
  }

  if (options.provider === 'anthropic') {
    const key = options.apiKey ?? process.env['ANTHROPIC_API_KEY'] ?? '';
    return { provider: key ? 'anthropic' : null, apiKey: key };
  }

  // Explicit apiKey provided without explicit provider
  if (options.apiKey) {
    const isGeminiBase = options.baseUrl && options.baseUrl.includes('googleapis.com');
    const isAnthropicBase = options.baseUrl && options.baseUrl.includes('anthropic.com');
    if (isAnthropicBase) {
      return { provider: 'anthropic', apiKey: options.apiKey };
    }
    if (isGeminiBase) {
      return { provider: 'gemini', apiKey: options.apiKey };
    }
    // Default explicit apiKey to gemini if GEMINI_API_KEY exists, else anthropic if ANTHROPIC_API_KEY exists, else gemini
    const geminiEnv = process.env['GEMINI_API_KEY'] ?? process.env['GOOGLE_API_KEY'];
    const anthropicEnv = process.env['ANTHROPIC_API_KEY'];
    if (!geminiEnv && anthropicEnv) {
      return { provider: 'anthropic', apiKey: options.apiKey };
    }
    return { provider: 'gemini', apiKey: options.apiKey };
  }

  // Auto-detection based on environment variables (Gemini prioritized as zero-marginal workhorse)
  const geminiKey = process.env['GEMINI_API_KEY'] ?? process.env['GOOGLE_API_KEY'];
  if (geminiKey) {
    return { provider: 'gemini', apiKey: geminiKey };
  }

  const anthropicKey = process.env['ANTHROPIC_API_KEY'];
  if (anthropicKey) {
    return { provider: 'anthropic', apiKey: anthropicKey };
  }

  return { provider: null, apiKey: '' };
}

/**
 * Explain a built deck using Gemini 3.7 Flash or Claude Haiku 4.5.
 * Returns a fallback result (no throw) if no API key is configured.
 * Throws AiAdvisorError for API failures or malformed responses.
 */
export async function explainDeck(
  input: ExplainDeckInput,
  options: AiAdvisorOptions = {},
): Promise<ExplainDeckResult> {
  const { provider, apiKey } = resolveProviderAndKey(options);

  if (!provider || !apiKey) {
    return buildFallbackResult(input.commanderName);
  }

  const prompt = buildPrompt(input);
  let rawText = '';

  if (provider === 'gemini') {
    const baseUrl = options.baseUrl ?? DEFAULT_GEMINI_BASE_URL;
    const model = options.model ?? DEFAULT_GEMINI_MODEL;
    rawText = await callGemini(prompt, apiKey, baseUrl, model);
  } else {
    const baseUrl = options.baseUrl ?? DEFAULT_ANTHROPIC_BASE_URL;
    const model = options.model ?? DEFAULT_ANTHROPIC_MODEL;
    rawText = await callAnthropic(prompt, apiKey, baseUrl, model);
  }

  // Strip markdown code fences if present
  const jsonText = rawText.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new AiAdvisorError(`Failed to parse AI response as JSON: ${jsonText.slice(0, 200)}`);
  }

  const parseResult = ExplainDeckResultSchema.safeParse(parsed);
  if (!parseResult.success) {
    throw new AiAdvisorError('AI response shape invalid — missing explanation/keyCards/suggestedUpgrades');
  }

  return parseResult.data;
}
