/**
 * Live speech-to-text proxy for the accessibility caption feature.
 *
 * The browser can't hold the DashScope key, so it opens a WebSocket to *us*
 * (`/api/audio/asr`) and streams raw PCM16 (16 kHz mono) frames. We relay them
 * to DashScope's `qwen3-asr-flash-realtime` over its realtime WebSocket, and
 * push transcription events back to the browser as compact JSON:
 *
 *   { type: 'ready' }                    — upstream session open, start talking
 *   { type: 'partial', text }            — interim caption (updates in place)
 *   { type: 'final',   text }            — finalized sentence
 *   { type: 'error',   message }         — upstream/config failure
 *   { type: 'done' }                     — session closed
 *
 * Browser → us protocol: binary frames = PCM audio; a text frame
 * `{"type":"stop"}` ends the session. The venue's real gate/section labels are
 * fed as ASR context "hotwords" so names like "HCL Tech VIP Gate" transcribe
 * correctly instead of being mangled.
 */

import { WebSocketServer, WebSocket, type RawData } from 'ws';
import type { Server } from 'node:http';
import { env } from '../../config/env.js';
import { logger } from '../../middleware/logger.js';
import { getGraph } from '../graph/loader.js';

const ASR_MODEL = 'qwen3-asr-flash-realtime';
const ASR_URL = `wss://dashscope-intl.aliyuncs.com/api-ws/v1/realtime?model=${ASR_MODEL}`;
const ASR_PATH = '/api/audio/asr';
/** Hard cap on a single caption session, to protect the free ASR quota. */
const MAX_SESSION_MS = 120_000;

/** Terms that aren't venue nodes but are common in fan/PA speech here. */
const STATIC_HOTWORDS = [
  'step-free', 'restroom', 'first aid', 'concession', 'prayer room', 'elevator',
  'escalator', 'gate', 'section', 'concourse', 'kickoff', 'half-time',
  'FIFA World Cup', 'MetLife Stadium',
];

let cachedCorpus: string | undefined;
/** Build the ASR context corpus once from real venue labels (capped for safety). */
function venueCorpus(): string {
  if (cachedCorpus !== undefined) return cachedCorpus;
  let labels: string[] = [];
  try {
    const g = getGraph();
    const gates = (g.byType.get('entry_gate') ?? []).map((n) => n.label);
    labels = gates;
  } catch (err) {
    logger.warn({ err }, 'ASR corpus: venue graph unavailable, using static terms only');
  }
  const unique = [...new Set([...labels, ...STATIC_HOTWORDS])].filter(Boolean);
  // corpus limit is 10k tokens; our list is tiny, but cap chars defensively.
  cachedCorpus = unique.join(', ').slice(0, 4000);
  return cachedCorpus;
}

/** Wire the ASR bridge onto the shared HTTP server (handles the WS upgrade). */
export function attachAsrWebSocket(server: Server): void {
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (req, socket, head) => {
    // Only claim our own path; leave anything else alone.
    if (!req.url || !req.url.startsWith(ASR_PATH)) return;
    wss.handleUpgrade(req, socket, head, (client) => wss.emit('connection', client, req));
  });

  wss.on('connection', (client) => bridgeSession(client));
  logger.info({ path: ASR_PATH, model: ASR_MODEL }, 'ASR WebSocket bridge attached');
}

function bridgeSession(client: WebSocket): void {
  if (!env.DASHSCOPE_API_KEY) {
    safeSend(client, { type: 'error', message: 'Speech recognition is not configured on this server.' });
    client.close();
    return;
  }

  const upstream = new WebSocket(ASR_URL, {
    headers: { Authorization: `Bearer ${env.DASHSCOPE_API_KEY}`, 'OpenAI-Beta': 'realtime=v1' },
  });

  let upstreamReady = false;
  const pending: Buffer[] = []; // audio that arrived before upstream was ready
  const killTimer = setTimeout(() => close('session timeout'), MAX_SESSION_MS);

  const close = (reason: string): void => {
    clearTimeout(killTimer);
    safeSend(client, { type: 'done' });
    if (client.readyState === WebSocket.OPEN) client.close();
    if (upstream.readyState === WebSocket.OPEN || upstream.readyState === WebSocket.CONNECTING) {
      upstream.close();
    }
    logger.info({ reason }, 'ASR session closed');
  };

  // --- upstream (DashScope) ---
  upstream.on('open', () => {
    upstream.send(JSON.stringify({
      event_id: 'session-init',
      type: 'session.update',
      session: {
        modalities: ['text'],
        input_audio_format: 'pcm',
        sample_rate: 16000,
        // `language` omitted → auto-detect (multilingual captions). `corpus`
        // biases recognition toward this venue's real place names.
        input_audio_transcription: { corpus: { text: venueCorpus() } },
        turn_detection: { type: 'server_vad', threshold: 0.0, silence_duration_ms: 500 },
      },
    }));
    upstreamReady = true;
    for (const buf of pending) forwardAudio(buf);
    pending.length = 0;
    safeSend(client, { type: 'ready' });
  });

  upstream.on('message', (data: RawData) => {
    let m: Record<string, unknown>;
    try { m = JSON.parse(data.toString()) as Record<string, unknown>; } catch { return; }
    switch (m.type) {
      case 'conversation.item.input_audio_transcription.text':
        if (typeof m.text === 'string') safeSend(client, { type: 'partial', text: m.text });
        break;
      case 'conversation.item.input_audio_transcription.completed':
        if (typeof m.transcript === 'string') safeSend(client, { type: 'final', text: m.transcript });
        break;
      case 'session.finished':
        close('upstream finished');
        break;
      case 'error':
      case 'session.failed':
        logger.error({ upstream: m }, 'ASR upstream reported failure');
        safeSend(client, { type: 'error', message: 'Recognition failed upstream.' });
        close('upstream error');
        break;
      default:
        break;
    }
  });

  upstream.on('error', (err) => {
    logger.error({ err }, 'ASR upstream error');
    safeSend(client, { type: 'error', message: 'Could not reach the speech service.' });
    close('upstream socket error');
  });
  upstream.on('close', () => close('upstream closed'));

  const forwardAudio = (buf: Buffer): void => {
    if (upstream.readyState !== WebSocket.OPEN) return;
    upstream.send(JSON.stringify({
      event_id: `a${Date.now()}`,
      type: 'input_audio_buffer.append',
      audio: buf.toString('base64'),
    }));
  };

  // --- browser (client) ---
  client.on('message', (data: RawData, isBinary: boolean) => {
    if (isBinary) {
      const buf = Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer);
      if (upstreamReady) forwardAudio(buf);
      else pending.push(buf);
      return;
    }
    // text control frame
    try {
      const ctrl = JSON.parse(data.toString()) as { type?: string };
      if (ctrl.type === 'stop' && upstream.readyState === WebSocket.OPEN) {
        upstream.send(JSON.stringify({ event_id: 'finish', type: 'session.finish' }));
      }
    } catch { /* ignore malformed control */ }
  });

  client.on('close', () => close('client closed'));
  client.on('error', (err) => { logger.warn({ err }, 'ASR client error'); close('client error'); });
}

function safeSend(ws: WebSocket, obj: unknown): void {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
}
