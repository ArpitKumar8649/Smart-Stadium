import OpenAI from 'openai';
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from 'openai/resources/chat/completions';
import { env } from '../../config/env.js';
import { logger } from '../../middleware/logger.js';
import { llmBucket } from './rate-limit.js';
import type {
  ChatMessage,
  ChatOptions,
  LlmProvider,
  LlmStreamEvent,
  LlmUsage,
  ToolCall,
} from './provider.js';

/**
 * Qwen provider over DashScope's OpenAI-compatible endpoint.
 * Verified live: chat, function-calling, streaming, multilingual, vision.
 */
export class QwenProvider implements LlmProvider {
  readonly name = 'qwen';
  private readonly client: OpenAI;
  private readonly chatModel: string;
  private readonly vlModel: string;

  constructor() {
    if (!env.DASHSCOPE_API_KEY) {
      logger.warn('DASHSCOPE_API_KEY is not set — LLM calls will fail until it is provided.');
    }
    this.client = new OpenAI({
      apiKey: env.DASHSCOPE_API_KEY ?? 'missing',
      baseURL: env.DASHSCOPE_BASE_URL,
    });
    this.chatModel = env.QWEN_MODEL_CHAT;
    this.vlModel = env.QWEN_MODEL_VL;
  }

  private toOpenAiMessages(messages: ChatMessage[]): ChatCompletionMessageParam[] {
    return messages.map((m) => {
      if (m.role === 'assistant' && m.tool_calls?.length) {
        return {
          role: 'assistant',
          content: m.content ?? '',
          tool_calls: m.tool_calls.map((tc) => ({
            id: tc.id,
            type: 'function' as const,
            function: { name: tc.name, arguments: tc.arguments },
          })),
        };
      }
      if (m.role === 'tool') {
        return {
          role: 'tool',
          content: m.content ?? '',
          tool_call_id: m.tool_call_id ?? '',
        };
      }
      return { role: m.role, content: m.content ?? '' } as ChatCompletionMessageParam;
    });
  }

  private toOpenAiTools(opts: ChatOptions): ChatCompletionTool[] | undefined {
    if (!opts.tools?.length) return undefined;
    return opts.tools.map((t) => ({
      type: 'function',
      function: { name: t.name, description: t.description, parameters: t.parameters },
    }));
  }

  async *streamChat(opts: ChatOptions): AsyncGenerator<LlmStreamEvent, void, unknown> {
    await llmBucket.acquire();
    const tools = this.toOpenAiTools(opts);
    const stream = await this.client.chat.completions.create({
      model: opts.model ?? this.chatModel,
      messages: this.toOpenAiMessages(opts.messages),
      ...(tools ? { tools } : {}),
      temperature: opts.temperature ?? 0.3,
      max_tokens: opts.maxTokens ?? 800,
      stream: true,
      stream_options: { include_usage: true },
    }, opts.signal ? { signal: opts.signal } : {});

    // Accumulate streamed tool-call fragments by index.
    const toolAcc = new Map<number, { id: string; name: string; args: string }>();
    let finishReason = 'stop';
    let usage: LlmUsage | undefined;

    for await (const chunk of stream) {
      const choice = chunk.choices[0];
      if (chunk.usage) {
        usage = {
          inputTokens: chunk.usage.prompt_tokens ?? 0,
          outputTokens: chunk.usage.completion_tokens ?? 0,
        };
      }
      if (!choice) continue;
      const delta = choice.delta;

      if (delta?.content) {
        yield { type: 'token', text: delta.content };
      }
      if (delta?.tool_calls) {
        for (const tc of delta.tool_calls) {
          const idx = tc.index ?? 0;
          const cur = toolAcc.get(idx) ?? { id: '', name: '', args: '' };
          if (tc.id) cur.id = tc.id;
          if (tc.function?.name) cur.name = tc.function.name;
          if (tc.function?.arguments) cur.args += tc.function.arguments;
          toolAcc.set(idx, cur);
        }
      }
      if (choice.finish_reason) finishReason = choice.finish_reason;
    }

    if (toolAcc.size) {
      const calls: ToolCall[] = [...toolAcc.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([, v]) => ({ id: v.id, name: v.name, arguments: v.args || '{}' }));
      yield { type: 'tool_calls', calls };
    }
    yield usage
      ? { type: 'done', finishReason, usage }
      : { type: 'done', finishReason };
  }

  async chat(opts: ChatOptions): Promise<{ message: ChatMessage; usage?: LlmUsage }> {
    await llmBucket.acquire();
    const tools = this.toOpenAiTools(opts);
    const res = await this.client.chat.completions.create({
      model: opts.model ?? this.chatModel,
      messages: this.toOpenAiMessages(opts.messages),
      ...(tools ? { tools } : {}),
      temperature: opts.temperature ?? 0.3,
      max_tokens: opts.maxTokens ?? 800,
    }, opts.signal ? { signal: opts.signal } : {});

    const choice = res.choices[0];
    const msg = choice?.message;
    const message: ChatMessage = {
      role: 'assistant',
      content: msg?.content ?? null,
    };
    if (msg?.tool_calls?.length) {
      message.tool_calls = msg.tool_calls.map((tc) => ({
        id: tc.id,
        name: tc.function.name,
        arguments: tc.function.arguments,
      }));
    }
    if (res.usage) {
      return {
        message,
        usage: { inputTokens: res.usage.prompt_tokens, outputTokens: res.usage.completion_tokens },
      };
    }
    return { message };
  }

  async describeImage(imageB64: string, prompt: string, lang: string): Promise<string> {
    await llmBucket.acquire();
    const dataUrl = imageB64.startsWith('data:') ? imageB64 : `data:image/jpeg;base64,${imageB64}`;
    const res = await this.client.chat.completions.create({
      model: this.vlModel,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: `${prompt}\n\nRespond in this language: ${lang}.` },
            { type: 'image_url', image_url: { url: dataUrl } },
          ],
        },
      ],
      max_tokens: 400,
    });
    return res.choices[0]?.message?.content ?? '';
  }
}

let singleton: QwenProvider | undefined;
export function getLlm(): QwenProvider {
  if (!singleton) singleton = new QwenProvider();
  return singleton;
}
