import { AdvisorChat } from '@mtg/advisor-agent';
import { loadAdvisorData } from '@mtg/deck-advisor/node';
import type { AdvisorData } from '@mtg/deck-advisor';
import { buildApp } from './app';
import { ChatBudget } from './chat-budget';

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

// The chat agent is the only part that calls a model. It is on when the
// environment gives the ADK a way to reach Gemini: an API key, or Vertex AI
// with the instance's own credentials.
const env = process.env;
const modelConfigured = Boolean(
  env['GOOGLE_API_KEY'] || env['GEMINI_API_KEY'] || env['GOOGLE_GENAI_API_KEY'] ||
  ['1', 'true'].includes((env['GOOGLE_GENAI_USE_VERTEXAI'] ?? '').toLowerCase()),
);
const positiveInt = (value: string | undefined, fallback: number): number => {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};
const chat = advisor && modelConfigured
  ? new AdvisorChat({ data: advisor, model: env['ADVISOR_AGENT_MODEL'] ?? 'gemini-3.8-flash' })
  : null;
const chatBudget = new ChatBudget({
  perDay: positiveInt(env['ADVISOR_AGENT_DAILY_LIMIT'], 300),
  perMinute: positiveInt(env['ADVISOR_AGENT_PER_MINUTE'], 20),
});

const app = buildApp({ advisor, chat, chatBudget });
for (const warning of advisorWarnings) app.log.warn(warning);
if (advisor) {
  app.log.info(`Deck advisor ready: ${advisor.index.size} cards, meta for ${[...advisor.meta.keys()].join(', ') || 'no formats'}`);
  app.log.info(chat ? `Advisor chat on: ${chat.modelName}` : 'Advisor chat off: no model key or Vertex AI setting in the environment');
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
