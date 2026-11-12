import type { CardIndex } from '@mtg/card-index';
import type { ToolRun } from '../chat';
import { CardMentions } from './mentions';

/** What an answer is expected to do. Every field is optional; grounding is checked unless switched off. */
export interface Expectation {
  /** Tool choice: each inner list names alternatives, and at least one of them must have run. */
  calls?: string[][];
  /** Tools that must not run. */
  avoids?: string[];
  /** The answer needs no tool at all. */
  noTools?: boolean;
  /** Each pattern must match the answer. */
  says?: RegExp[];
  /** No pattern may match the answer. */
  neverSays?: RegExp[];
  maxChars?: number;
  /** False for answers where naming cards from memory is not the risk under test. Default true. */
  grounded?: boolean;
}

export interface Failure {
  check: 'tools' | 'cards' | 'numbers' | 'says' | 'neverSays' | 'length';
  detail: string;
}

/** Everything the answer may rest on: this turn's tool results and what the conversation already held. */
export interface Evidence {
  /** Tool runs of this turn. */
  tools: ToolRun[];
  /** Tool results from earlier turns of the conversation. */
  earlierResults: unknown[];
  /** Everything the player has written so far, this turn included. */
  playerMessages: string[];
}

const PERCENT = /(\d+(?:\.\d+)?)\s*%/g;
const NUMBER = /\d+(?:\.\d+)?/g;

function strings(value: unknown, into: string[] = []): string[] {
  if (typeof value === 'string') into.push(value);
  else if (Array.isArray(value)) for (const item of value) strings(item, into);
  else if (value && typeof value === 'object') for (const item of Object.values(value)) strings(item, into);
  return into;
}

function numbers(value: unknown, into: number[] = []): number[] {
  if (typeof value === 'number') into.push(value);
  else if (typeof value === 'string') for (const match of value.matchAll(NUMBER)) into.push(Number(match[0]));
  else if (Array.isArray(value)) for (const item of value) numbers(item, into);
  else if (value && typeof value === 'object') for (const item of Object.values(value)) numbers(item, into);
  return into;
}

/**
 * Checks answers against what the tools returned. "Code decides, the model
 * explains" is only true if the explanation adds no cards and no numbers of
 * its own, and that is what these look for.
 */
export class AnswerChecker {
  private readonly mentions: CardMentions;

  constructor(private readonly index: CardIndex) {
    this.mentions = new CardMentions(index);
  }

  check(reply: string, expectation: Expectation, evidence: Evidence): Failure[] {
    const failures: Failure[] = [];
    const ran = evidence.tools.map(run => run.tool);

    for (const alternatives of expectation.calls ?? []) {
      if (!alternatives.some(tool => ran.includes(tool))) {
        failures.push({ check: 'tools', detail: `expected ${alternatives.join(' or ')}; ran ${ran.join(', ') || 'nothing'}` });
      }
    }
    const unwanted = (expectation.avoids ?? []).filter(tool => ran.includes(tool));
    if (unwanted.length) failures.push({ check: 'tools', detail: `should not have run ${unwanted.join(', ')}` });
    if (expectation.noTools && ran.length) failures.push({ check: 'tools', detail: `needed no tool; ran ${ran.join(', ')}` });

    for (const pattern of expectation.says ?? []) {
      if (!pattern.test(reply)) failures.push({ check: 'says', detail: `nothing matches ${String(pattern)}` });
    }
    for (const pattern of expectation.neverSays ?? []) {
      const found = reply.match(pattern);
      if (found) failures.push({ check: 'neverSays', detail: `"${found[0]}" matches ${String(pattern)}` });
    }
    if (expectation.maxChars !== undefined && reply.length > expectation.maxChars) {
      failures.push({ check: 'length', detail: `${reply.length} characters, limit ${expectation.maxChars}` });
    }

    if (expectation.grounded !== false) {
      const cards = this.ungroundedCards(reply, evidence);
      if (cards.length) failures.push({ check: 'cards', detail: `named without a tool result: ${cards.join(', ')}` });
      const figures = this.ungroundedPercentages(reply, evidence);
      if (figures.length) failures.push({ check: 'numbers', detail: `percentages no tool returned: ${figures.join(', ')}` });
    }
    return failures;
  }

  /** Cards the answer names that neither a tool result nor the player mentioned. Basic lands are free. */
  ungroundedCards(reply: string, evidence: Evidence): string[] {
    const known = new Set<string>();
    const results = [...evidence.tools.map(run => run.result), ...evidence.earlierResults];
    for (const text of [...strings(results), ...evidence.playerMessages]) {
      // A field that is nothing but a card name needs no capital-letter guesswork.
      const exact = this.index.byName(text);
      if (exact) known.add(exact.oracleId);
      for (const mention of this.mentions.find(text, { loose: true })) known.add(mention.card.oracleId);
    }

    const missing = new Set<string>();
    for (const mention of this.mentions.find(reply)) {
      if (!mention.card.isBasicLand && !known.has(mention.card.oracleId)) missing.add(mention.card.name);
    }
    return [...missing];
  }

  /** Percentages in the answer that match no number in the evidence, allowing for rounding. */
  ungroundedPercentages(reply: string, evidence: Evidence): string[] {
    const known = numbers([...evidence.tools.map(run => run.result), ...evidence.earlierResults, ...evidence.playerMessages]);
    const missing = new Set<string>();
    for (const match of reply.matchAll(PERCENT)) {
      const value = Number(match[1]);
      const decimals = (match[1]!.split('.')[1] ?? '').length;
      const step = 10 ** -decimals;
      // The model may round what a tool gave: 64.04 can be written 64.0 or 64.
      const grounded = known.some(n => Math.abs(n - value) <= step / 2 + 1e-9);
      if (!grounded) missing.add(`${match[1]}%`);
    }
    return [...missing];
  }
}
