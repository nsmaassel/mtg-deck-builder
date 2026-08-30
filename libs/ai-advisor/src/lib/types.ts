import type { DeckList } from '@mtg/deck-builder';

export interface ExplainDeckInput {
  deck: DeckList;
  commanderName: string;
  missingStaples?: Array<{ name: string; wouldFillSlot: string }>;
}

export interface ExplainDeckResult {
  explanation: string;
  keyCards: string[];
  suggestedUpgrades: string[];
}

export type AiAdvisorProvider = 'anthropic' | 'gemini';

export interface AiAdvisorOptions {
  /** Provider API key. Falls back to GEMINI_API_KEY or ANTHROPIC_API_KEY for the selected provider. */
  apiKey?: string;
  /** Override base URL for testing */
  baseUrl?: string;
  /**
   * LLM provider. Defaults to `'gemini'` when `GEMINI_API_KEY` is set,
   * otherwise `'anthropic'`.
   */
  provider?: AiAdvisorProvider;
}
