/**
 * Audio routes — generative multilingual PA (Tier 1).
 *
 * POST /api/audio/tts
 *   { text: string, lang?: string, source_lang?: string, voice?: string }
 *   → audio/mpeg (MP3)
 *
 * If `lang` differs from `source_lang` (default "en"), the text is first
 * translated with the existing Qwen chat model, then spoken by CosyVoice. This
 * is the "one English announcement, heard by everyone in their own language"
 * feature — generative translation + generative speech, on the same key.
 */

import { Router } from 'express';
import { z } from 'zod';
import { getLlm } from '../services/llm/qwen.js';
import { synthesizeSpeech, DEFAULT_VOICE } from '../services/audio/tts.js';
import { logger } from '../middleware/logger.js';
import { requireAdmin } from '../middleware/admin-auth.js';
import { LlmCapacityError } from '../services/llm/rate-limit.js';

export const audioRouter: Router = Router();

// PA generation consumes paid AI quota and is an operator action, not a
// public fan endpoint. The frontend supplies this credential only from the
// authenticated admin page's in-memory state.
audioRouter.use('/audio/tts', requireAdmin);

const TtsRequestSchema = z.object({
  text: z.string().min(1).max(600),
  lang: z.string().min(2).max(12).default('en'),
  source_lang: z.string().min(2).max(12).default('en'),
  voice: z.string().min(1).max(40).optional(),
});

const LANG_NAMES: Record<string, string> = {
  en: 'English', es: 'Spanish', pt: 'Portuguese', fr: 'French', de: 'German',
  ar: 'Arabic', hi: 'Hindi', bn: 'Bengali', ta: 'Tamil', ja: 'Japanese',
  ko: 'Korean', zh: 'Chinese', 'zh-Hans': 'Simplified Chinese', ru: 'Russian',
  it: 'Italian',
};

function langName(code: string): string {
  return LANG_NAMES[code] ?? LANG_NAMES[code.split('-')[0] ?? code] ?? code;
}

/** Translate a short announcement with the chat model. Returns text only. */
async function translate(text: string, from: string, to: string): Promise<string> {
  const { message } = await getLlm().chat({
    messages: [
      {
        role: 'system',
        content:
          `You are a translator for stadium public-address announcements. Translate the user's ` +
          `message from ${langName(from)} to ${langName(to)}. Output ONLY the translation — no ` +
          `notes, no quotes, no romanization. Keep venue names (gates, sections) and numbers intact.`,
      },
      { role: 'user', content: text },
    ],
    temperature: 0.2,
    maxTokens: 400,
  });
  return (message.content ?? '').trim() || text;
}

audioRouter.post('/audio/tts', async (req, res) => {
  const parsed = TtsRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: { code: 'validation_error', message: 'Invalid TTS request', details: parsed.error.flatten() },
    });
    return;
  }

  const { text, lang, source_lang, voice } = parsed.data;

  try {
    let spoken = text;
    if (lang !== source_lang) {
      spoken = await translate(text, source_lang, lang);
    }

    const { audio, cached, chars } = await synthesizeSpeech(spoken, voice ?? DEFAULT_VOICE);
    logger.info({ lang, source_lang, chars, cached, bytes: audio.length }, 'TTS synthesized');

    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Length', String(audio.length));
    // Expose useful metadata without a second request (the UI reads these).
    res.setHeader('X-TTS-Cached', cached ? '1' : '0');
    res.setHeader('X-TTS-Lang', lang);
    res.setHeader('X-TTS-Text', encodeURIComponent(spoken));
    res.status(200).send(audio);
  } catch (err) {
    if (err instanceof LlmCapacityError) {
      res.status(503).json({
        error: { code: 'capacity_reached', message: 'Speech translation is busy. Please try again shortly.' },
      });
      return;
    }
    logger.error({ err }, 'TTS request failed');
    res.status(502).json({
      error: { code: 'tts_error', message: 'Speech service is temporarily unavailable. Please try again.' },
    });
  }
});
