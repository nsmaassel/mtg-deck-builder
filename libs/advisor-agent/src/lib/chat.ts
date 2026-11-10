import { randomUUID } from 'node:crypto';
import {
  InMemorySessionService,
  LlmAgent,
  Runner,
  createRunConfig,
  getFunctionCalls,
  isFinalResponse,
  stringifyContent,
} from '@google/adk';
import type { BaseLlm } from '@google/adk';
import type { AdvisorData, Collection } from '@mtg/deck-advisor';
import { ADVISOR_INSTRUCTION } from './instruction';
import { createAdvisorTools } from './tools';

const APP_NAME = 'deck-advisor';
// Visitors are anonymous; conversations are told apart by session id alone.
const USER_ID = 'visitor';

export interface AdvisorChatOptions {
  data: AdvisorData;
  /** A model name the ADK resolves (a Gemini model id), or a model object. */
  model: string | BaseLlm;
  /** Model calls allowed in one turn, tool round-trips included. Default 8. */
  maxLlmCallsPerTurn?: number;
  /** Turns allowed in one conversation. Default 30. */
  maxTurnsPerSession?: number;
  /** A conversation idle for this long is forgotten. Default one hour. */
  sessionTtlMs?: number;
  /** Conversations kept at once; the longest idle go first. Default 500. */
  maxSessions?: number;
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
  /**
   * True when the caller named a conversation the server no longer has (it
   * expired, or the server restarted) and this answer starts a new one.
   */
  restarted?: boolean;
}

export class AdvisorChatError extends Error {
  constructor(
    message: string,
    /**
     * `limit`: the conversation is over its turn budget. `busy`: it is still
     * answering the previous message. `model`: the model call failed.
     */
    public readonly kind: 'limit' | 'busy' | 'model',
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
  private readonly options: Required<Omit<AdvisorChatOptions, 'data' | 'model'>> & Pick<AdvisorChatOptions, 'data' | 'model'>;

  constructor(options: AdvisorChatOptions) {
    this.options = {
      maxLlmCallsPerTurn: 8,
      maxTurnsPerSession: 30,
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
    if (record.turns >= this.options.maxTurnsPerSession) {
      throw new AdvisorChatError('This conversation has reached its length limit. Start a new one to keep going.', 'limit');
    }

    record.busy = true;
    const before = await this.events(sessionId);
    try {
      const turn = await this.run(sessionId, input.message, input.collection);
      record.turns += 1;
      return restarted ? { ...turn, restarted } : turn;
    } catch (err) {
      // The runner has already written the question, and any tool calls, into the session.
      // Put the history back as it was, so a retry is not the same question asked twice.
      await this.restore(sessionId, before);
      if (err instanceof AdvisorChatError) throw err;
      throw new AdvisorChatError(err instanceof Error ? err.message : String(err), 'model');
    } finally {
      record.busy = false;
      record.lastUsed = this.options.now();
    }
  }

  private async run(sessionId: string, message: string, collection: Collection | null): Promise<ChatTurn> {
    // The tools close over this turn's collection, so the agent is built per turn. It is cheap.
    const agent = new LlmAgent({
      name: 'deck_advisor',
      description: 'Advises MTG Arena players on which deck to build with the cards they own.',
      model: this.options.model,
      instruction: ADVISOR_INSTRUCTION,
      tools: createAdvisorTools(this.options.data, { collection }),
    });
    const runner = new Runner({ appName: APP_NAME, agent, sessionService: this.sessionService });

    const steps: ChatStep[] = [];
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
      for (const call of getFunctionCalls(event)) {
        steps.push(describeStep(call.name ?? 'tool', (call.args ?? {}) as Record<string, unknown>, collection !== null));
      }
      if (isFinalResponse(event)) {
        const text = stringifyContent(event).trim();
        if (text) reply = text;
      }
    }

    if (!reply) throw new AdvisorChatError('The model returned no answer.', 'model');
    return { sessionId, reply, steps };
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
    this.sessions.set(sessionId, { lastUsed: now, turns: 0, busy: false });
    return { sessionId, restarted: requested !== undefined };
  }

  private async forget(sessionId: string): Promise<void> {
    this.sessions.delete(sessionId);
    await this.sessionService.deleteSession({ appName: APP_NAME, userId: USER_ID, sessionId });
  }
}
