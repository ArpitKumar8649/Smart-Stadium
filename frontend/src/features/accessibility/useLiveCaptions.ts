import { useCallback, useEffect, useRef, useState } from 'react';

const API_BASE = import.meta.env.VITE_API_BASE ?? '';

/** Build a ws(s):// URL for our backend, honoring VITE_API_BASE in production. */
function asrSocketUrl(): string {
  const base = API_BASE || window.location.origin;
  const u = new URL('/api/audio/asr', base);
  u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:';
  return u.toString();
}

/** Float32 [-1,1] mono at `inRate` → Int16 PCM at 16 kHz (what the ASR wants). */
export function downsampleToPcm16(input: Float32Array, inRate: number): ArrayBuffer {
  const outRate = 16000;
  if (inRate === outRate) {
    const out = new Int16Array(input.length);
    for (let i = 0; i < input.length; i++) out[i] = Math.max(-1, Math.min(1, input[i]!)) * 0x7fff;
    return out.buffer;
  }
  const ratio = inRate / outRate;
  const outLen = Math.floor(input.length / ratio);
  const out = new Int16Array(outLen);
  let pos = 0;
  for (let i = 0; i < outLen; i++) {
    const next = Math.round((i + 1) * ratio);
    let sum = 0;
    let cnt = 0;
    for (let j = Math.round(pos); j < next && j < input.length; j++) { sum += input[j]!; cnt++; }
    out[i] = Math.max(-1, Math.min(1, cnt ? sum / cnt : 0)) * 0x7fff;
    pos = next;
  }
  return out.buffer;
}

export type CaptionState = 'idle' | 'connecting' | 'listening' | 'error';

export interface LiveCaptions {
  state: CaptionState;
  /** The current in-progress sentence (updates in place). */
  partial: string;
  /** Finalized sentences, newest last. */
  lines: string[];
  error: string | null;
  start: () => Promise<void>;
  stop: () => void;
}

/**
 * Live speech-to-text for the accessibility caption feature. Captures the mic,
 * downsamples to 16 kHz PCM16, and streams it to our backend ASR bridge
 * (`/api/audio/asr`), which relays to DashScope and streams captions back.
 */
export function useLiveCaptions(): LiveCaptions {
  const [state, setState] = useState<CaptionState>('idle');
  const [partial, setPartial] = useState('');
  const [lines, setLines] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const procRef = useRef<ScriptProcessorNode | null>(null);
  const srcRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const attemptRef = useRef(0);
  const mountedRef = useRef(true);

  /** Release every browser-owned media resource. Safe to call more than once. */
  const release = useCallback((nextState?: CaptionState, nextError?: string) => {
    const ws = wsRef.current;
    const proc = procRef.current;
    const source = srcRef.current;
    const ctx = ctxRef.current;
    const stream = streamRef.current;

    wsRef.current = null;
    procRef.current = null;
    srcRef.current = null;
    ctxRef.current = null;
    streamRef.current = null;

    proc?.disconnect();
    source?.disconnect();
    void ctx?.close();
    stream?.getTracks().forEach((track) => track.stop());
    try { ws?.close(); } catch { /* socket may already be closed */ }

    if (!mountedRef.current || !nextState) return;
    if (nextError !== undefined) setError(nextError);
    setState(nextState);
    if (nextState !== 'listening') setPartial('');
  }, []);

  const stop = useCallback(() => {
    attemptRef.current += 1;
    try { wsRef.current?.send(JSON.stringify({ type: 'stop' })); } catch { /* socket may be closing */ }
    release('idle');
  }, [release]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      attemptRef.current += 1;
      release();
    };
  }, [release]);

  const start = useCallback(async () => {
    // Starting a fresh attempt always releases a previous failed or connecting attempt.
    attemptRef.current += 1;
    const attempt = attemptRef.current;
    release();
    setError(null);
    setLines([]);
    setPartial('');
    setState('connecting');

    const fail = (message: string, ws?: WebSocket) => {
      if (attempt !== attemptRef.current || (ws && wsRef.current !== ws)) return;
      attemptRef.current += 1;
      release('error', message);
    };

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
      });
      if (attempt !== attemptRef.current || !mountedRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;

      const ctx = new AudioContext();
      ctxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      srcRef.current = source;
      // ScriptProcessorNode is deprecated but ubiquitous and simplest here; it
      // outputs silence (we never write its output buffer) so there's no feedback.
      const proc = ctx.createScriptProcessor(4096, 1, 1);
      procRef.current = proc;

      const ws = new WebSocket(asrSocketUrl());
      wsRef.current = ws;
      let ready = false;

      ws.onmessage = (event) => {
        if (attempt !== attemptRef.current || wsRef.current !== ws) return;
        let message: { type?: string; text?: string; message?: string };
        try { message = JSON.parse(event.data as string); } catch { return; }
        if (message.type === 'ready') {
          ready = true;
          setState('listening');
        } else if (message.type === 'partial' && message.text !== undefined) {
          setPartial(message.text);
        } else if (message.type === 'final' && message.text) {
          setLines((current) => [...current, message.text!]);
          setPartial('');
        } else if (message.type === 'error') {
          fail(message.message ?? 'Recognition error.', ws);
        }
      };
      ws.onerror = () => fail('Could not connect to the caption service.', ws);
      ws.onclose = () => {
        if (attempt === attemptRef.current && wsRef.current === ws) {
          fail('The caption service connection closed unexpectedly.', ws);
        }
      };

      const inRate = ctx.sampleRate;
      proc.onaudioprocess = (event) => {
        if (attempt !== attemptRef.current || !ready || ws.readyState !== WebSocket.OPEN) return;
        ws.send(downsampleToPcm16(event.inputBuffer.getChannelData(0), inRate));
      };

      source.connect(proc);
      proc.connect(ctx.destination); // needed for onaudioprocess to fire in some browsers
    } catch (e) {
      console.error("LiveCaptions start() threw:", e);
      if (attempt === attemptRef.current) fail('Microphone access was denied or is unavailable.');
    }
  }, [release]);

  return { state, partial, lines, error, start, stop };
}
