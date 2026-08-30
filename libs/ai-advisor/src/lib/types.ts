import type { DeckList } from '@mtg/deck-builder';
import { z } from 'zod';

export interface ExplainDeckInput {
  deck: DeckList;
  commanderName: string;
  missingStaples?: Array<{ name: string; wouldFillSlot: string }>;
}

export const ExplainDeckResultSchema = z.object({
  explanation: z.string(),
  keyCards: z.array(z.coerce.string()),
  suggestedUpgrades: z.array(z.coerce.string()),
});

export type ExplainDeckResult = z.infer<typeof ExplainDeckResultSchema>;

export type AiAdvisorProvider = 'anthropic' | 'gemini';

export interface AiAdvisorOptions {
  /** Provider API key. Falls back to GEMINI_API_KEY, GOOGLE_API_KEY, or ANTHROPIC_API_KEY for the selected provider. */
  apiKey?: string;
  /** Override base URL for testing */
  baseUrl?: string;
  /**
   * LLM provider. Defaults to `'gemini'` when `GEMINI_API_KEY` or `GOOGLE_API_KEY` is set,
   * otherwise `'anthropic'`.
   */
  provider?: AiAdvisorProvider;
}
