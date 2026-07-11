import { z } from 'zod';
import { ROUTING_MODES } from '../constants.js';

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
