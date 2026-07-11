import { useCallback, useRef, useState } from 'react';

export type ToolChip = { id: string; name: string; summary?: string; ok?: boolean };

export type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  tools?: ToolChip[];
  streaming?: boolean;
};

type StreamEvent =
  | { type: 'token'; text: string; index?: number }
  | { type: 'toolCall'; name: string; args: Record<string, unknown>; id: string }
  | { type: 'toolResult'; name: string; id: string; ok: boolean; summary?: string }
  | { type: 'done'; usage?: { input_tokens: number; output_tokens: number } }
  | { type: 'error'; code: string; message: string };

const API_BASE = import.meta.env.VITE_API_BASE ?? '';

let idSeq = 0;
const nextId = () => `m${Date.now()}_${idSeq++}`;

/**
 * Drives the concierge chat: sends a message to POST /api/chat and consumes
 * the SSE stream (parsed from the fetch body), updating the last assistant
 * message as tokens and tool chips arrive.
 */
export function useConcierge(sessionId: string) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // Use a ref for history to avoid stale closures in the useCallback without triggering re-renders
  const historyRef = useRef<ChatMessage[]>([]);
  historyRef.current = messages;

  const send = useCallback(
    async (text: string, lang?: string, locationNodeId?: string, gpsContext?: { lat: number; lng: number }) => {
      if (!text.trim() || busy) return;
      setBusy(true);

      const userMsg: ChatMessage = { id: nextId(), role: 'user', text };
      const asstId = nextId();
      const asstMsg: ChatMessage = { id: asstId, role: 'assistant', text: '', tools: [], streaming: true };

      // Capture current history before we append the new messages
      const historyToSent = historyRef.current.map(m => ({
        role: m.role,
        content: m.text
      }));

      setMessages((m) => [...m, userMsg, asstMsg]);

      const patch = (fn: (m: ChatMessage) => ChatMessage) =>
        setMessages((list) => list.map((m) => (m.id === asstId ? fn(m) : m)));

      const ctrl = new AbortController();
      abortRef.current = ctrl;

      try {
        const res = await fetch(`${API_BASE}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            session_id: sessionId,
            message: text,
            history: historyToSent,
            ...(lang ? { lang } : {}),
            ...(locationNodeId ? { location_node_id: locationNodeId } : {}),
            ...(gpsContext ? { context: { location: gpsContext } } : {}),
          }),
          signal: ctrl.signal,
        });

        if (!res.ok || !res.body) {
          const msg = `Concourse is unavailable (HTTP ${res.status}).`;
          patch((m) => ({ ...m, text: msg, streaming: false }));
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = '';

        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });

          // SSE frames are separated by a blank line.
          const frames = buf.split('\n\n');
          buf = frames.pop() ?? '';
          for (const frame of frames) {
            const line = frame.split('\n').find((l) => l.startsWith('data:'));
            if (!line) continue;
            const json = line.slice(5).trim();
            if (!json || json === '[DONE]') continue;
            let ev: StreamEvent;
            try {
              ev = JSON.parse(json) as StreamEvent;
            } catch {
              continue;
            }
            applyEvent(ev, patch);
          }
        }
        patch((m) => ({ ...m, streaming: false }));
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          patch((m) => ({
            ...m,
            text: m.text || 'Something interrupted the connection. Try again.',
            streaming: false,
          }));
        }
      } finally {
        setBusy(false);
        abortRef.current = null;
      }
    },
    [busy, sessionId],
  );

  const stop = useCallback(() => abortRef.current?.abort(), []);

  return { messages, busy, send, stop };
}

function applyEvent(ev: StreamEvent, patch: (fn: (m: ChatMessage) => ChatMessage) => void) {
  switch (ev.type) {
    case 'token':
      patch((m) => ({ ...m, text: m.text + ev.text }));
      break;
    case 'toolCall':
      patch((m) => ({
        ...m,
        tools: [...(m.tools ?? []), { id: ev.id, name: ev.name }],
      }));
      break;
    case 'toolResult':
      patch((m) => ({
        ...m,
        tools: (m.tools ?? []).map((t) =>
          t.id === ev.id
            ? { ...t, ok: ev.ok, ...(ev.summary ? { summary: ev.summary } : {}) }
            : t,
        ),
      }));
      break;
    case 'error':
      patch((m) => ({ ...m, text: m.text || `⚠ ${ev.message}`, streaming: false }));
      break;
    case 'done':
      break;
  }
}
