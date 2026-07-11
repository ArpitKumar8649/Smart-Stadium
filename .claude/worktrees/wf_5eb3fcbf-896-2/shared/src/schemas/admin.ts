import { z } from 'zod';
import { ALERT_KINDS, INCIDENT_SEVERITY } from '../constants.js';

export const AdminIncidentRequestSchema = z.object({
  venue_id: z.string(),
  kind: z.enum(ALERT_KINDS),
  severity: z.enum(INCIDENT_SEVERITY),
  title: z.string().min(1).max(120),
  body: z.string().min(1).max(1000),
  affected_zone_id: z.string().optional(),
  affected_gate_id: z.string().optional(),
  expires_in_minutes: z.number().int().positive().max(600).optional(),
});
export type AdminIncidentRequest = z.infer<typeof AdminIncidentRequestSchema>;

export const AdminCrowdOverrideRequestSchema = z.object({
  venue_id: z.string(),
  zone_id: z.string(),
  density: z.number().min(0).max(1),
  wait_seconds: z.number().nonnegative(),
  ttl_seconds: z.number().int().positive().max(3600).default(300),
});
export type AdminCrowdOverrideRequest = z.infer<typeof AdminCrowdOverrideRequestSchema>;
