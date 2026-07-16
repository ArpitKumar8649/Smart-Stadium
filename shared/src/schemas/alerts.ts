import { z } from 'zod';
import { ALERT_KINDS, INCIDENT_SEVERITY } from '../constants.js';

export const AlertSchema = z.object({
  id: z.string(),
  kind: z.enum(ALERT_KINDS),
  severity: z.enum(INCIDENT_SEVERITY),
  title: z.string(),
  body: z.string(),
  action_label: z.string().optional(),
  action_href: z.string().optional(),
  emitted_at: z.string(),
  expires_at: z.string().optional(),
  affected_zone_id: z.string().optional(),
  /** Internal venue-graph node temporarily unavailable for a demo advisory. */
  affected_node_id: z.string().optional(),
  affected_gate_id: z.string().optional(),
});
export type Alert = z.infer<typeof AlertSchema>;

export const IncidentSchema = z.object({
  id: z.string(),
  venue_id: z.string(),
  kind: z.enum(ALERT_KINDS),
  severity: z.enum(INCIDENT_SEVERITY),
  title: z.string(),
  body: z.string(),
  affected_zone_id: z.string().optional(),
  /** Internal venue-graph node temporarily unavailable for a demo advisory. */
  affected_node_id: z.string().optional(),
  affected_gate_id: z.string().optional(),
  created_at: z.string(),
  created_by: z.string(),
});
export type Incident = z.infer<typeof IncidentSchema>;
