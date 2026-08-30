import type { DeckList } from '@mtg/deck-builder';
import { z } from 'zod';

export type AiProvider = 'gemini' | 'anthropic';

export interface ExplainDeckInput {
  deck: DeckList;
  commanderName: string;
  missingStaples?: Array<{ name: string; wouldFillSlot: string }>;
}

export const ExplainDeckResultSchema = z.object({
  explanation: z.string(),
  keyCards: z.array(z.string()),
  suggestedUpgrades: z.array(z.string()),
});

export type ExplainDeckResult = z.infer<typeof ExplainDeckResultSchema>;

export interface AiAdvisorOptions {
  /** AI Provider to use ('gemini' | 'anthropic'). Defaults to 'gemini' when GEMINI_API_KEY / GOOGLE_API_KEY is present, else 'anthropic'. */
  provider?: AiProvider;
  /** API key override. If not provided, resolves from GEMINI_API_KEY / GOOGLE_API_KEY or ANTHROPIC_API_KEY. */
  apiKey?: string;
  /** Model override. Defaults to 'gemini-3.7-flash' for gemini, 'claude-haiku-4-5' for anthropic. */
  model?: string;
  /** Override base URL for testing or proxy endpoints. */
  baseUrl?: string;
}
