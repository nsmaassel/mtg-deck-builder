/**
 * Puts the advisor agent's eval cases to a real model and checks every answer
 * against the tool results of its conversation: the right tools ran, no card
 * and no percentage appears that a tool did not return, and the answer says
 * what the instruction promises (tournament data, no collection loaded, ...).
 *
 * Needs the generated data (`pnpm data`) and model access in the environment,
 * the same variables the server reads (GEMINI_API_KEY, or the Vertex AI ones).
 * It costs a few cents per run; nothing here runs in CI.
 *
 * Usage: npx tsx --tsconfig tsconfig.json scripts/evals/advisor-agent.ts [options]
 *   --model gemini-3.8-flash   model to evaluate (default ADVISOR_AGENT_MODEL, then gemini-3.8-flash)
 *   --thinking low             minimal, low, medium or high (default ADVISOR_AGENT_THINKING, then the model's own)
 *   --only id,id               run only these cases
 *   --concurrency 3            conversations at once
 *   --out <file>               write the full report as JSON (default .cache/evals/advisor-agent-<time>.json)
 *   --price-in 0.30            USD per million prompt tokens, to print what the run cost
 *   --price-out 2.50           USD per million output tokens (thinking included)
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { THINKING_LEVELS, detectModelAccess, parseThinkingLevel } from '@mtg/advisor-agent/config';
import type { ThinkingLevel } from '@mtg/advisor-agent/config';
import { ADVISOR_EVAL_CASES, runAdvisorEvals } from '@mtg/advisor-agent/evals';
import type { CaseResult, EvalReport } from '@mtg/advisor-agent/evals';
import { loadAdvisorData } from '@mtg/deck-advisor/node';

interface Options {
  model: string;
  thinking?: ThinkingLevel;
  only?: string[];
  concurrency: number;
  out: string;
  priceIn?: number;
  priceOut?: number;
}

function thinkingLevel(value: string | undefined, source: string): ThinkingLevel | undefined {
  if (!value) return undefined;
  const level = parseThinkingLevel(value);
  if (!level) throw new Error(`${source} must be one of ${THINKING_LEVELS.join(', ')}`);
  return level;
}

function parseArgs(argv: string[]): Options {
  const options: Options = {
    model: process.env['ADVISOR_AGENT_MODEL'] ?? 'gemini-3.8-flash',
    thinking: thinkingLevel(process.env['ADVISOR_AGENT_THINKING'], 'ADVISOR_AGENT_THINKING'),
    concurrency: 3,
    out: `.cache/evals/advisor-agent-${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
  };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i]!;
    const value = (): string => {
      const next = argv[++i];
      if (next === undefined) throw new Error(`${flag} needs a value`);
      return next;
    };
    const positive = (): number => {
      const parsed = Number(value());
      if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`${flag} needs a positive number`);
      return parsed;
    };
    switch (flag) {
      case '--model': options.model = value(); break;
      case '--thinking': options.thinking = thinkingLevel(value(), flag); break;
      case '--only': options.only = value().split(',').map(id => id.trim()).filter(Boolean); break;
      case '--concurrency': options.concurrency = Math.floor(positive()); break;
      case '--out': options.out = value(); break;
      case '--price-in': options.priceIn = positive(); break;
      case '--price-out': options.priceOut = positive(); break;
      default: throw new Error(`Unknown option ${flag}`);
    }
  }
  return options;
}

function printCase(result: CaseResult): void {
  console.log(`\n${result.passed ? 'PASS' : 'FAIL'}  ${result.id}: ${result.purpose}`);
  for (const turn of result.turns) {
    const tools = turn.tools.map(run => run.tool).join(', ') || 'no tools';
    const cost = turn.usage
      ? `${turn.usage.promptTokens} in, ${turn.usage.outputTokens + turn.usage.thinkingTokens} out (${turn.usage.thinkingTokens} thinking), ${turn.usage.llmCalls} calls, ${((turn.ms ?? 0) / 1000).toFixed(1)} s`
      : turn.error ?? '';
    console.log(`  > ${turn.message.split('\n')[0]}`);
    console.log(`    ${tools} | ${cost}`);
    for (const failure of turn.failures) console.log(`    ✗ ${failure.check}: ${failure.detail}`);
  }
}

function printSummary(report: EvalReport, options: Options): void {
  const { usage, turns } = report;
  const output = usage.outputTokens + usage.thinkingTokens;
  console.log(`\n${report.passed} of ${report.cases.length} cases passed on ${report.model}${options.thinking ? ` (thinking ${options.thinking})` : ''}.`);
  if (turns === 0) return;
  console.log(
    `${turns} answers: ${Math.round(usage.promptTokens / turns)} prompt and ${Math.round(output / turns)} output tokens each on average ` +
    `(${Math.round(usage.thinkingTokens / turns)} of them thinking), ${(usage.llmCalls / turns).toFixed(1)} model calls.`,
  );
  if (options.priceIn !== undefined && options.priceOut !== undefined) {
    const cost = (usage.promptTokens * options.priceIn + output * options.priceOut) / 1_000_000;
    console.log(`Cost at $${options.priceIn}/$${options.priceOut} per million tokens: $${cost.toFixed(4)} for the run, $${(cost / turns).toFixed(4)} per answer.`);
  }
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const access = detectModelAccess(process.env);
  if (!access.configured) throw new Error(`No model access: ${access.reason}.`);

  const cases = options.only ? ADVISOR_EVAL_CASES.filter(evalCase => options.only!.includes(evalCase.id)) : ADVISOR_EVAL_CASES;
  const unknown = (options.only ?? []).filter(id => !ADVISOR_EVAL_CASES.some(evalCase => evalCase.id === id));
  if (unknown.length) throw new Error(`No such case: ${unknown.join(', ')}`);

  const { data, warnings } = loadAdvisorData();
  for (const warning of warnings) console.warn(warning);
  console.log(`${cases.length} cases against ${options.model} via ${access.via}; meta for ${[...data.meta.keys()].join(', ') || 'no formats'}.`);

  const report = await runAdvisorEvals({
    data, model: options.model, thinkingLevel: options.thinking, cases, concurrency: options.concurrency, onCase: printCase,
  });
  printSummary(report, options);

  // Tool results are large; they are kept only where an answer failed, which is where they get read.
  const slim = {
    ...report,
    thinking: options.thinking ?? 'model default',
    ranAt: new Date().toISOString(),
    cases: report.cases.map(result => ({
      ...result,
      turns: result.turns.map(turn => ({
        ...turn,
        tools: turn.tools.map(run => (turn.failures.length ? run : { tool: run.tool, args: run.args })),
      })),
    })),
  };
  const out = resolve(options.out);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(slim, null, 2));
  console.log(`Report: ${out}`);

  if (report.failed > 0) process.exitCode = 1;
}

main().catch(err => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
