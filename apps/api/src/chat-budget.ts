export interface ChatBudgetOptions {
  /** Chat messages answered per UTC day, across all visitors. */
  perDay: number;
  /** Chat messages answered per minute, across all visitors. */
  perMinute: number;
  now?: () => number;
}

export type BudgetDecision = { allowed: true } | { allowed: false; reason: 'minute' | 'day' };

const MINUTE_MS = 60_000;

/**
 * A spending ceiling for the one part of the app that costs money per request.
 *
 * The counts are global, not per visitor: the point is to bound the bill, and
 * a per-address limit behind a proxy is only as good as the forwarded header.
 * They live in memory, which is enough for a single instance; a restart
 * forgets the day's count.
 */
export class ChatBudget {
  private day = '';
  private usedToday = 0;
  private recent: number[] = [];
  private readonly now: () => number;

  constructor(private readonly options: ChatBudgetOptions) {
    this.now = options.now ?? Date.now;
  }

  /** Count one message against the budget, or refuse it. */
  spend(): BudgetDecision {
    const now = this.now();
    const today = new Date(now).toISOString().slice(0, 10);
    if (today !== this.day) {
      this.day = today;
      this.usedToday = 0;
    }
    this.recent = this.recent.filter(at => now - at < MINUTE_MS);

    if (this.usedToday >= this.options.perDay) return { allowed: false, reason: 'day' };
    if (this.recent.length >= this.options.perMinute) return { allowed: false, reason: 'minute' };

    this.usedToday += 1;
    this.recent.push(now);
    return { allowed: true };
  }

  get remainingToday(): number {
    const today = new Date(this.now()).toISOString().slice(0, 10);
    return today === this.day ? Math.max(0, this.options.perDay - this.usedToday) : this.options.perDay;
  }
}
