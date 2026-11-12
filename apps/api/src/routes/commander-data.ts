import type { FastifyReply } from 'fastify';
import type { CardIndex } from '@mtg/card-index';
import type { ComboIndex } from '@mtg/combos';

export interface CommanderRouteOptions {
  /**
   * The card index the Commander Builder computes its recommendations from.
   * Null when the data has not been generated.
   */
  index: CardIndex | null;
  /** Commander Spellbook's combos, for the power assessment. Without them a build is assessed on its other signals. */
  combos?: ComboIndex | null;
}

export function unavailable(reply: FastifyReply) {
  return reply.status(503).send({
    error: 'Commander Builder data not built',
    message: 'The card index is missing on this server. Run `pnpm data:cards`, then restart.',
  });
}
