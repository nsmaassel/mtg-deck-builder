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
  apiKey?: string;
  baseUrl?: string;
  provider?: AiAdvisorProvider;
}
