import { z } from 'zod';
import { INCIDENT_SEVERITY } from '../constants.js';

/**
 * A structured, LLM-generated situational briefing for /admin.
 *
 * The Gemini agent produces one every ~5 minutes (or on demand) from
 * a bundle of tool results: crowd heatmap, incidents, aggregated fan
 * queries, upcoming match phase. See ADR 0009.
 *
 * The LLM writes the summary + recommendations in natural language.
 * The numeric fields (occupancy_pct, hotspots) come from tool
 * results, not from the LLM — deterministic tool-grounding applies
 * here too.
 */
export const BriefingConcernSchema = z.object({
  zone_id: z.string(),
  concern: z.string().min(1).max(240),
  severity: z.enum(INCIDENT_SEVERITY),
  eta_minutes: z.number().int().nonnegative().optional(),
});
export type BriefingConcern = z.infer<typeof BriefingConcernSchema>;

export const BriefingRecommendationSchema = z.object({
  action: z.string().min(1).max(240),
  affected_zone_id: z.string().optional(),
  suggested_alert_kind: z.string().optional(),
  reversible: z.boolean().default(true),
});
export type BriefingRecommendation = z.infer<typeof BriefingRecommendationSchema>;

export const BriefingSchema = z.object({
  id: z.string(),
  venue_id: z.string(),
  match_id: z.string().optional(),
  generated_at: z.string(),
  window_start: z.string(),
  window_end: z.string(),
  occupancy_pct: z.number().min(0).max(100),
  headline: z.string().min(1).max(160),
  summary: z.string().min(1).max(1200),
  concerns: z.array(BriefingConcernSchema),
  recommendations: z.array(BriefingRecommendationSchema),
  top_fan_questions: z.array(z.string()).default([]),
  model: z.string(),
  lang: z.string().default('en'),
});
export type Briefing = z.infer<typeof BriefingSchema>;

export const BriefingRequestSchema = z.object({
  venue_id: z.string(),
  match_id: z.string().optional(),
  lang: z.string().default('en'),
  force_refresh: z.boolean().default(false),
});
export type BriefingRequest = z.infer<typeof BriefingRequestSchema>;
