import { loadAdvisorData } from '@mtg/deck-advisor/node';
import type { AdvisorData } from '@mtg/deck-advisor';
import { buildApp } from './app';

const PORT = parseInt(process.env['PORT'] ?? '3000', 10);
const HOST = process.env['HOST'] ?? '0.0.0.0';

// The Commander builder works without generated data, so whatever is wrong
// with it (not built, cut short, from another version) only switches the
// advisor off instead of stopping the server.
let advisor: AdvisorData | null = null;
let advisorProblem: string | undefined;
let advisorWarnings: string[] = [];
try {
  const loaded = loadAdvisorData();
  advisor = loaded.data;
  advisorWarnings = loaded.warnings;
} catch (err) {
  advisorProblem = err instanceof Error ? err.message : String(err);
}

const app = buildApp({ advisor });
for (const warning of advisorWarnings) app.log.warn(warning);
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
