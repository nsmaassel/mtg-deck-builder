import type { AdvisorChat } from '@mtg/advisor-agent';
import { detectModelAccess } from '@mtg/advisor-agent/config';
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

async function main(): Promise<void> {
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

  // The chat agent is the only part that calls a model. It is loaded only when
  // the environment gives it a way to reach one: the ADK is a slow, heavy
  // import that a server without a model has no use for.
  const access = detectModelAccess(process.env);
  let chat: AdvisorChat | null = null;
  if (advisor && access.configured) {
    const { AdvisorChat } = await import('@mtg/advisor-agent');
    chat = new AdvisorChat({ data: advisor, model: process.env['ADVISOR_AGENT_MODEL'] ?? 'gemini-3.8-flash' });
  }
  const chatBudget = new ChatBudget({
    perDay: positiveInt(process.env['ADVISOR_AGENT_DAILY_LIMIT'], 300),
    perMinute: positiveInt(process.env['ADVISOR_AGENT_PER_MINUTE'], 20),
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
    app.log.warn(`Deck advisor disabled: ${advisorProblem ?? 'no data'}`);
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
