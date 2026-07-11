import { z } from 'zod';
import { NODE_TYPES } from '../constants.js';

export const CoordSchema = z.tuple([z.number(), z.number()]);
export type Coord = z.infer<typeof CoordSchema>;

export const NodeSchema = z.object({
  id: z.string().min(1),
  type: z.enum(NODE_TYPES),
  label: z.string(),
  level: z.number().int(),
  coords: CoordSchema,
  zone: z.string().optional(),
  team_side: z.enum(['home', 'away', 'neutral']).optional(),
  cuisine: z.string().optional(),
  halal: z.boolean().optional(),
  vegetarian: z.boolean().optional(),
  accessibility: z
    .array(z.enum(['step_free', 'wheelchair', 'sensory_safe', 'family', 'companion_seat']))
    .default([]),
  notes: z.string().optional(),
});
export type Node = z.infer<typeof NodeSchema>;

export const EdgeSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  distance_m: z.number().nonnegative(),
  avg_walk_seconds: z.number().nonnegative(),
  indoor: z.boolean(),
  step_free: z.boolean(),
  wheelchair_accessible: z.boolean(),
  capacity_class: z.enum(['narrow', 'normal', 'wide']),
  bidirectional: z.boolean().default(true),
  notes: z.string().optional(),
});
export type Edge = z.infer<typeof EdgeSchema>;

export const VenueGraphSchema = z.object({
  venue_id: z.string(),
  version: z.string(),
  generated_at: z.string(),
  nodes: z.array(NodeSchema),
  edges: z.array(EdgeSchema),
});
export type VenueGraph = z.infer<typeof VenueGraphSchema>;
