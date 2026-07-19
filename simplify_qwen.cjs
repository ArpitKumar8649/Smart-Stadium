const fs = require('fs');

const path = 'backend/src/services/llm/qwen.ts';
let code = fs.readFileSync(path, 'utf8');

const processQwenChunkStr = `
  private processStreamChunk(
    chunk: any,
    toolAcc: Map<number, { id: string; name: string; args: string }>,
    state: { finishReason: string; usage: LlmUsage | undefined }
  ): { type: 'token'; text: string } | null {
    if (chunk.usage) {
      state.usage = {
        inputTokens: chunk.usage.prompt_tokens ?? 0,
        outputTokens: chunk.usage.completion_tokens ?? 0,
      };
    }
    const choice = chunk.choices[0];
    if (!choice) return null;
    
    if (choice.finish_reason) state.finishReason = choice.finish_reason;
    
    const delta = choice.delta;
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
    if (delta?.content) {
      return { type: 'token', text: delta.content };
    }
    return null;
  }
`;

const searchStr = `    for await (const chunk of stream) {
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
    }`;

const replaceStr = `    const state = { finishReason: 'stop', usage: undefined as LlmUsage | undefined };

    for await (const chunk of stream) {
      const event = this.processStreamChunk(chunk, toolAcc, state);
      if (event) yield event;
    }
    finishReason = state.finishReason;
    usage = state.usage;`;

code = code.replace(searchStr, replaceStr);
code = code.replace('async *streamChat', processQwenChunkStr + '\n  async *streamChat');

fs.writeFileSync(path, code);
