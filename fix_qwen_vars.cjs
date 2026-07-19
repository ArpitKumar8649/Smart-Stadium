const fs = require('fs');

const path = 'backend/src/services/llm/qwen.ts';
let code = fs.readFileSync(path, 'utf8');

code = code.replace(
  "    let finishReason = 'stop';\\n    let usage: LlmUsage | undefined;",
  ""
);

code = code.replace(
  "finishReason = state.finishReason;\\n    usage = state.usage;",
  "const finishReason = state.finishReason;\\n    const usage = state.usage;"
);

// fix any for chunk to be imported or just explicit
code = code.replace('chunk: any,', 'chunk: import("openai/resources/chat/completions.mjs").ChatCompletionChunk,');

fs.writeFileSync(path, code);
