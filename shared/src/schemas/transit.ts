import { z } from 'zod';
import { SUPPORTED_LOCALES } from '../constants.js';

/**
 * Transit Agent contract — a peer agent to the concierge that answers
 * "how do I get to MetLife?" across every ground-travel mode, ranked on time
 * and CO₂ footprint together. Sustainability numbers are honestly labelled
 * as estimates (source is either an external carbon-aware API or a bundled
 * emissions-factor table — the `source` field on each option tells you which).
 */

export const TRANSIT_MODES = ['DRIVE', 'TWO_WHEELER', 'TRANSIT', 'BICYCLE', 'WALK'] as const;
export const TransitModeSchema = z.enum(TRANSIT_MODES);
export type TransitMode = z.infer<typeof TransitModeSchema>;

export const TransitOriginSchema = z.object({
  lat: z.number().finite().min(-90).max(90),
  lng: z.number().finite().min(-180).max(180),
  /** Optional human label the user can see, e.g. "Times Square". */
  label: z.string().min(1).max(160).optional(),
}).strict();
export type TransitOrigin = z.infer<typeof TransitOriginSchema>;

/**
 * Priority the fan asked for. `time` = fastest, `carbon` = lowest CO₂,
 * `balanced` = Pareto-aware compromise (default — good matchday behaviour).
 */
export const TransitPrioritySchema = z.enum(['time', 'carbon', 'balanced']);
export type TransitPriority = z.infer<typeof TransitPrioritySchema>;

export const TransitRequestSchema = z.object({
  origin: TransitOriginSchema,
  priority: TransitPrioritySchema.optional().default('balanced'),
  lang: z.enum(SUPPORTED_LOCALES).optional(),
  /** Optional narrative summary opt-in — when true, the agent streams a
   *  short spoken-language recommendation via SSE. Off by default so the
   *  route can be reused as a pure data endpoint. */
  narrate: z.boolean().optional().default(false),
}).strict();
export type TransitRequest = z.infer<typeof TransitRequestSchema>;

export const CarbonEstimateSourceSchema = z.enum([
  /** Bundled emissions-factor table (deterministic, no network call). */
  'emissions_factor_table',
  /** Live carbon-aware API — grid-adjusted intensity for electric modes. */
  'carbon_aware_api',
]);
export type CarbonEstimateSource = z.infer<typeof CarbonEstimateSourceSchema>;

export const TransitOptionSchema = z.object({
  mode: TransitModeSchema,
  /** Short display label, e.g. "Public transit". */
  label: z.string(),
  distance_meters: z.number().nonnegative(),
  duration_seconds: z.number().nonnegative(),
  /** Google Routes encoded polyline (may be empty for modes that don't return one). */
  polyline: z.string(),
  /** Estimated CO₂ for this trip in grams. Rounded, honestly labelled. */
  co2_grams: z.number().nonnegative(),
  /** g CO₂ per passenger-km used to produce the estimate. */
  emission_factor_g_per_km: z.number().nonnegative(),
  /** Where the emission factor came from — surfaced in the UI for honesty. */
  carbon_source: CarbonEstimateSourceSchema,
}).strict();
export type TransitOption = z.infer<typeof TransitOptionSchema>;

export const TransitRecommendationSchema = z.object({
  /** Which option is fastest end-to-end. */
  fastest_mode: TransitModeSchema,
  /** Which option has the lowest CO₂ footprint. */
  greenest_mode: TransitModeSchema,
  /** Pareto-aware pick given the fan's priority. */
  recommended_mode: TransitModeSchema,
  /** Human-readable one-line reason for the recommendation. */
  reason: z.string(),
  /** CO₂ saved vs. driving (grams), for the recommended option. */
  co2_saved_vs_drive_grams: z.number(),
  /** Time cost vs. fastest option (seconds); 0 when recommended == fastest. */
  time_cost_vs_fastest_seconds: z.number().nonnegative(),
}).strict();
export type TransitRecommendation = z.infer<typeof TransitRecommendationSchema>;

export const TransitResponseSchema = z.object({
  kind: z.literal('transit_plan'),
  destination: z.object({
    label: z.string(),
    lat: z.number(),
    lng: z.number(),
  }),
  origin: TransitOriginSchema,
  priority: TransitPrioritySchema,
  options: z.array(TransitOptionSchema),
  recommendation: TransitRecommendationSchema,
  /** Encoded polyline for the recommended option (so the map can draw one line). */
  primary_polyline: z.string(),
  /** Timestamp the plan was computed. */
  computed_at: z.string(),
  /** Free-form advisories, e.g. "TRANSIT unavailable from this origin". */
  warnings: z.array(z.string()).default([]),
}).strict();
export type TransitResponse = z.infer<typeof TransitResponseSchema>;
