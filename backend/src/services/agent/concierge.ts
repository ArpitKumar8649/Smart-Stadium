import { randomUUID } from 'node:crypto';
import { getLlm } from '../llm/qwen.js';
import type { ChatMessage, LlmStreamEvent } from '../llm/provider.js';
import { TOOL_DEFINITIONS, handleToolCall } from './tools.js';
import { buildSystemPrompt, CONCIERGE_TEMPERATURE } from './prompt.js';
import { logger } from '../../middleware/logger.js';

const MAX_HOPS = 6;

/** Events the concierge loop emits to the transport (mapped to SSE frames). */
export type ConciergeEvent =
  | { type: 'token'; text: string }
  | { type: 'toolCall'; id: string; name: string; args: Record<string, unknown> }
  | { type: 'toolResult'; id: string; name: string; ok: boolean; summary?: string }
  | { type: 'done'; usage?: { input_tokens: number; output_tokens: number } }
  | { type: 'error'; code: string; message: string };

export interface ConciergeTurnInput {
  message: string;
  lang?: string;
  locationLabel?: string;
  matchLabel?: string;
  accessibility?: string[];
  history?: ChatMessage[];
  signal?: AbortSignal;
}

/**
 * Runs one concierge turn: model → (tool calls → tool results → model)* → text.
 * Streams tokens as they arrive; bounded by MAX_HOPS so a tool loop can't run away.
 * The LLM only ever states venue facts that came back from a tool (deterministic
 * tool-grounding is enforced by the system prompt; tools return typed data).
 */
export async function* runConciergeTurn(
  input: ConciergeTurnInput,
): AsyncGenerator<ConciergeEvent, void, unknown> {
  const llm = getLlm();

  const system = buildSystemPrompt({
    ...(input.lang ? { lang: input.lang } : {}),
    ...(input.locationLabel ? { locationLabel: input.locationLabel } : {}),
    ...(input.matchLabel ? { matchLabel: input.matchLabel } : {}),
    ...(input.accessibility ? { accessibility: input.accessibility } : {}),
  });

  const messages: ChatMessage[] = [
    { role: 'system', content: system },
    ...(input.history ?? []),
    { role: 'user', content: input.message },
  ];

  let totalUsage = { input_tokens: 0, output_tokens: 0 };

  for (let hop = 0; hop < MAX_HOPS; hop++) {
    let assistantText = '';
    let toolCalls: { id: string; name: string; arguments: string }[] = [];
    let finishReason = 'stop';

    try {
      for await (const ev of llm.streamChat({
        messages,
        tools: TOOL_DEFINITIONS,
        temperature: CONCIERGE_TEMPERATURE,
        ...(input.signal ? { signal: input.signal } : {}),
      })) {
        const e = ev as LlmStreamEvent;
        if (e.type === 'token') {
          assistantText += e.text;
          yield { type: 'token', text: e.text };
        } else if (e.type === 'tool_calls') {
          toolCalls = e.calls;
        } else if (e.type === 'done') {
          finishReason = e.finishReason;
          if (e.usage) {
            totalUsage.input_tokens += e.usage.inputTokens;
            totalUsage.output_tokens += e.usage.outputTokens;
          }
        }
      }
    } catch (err) {
      logger.error({ err }, 'concierge stream failed');
      yield { type: 'error', code: 'llm_error', message: 'Concourse hit a snag. Try again.' };
      return;
    }

    // No tools requested → the turn is complete.
    if (toolCalls.length === 0 || finishReason !== 'tool_calls') {
      yield { type: 'done', usage: totalUsage };
      return;
    }

    // Record the assistant's tool-call turn, then run each tool.
    messages.push({
      role: 'assistant',
      content: assistantText || null,
      tool_calls: toolCalls.map((t) => ({ id: t.id, name: t.name, arguments: t.arguments })),
    });

    for (const call of toolCalls) {
      const id = call.id || randomUUID();
      let args: Record<string, unknown> = {};
      try {
        args = call.arguments ? (JSON.parse(call.arguments) as Record<string, unknown>) : {};
      } catch {
        // leave args empty; handler will reject with a helpful error
      }
      yield { type: 'toolCall', id, name: call.name, args };

      const result = await handleToolCall(call.name, args);
      yield {
        type: 'toolResult',
        id,
        name: call.name,
        ok: result.ok,
        ...(result.summary ? { summary: result.summary } : {}),
      };

      messages.push({
        role: 'tool',
        tool_call_id: call.id,
        name: call.name,
        content: JSON.stringify(result.ok ? { ok: true, ...(result.data as object) } : result),
      });
    }
    // loop again → model sees tool results and continues
  }

  // Hop budget exhausted.
  yield {
    type: 'token',
    text: ' (I need a moment to finish that — could you rephrase?)',
  };
  yield { type: 'done', usage: totalUsage };
}
