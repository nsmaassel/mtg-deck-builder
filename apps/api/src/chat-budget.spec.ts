import { describe, it, expect } from 'vitest';
import { ChatBudget } from './chat-budget';

const DAY = Date.UTC(2026, 10, 10, 12, 0, 0);

/** One message from start to finish: these tests are about messages one after another, not at once. */
const message = (budget: ChatBudget) => {
  const decision = budget.spend();
  if (decision.allowed) budget.done();
  return decision;
};

describe('ChatBudget', () => {
  it('allows messages up to the daily ceiling and then refuses', () => {
    let now = DAY;
    const budget = new ChatBudget({ perDay: 3, perMinute: 100, now: () => now });
    expect([message(budget), message(budget), message(budget)].every(d => d.allowed)).toBe(true);
    expect(budget.remainingToday).toBe(0);
    expect(message(budget)).toEqual({ allowed: false, reason: 'day' });
    now += 60 * 60 * 1000;
    expect(message(budget)).toEqual({ allowed: false, reason: 'day' });
  });

  it('starts a new count at midnight UTC', () => {
    let now = DAY;
    const budget = new ChatBudget({ perDay: 1, perMinute: 100, now: () => now });
    expect(message(budget).allowed).toBe(true);
    expect(message(budget).allowed).toBe(false);
    now = Date.UTC(2026, 10, 11, 0, 0, 1);
    expect(budget.remainingToday).toBe(1);
    expect(message(budget).allowed).toBe(true);
  });

  it('holds back a burst and lets it through a minute later', () => {
    let now = DAY;
    const budget = new ChatBudget({ perDay: 100, perMinute: 2, now: () => now });
    expect(message(budget).allowed).toBe(true);
    expect(message(budget).allowed).toBe(true);
    expect(message(budget)).toEqual({ allowed: false, reason: 'minute' });
    now += 61_000;
    expect(message(budget).allowed).toBe(true);
  });

  it('does not charge a refused message to the day', () => {
    const budget = new ChatBudget({ perDay: 10, perMinute: 1, now: () => DAY });
    message(budget);
    message(budget);
    message(budget);
    expect(budget.remainingToday).toBe(9);
  });

  it('gives back the day\'s count for an unanswered message but not the minute\'s', () => {
    const budget = new ChatBudget({ perDay: 2, perMinute: 2, now: () => DAY });
    message(budget);
    budget.refund();
    expect(budget.remainingToday).toBe(2);
    message(budget);
    // Two attempts this minute, whatever became of them.
    expect(message(budget)).toEqual({ allowed: false, reason: 'minute' });
    budget.refund();
    budget.refund();
    budget.refund();
    expect(budget.remainingToday).toBe(2);
  });
});

describe('ChatBudget spend ceiling', () => {
  const price = { input: 1.5, output: 7.5 };
  const turn = { promptTokens: 100_000, outputTokens: 2_000, thinkingTokens: 2_000 };

  it('prices a turn from its tokens, thinking billed as output', () => {
    const budget = new ChatBudget({ perDay: 100, perMinute: 100, usdPerDay: 1, price, now: () => DAY });
    // 100k prompt at $1.50 a million, 4k output at $7.50 a million.
    expect(budget.charge(turn)).toBeCloseTo(0.15 + 0.03, 10);
    expect(budget.spentToday).toBeCloseTo(0.18, 10);
  });

  it('stops chat for the day once the turns so far have cost the ceiling', () => {
    const budget = new ChatBudget({ perDay: 100, perMinute: 100, usdPerDay: 0.3, price, now: () => DAY });
    expect(budget.spend().allowed).toBe(true);
    budget.charge(turn);
    // 18 cents spent: under the ceiling, so the next message is answered and takes the day over it.
    expect(budget.spend().allowed).toBe(true);
    budget.charge(turn);
    expect(budget.spend()).toEqual({ allowed: false, reason: 'day' });
  });

  it('starts the spend afresh at midnight UTC', () => {
    let now = DAY;
    const budget = new ChatBudget({ perDay: 100, perMinute: 100, usdPerDay: 0.1, price, now: () => now });
    budget.spend();
    budget.charge(turn);
    expect(budget.spend().allowed).toBe(false);
    now = Date.UTC(2026, 10, 11, 0, 0, 1);
    expect(budget.spentToday).toBe(0);
    expect(budget.spend().allowed).toBe(true);
  });

  it('keeps what a refunded message cost: the refund is for the count, not the tokens', () => {
    const budget = new ChatBudget({ perDay: 100, perMinute: 100, usdPerDay: 0.1, price, now: () => DAY });
    budget.spend();
    budget.charge(turn);
    budget.refund();
    expect(budget.spentToday).toBeCloseTo(0.18, 10);
    expect(budget.spend()).toEqual({ allowed: false, reason: 'day' });
  });

  it('charges nothing without a price', () => {
    const budget = new ChatBudget({ perDay: 100, perMinute: 100, now: () => DAY });
    expect(budget.charge(turn)).toBe(0);
    expect(budget.spentToday).toBe(0);
  });
});

describe('ChatBudget turns in flight', () => {
  it('answers only so many turns at once, and takes the next when one is done', () => {
    const budget = new ChatBudget({ perDay: 100, perMinute: 100, maxConcurrent: 2, now: () => DAY });
    expect(budget.spend().allowed).toBe(true);
    expect(budget.spend().allowed).toBe(true);
    expect(budget.spend()).toEqual({ allowed: false, reason: 'minute' });
    // The refused message took no place and no count.
    expect(budget.remainingToday).toBe(98);

    budget.done();
    expect(budget.spend().allowed).toBe(true);
  });

  it('bounds how far a day can run over its dollar ceiling to the turns in flight', () => {
    const price = { input: 1, output: 1 };
    const turn = { promptTokens: 100_000, outputTokens: 0, thinkingTokens: 0 };
    const budget = new ChatBudget({ perDay: 100, perMinute: 100, usdPerDay: 0.05, maxConcurrent: 2, price, now: () => DAY });

    // Nothing is charged until a turn ends, so every turn that starts under the ceiling gets through.
    const started = [budget.spend(), budget.spend(), budget.spend(), budget.spend()].filter(d => d.allowed).length;
    expect(started).toBe(2);
    for (let i = 0; i < started; i++) {
      budget.charge(turn);
      budget.done();
    }
    expect(budget.spentToday).toBeCloseTo(0.2, 10);
    expect(budget.spend()).toEqual({ allowed: false, reason: 'day' });
  });

  it('does not go below zero when done is called once too often', () => {
    const budget = new ChatBudget({ perDay: 100, perMinute: 100, maxConcurrent: 1, now: () => DAY });
    budget.done();
    expect(budget.spend().allowed).toBe(true);
    expect(budget.spend().allowed).toBe(false);
  });
});
