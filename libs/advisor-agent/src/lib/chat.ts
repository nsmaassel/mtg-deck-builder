import { randomUUID } from 'node:crypto';
import {
  InMemorySessionService,
  LlmAgent,
  Runner,
  createRunConfig,
  getFunctionCalls,
  getFunctionResponses,
  isFinalResponse,
  stringifyContent,
} from '@google/adk';
import type { BaseLlm } from '@google/adk';
import type { AdvisorData, Collection } from '@mtg/deck-advisor';
import { ADVISOR_INSTRUCTION } from './instruction';
import type { ThinkingLevel } from './thinking';
import { createAdvisorTools, isRefusedByLimit } from './tools';

const APP_NAME = 'deck-advisor';
// Visitors are anonymous; conversations are told apart by session id alone.
const USER_ID = 'visitor';

export interface AdvisorChatOptions {
  data: AdvisorData;
  /** A model name the ADK resolves (a Gemini model id), or a model object. */
  model: string | BaseLlm;
  /**
   * How hard the model thinks before it answers or picks a tool. Thinking is
   * billed as output and is most of the wait; the tools do the reasoning that
   * matters here. Left unset, the model's own default applies.
   */
  thinkingLevel?: ThinkingLevel;
  /**
   * Model calls allowed in one turn, tool round-trips included. Default 8: two
   * more than the tool runs, so a turn that asks for one tool at a time and
   * uses them all can still be told so and answer.
   */
  maxLlmCallsPerTurn?: number;
  /** Tool runs allowed in one turn; each result is carried in every later model call. Default 6. */
  maxToolCallsPerTurn?: number;
  /**
   * The most one model call may write, thinking included, in tokens. Default 4,096.
   * Without it a visitor asking for a very long answer sets the price of a turn.
   */
  maxOutputTokensPerCall?: number;
  /** Turns allowed in one conversation. Default 30. */
  maxTurnsPerSession?: number;
  /**
   * A conversation ends once the history sent to the model has grown past this
   * many tokens: every further message would pay for all of it again. Default 40,000.
   */
  maxContextTokens?: number;
  /** A conversation idle for this long is forgotten. Default one hour. */
  sessionTtlMs?: number;
  /** Conversations kept at once; the longest idle go first. Default 500. */
  maxSessions?: number;
  /**
   * Told about every answered turn: what the tools returned and what the model
   * calls cost. For the server's log and for evals; none of it goes to the browser.
   */
  onTurn?: (trace: TurnTrace) => void;
  now?: () => number;
}

export interface ChatStep {
  tool: string;
  /** What the tool was asked, in a few words, for the activity line in the UI. */
  summary: string;
}

export interface ChatTurn {
  sessionId: string;
  reply: string;
  steps: ChatStep[];
  /** What the turn cost at the model: for the server's budget, not for the browser. */
  usage: ChatUsage;
  /**
   * True when the caller named a conversation the server no longer has (it
   * expired, or the server restarted) and this answer starts a new one.
   */
  restarted?: boolean;
}

/** What one turn cost at the model. Thinking tokens are billed as output. */
export interface ChatUsage {
  /** Model calls, tool round-trips included. */
  llmCalls: number;
  promptTokens: number;
  outputTokens: number;
  thinkingTokens: number;
}

export interface ToolRun {
  tool: string;
  args: Record<string, unknown>;
  /** What the tool returned to the model. */
  result: unknown;
}

export interface TurnTrace {
  sessionId: string;
  message: string;
  reply: string;
  tools: ToolRun[];
  usage: ChatUsage;
  /** Wall-clock time for the whole turn. */
  ms: number;
}

export class AdvisorChatError extends Error {
  constructor(
    message: string,
    /**
     * `limit`: the conversation is over its turn budget. `busy`: it is still
     * answering the previous message. `model`: the model call failed.
     */
    public readonly kind: 'limit' | 'busy' | 'model',
    /** Tokens a failed turn used before it failed. They are billed all the same. */
    public readonly usage?: ChatUsage,
  ) {
    super(message);
    this.name = 'AdvisorChatError';
  }
}

const TOOL_LABELS: Record<string, (args: Record<string, unknown>) => string> = {
  collection_summary: () => 'Looked at your collection',
  list_meta_decks: args => `Looked up the ${String(args['format'] ?? '')} meta`,
  check_meta_deck: args => `Checked ${String(args['archetype'] ?? 'a meta deck')}`,
  check_decklist: args => `Checked your ${String(args['format'] ?? '')} decklist`,
  lookup_cards: args => `Looked up ${Array.isArray(args['names']) ? (args['names'] as unknown[]).join(', ') : 'cards'}`,
  find_stand_ins: args => `Searched for stand-ins for ${String(args['card'] ?? 'a card')}`,
  find_combos: args => `Looked for ${String(args['format'] ?? '')} combos in your collection`,
};

