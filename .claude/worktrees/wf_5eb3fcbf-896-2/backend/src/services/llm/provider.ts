/**
 * LlmProvider — the single seam between Concourse and its language model.
 *
 * Everything the app needs from an LLM goes through this interface. Today
 * the only implementation is Qwen (via DashScope's OpenAI-compatible API).
 * Keeping the seam means the concierge loop, tools, and routes never import
 * the OpenAI SDK directly — see ADR 0003.
 */

export type ChatRole = 'system' | 'user' | 'assistant' | 'tool';

export interface ChatMessage {
  role: ChatRole;
  content: string | null;
  /** Present on assistant turns that call tools. */
  tool_calls?: ToolCall[];
  /** Present on tool-result turns; ties the result to the call. */
  tool_call_id?: string;
  /** Optional label for tool messages. */
  name?: string;
}

export interface ToolCall {
  id: string;
  name: string;
  /** Raw JSON string of arguments as emitted by the model. */
  arguments: string;
}

/** OpenAI-style tool definition (JSON Schema parameters). */
export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

/** A single event emitted while streaming one model turn. */
export type LlmStreamEvent =
  | { type: 'token'; text: string }
  | { type: 'tool_calls'; calls: ToolCall[] }
  | { type: 'done'; finishReason: string; usage?: LlmUsage };

export interface LlmUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface ChatOptions {
  messages: ChatMessage[];
  tools?: ToolDefinition[];
  temperature?: number;
  maxTokens?: number;
  /** Model id override; defaults to the provider's chat model. */
  model?: string;
  signal?: AbortSignal;
}

export interface LlmProvider {
  readonly name: string;
  /** Stream a single model turn. Yields tokens, then any tool calls, then done. */
  streamChat(opts: ChatOptions): AsyncGenerator<LlmStreamEvent, void, unknown>;
  /** Non-streaming convenience (used by the admin briefing + eval harness). */
  chat(opts: ChatOptions): Promise<{ message: ChatMessage; usage?: LlmUsage }>;
  /** Multimodal: describe/translate an image (sign reader). */
  describeImage(imageB64: string, prompt: string, lang: string): Promise<string>;
}
