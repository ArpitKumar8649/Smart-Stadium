import { z } from 'zod';

export const CrowdLevelSchema = z.object({
  venue_id: z.string(),
  zone_id: z.string(),
  density: z.number().min(0).max(1),
  wait_seconds: z.number().nonnegative(),
  updated_at: z.string(),
  source: z.enum(['sim', 'injected', 'sensor']),
});
export type CrowdLevel = z.infer<typeof CrowdLevelSchema>;

export const CrowdHeatmapSchema = z.object({
  venue_id: z.string(),
  zones: z.array(CrowdLevelSchema),
  generated_at: z.string(),
});
export type CrowdHeatmap = z.infer<typeof CrowdHeatmapSchema>;
