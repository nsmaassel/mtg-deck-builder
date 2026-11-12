import type { AdvisorChat } from '@mtg/advisor-agent';
import { detectModelAccess, parseThinkingLevel } from '@mtg/advisor-agent/config';
import { loadAdvisorData } from '@mtg/deck-advisor/node';
import type { AdvisorData } from '@mtg/deck-advisor';
import { buildApp } from './app';
import { ChatBudget } from './chat-budget';

const PORT = parseInt(process.env['PORT'] ?? '3000', 10);
const HOST = process.env['HOST'] ?? '0.0.0.0';

const positiveInt = (value: string | undefined, fallback: number): number => {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const positiveNumber = (value: string | undefined, fallback: number): number => {
  const parsed = Number.parseFloat(value ?? '');
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

async function main(): Promise<void> {
  // Both the advisor and the Commander builder read the card index. Whatever is
  // wrong with it (not built, cut short, from another version) switches them
  // off with a 503 that says how to build it, instead of stopping the server.
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

  // The chat agent is the only part that calls a model. It is loaded only when
  // the environment gives it a way to reach one: the ADK is a slow, heavy
  // import that a server without a model has no use for.
  const access = detectModelAccess(process.env);
  let chat: AdvisorChat | null = null;
  if (advisor && access.configured) {
    const { AdvisorChat } = await import('@mtg/advisor-agent');
    chat = new AdvisorChat({
      data: advisor,
      model: process.env['ADVISOR_AGENT_MODEL'] ?? 'gemini-3.8-flash',
      // Evaluated on gemini-3.8-flash: at "low" every eval case passes, answers come back in about a
      // third of the time, and a turn costs about half as much (docs/evals/advisor-agent.md).
      thinkingLevel: parseThinkingLevel(process.env['ADVISOR_AGENT_THINKING']) ?? 'low',
    });
  }
  // The dollar ceiling is the one sized to the bill: $0.30 a day is at most $9.30 a month.
  // The default prices are gemini-3.8-flash's list prices from 2027-01-01, double what it costs
  // until then, so the ceiling errs towards stopping early. Set them when the model changes.
  const chatBudget = new ChatBudget({
    perDay: positiveInt(process.env['ADVISOR_AGENT_DAILY_LIMIT'], 100),
    perMinute: positiveInt(process.env['ADVISOR_AGENT_PER_MINUTE'], 10),
    usdPerDay: positiveNumber(process.env['ADVISOR_AGENT_DAILY_USD'], 0.3),
    price: {
      input: positiveNumber(process.env['ADVISOR_AGENT_PRICE_IN'], 1.5),
      output: positiveNumber(process.env['ADVISOR_AGENT_PRICE_OUT'], 7.5),
    },
  });

  const app = buildApp({ advisor, chat, chatBudget });
  for (const warning of advisorWarnings) app.log.warn(warning);
  if (advisor) {
    app.log.info(`Deck advisor ready: ${advisor.index.size} cards, meta for ${[...advisor.meta.keys()].join(', ') || 'no formats'}`);
    app.log.info(
      chat && access.configured
        ? `Advisor chat on: ${chat.modelName} via ${access.via}`
        : `Advisor chat off: ${access.configured ? 'no advisor data' : access.reason}`,
    );
  } else {
    app.log.warn(`Deck advisor and Commander builder disabled: ${advisorProblem ?? 'no data'}`);
  }

  app.listen({ port: PORT, host: HOST }, (err, address) => {
    if (err) {
      app.log.error(err);
      process.exit(1);
    }
    app.log.info(`MTG Deck Builder API listening at ${address}`);
  });
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
