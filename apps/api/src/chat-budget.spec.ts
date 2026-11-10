import { describe, it, expect } from 'vitest';
import { ChatBudget } from './chat-budget';

const DAY = Date.UTC(2026, 10, 10, 12, 0, 0);

describe('ChatBudget', () => {
  it('allows messages up to the daily ceiling and then refuses', () => {
    let now = DAY;
    const budget = new ChatBudget({ perDay: 3, perMinute: 100, now: () => now });
    expect([budget.spend(), budget.spend(), budget.spend()].every(d => d.allowed)).toBe(true);
    expect(budget.remainingToday).toBe(0);
    expect(budget.spend()).toEqual({ allowed: false, reason: 'day' });
    now += 60 * 60 * 1000;
    expect(budget.spend()).toEqual({ allowed: false, reason: 'day' });
  });

  it('starts a new count at midnight UTC', () => {
    let now = DAY;
    const budget = new ChatBudget({ perDay: 1, perMinute: 100, now: () => now });
    expect(budget.spend().allowed).toBe(true);
    expect(budget.spend().allowed).toBe(false);
    now = Date.UTC(2026, 10, 11, 0, 0, 1);
    expect(budget.remainingToday).toBe(1);
    expect(budget.spend().allowed).toBe(true);
  });

  it('holds back a burst and lets it through a minute later', () => {
    let now = DAY;
    const budget = new ChatBudget({ perDay: 100, perMinute: 2, now: () => now });
    expect(budget.spend().allowed).toBe(true);
    expect(budget.spend().allowed).toBe(true);
    expect(budget.spend()).toEqual({ allowed: false, reason: 'minute' });
    now += 61_000;
    expect(budget.spend().allowed).toBe(true);
  });

  it('does not charge a refused message to the day', () => {
    const budget = new ChatBudget({ perDay: 10, perMinute: 1, now: () => DAY });
    budget.spend();
    budget.spend();
    budget.spend();
    expect(budget.remainingToday).toBe(9);
  });
});
