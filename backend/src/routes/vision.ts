import { Router } from 'express';
import { z } from 'zod';
import { getLlm } from '../services/llm/qwen.js';
import { logger } from '../middleware/logger.js';
import { LlmCapacityError, LlmRequestAbortedError } from '../services/llm/rate-limit.js';

export const visionRouter: Router = Router();

const SignReaderRequestSchema = z.object({
  // Keep the base64 payload below Express's 2 MB JSON limit and avoid sending
  // unexpectedly large photos to the vision model.
  image_b64: z.string().min(1).max(1_800_000),
  lang: z.string().default('en'),
});

/**
 * POST /api/vision/sign-reader
 *
 * Receives a base64 image (expected to be a wayfinding sign or menu).
 * Returns a translated, accessible description. Uses Qwen-VL.
 */
visionRouter.post('/vision/sign-reader', async (req, res) => {
  const parsed = SignReaderRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: { code: 'validation_error', message: 'Invalid image payload', details: parsed.error.flatten() },
    });
    return;
  }

  const { image_b64, lang } = parsed.data;
  const controller = new AbortController();
  res.on('close', () => {
    if (!res.writableFinished) controller.abort();
  });

  try {
    const llm = getLlm();
    const prompt = `You are Concourse, an accessibility assistant for MetLife Stadium.
The user has photographed a sign, menu, or facility in the stadium.
Read the text and describe what the image shows. Be concise and helpful.
Do not hallucinate directions. Describe ONLY what is visible.`;

    const description = await llm.describeImage(image_b64, prompt, lang, controller.signal);
    if (!controller.signal.aborted) res.json({ description });
  } catch (err) {
    if (controller.signal.aborted || err instanceof LlmRequestAbortedError) return;
    if (err instanceof LlmCapacityError) {
      res.status(503).json({
        error: { code: 'capacity_reached', message: 'Sign reading is busy. Please try again shortly.' },
      });
      return;
    }
    logger.error({ err }, 'Vision request failed');
    res.status(500).json({ error: { code: 'internal', message: 'Could not process the image right now.' } });
  }
});
