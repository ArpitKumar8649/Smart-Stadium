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
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
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

const CACHE_DIR = join(tmpdir(), 'concourse-tts-cache');

function cacheKey(text: string, voice: string): string {
  return createHash('sha256').update(`${TTS_MODEL}::${voice}::${text}`).digest('hex').slice(0, 32);
}

async function readCache(key: string): Promise<Buffer | undefined> {
  try {
    return await readFile(join(CACHE_DIR, `${key}.mp3`));
  } catch {
    return undefined;
  }
}

async function writeCache(key: string, audio: Buffer): Promise<void> {
  try {
    await mkdir(CACHE_DIR, { recursive: true });
    await writeFile(join(CACHE_DIR, `${key}.mp3`), audio);
  } catch (err) {
    logger.warn({ err }, 'TTS cache write failed (non-fatal)');
  }
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
  if (hit) {
    logger.info({ chars: clean.length, voice }, 'TTS cache hit (0 quota)');
    return { audio: hit, cached: true, chars: clean.length };
  }

  const audio = await synthesizeUpstream(clean, voice);
  await writeCache(key, audio);
  return { audio, cached: false, chars: clean.length };
}

/** One CosyVoice WebSocket synthesis. Resolves to the full MP3 Buffer. */
function synthesizeUpstream(text: string, voice: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(TTS_URL, {
      headers: { Authorization: `Bearer ${env.DASHSCOPE_API_KEY}` },
    });
    const taskId = `tts-${createHash('sha1').update(text + voice).digest('hex').slice(0, 12)}`;
    const chunks: Buffer[] = [];
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
      if (isBinary) { chunks.push(data); return; }
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
