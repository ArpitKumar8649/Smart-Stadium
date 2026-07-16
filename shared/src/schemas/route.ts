import { z } from 'zod';
import { ROUTING_MODES } from '../constants.js';

/** Public navigation API input: human-readable venue labels, not graph ids. */
export const NavigationRouteRequestSchema = z.object({
  from_label: z.string().trim().min(1).max(120),
  to_label: z.string().trim().min(1).max(120),
  mode: z.enum(ROUTING_MODES).default('fastest'),
});
export type NavigationRouteRequest = z.infer<typeof NavigationRouteRequestSchema>;

/** Legacy graph-node routing contract retained for shared-package consumers.
 * The deployed /api/navigation/route endpoint intentionally uses the explicit
 * NavigationRouteRequestSchema above instead. */
export const RouteRequestSchema = z.object({
  from_node_id: z.string().min(1),
  to_node_id: z.string().min(1),
  mode: z.enum(ROUTING_MODES).default('fastest'),
  avoid_crowded: z.boolean().default(false),
});
export type RouteRequest = z.infer<typeof RouteRequestSchema>;

export const RouteStepSchema = z.object({
  from_node_id: z.string(),
  to_node_id: z.string(),
  distance_m: z.number().nonnegative(),
  seconds: z.number().nonnegative(),
  instruction: z.string(),
});
export type RouteStep = z.infer<typeof RouteStepSchema>;

export const RouteResponseSchema = z.object({
  mode: z.enum(ROUTING_MODES),
  total_distance_m: z.number().nonnegative(),
  total_seconds: z.number().nonnegative(),
  step_free: z.boolean(),
  wheelchair_accessible: z.boolean(),
  crowd_penalty: z.number().nonnegative(),
  steps: z.array(RouteStepSchema),
  path: z.array(z.string()),
  warnings: z.array(z.string()).default([]),
});
export type RouteResponse = z.infer<typeof RouteResponseSchema>;

export const NavigationRoutePointSchema = z.object({
  id: z.string(),
  label: z.string(),
  level: z.number().int(),
  /** Venue-graph zone used to determine whether an operational advisory
   * intersects a displayed route. Older graph nodes may not carry one. */
  zone: z.string().optional(),
  coords: z.tuple([z.number().finite(), z.number().finite()]),
  order: z.number().int().nonnegative(),
});
export type NavigationRoutePoint = z.infer<typeof NavigationRoutePointSchema>;

/** Response produced by POST /api/navigation/route, ready for the tactical map. */
export const NavigationRouteResponseSchema = RouteResponseSchema.extend({
  from: z.object({ label: z.string(), level: z.number().int() }),
  to: z.object({ label: z.string(), level: z.number().int() }),
  points: z.array(NavigationRoutePointSchema),
});
export type NavigationRouteResponse = z.infer<typeof NavigationRouteResponseSchema>;
