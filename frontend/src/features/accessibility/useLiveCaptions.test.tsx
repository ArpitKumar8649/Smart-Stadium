import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { downsampleToPcm16, useLiveCaptions } from './useLiveCaptions.ts';

class MockWebSocket {
  static instances: MockWebSocket[] = [];
  static readonly OPEN = 1;
  readyState = MockWebSocket.OPEN;
  onmessage: ((event: MessageEvent) => unknown) | null = null;
  onerror: (() => unknown) | null = null;
  onclose: (() => unknown) | null = null;
  send = vi.fn();
  close = vi.fn(() => { this.readyState = 3; });
  constructor(readonly url: string) { MockWebSocket.instances.push(this); }
  emit(data: unknown) { this.onmessage?.(new MessageEvent('message', { data: JSON.stringify(data) })); }
}

class MockAudioContext {
  sampleRate = 16000;
  destination = {} as AudioDestinationNode;
  close = vi.fn(async () => undefined);
  source = { connect: vi.fn(), disconnect: vi.fn() };
  processor = { connect: vi.fn(), disconnect: vi.fn(), onaudioprocess: null as ScriptProcessorNode['onaudioprocess'] };
  createMediaStreamSource = vi.fn(() => this.source);
  createScriptProcessor = vi.fn(() => this.processor);
}

describe('downsampleToPcm16', () => {
  it('clamps samples and converts to signed PCM at matching sample rate', () => {
    const result = new Int16Array(downsampleToPcm16(new Float32Array([-2, -0.5, 0, 0.5, 2]), 16000));
    expect([...result]).toEqual([-32767, -16383, 0, 16383, 32767]);
  });

  it('downsamples by averaging source samples', () => {
    const result = new Int16Array(downsampleToPcm16(new Float32Array([1, 1, -1, -1]), 32000));
    expect([...result]).toEqual([32767, -32767]);
  });
});

describe('useLiveCaptions', () => {
  let track: { stop: ReturnType<typeof vi.fn> };
  let audioContext: MockAudioContext;

  beforeEach(() => {
    MockWebSocket.instances = [];
    track = { stop: vi.fn() };
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: vi.fn(async () => ({ getTracks: () => [track] })),
      },
    });
    audioContext = new MockAudioContext();
    Object.defineProperty(globalThis, 'AudioContext', {
      configurable: true,
      writable: true,
      value: vi.fn(() => audioContext),
    });
    Object.defineProperty(globalThis, 'WebSocket', {
      configurable: true,
      writable: true,
      value: MockWebSocket,
    });
  });

  it('streams captions, sends PCM only after ready, and cleans up on stop', async () => {
    const { result } = renderHook(() => useLiveCaptions());

    await act(async () => { await result.current.start(); });
    expect(result.current.state).toBe('connecting');
    expect(MockWebSocket.instances[0]?.url).toBe('ws://localhost:3000/api/audio/asr');

    act(() => { MockWebSocket.instances[0]?.emit({ type: 'ready' }); });
    expect(result.current.state).toBe('listening');

    act(() => {
      MockWebSocket.instances[0]?.emit({ type: 'partial', text: 'Gate C' });
      MockWebSocket.instances[0]?.emit({ type: 'final', text: 'Gate C is closing.' });
    });
    expect(result.current.partial).toBe('');
    expect(result.current.lines).toEqual(['Gate C is closing.']);

    act(() => {
      const event = {
        inputBuffer: { getChannelData: () => new Float32Array([0.5, -0.5]) },
      } as unknown as AudioProcessingEvent;
      audioContext.processor.onaudioprocess?.call(audioContext.processor as unknown as ScriptProcessorNode, event);
    });
    expect(MockWebSocket.instances[0]?.send).toHaveBeenCalledWith(expect.any(ArrayBuffer));

    act(() => { result.current.stop(); });
    expect(MockWebSocket.instances[0]?.send).toHaveBeenCalledWith(JSON.stringify({ type: 'stop' }));
    expect(MockWebSocket.instances[0]?.close).toHaveBeenCalled();
    expect(track.stop).toHaveBeenCalled();
    expect(audioContext.close).toHaveBeenCalled();
    expect(result.current.state).toBe('idle');
  });

  it('reports microphone denial and service errors without leaking resources', async () => {
    vi.mocked(navigator.mediaDevices.getUserMedia).mockRejectedValueOnce(new Error('denied'));
    const { result, rerender } = renderHook(() => useLiveCaptions());

    await act(async () => { await result.current.start(); });
    expect(result.current.state).toBe('error');
    expect(result.current.error).toBe('Microphone access was denied or is unavailable.');

    vi.mocked(navigator.mediaDevices.getUserMedia).mockResolvedValueOnce({ getTracks: () => [track] } as unknown as MediaStream);
    await act(async () => { await result.current.start(); });
    rerender();
    act(() => { MockWebSocket.instances.at(-1)?.emit({ type: 'error', message: 'ASR unavailable' }); });

    expect(result.current.state).toBe('error');
    expect(result.current.error).toBe('ASR unavailable');
    expect(track.stop).toHaveBeenCalled();
  });
});