/** Tools whose answer depends on the collection; the label only says so when there is one. */
const USES_COLLECTION = new Set(['list_meta_decks', 'check_meta_deck', 'check_decklist', 'find_stand_ins']);

function describeStep(tool: string, args: Record<string, unknown>, hasCollection: boolean): ChatStep {
  const label = TOOL_LABELS[tool];
  const text = label ? label(args) : tool;
  const suffix = hasCollection && USES_COLLECTION.has(tool) ? ' against your collection' : '';
  return { tool, summary: `${text}${suffix}`.replace(/\s+/g, ' ').trim().slice(0, 160) };
}

interface SessionRecord {
  lastUsed: number;
  /** Turns that produced an answer. */
  turns: number;
  /** Size of the largest prompt of the latest turn: what the conversation now costs to continue. */
  contextTokens: number;
  /** A turn is running; the conversation must not be evicted or entered a second time. */
  busy: boolean;
}

type SessionEvents = NonNullable<Awaited<ReturnType<InMemorySessionService['getSession']>>>['events'];

/**
 * The conversational face of the advisor: an ADK agent whose tools are the
 * deterministic engine. Conversation history is kept in memory and nowhere
 * else; the player's collection arrives with each message.
 */
export class AdvisorChat {
  private readonly sessions = new Map<string, SessionRecord>();
  private readonly sessionService = new InMemorySessionService();
  private readonly options: Required<Omit<AdvisorChatOptions, 'data' | 'model' | 'onTurn' | 'thinkingLevel'>> &
    Pick<AdvisorChatOptions, 'data' | 'model' | 'onTurn' | 'thinkingLevel'>;

  constructor(options: AdvisorChatOptions) {
    this.options = {
      maxLlmCallsPerTurn: 8,
      maxToolCallsPerTurn: 6,
      maxOutputTokensPerCall: 4096,
      maxTurnsPerSession: 30,
      maxContextTokens: 40_000,
      sessionTtlMs: 60 * 60 * 1000,
      maxSessions: 500,
      now: Date.now,
      ...options,
    };
  }

  /** The model's name, for the status endpoint. */
  get modelName(): string {
    return typeof this.options.model === 'string' ? this.options.model : this.options.model.model;
  }

  async send(input: { sessionId?: string; message: string; collection: Collection | null }): Promise<ChatTurn> {
    const { sessionId, restarted } = await this.openSession(input.sessionId);
    const record = this.sessions.get(sessionId)!;
    if (record.busy) {
      throw new AdvisorChatError('The advisor is still answering your previous question.', 'busy');
    }
    if (record.turns >= this.options.maxTurnsPerSession || record.contextTokens > this.options.maxContextTokens) {
      throw new AdvisorChatError('This conversation has reached its length limit. Start a new one to keep going.', 'limit');
    }

    record.busy = true;
    const before = await this.events(sessionId);
    const usage: ChatUsage = { llmCalls: 0, promptTokens: 0, outputTokens: 0, thinkingTokens: 0 };
    try {
      const turn = await this.run(sessionId, input.message, input.collection, usage, record);
      record.turns += 1;
      return restarted ? { ...turn, restarted } : turn;
    } catch (err) {
      // The runner has already written the question, and any tool calls, into the session.
      // Put the history back as it was, so a retry is not the same question asked twice.
      await this.restore(sessionId, before);
      const kind = err instanceof AdvisorChatError ? err.kind : 'model';
      throw new AdvisorChatError(err instanceof Error ? err.message : String(err), kind, usage);
    } finally {
      record.busy = false;
      record.lastUsed = this.options.now();
    }
  }

