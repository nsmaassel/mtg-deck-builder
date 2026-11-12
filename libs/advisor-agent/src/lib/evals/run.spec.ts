import { describe, it, expect } from 'vitest';
import { TextModel } from '@mtg/deck-advisor';
import type { AdvisorData } from '@mtg/deck-advisor';
import { buildTestIndex } from '@mtg/deck-advisor/testing';
import { ScriptedLlm, callTool, say } from '../testing';
import type { EvalCase } from './cases';
import { ADVISOR_EVAL_CASES } from './cases';
import { runAdvisorEvals } from './run';

const index = buildTestIndex();
const data: AdvisorData = { index, text: new TextModel(index), meta: new Map() };

const lookup: EvalCase = {
  id: 'lookup',
  purpose: 'Looks the card up.',
  collection: 'none',
  turns: [
    { message: 'What does Opt do?', expect: { calls: [['lookup_cards']] } },
    { message: 'And what goes with it?', expect: {} },
  ],
};

describe('runAdvisorEvals', () => {
  it('passes a conversation whose answers stay within the tool results', async () => {
    const model = new ScriptedLlm([
      callTool('lookup_cards', { names: ['Opt'] }),
      say('**Opt** is an instant: scry 1, then draw a card.'),
      // The second answer leans on the first turn's lookup.
      say('Keep playing **Opt**.'),
    ]);

    const report = await runAdvisorEvals({ data, model, cases: [lookup], concurrency: 1 });

    expect(report).toMatchObject({ model: 'scripted', passed: 1, failed: 0, turns: 2 });
    expect(report.cases[0]!.turns.map(turn => turn.failures)).toEqual([[], []]);
    expect(report.cases[0]!.turns[0]!.tools.map(run => run.tool)).toEqual(['lookup_cards']);
  });

  it('fails a case on the wrong tool or an ungrounded card, and says why', async () => {
    const model = new ScriptedLlm([say('**Opt** draws a card. So does **Brainstorm**.'), say('Nothing.')]);

    const report = await runAdvisorEvals({ data, model, cases: [lookup], concurrency: 1 });

    expect(report).toMatchObject({ passed: 0, failed: 1 });
    expect(report.cases[0]!.turns[0]!.failures).toEqual([
      { check: 'tools', detail: 'expected lookup_cards; ran nothing' },
      { check: 'cards', detail: 'named without a tool result: Brainstorm' },
    ]);
  });

  it('records a model failure as a failed case and stops that conversation', async () => {
    const model = new ScriptedLlm([say('')]);

    const report = await runAdvisorEvals({ data, model, cases: [lookup], concurrency: 1 });

    expect(report.cases[0]).toMatchObject({ passed: false });
    expect(report.cases[0]!.turns).toHaveLength(1);
    expect(report.cases[0]!.turns[0]!.error).toMatch(/no answer/i);
  });

  it('adds up what the model calls cost', async () => {
    const usage = { promptTokenCount: 100, candidatesTokenCount: 10, thoughtsTokenCount: 2 };
    const model = new ScriptedLlm([
      { ...callTool('lookup_cards', { names: ['Opt'] }), usageMetadata: usage },
      { ...say('**Opt** draws a card.'), usageMetadata: usage },
      { ...say('**Opt** again.'), usageMetadata: usage },
    ]);

    const report = await runAdvisorEvals({ data, model, cases: [lookup], concurrency: 1 });

    expect(report.usage).toEqual({ llmCalls: 3, promptTokens: 300, outputTokens: 30, thinkingTokens: 6 });
  });

  it('ships cases with unique ids and at least one expectation each', () => {
    const ids = ADVISOR_EVAL_CASES.map(evalCase => evalCase.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const evalCase of ADVISOR_EVAL_CASES) expect(evalCase.turns.length).toBeGreaterThan(0);
  });
});
