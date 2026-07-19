const fs = require('fs');

const path = 'backend/src/services/agent/transit.ts';
let code = fs.readFileSync(path, 'utf8');

const processTransitToolCallsStr = `
async function* processTransitToolCalls(
  toolCalls: { id: string; name: string; arguments: string }[],
  state: TransitTurnState,
  messages: ChatMessage[]
): AsyncGenerator<TransitEvent, void, unknown> {
  for (const call of toolCalls) {
    const id = call.id || randomUUID();
    let args: Record<string, unknown> = {};
    try {
      args = call.arguments ? (JSON.parse(call.arguments) as Record<string, unknown>) : {};
    } catch {
      // leave args empty
    }
    yield { type: 'toolCall', id, name: call.name, args };
    logger.info({ tool: call.name, args }, 'Transit agent tool call');

    const result = await dispatchTransitTool(call.name, args, state);
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

const searchStr = `    messages.push({
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
        // leave args empty
      }
      yield { type: 'toolCall', id, name: call.name, args };
      logger.info({ tool: call.name, args }, 'Transit agent tool call');

      const result = await dispatchTransitTool(call.name, args, state);
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
    }`;

const replaceStr = `    messages.push({
      role: 'assistant',
      content: assistantText || null,
      tool_calls: toolCalls.map((t) => ({ id: t.id, name: t.name, arguments: t.arguments })),
    });

    yield* processTransitToolCalls(toolCalls, state, messages);`;

code = code.replace(searchStr, replaceStr);

// add function before runTransitTurn
code = code.replace('export async function* runTransitTurn', processTransitToolCallsStr + '\nexport async function* runTransitTurn');

fs.writeFileSync(path, code);
