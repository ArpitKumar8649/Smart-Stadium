const fs = require('fs');

const path = 'frontend/src/features/concierge/useConcierge.ts';
let code = fs.readFileSync(path, 'utf8');

const readStreamStr = `
async function readChatStream(res: Response, patch: (fn: (m: ChatMessage) => ChatMessage) => void) {
  if (!res.body) return;
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';

  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });

    const frames = buf.split('\\n\\n');
    buf = frames.pop() ?? '';
    for (const frame of frames) {
      const line = frame.split('\\n').find((l) => l.startsWith('data:'));
      if (!line) continue;
      const json = line.slice(5).trim();
      if (!json || json === '[DONE]') continue;
      let ev: ChatEvent;
      try {
        ev = JSON.parse(json) as ChatEvent;
      } catch {
        continue;
      }
      applyEvent(ev, patch);
    }
  }
}
`;

const searchStr = `        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = '';

        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });

          // SSE frames are separated by a blank line.
          const frames = buf.split('\\n\\n');
          buf = frames.pop() ?? '';
          for (const frame of frames) {
            const line = frame.split('\\n').find((l) => l.startsWith('data:'));
            if (!line) continue;
            const json = line.slice(5).trim();
            if (!json || json === '[DONE]') continue;
            let ev: ChatEvent;
            try {
              ev = JSON.parse(json) as ChatEvent;
            } catch {
              continue;
            }
            applyEvent(ev, patch);
          }
        }`;

const replaceStr = `        await readChatStream(res, patch);`;

code = code.replace(searchStr, replaceStr);
code = code.replace('function applyEvent', readStreamStr + '\nfunction applyEvent');

fs.writeFileSync(path, code);
