export interface ChatBudgetOptions {
  /** Chat messages answered per UTC day, across all visitors. */
  perDay: number;
  /** Chat messages answered per minute, across all visitors. */
  perMinute: number;
  /**
   * Model spend allowed per UTC day, in USD, at `price`. Chat stops for the day
   * once the turns so far have cost this much. A turn is checked when it starts
   * and charged when it ends, so the turns in flight when the line is crossed
   * are still answered: a day can end `maxConcurrent` turns over.
   */
  usdPerDay?: number;
  /** Chat turns answered at once, across all visitors. Default 2. It is what bounds the overshoot above. */
  maxConcurrent?: number;
  /** The model's list price in USD per million tokens. Thinking is billed as output. */
  price?: TokenPrice;
  now?: () => number;
}

export interface TokenPrice {
  input: number;
  output: number;
}

/** What a turn used, as the chat reports it. */
export interface TokenUsage {
  promptTokens: number;
  outputTokens: number;
  thinkingTokens: number;
}

export type BudgetDecision = { allowed: true } | { allowed: false; reason: 'minute' | 'day' };

const MINUTE_MS = 60_000;

/**
 * A spending ceiling for the one part of the app that costs money per request.
 *
 * Two ceilings per day: messages, and what the model calls behind them cost.
 * Messages differ in cost by an order of magnitude (a question that runs six
 * deck checks against one that runs none), so the dollar ceiling is the one
 * that tracks the bill.
 *
 * The counts are global, not per visitor: the point is to bound the bill, and
 * a per-address limit behind a proxy is only as good as the forwarded header.
 * They live in memory, which is enough for a single instance; a restart
 * forgets the day's count, so this is not the last line of defence (the
 * project's billing cut-off is).
 */
export class ChatBudget {
  private day = '';
  private usedToday = 0;
  private usdToday = 0;
  private inFlight = 0;
  private recent: number[] = [];
  private readonly now: () => number;

  constructor(private readonly options: ChatBudgetOptions) {
    this.now = options.now ?? Date.now;
  }

  /** Count one message against the budget, or refuse it. An allowed message must be followed by `done()`. */
  spend(): BudgetDecision {
    const now = this.now();
    this.startDay(now);
    this.recent = this.recent.filter(at => now - at < MINUTE_MS);

    if (this.usedToday >= this.options.perDay) return { allowed: false, reason: 'day' };
    if (this.options.usdPerDay !== undefined && this.usdToday >= this.options.usdPerDay) return { allowed: false, reason: 'day' };
    if (this.recent.length >= this.options.perMinute) return { allowed: false, reason: 'minute' };
    // Too many answers under way is a reason to wait a moment, like a burst.
    if (this.inFlight >= (this.options.maxConcurrent ?? 2)) return { allowed: false, reason: 'minute' };

    this.usedToday += 1;
    this.inFlight += 1;
    this.recent.push(now);
    return { allowed: true };
  }

  /** The turn that `spend()` allowed is over, answered or not. */
  done(): void {
    if (this.inFlight > 0) this.inFlight -= 1;
  }

  /**
   * Give back the day's count for a message that got no answer. The minute's
   * count stays, so a failing provider cannot be hammered.
   */
  refund(): void {
    if (this.usedToday > 0) this.usedToday -= 1;
  }

  /**
   * Add what a turn's model calls cost to the day, and return that cost in USD.
   * Called for every turn that reached the model, answered or not: tokens a
   * failed turn used are billed like any others.
   */
  charge(usage: TokenUsage): number {
    const price = this.options.price;
    if (!price) return 0;
    const cost = (usage.promptTokens * price.input + (usage.outputTokens + usage.thinkingTokens) * price.output) / 1_000_000;
    this.startDay(this.now());
    this.usdToday += cost;
    return cost;
  }

  get remainingToday(): number {
    const today = new Date(this.now()).toISOString().slice(0, 10);
    return today === this.day ? Math.max(0, this.options.perDay - this.usedToday) : this.options.perDay;
  }

  /** Model spend so far this UTC day, in USD. */
  get spentToday(): number {
    const today = new Date(this.now()).toISOString().slice(0, 10);
    return today === this.day ? this.usdToday : 0;
  }

  private startDay(now: number): void {
    const today = new Date(now).toISOString().slice(0, 10);
    if (today === this.day) return;
    this.day = today;
    this.usedToday = 0;
    this.usdToday = 0;
  }
}
