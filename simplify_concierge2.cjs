const fs = require('fs');

const path = 'backend/src/services/agent/concierge.ts';
let code = fs.readFileSync(path, 'utf8');

const processToolCallsStr = `
async function* processToolCalls(
  toolCalls: { id: string; name: string; arguments: string }[],
  input: ConciergeTurnInput,
  messages: ChatMessage[]
): AsyncGenerator<ConciergeEvent, void, unknown> {
  for (const call of toolCalls) {
    const id = call.id || randomUUID();
    let args: Record<string, unknown> = {};
    try {
      args = call.arguments ? (JSON.parse(call.arguments) as Record<string, unknown>) : {};
    } catch {
      // leave args empty; handler will reject with a helpful error
    }
    yield { type: 'toolCall', id, name: call.name, args };
    logger.info({ tool: call.name, args }, 'Executing LLM tool call');

    const result = await handleToolCall(call.name, args, input.context);
    yield {
      type: 'toolResult',
      id,
      name: call.name,
      ok: result.ok,
      ...(result.summary ? { summary: result.summary } : {}),
      ...(result.data ? { data: result.data as Record<string, unknown> } : {}),
    };

    messages.push({
      role: 'tool',
      tool_call_id: call.id,
      name: call.name,
      content: JSON.stringify(result.ok ? { ok: true, ...(result.data as object) } : result),
    });
  }
}
`;

const replaceStr = `
    // Record the assistant's tool-call turn, then run each tool.
    messages.push({
      role: 'assistant',
      content: assistantText || null,
      tool_calls: toolCalls.map((t) => ({ id: t.id, name: t.name, arguments: t.arguments })),
    });

    yield* processToolCalls(toolCalls, input, messages);
    // loop again → model sees tool results and continues
`;

const searchStr = `    // Record the assistant's tool-call turn, then run each tool.
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
      logger.info({ tool: call.name, args }, 'Executing LLM tool call');

      const result = await handleToolCall(call.name, args, input.context);
      yield {
        type: 'toolResult',
        id,
        name: call.name,
        ok: result.ok,
        ...(result.summary ? { summary: result.summary } : {}),
        ...(result.data ? { data: result.data as Record<string, unknown> } : {}),
      };

      messages.push({
        role: 'tool',
        tool_call_id: call.id,
        name: call.name,
        content: JSON.stringify(result.ok ? { ok: true, ...(result.data as object) } : result),
      });
    }
    // loop again → model sees tool results and continues`;

code = code.replace(searchStr, replaceStr);

// add function before prepareMessages
code = code.replace('function prepareMessages', processToolCallsStr + '\nfunction prepareMessages');

fs.writeFileSync(path, code);
