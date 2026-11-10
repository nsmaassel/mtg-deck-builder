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
}

export class AdvisorChatError extends Error {
  constructor(
    message: string,
    /** `limit`: the conversation is over its turn budget. `model`: the model call failed. */
    public readonly kind: 'limit' | 'model',
  ) {
    super(message);
    this.name = 'AdvisorChatError';
  }
}

const TOOL_LABELS: Record<string, (args: Record<string, unknown>) => string> = {
  collection_summary: () => 'Looked at your collection',
  list_meta_decks: args => `Ranked the ${String(args['format'] ?? '')} meta against your collection`,
  check_meta_deck: args => `Checked ${String(args['archetype'] ?? 'a meta deck')} against your collection`,
  check_decklist: args => `Checked your ${String(args['format'] ?? '')} decklist`,
  lookup_cards: args => `Looked up ${Array.isArray(args['names']) ? (args['names'] as unknown[]).join(', ') : 'cards'}`,
  find_stand_ins: args => `Searched for stand-ins for ${String(args['card'] ?? 'a card')}`,
};

function describeStep(tool: string, args: Record<string, unknown>): ChatStep {
  const label = TOOL_LABELS[tool];
  return { tool, summary: (label ? label(args) : tool).replace(/\s+/g, ' ').trim().slice(0, 160) };
}

interface SessionRecord {
  lastUsed: number;
  turns: number;
}

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
    const sessionId = await this.openSession(input.sessionId);
    const record = this.sessions.get(sessionId)!;
    if (record.turns >= this.options.maxTurnsPerSession) {
      throw new AdvisorChatError('This conversation has reached its length limit. Start a new one to keep going.', 'limit');
    }
    record.turns += 1;

    // The tools close over this turn's collection, so the agent is built per turn. It is cheap.
    const agent = new LlmAgent({
      name: 'deck_advisor',
      description: 'Advises MTG Arena players on which deck to build with the cards they own.',
      model: this.options.model,
      instruction: ADVISOR_INSTRUCTION,
      tools: createAdvisorTools(this.options.data, { collection: input.collection }),
    });
    const runner = new Runner({ appName: APP_NAME, agent, sessionService: this.sessionService });

    const steps: ChatStep[] = [];
    let reply = '';
    const events = runner.runAsync({
      userId: USER_ID,
      sessionId,
      newMessage: { role: 'user', parts: [{ text: input.message }] },
      runConfig: createRunConfig({ maxLlmCalls: this.options.maxLlmCallsPerTurn }),
    });
    try {
      for await (const event of events) {
        if (event.errorCode || event.errorMessage) {
          throw new AdvisorChatError(event.errorMessage ?? `Model error ${event.errorCode}`, 'model');
        }
        for (const call of getFunctionCalls(event)) {
          steps.push(describeStep(call.name ?? 'tool', (call.args ?? {}) as Record<string, unknown>));
        }
        if (isFinalResponse(event)) {
          const text = stringifyContent(event).trim();
          if (text) reply = text;
        }
      }
    } catch (err) {
      if (err instanceof AdvisorChatError) throw err;
      throw new AdvisorChatError(err instanceof Error ? err.message : String(err), 'model');
    }

    if (!reply) throw new AdvisorChatError('The model returned no answer.', 'model');
    return { sessionId, reply, steps };
  }

  /** Continue a known conversation, or start one. An unknown or expired id starts afresh. */
  private async openSession(requested: string | undefined): Promise<string> {
    const now = this.options.now();
    for (const [id, record] of this.sessions) {
      if (now - record.lastUsed > this.options.sessionTtlMs) await this.forget(id);
    }

    const known = requested ? this.sessions.get(requested) : undefined;
    if (requested && known) {
      known.lastUsed = now;
      return requested;
    }

    while (this.sessions.size >= this.options.maxSessions) {
      const oldest = [...this.sessions].sort((a, b) => a[1].lastUsed - b[1].lastUsed)[0];
      if (!oldest) break;
      await this.forget(oldest[0]);
    }
    const sessionId = randomUUID();
    await this.sessionService.createSession({ appName: APP_NAME, userId: USER_ID, sessionId });
    this.sessions.set(sessionId, { lastUsed: now, turns: 0 });
    return sessionId;
  }

  private async forget(sessionId: string): Promise<void> {
    this.sessions.delete(sessionId);
    await this.sessionService.deleteSession({ appName: APP_NAME, userId: USER_ID, sessionId });
  }
}
