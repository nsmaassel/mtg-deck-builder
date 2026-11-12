import { sampleCollection } from '@mtg/deck-advisor';
import type { AdvisorData, Collection } from '@mtg/deck-advisor';
import { AdvisorChat } from '../chat';
import type { AdvisorChatOptions, ChatUsage, ToolRun, TurnTrace } from '../chat';
import type { EvalCase } from './cases';
import { AnswerChecker } from './checks';
import type { Failure } from './checks';

export interface TurnResult {
  message: string;
  /** Empty when the model call failed; `error` says how. */
  reply: string;
  error?: string;
  tools: ToolRun[];
  failures: Failure[];
  usage?: ChatUsage;
  ms?: number;
}

export interface CaseResult {
  id: string;
  purpose: string;
  passed: boolean;
  turns: TurnResult[];
}

export interface EvalReport {
  model: string;
  cases: CaseResult[];
  passed: number;
  failed: number;
  /** Totals over every answered turn. */
  usage: ChatUsage;
  turns: number;
}

export interface RunOptions {
  data: AdvisorData;
  model: AdvisorChatOptions['model'];
  thinkingLevel?: AdvisorChatOptions['thinkingLevel'];
  cases: EvalCase[];
  /** Cases run at once. Default 3. */
  concurrency?: number;
  onCase?: (result: CaseResult) => void;
}

/**
 * Put every case to the model through the same AdvisorChat the server uses and
 * check each answer against the tool results of its conversation.
 */
export async function runAdvisorEvals(options: RunOptions): Promise<EvalReport> {
  const { data, model, cases } = options;
  const checker = new AnswerChecker(data.index);
  const traces = new Map<string, TurnTrace[]>();
  const chat = new AdvisorChat({
    data,
    model,
    thinkingLevel: options.thinkingLevel,
    maxSessions: cases.length + 1,
    onTurn: trace => traces.set(trace.sessionId, [...(traces.get(trace.sessionId) ?? []), trace]),
  });
  const collections = new Map<string, Collection>();
  const collectionFor = (profile: EvalCase['collection']): Collection | null => {
    if (profile === 'none') return null;
    let collection = collections.get(profile);
    if (!collection) {
      collection = sampleCollection(data.index, profile);
      collections.set(profile, collection);
    }
    return collection;
  };

  const runCase = async (evalCase: EvalCase): Promise<CaseResult> => {
    const collection = collectionFor(evalCase.collection);
    const turns: TurnResult[] = [];
    const playerMessages: string[] = [];
    const earlierResults: unknown[] = [];
    let sessionId: string | undefined;

    for (const turn of evalCase.turns) {
      playerMessages.push(turn.message);
      try {
        const answer = await chat.send({ sessionId, message: turn.message, collection });
        sessionId = answer.sessionId;
        const trace = traces.get(answer.sessionId)!.at(-1)!;
        const failures = checker.check(answer.reply, turn.expect, { tools: trace.tools, earlierResults, playerMessages });
        turns.push({ message: turn.message, reply: answer.reply, tools: trace.tools, failures, usage: trace.usage, ms: trace.ms });
        earlierResults.push(...trace.tools.map(run => run.result));
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        turns.push({ message: turn.message, reply: '', error, tools: [], failures: [{ check: 'says', detail: `no answer: ${error}` }] });
        // Later turns of the conversation depend on this one.
        break;
      }
    }

    const result: CaseResult = {
      id: evalCase.id,
      purpose: evalCase.purpose,
      passed: turns.length === evalCase.turns.length && turns.every(turn => turn.failures.length === 0),
      turns,
    };
    options.onCase?.(result);
    return result;
  };

  const results: CaseResult[] = new Array<CaseResult>(cases.length);
  let next = 0;
  const worker = async () => {
    while (next < cases.length) {
      const i = next++;
      results[i] = await runCase(cases[i]!);
    }
  };
  await Promise.all(Array.from({ length: Math.min(options.concurrency ?? 3, cases.length) }, worker));

  const usage: ChatUsage = { llmCalls: 0, promptTokens: 0, outputTokens: 0, thinkingTokens: 0 };
  let answered = 0;
  for (const turn of results.flatMap(result => result.turns)) {
    if (!turn.usage) continue;
    answered += 1;
    usage.llmCalls += turn.usage.llmCalls;
    usage.promptTokens += turn.usage.promptTokens;
    usage.outputTokens += turn.usage.outputTokens;
    usage.thinkingTokens += turn.usage.thinkingTokens;
  }
  const passed = results.filter(result => result.passed).length;
  return { model: chat.modelName, cases: results, passed, failed: results.length - passed, usage, turns: answered };
}
