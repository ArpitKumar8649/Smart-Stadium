import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useConcierge } from './useConcierge.ts';
import { sseFrame } from '../../test/factories.ts';

function streamResponse(chunks: string[], init: ResponseInit = {}) {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
        controller.close();
      },
    }),
    { status: 200, ...init },
  );
}

describe('useConcierge', () => {
  beforeEach(() => {
    vi.setSystemTime(new Date('2026-07-18T00:00:00.000Z'));
  });

  it('streams tokens and tool chips while sending language, location, accessibility and bounded history', async () => {
    const fetchMock = vi.fn(async () => streamResponse([
      sseFrame({ type: 'token', text: 'Hello ' }),
      sseFrame({ type: 'toolCall', id: 'tool-1', name: 'find_route' }),
      sseFrame({ type: 'toolResult', id: 'tool-1', ok: true, summary: 'Route found' }),
      sseFrame({ type: 'token', text: 'fan' }),
      sseFrame('[DONE]'),
    ]));
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useConcierge('session-1'));

    await act(async () => {
      await result.current.send('Where is Section 108?', 'es', undefined, { lat: 1, lng: 2 }, ['step_free']);
    });

    expect(fetchMock).toHaveBeenCalledWith('/api/chat', expect.objectContaining({ method: 'POST' }));
    const firstCall = fetchMock.mock.calls[0] as unknown as [RequestInfo | URL, RequestInit];
    const body = JSON.parse(String(firstCall[1].body));
    expect(body).toMatchObject({
      session_id: 'session-1',
      message: 'Where is Section 108?',
      lang: 'es',
      accessibility: ['step_free'],
      context: { location: { lat: 1, lng: 2 } },
    });
    expect(result.current.busy).toBe(false);
    expect(result.current.messages).toHaveLength(2);
    expect(result.current.messages[1]).toMatchObject({
      role: 'assistant',
      text: 'Hello fan',
      streaming: false,
      tools: [{ id: 'tool-1', name: 'find_route', ok: true, summary: 'Route found' }],
    });

    fetchMock.mockClear();
    await act(async () => { await result.current.send('Follow up'); });
    const followUpCall = fetchMock.mock.calls[0] as unknown as [RequestInfo | URL, RequestInit];
    const followUp = JSON.parse(String(followUpCall[1].body));
    expect(followUp.history).toEqual([
      { role: 'user', content: 'Where is Section 108?' },
      { role: 'assistant', content: 'Hello fan' },
    ]);
  });

  it('ignores blank/concurrent sends, handles HTTP errors, and aborts cleanly', async () => {
    let resolveFetch!: (value: Response) => void;
    const fetchMock = vi.fn(() => new Promise<Response>((resolve) => { resolveFetch = resolve; }));
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useConcierge('session-2'));

    await act(async () => { await result.current.send('   '); });
    expect(fetchMock).not.toHaveBeenCalled();

    let firstSend!: Promise<void>;
    await act(async () => { firstSend = result.current.send('first'); });
    await waitFor(() => expect(result.current.busy).toBe(true));
    await act(async () => { await result.current.send('second'); });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => { result.current.stop(); });
    const pendingCall = fetchMock.mock.calls[0] as unknown as [RequestInfo | URL, RequestInit];
    const signal = pendingCall[1].signal as AbortSignal;
    expect(signal.aborted).toBe(true);

    resolveFetch(new Response(null, { status: 499 }));
    await act(async () => { await firstSend; });

    fetchMock.mockResolvedValueOnce(new Response('', { status: 503 }));
    await act(async () => { await result.current.send('retry'); });
    expect(result.current.messages.at(-1)?.text).toBe('Concourse is unavailable (HTTP 503).');
  });
});
