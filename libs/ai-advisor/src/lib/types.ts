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

export interface AiAdvisorOptions {
  /** Anthropic API key. Falls back to ANTHROPIC_API_KEY env var. */
  apiKey?: string;
  /** Override base URL for testing */
  baseUrl?: string;
}
