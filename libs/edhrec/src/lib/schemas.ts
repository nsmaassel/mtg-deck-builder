import { z } from 'zod';

export const EDHRecCardSchema = z.object({
  name: z.string(),
  inclusion: z.number(),   // 0–100 percent
  synergy: z.number(),     // -1 to 1
  label: z.string(),       // "ramp", "draw", "removal", "staple", etc.
  cmc: z.number(),
}).passthrough();

export type EDHRecCard = z.infer<typeof EDHRecCardSchema>;

export const EDHRecCommanderDataSchema = z.object({
  commander: z.string(),
  slug: z.string(),
  cardlist: z.array(EDHRecCardSchema),
}).passthrough();

export type EDHRecCommanderData = z.infer<typeof EDHRecCommanderDataSchema>;

export const EDHRecThemeDataSchema = z.object({
  theme: z.string(),
  slug: z.string(),
  cardlist: z.array(EDHRecCardSchema),
  commanders: z.array(z.object({
    name: z.string(),
    slug: z.string(),
    colorIdentity: z.array(z.string()),
    edhrecRank: z.number().optional(),
  }).passthrough()).optional(),
}).passthrough();

export type EDHRecThemeData = z.infer<typeof EDHRecThemeDataSchema>;

export class EDHRecError extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message);
    this.name = 'EDHRecError';
  }
}

export class EDHRecNotFoundError extends EDHRecError {
  constructor(slug: string) {
    super(`EDHRec data not found for slug: "${slug}"`, 404);
    this.name = 'EDHRecNotFoundError';
  }
}
