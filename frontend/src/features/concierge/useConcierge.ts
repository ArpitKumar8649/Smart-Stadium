import { useCallback, useRef, useState } from 'react';
import type { ChatEvent } from '@concourse/shared';

export type ToolChip = { id: string; name: string; summary?: string; ok?: boolean; data?: Record<string, unknown> };

export type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  tools?: ToolChip[];
  streaming?: boolean;
};

const API_BASE = import.meta.env.VITE_API_BASE ?? '';
const MAX_HISTORY_MESSAGES = 10;
const MAX_HISTORY_CONTENT = 2_000;

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
    async (
      text: string,
      lang?: string,
      locationNodeId?: string,
      gpsCoords?: {lat: number, lng: number},
      accessibility?: string[],
    ) => {
      if (!text.trim() || busy) return;
      setBusy(true);

      const userMsg: ChatMessage = { id: nextId(), role: 'user', text };
      const asstId = nextId();
      const asstMsg: ChatMessage = { id: asstId, role: 'assistant', text: '', tools: [], streaming: true };

      // Keep only API-valid completed turns. Empty placeholders can occur when
      // a stream is cancelled, and output tokens are not a character limit.
      const historyToSend = historyRef.current
        .filter((message) => !message.streaming && message.text.trim().length > 0)
        .slice(-MAX_HISTORY_MESSAGES)
        .map((message) => ({
          role: message.role,
          content: message.text.trim().slice(0, MAX_HISTORY_CONTENT),
        }));

      setMessages((m) => [...m, userMsg, asstMsg]);

      const patch = (fn: (m: ChatMessage) => ChatMessage) =>
        setMessages((list) => list.map((m) => (m.id === asstId ? fn(m) : m)));

      const ctrl = new AbortController();
      abortRef.current = ctrl;

      try {
        const reqBody: Record<string, unknown> = {
          session_id: sessionId,
          message: text,
          ...(historyToSend.length ? { history: historyToSend } : {}),
        };
        if (lang) reqBody.lang = lang;
        if (locationNodeId) reqBody.location_node_id = locationNodeId;
        if (accessibility?.length) reqBody.accessibility = accessibility;
        if (gpsCoords) {
          reqBody.context = { location: gpsCoords };
        }

        const res = await fetch(`${API_BASE}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(reqBody),
          signal: ctrl.signal,
        });

        if (!res.ok || !res.body) {
          const msg = `Concourse is unavailable (HTTP ${res.status}).`;
          patch((m) => ({ ...m, text: msg, streaming: false }));
          return;
        }

        await readChatStream(res, patch);
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


async function readChatStream(res: Response, patch: (fn: (m: ChatMessage) => ChatMessage) => void) {
  if (!res.body) return;
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';

  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });

    const frames = buf.split('\n\n');
    buf = frames.pop() ?? '';
    for (const frame of frames) {
      const line = frame.split('\n').find((l) => l.startsWith('data:'));
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

function applyEvent(ev: ChatEvent, patch: (fn: (m: ChatMessage) => ChatMessage) => void) {
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
            ? { ...t, ok: ev.ok, ...(ev.summary ? { summary: ev.summary } : {}), ...('data' in ev && ev.data ? { data: ev.data as Record<string, unknown> } : {}) }
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
