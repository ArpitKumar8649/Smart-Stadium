import { z } from 'zod';
import { SUPPORTED_LOCALES } from '../constants.js';

export const AccessibilityPrefsSchema = z.object({
  step_free: z.boolean().default(false),
  sensory_safe: z.boolean().default(false),
  large_text: z.boolean().default(false),
  reduce_motion: z.boolean().default(false),
  screen_reader: z.boolean().default(false),
});
export type AccessibilityPrefs = z.infer<typeof AccessibilityPrefsSchema>;

export const SessionSchema = z.object({
  id: z.string(),
  lang: z.enum(SUPPORTED_LOCALES).default('en'),
  team_code: z.string().length(3).optional(),
  section_node_id: z.string().optional(),
  match_id: z.string().optional(),
  accessibility: AccessibilityPrefsSchema.default({}),
  created_at: z.string(),
  updated_at: z.string(),
});
export type Session = z.infer<typeof SessionSchema>;

export const SessionCreateSchema = SessionSchema.pick({
  lang: true,
  team_code: true,
  section_node_id: true,
  match_id: true,
  accessibility: true,
}).partial();
export type SessionCreate = z.infer<typeof SessionCreateSchema>;

export const SessionPatchSchema = SessionCreateSchema;
export type SessionPatch = z.infer<typeof SessionPatchSchema>;
