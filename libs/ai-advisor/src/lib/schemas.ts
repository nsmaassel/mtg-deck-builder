import { z } from 'zod';

export const ExplainDeckResultSchema = z.object({
  explanation: z.string(),
  keyCards: z.array(z.string()),
  suggestedUpgrades: z.array(z.string()),
});

export type ExplainDeckResult = z.infer<typeof ExplainDeckResultSchema>;
