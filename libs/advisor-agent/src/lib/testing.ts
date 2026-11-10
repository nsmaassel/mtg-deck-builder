import { BaseLlm } from '@google/adk';
import type { LlmRequest, LlmResponse } from '@google/adk';

type Reply = LlmResponse | ((request: LlmRequest) => LlmResponse);

/** A model that says what the test tells it to, and records what it was asked. */
export class ScriptedLlm extends BaseLlm {
  readonly requests: LlmRequest[] = [];
  private readonly replies: Reply[];

  constructor(replies: Reply[]) {
    super({ model: 'scripted' });
    this.replies = [...replies];
  }

  async *generateContentAsync(request: LlmRequest): AsyncGenerator<LlmResponse, void> {
    this.requests.push(request);
    const next = this.replies.shift();
    if (!next) throw new Error('The script has no reply left for this model call.');
    yield typeof next === 'function' ? next(request) : next;
  }

  async connect(): Promise<never> {
    throw new Error('Live connections are not scripted.');
  }
}

export function callTool(name: string, args: Record<string, unknown> = {}): LlmResponse {
  return { content: { role: 'model', parts: [{ functionCall: { name, args } }] } };
}

export function say(text: string): LlmResponse {
  return { content: { role: 'model', parts: [{ text }] } };
}

/** The result of the most recent tool call, as the model received it. */
export function lastToolResult(request: LlmRequest): Record<string, unknown> {
  for (const content of [...request.contents].reverse()) {
    for (const part of content.parts ?? []) {
      if (part.functionResponse) return part.functionResponse.response as Record<string, unknown>;
    }
  }
  throw new Error('The request carries no tool result.');
}
