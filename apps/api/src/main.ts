import { CardIndexMissingError } from '@mtg/card-index/node';
import { loadAdvisorData } from '@mtg/deck-advisor/node';
import type { AdvisorData } from '@mtg/deck-advisor';
import { buildApp } from './app';

const PORT = parseInt(process.env['PORT'] ?? '3000', 10);
const HOST = process.env['HOST'] ?? '0.0.0.0';

// The Commander builder works without generated data, so a missing card index
// only switches the advisor off instead of stopping the server.
let advisor: AdvisorData | null = null;
let advisorProblem: string | undefined;
try {
  advisor = loadAdvisorData();
} catch (err) {
  if (!(err instanceof CardIndexMissingError)) throw err;
  advisorProblem = err.message;
}

const app = buildApp({ advisor });
if (advisor) {
  app.log.info(`Deck advisor ready: ${advisor.index.size} cards, meta for ${[...advisor.meta.keys()].join(', ') || 'no formats'}`);
} else {
  app.log.warn(`Deck advisor disabled: ${advisorProblem ?? 'no data'}`);
}

app.listen({ port: PORT, host: HOST }, (err, address) => {
  if (err) {
    app.log.error(err);
    process.exit(1);
  }
  app.log.info(`MTG Deck Builder API listening at ${address}`);
});
