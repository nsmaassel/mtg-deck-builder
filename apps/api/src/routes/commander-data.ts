import type { FastifyReply } from 'fastify';
import type { CardIndex } from '@mtg/card-index';
import type { ComboIndex } from '@mtg/combos';
import type { ChatBudget } from '../chat-budget';

export interface CommanderRouteOptions {
  /**
   * The card index the Commander Builder computes its recommendations from.
   * Null when the data has not been generated.
   */
  index: CardIndex | null;
  /** Commander Spellbook's combos, for the power assessment. Without them a build is assessed on its other signals. */
  combos?: ComboIndex | null;
  /** The ceiling on model spend, shared with the advisor's chat. The deck explanation counts against it. */
  chatBudget?: ChatBudget | null;
}

export function unavailable(reply: FastifyReply) {
  return reply.status(503).send({
    error: 'Commander Builder data not built',
    message: 'The card index is missing on this server. Run `pnpm data:cards`, then restart.',
  });
}
