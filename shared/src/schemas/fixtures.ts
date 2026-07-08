import { z } from 'zod';

export const TeamSchema = z.object({
  code: z.string().length(3),
  name: z.string(),
  short_name: z.string(),
  flag: z.string(),
  jersey_primary_hex: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/),
});
export type Team = z.infer<typeof TeamSchema>;

export const MatchStageSchema = z.enum(['group', 'r32', 'r16', 'qf', 'sf', 'third', 'final']);
export type MatchStage = z.infer<typeof MatchStageSchema>;

export const FixtureSchema = z.object({
  match_id: z.string(),
  venue_id: z.string(),
  date: z.string(),
  kickoff_local: z.string(),
  kickoff_iso: z.string(),
  timezone: z.string(),
  stage: MatchStageSchema,
  home: z.string().nullable(),
  away: z.string().nullable(),
  notes: z.string().optional(),
});
export type Fixture = z.infer<typeof FixtureSchema>;
