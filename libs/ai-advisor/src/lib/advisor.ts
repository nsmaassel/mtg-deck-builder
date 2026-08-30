import type { DeckCard } from '@mtg/deck-builder';
import { ExplainDeckResultSchema } from './types';
import type {
  ExplainDeckInput,
  ExplainDeckResult,
  AiAdvisorOptions,
  AiAdvisorProvider,
} from './types';

const DEFAULT_ANTHROPIC_BASE_URL = 'https://api.anthropic.com';
const DEFAULT_GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com';
const ANTHROPIC_MODEL = 'claude-haiku-4-5';
const GEMINI_MODEL = 'gemini-3.7-flash';

/** Gemini REST Schema — uppercase types required by generateContent responseSchema. */
const EXPLAIN_DECK_RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    explanation: { type: 'STRING' },
    keyCards: { type: 'ARRAY', items: { type: 'STRING' } },
    suggestedUpgrades: { type: 'ARRAY', items: { type: 'STRING' } },
  },
  required: ['explanation', 'keyCards', 'suggestedUpgrades'],
} as const;

interface AnthropicMessageResponse {
  content: Array<{ type: string; text: string }>;
}

interface GeminiGenerateContentResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
  }>;
}

function buildPrompt(input: ExplainDeckInput): string {
  const { deck, commanderName, missingStaples = [] } = input;

  const slotSummary = Object.entries(deck.slots)
    .map(([slot, cards]) => {
      const names = (cards as DeckCard[]).map(c => c.name).join(', ');
      return `${slot.toUpperCase()}: ${names || '(none)'}`;
    })
    .join('\n');

  const upgradeHints = missingStaples
    .slice(0, 5)
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

function resolveProvider(options: AiAdvisorOptions): AiAdvisorProvider {
  if (options.provider) return options.provider;
  if (process.env['GEMINI_API_KEY'] || process.env['GOOGLE_API_KEY']) return 'gemini';
  return 'anthropic';
}

function resolveApiKey(provider: AiAdvisorProvider, options: AiAdvisorOptions): string {
  if (options.apiKey) return options.apiKey;
  if (provider === 'gemini') {
    return process.env['GEMINI_API_KEY'] ?? process.env['GOOGLE_API_KEY'] ?? '';
  }
  return process.env['ANTHROPIC_API_KEY'] ?? '';
}

function resolveBaseUrl(provider: AiAdvisorProvider, options: AiAdvisorOptions): string {
  if (options.baseUrl) return options.baseUrl;
  return provider === 'gemini' ? DEFAULT_GEMINI_BASE_URL : DEFAULT_ANTHROPIC_BASE_URL;
}

/** Call the Anthropic Messages API. Returns parsed JSON or throws. */
async function callAnthropic(
  prompt: string,
  apiKey: string,
  baseUrl: string,
): Promise<AnthropicMessageResponse> {
  const response = await fetch(`${baseUrl.replace(/\/+$/, '')}/v1/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new AiAdvisorError(`Anthropic API error ${response.status}: ${body}`);
  }

  return response.json() as Promise<AnthropicMessageResponse>;
}

/** Call Gemini 3.7 Flash generateContent with native JSON schema. */
async function callGemini(
  prompt: string,
  apiKey: string,
  baseUrl: string,
): Promise<GeminiGenerateContentResponse> {
  const response = await fetch(
    `${baseUrl.replace(/\/+$/, '')}/v1beta/models/${GEMINI_MODEL}:generateContent`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          maxOutputTokens: 1024,
          responseMimeType: 'application/json',
          responseSchema: EXPLAIN_DECK_RESPONSE_SCHEMA,
        },
      }),
    },
  );

  if (!response.ok) {
    const body = await response.text();
    throw new AiAdvisorError(`Gemini API error ${response.status}: ${body}`);
  }

  return response.json() as Promise<GeminiGenerateContentResponse>;
}

function extractAnthropicText(raw: AnthropicMessageResponse): string {
  const textBlock = raw.content.find(b => b.type === 'text');
  if (!textBlock?.text) {
    throw new AiAdvisorError('Anthropic response contained no text content');
  }
  return textBlock.text;
}

function extractGeminiText(raw: GeminiGenerateContentResponse): string {
  const parts = raw.candidates?.[0]?.content?.parts ?? [];
  const text = parts.map(p => p.text).find(t => typeof t === 'string' && t.length > 0);
  if (!text) {
    throw new AiAdvisorError('Gemini response contained no text content');
  }
  return text;
}

function stripJsonFences(text: string): string {
  return text.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim();
}

function parseExplainDeckResult(jsonText: string): ExplainDeckResult {
  const stripped = stripJsonFences(jsonText);

  let parsed: unknown;
  try {
    parsed = JSON.parse(stripped);
  } catch {
    throw new AiAdvisorError(`Failed to parse AI response as JSON: ${stripped.slice(0, 200)}`);
  }

  const result = ExplainDeckResultSchema.safeParse(parsed);
  if (!result.success) {
    throw new AiAdvisorError('AI response shape invalid — missing explanation/keyCards/suggestedUpgrades');
  }

  return result.data;
}

/** Graceful fallback when AI is unavailable */
function buildFallbackResult(
  commanderName: string,
  provider: AiAdvisorProvider,
): ExplainDeckResult {
  const keyName = provider === 'gemini' ? 'GEMINI_API_KEY' : 'ANTHROPIC_API_KEY';
  return {
    explanation: `This deck is built around ${commanderName} as the commander. The deck follows a synergy-focused strategy typical for this commander archetype, with supporting ramp, card draw, interaction, and win conditions selected from your collection. For detailed strategic analysis, ensure your ${keyName} is configured.`,
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

/**
 * Explain a built deck using Gemini 3.7 Flash or Claude Haiku.
 * Defaults to Gemini when `GEMINI_API_KEY` / `GOOGLE_API_KEY` is set; otherwise Anthropic.
 * Returns a fallback result (no throw) if the API key is missing.
 * Throws AiAdvisorError for API/parse failures when a key is present.
 */
export async function explainDeck(
  input: ExplainDeckInput,
  options: AiAdvisorOptions = {},
): Promise<ExplainDeckResult> {
  const provider = resolveProvider(options);
  const apiKey = resolveApiKey(provider, options);
  const baseUrl = resolveBaseUrl(provider, options);

  if (!apiKey) {
    return buildFallbackResult(input.commanderName, provider);
  }

  const prompt = buildPrompt(input);
  const text =
    provider === 'gemini'
      ? extractGeminiText(await callGemini(prompt, apiKey, baseUrl))
      : extractAnthropicText(await callAnthropic(prompt, apiKey, baseUrl));

  return parseExplainDeckResult(text);
}
