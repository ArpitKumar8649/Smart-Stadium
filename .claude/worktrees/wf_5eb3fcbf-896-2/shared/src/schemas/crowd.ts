import { z } from 'zod';

/**
 * A single density prediction for a zone at a future offset.
 * Confidence is the simulator's own reported certainty (0..1),
 * NOT a claim of ML accuracy — see ADR 0008.
 */
export const CrowdPredictionSchema = z.object({
  offset_minutes: z.number().int().positive(),
  density: z.number().min(0).max(1),
  wait_seconds: z.number().nonnegative(),
  confidence: z.number().min(0).max(1),
});
export type CrowdPrediction = z.infer<typeof CrowdPredictionSchema>;

export const CrowdLevelSchema = z.object({
  venue_id: z.string(),
  zone_id: z.string(),
  density: z.number().min(0).max(1),
  wait_seconds: z.number().nonnegative(),
  updated_at: z.string(),
  source: z.enum(['sim', 'injected', 'sensor']),
  /**
   * Forward-look at T+15 and T+30 min, derived from the phase-curve
   * simulator (deterministic + stochastic). Missing when unknowable
   * (e.g. admin override with no TTL). See ADR 0008.
   */
  predictions: z.array(CrowdPredictionSchema).optional(),
});
export type CrowdLevel = z.infer<typeof CrowdLevelSchema>;

export const CrowdHeatmapSchema = z.object({
  venue_id: z.string(),
  zones: z.array(CrowdLevelSchema),
  generated_at: z.string(),
});
export type CrowdHeatmap = z.infer<typeof CrowdHeatmapSchema>;
