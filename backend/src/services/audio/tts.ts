/**
 * Generative text-to-speech via DashScope's CosyVoice (cosyvoice-v3-flash).
 *
 * This is the "mouth" of the multilingual PA feature (Tier 1). Unlike the flat
 * browser Web Speech voice, CosyVoice synthesizes speech with real prosody —
 * it's generative audio, so it counts as "GenAI beyond an LLM".
 *
 * The model speaks over a WebSocket using a run-task → continue-task →
 * finish-task lifecycle; audio comes back as binary MP3 frames. We buffer them
 * into one Buffer and return it. Proven working on the international endpoint
 * (English + Devanagari) before this was written.
 *
 * QUOTA DISCIPLINE: the free tier is only ~10K characters. So every synthesis
 * is cached on disk keyed by hash(model + voice + text); a repeated
 * announcement (the common demo case) costs ZERO quota on replay.
 */

import { WebSocket } from 'ws';
import { createHash, randomUUID } from 'node:crypto';
import { readFile, writeFile, mkdir, readdir, rename, stat, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { env } from '../../config/env.js';
import { logger } from '../../middleware/logger.js';

const TTS_MODEL = 'cosyvoice-v3-flash';
const TTS_URL = 'wss://dashscope-intl.aliyuncs.com/api-ws/v1/inference/';
/** Default multilingual voice preset. */
export const DEFAULT_VOICE = 'longanyang';
/** Cap a single synthesis so a runaway request can't drain the quota. */
const MAX_CHARS = 600;
const SYNTH_TIMEOUT_MS = 25_000;
const MAX_AUDIO_BYTES = 3 * 1024 * 1024;

const CACHE_DIR = join(tmpdir(), 'concourse-tts-cache');
const CACHE_TTL_MS = 6 * 60 * 60 * 1_000;
const MAX_CACHE_ENTRIES = 24;
const MAX_CACHE_BYTES = 24 * 1024 * 1024;
const MAX_CACHE_WRITE_QUEUE_BYTES = 12 * 1024 * 1024;
let cacheWriteQueue = Promise.resolve();
let queuedCacheWriteBytes = 0;
const inFlightSyntheses = new Map<string, Promise<Buffer>>();

function cacheKey(text: string, voice: string): string {
  return createHash('sha256').update(`${TTS_MODEL}::${voice}::${text}`).digest('hex').slice(0, 32);
}

interface CachedAudio {
  audio: Buffer;
  fresh: boolean;
}

async function readCache(key: string): Promise<CachedAudio | undefined> {
  try {
    const path = join(CACHE_DIR, `${key}.mp3`);
    const metadata = await stat(path);
    if (metadata.size === 0 || metadata.size > MAX_AUDIO_BYTES) {
      await unlink(path);
      return undefined;
    }
    return {
      audio: await readFile(path),
      fresh: Date.now() - metadata.mtimeMs <= CACHE_TTL_MS,
    };
  } catch {
    return undefined;
  }
}

type CachedFile = { path: string; size: number; modifiedAt: number };

async function pruneCache(incomingBytes: number): Promise<void> {
  const files: CachedFile[] = [];
  const now = Date.now();
  const entries = await readdir(CACHE_DIR, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.mp3')) continue;
    const path = join(CACHE_DIR, entry.name);
    try {
      const metadata = await stat(path);
      if (now - metadata.mtimeMs > CACHE_TTL_MS || metadata.size > MAX_AUDIO_BYTES) {
        await unlink(path);
      } else {
        files.push({ path, size: metadata.size, modifiedAt: metadata.mtimeMs });
      }
    } catch {
      // A concurrent cache cleanup can remove a file between readdir and stat.
    }
  }

  files.sort((a, b) => a.modifiedAt - b.modifiedAt);
  let totalBytes = files.reduce((total, file) => total + file.size, 0);
  while (files.length >= MAX_CACHE_ENTRIES || totalBytes + incomingBytes > MAX_CACHE_BYTES) {
    const oldest = files.shift();
    if (!oldest) break;
    try {
      await unlink(oldest.path);
      totalBytes -= oldest.size;
    } catch {
      // The write itself remains useful even if best-effort eviction races.
    }
  }
}

function scheduleCacheWrite(key: string, audio: Buffer): void {
  if (audio.length > MAX_AUDIO_BYTES || audio.length > MAX_CACHE_BYTES) return;
  if (queuedCacheWriteBytes + audio.length > MAX_CACHE_WRITE_QUEUE_BYTES) {
    logger.warn({ bytes: audio.length }, 'TTS cache write queue is full; skipping non-fatal cache write');
    return;
  }

  queuedCacheWriteBytes += audio.length;
  const write = cacheWriteQueue.then(async () => {
    await mkdir(CACHE_DIR, { recursive: true });
    await pruneCache(audio.length);
    const destination = join(CACHE_DIR, `${key}.mp3`);
    const temporary = join(CACHE_DIR, `.${key}.${randomUUID()}.tmp`);
    try {
      await writeFile(temporary, audio);
      await rename(temporary, destination);
    } finally {
      // rename removes the temp file on success; ignore cleanup races/failures.
      await unlink(temporary).catch(() => undefined);
    }
  });
  // Serialize cache mutation so simultaneous operator requests cannot bypass
  // the entry/byte budget by racing their eviction passes. Do not await this
  // best-effort optimization on the HTTP response path.
  cacheWriteQueue = write
    .catch((err) => {
      logger.warn({ err }, 'TTS cache write failed (non-fatal)');
    })
    .finally(() => {
      queuedCacheWriteBytes = Math.max(0, queuedCacheWriteBytes - audio.length);
    });
}

export interface SynthesisResult {
  audio: Buffer;
  cached: boolean;
  chars: number;
}

/**
 * Synthesize `text` to an MP3 Buffer via CosyVoice. Returns cached audio when
 * the same text+voice was synthesized before (0 quota). Never throws for empty
 * results — rejects with a descriptive Error the route maps to HTTP 502.
 */
export async function synthesizeSpeech(text: string, voice: string = DEFAULT_VOICE): Promise<SynthesisResult> {
  const clean = text.trim().slice(0, MAX_CHARS);
  if (!clean) throw new Error('Empty text for synthesis.');
  if (!env.DASHSCOPE_API_KEY) throw new Error('TTS is not configured on this server.');

  const key = cacheKey(clean, voice);
  const hit = await readCache(key);
  if (hit?.fresh) {
    logger.info({ chars: clean.length, voice }, 'TTS cache hit (0 quota)');
    return { audio: hit.audio, cached: true, chars: clean.length };
  }

  let synthesis = inFlightSyntheses.get(key);
  if (!synthesis) {
    synthesis = synthesizeUpstream(clean, voice);
    inFlightSyntheses.set(key, synthesis);
    void synthesis.finally(() => inFlightSyntheses.delete(key)).catch(() => undefined);
  }
  try {
    const audio = await synthesis;
    scheduleCacheWrite(key, audio);
    return { audio, cached: false, chars: clean.length };
  } catch (err) {
    if (hit) {
      logger.warn({ err, chars: clean.length, voice }, 'TTS upstream failed; serving stale cache');
      return { audio: hit.audio, cached: true, chars: clean.length };
    }
    throw err;
  }
}

/** One CosyVoice WebSocket synthesis. Resolves to the full MP3 Buffer. */
function synthesizeUpstream(text: string, voice: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(TTS_URL, {
      headers: { Authorization: `Bearer ${env.DASHSCOPE_API_KEY}` },
    });
    const taskId = `tts-${createHash('sha1').update(text + voice).digest('hex').slice(0, 12)}`;
    const chunks: Buffer[] = [];
    let audioBytes = 0;
    let settled = false;

    const timer = setTimeout(() => finish(new Error('TTS synthesis timed out.')), SYNTH_TIMEOUT_MS);

    function finish(err?: Error): void {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) ws.close();
      if (err) return reject(err);
      const audio = Buffer.concat(chunks);
      if (audio.length === 0) return reject(new Error('TTS returned no audio.'));
      resolve(audio);
    }

    ws.on('open', () => {
      ws.send(JSON.stringify({
        header: { action: 'run-task', task_id: taskId, streaming: 'duplex' },
        payload: {
          task_group: 'audio', task: 'tts', function: 'SpeechSynthesizer', model: TTS_MODEL,
          parameters: { text_type: 'PlainText', voice, format: 'mp3', sample_rate: 22050 },
          input: {},
        },
      }));
    });

    ws.on('message', (data: Buffer, isBinary: boolean) => {
      if (isBinary) {
        audioBytes += data.byteLength;
        if (audioBytes > MAX_AUDIO_BYTES) {
          finish(new Error('TTS audio exceeded the configured size limit.'));
          return;
        }
        chunks.push(data);
        return;
      }
      let m: { header?: { event?: string; error_message?: string } };
      try { m = JSON.parse(data.toString()); } catch { return; }
      const ev = m.header?.event;
      if (ev === 'task-started') {
        ws.send(JSON.stringify({
          header: { action: 'continue-task', task_id: taskId, streaming: 'duplex' },
          payload: { input: { text } },
        }));
        ws.send(JSON.stringify({
          header: { action: 'finish-task', task_id: taskId, streaming: 'duplex' },
          payload: { input: {} },
        }));
      } else if (ev === 'task-finished') {
        finish();
      } else if (ev === 'task-failed') {
        logger.error({ header: m.header }, 'CosyVoice task failed');
        finish(new Error(m.header?.error_message ?? 'TTS task failed upstream.'));
      }
    });

    ws.on('error', (err) => finish(err instanceof Error ? err : new Error('TTS socket error')));
  });
}