  private async run(
    sessionId: string,
    message: string,
    collection: Collection | null,
    usage: ChatUsage,
    record: SessionRecord,
  ): Promise<ChatTurn> {
    // The tools close over this turn's collection, so the agent is built per turn. It is cheap.
    const agent = new LlmAgent({
      name: 'deck_advisor',
      description: 'Advises MTG Arena players on which deck to build with the cards they own.',
      model: this.options.model,
      instruction: ADVISOR_INSTRUCTION,
      tools: createAdvisorTools(this.options.data, { collection }, { maxCalls: this.options.maxToolCallsPerTurn }),
      generateContentConfig: {
        maxOutputTokens: this.options.maxOutputTokensPerCall,
        ...(this.options.thinkingLevel && {
          // The API's own spelling of the level; typed as a string enum in the SDK the ADK wraps.
          thinkingConfig: { thinkingLevel: this.options.thinkingLevel.toUpperCase() as never },
        }),
      },
    });
    const runner = new Runner({ appName: APP_NAME, agent, sessionService: this.sessionService });

    const started = this.options.now();
    const tools: ToolRun[] = [];
    // A tool's result arrives in a later event than its call; the call id pairs them.
    const pending = new Map<string, ToolRun>();
    let context = 0;
    let reply = '';
    const events = runner.runAsync({
      userId: USER_ID,
      sessionId,
      newMessage: { role: 'user', parts: [{ text: message }] },
      runConfig: createRunConfig({ maxLlmCalls: this.options.maxLlmCallsPerTurn }),
    });
    for await (const event of events) {
      if (event.errorCode || event.errorMessage) {
        throw new AdvisorChatError(event.errorMessage ?? `Model error ${event.errorCode}`, 'model');
      }
      if (event.usageMetadata) {
        usage.llmCalls += 1;
        context = Math.max(context, event.usageMetadata.promptTokenCount ?? 0);
        usage.promptTokens += event.usageMetadata.promptTokenCount ?? 0;
        usage.outputTokens += event.usageMetadata.candidatesTokenCount ?? 0;
        usage.thinkingTokens += event.usageMetadata.thoughtsTokenCount ?? 0;
      }
      for (const call of getFunctionCalls(event)) {
        const name = call.name ?? 'tool';
        const args = (call.args ?? {}) as Record<string, unknown>;
        const run: ToolRun = { tool: name, args, result: undefined };
        tools.push(run);
        if (call.id) pending.set(call.id, run);
      }
      for (const response of getFunctionResponses(event)) {
        const run = (response.id && pending.get(response.id)) || tools.find(t => t.tool === response.name && t.result === undefined);
        if (run) run.result = response.response;
      }
      if (isFinalResponse(event)) {
        const text = stringifyContent(event).trim();
        if (text) reply = text;
      }
    }

    if (!reply) throw new AdvisorChatError('The model returned no answer.', 'model');
    // What the player is shown is what ran: a call the turn's limit refused did nothing.
    const steps = tools
      .filter(run => !isRefusedByLimit(run.result))
      .map(run => describeStep(run.tool, run.args, collection !== null));
    record.contextTokens = context;
    this.options.onTurn?.({ sessionId, message, reply, tools, usage, ms: this.options.now() - started });
    return { sessionId, reply, steps, usage };
  }

  private async events(sessionId: string): Promise<SessionEvents> {
    const session = await this.sessionService.getSession({ appName: APP_NAME, userId: USER_ID, sessionId });
    return session ? [...session.events] : [];
  }

  /** Rebuild a session from the events it held before a failed turn. */
  private async restore(sessionId: string, events: SessionEvents): Promise<void> {
    try {
      await this.sessionService.deleteSession({ appName: APP_NAME, userId: USER_ID, sessionId });
      const session = await this.sessionService.createSession({ appName: APP_NAME, userId: USER_ID, sessionId });
      for (const event of events) await this.sessionService.appendEvent({ session, event });
    } catch {
      // A conversation that cannot be put back is better forgotten than left half-written.
      this.sessions.delete(sessionId);
    }
  }

  /** Continue a known conversation, or start one. An unknown or expired id starts afresh and says so. */
  private async openSession(requested: string | undefined): Promise<{ sessionId: string; restarted: boolean }> {
    const now = this.options.now();
    for (const [id, record] of this.sessions) {
      if (!record.busy && now - record.lastUsed > this.options.sessionTtlMs) await this.forget(id);
    }

    const known = requested ? this.sessions.get(requested) : undefined;
    if (requested && known) {
      known.lastUsed = now;
      return { sessionId: requested, restarted: false };
    }

    // Make room, oldest idle conversation first. One that is mid-answer is never dropped.
    const idle = [...this.sessions].filter(([, record]) => !record.busy).sort((a, b) => a[1].lastUsed - b[1].lastUsed);
    while (this.sessions.size >= this.options.maxSessions && idle.length > 0) {
      await this.forget(idle.shift()![0]);
    }

    const sessionId = randomUUID();
    await this.sessionService.createSession({ appName: APP_NAME, userId: USER_ID, sessionId });
    this.sessions.set(sessionId, { lastUsed: now, turns: 0, contextTokens: 0, busy: false });
    return { sessionId, restarted: requested !== undefined };
  }

  private async forget(sessionId: string): Promise<void> {
    this.sessions.delete(sessionId);
    await this.sessionService.deleteSession({ appName: APP_NAME, userId: USER_ID, sessionId });
  }
}
