import type { DeckCard } from '@mtg/deck-builder';
import type { ExplainDeckInput, ExplainDeckResult, AiAdvisorOptions } from './types';

const DEFAULT_BASE_URL = 'https://api.anthropic.com';
const MODEL = 'claude-haiku-4-5';

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

/** Call the Anthropic Messages API synchronously. Returns parsed JSON or throws. */
async function callAnthropic(
  prompt: string,
  apiKey: string,
  baseUrl: string,
): Promise<{ content: Array<{ type: string; text: string }> }> {
  const response = await fetch(`${baseUrl}/v1/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new AiAdvisorError(`Anthropic API error ${response.status}: ${body}`);
  }

  return response.json() as Promise<{ content: Array<{ type: string; text: string }> }>;
}

/** Graceful fallback when AI is unavailable */
function buildFallbackResult(commanderName: string): ExplainDeckResult {
  return {
    explanation: `This deck is built around ${commanderName} as the commander. The deck follows a synergy-focused strategy typical for this commander archetype, with supporting ramp, card draw, interaction, and win conditions selected from your collection. For detailed strategic analysis, ensure your ANTHROPIC_API_KEY is configured.`,
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
 * Explain a built deck using Claude claude-haiku-4.5.
 * Returns a fallback result (no throw) if the API key is missing.
 * Throws AiAdvisorError for API/parse failures when key is present.
 */
export async function explainDeck(
  input: ExplainDeckInput,
  options: AiAdvisorOptions = {},
): Promise<ExplainDeckResult> {
  const apiKey = options.apiKey ?? process.env['ANTHROPIC_API_KEY'] ?? '';
  const baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;

  if (!apiKey) {
    return buildFallbackResult(input.commanderName);
  }

  const prompt = buildPrompt(input);
  const raw = await callAnthropic(prompt, apiKey, baseUrl);

  const textBlock = raw.content.find(b => b.type === 'text');
  if (!textBlock?.text) {
    throw new AiAdvisorError('Anthropic response contained no text content');
  }

  // Strip markdown code fences if present
  const jsonText = textBlock.text.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new AiAdvisorError(`Failed to parse AI response as JSON: ${jsonText.slice(0, 200)}`);
  }

  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    typeof (parsed as Record<string, unknown>)['explanation'] !== 'string' ||
    !Array.isArray((parsed as Record<string, unknown>)['keyCards']) ||
    !Array.isArray((parsed as Record<string, unknown>)['suggestedUpgrades'])
  ) {
    throw new AiAdvisorError('AI response shape invalid — missing explanation/keyCards/suggestedUpgrades');
  }

  const result = parsed as Record<string, unknown>;
  return {
    explanation: result['explanation'] as string,
    keyCards: (result['keyCards'] as unknown[]).map(String),
    suggestedUpgrades: (result['suggestedUpgrades'] as unknown[]).map(String),
  };
}
