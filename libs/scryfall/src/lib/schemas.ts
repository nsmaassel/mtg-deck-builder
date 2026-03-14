import { z } from 'zod';

export const ScryfallCardSchema = z.object({
  id: z.string(),
  name: z.string(),
  type_line: z.string(),
  color_identity: z.array(z.string()),
  cmc: z.number(),
  legalities: z.object({
    commander: z.enum(['legal', 'not_legal', 'banned', 'restricted']),
  }).passthrough(),
  prices: z.object({
    usd: z.string().nullable().optional(),
    usd_foil: z.string().nullable().optional(),
  }).passthrough(),
  edhrec_rank: z.number().nullable().optional(),
  oracle_text: z.string().optional(),
  image_uris: z.object({
    normal: z.string().optional(),
    small: z.string().optional(),
  }).passthrough().optional(),
}).passthrough();

export type ScryfallCard = z.infer<typeof ScryfallCardSchema>;

export const ScryfallSearchResultSchema = z.object({
  object: z.literal('list'),
  total_cards: z.number(),
  has_more: z.boolean(),
  data: z.array(ScryfallCardSchema),
}).passthrough();

export type ScryfallSearchResult = z.infer<typeof ScryfallSearchResultSchema>;

export class ScryfallError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ScryfallError';
  }
}

export class ScryfallNotFoundError extends ScryfallError {
  constructor(name: string) {
    super(`Card not found: "${name}"`, 404);
    this.name = 'ScryfallNotFoundError';
  }
}
