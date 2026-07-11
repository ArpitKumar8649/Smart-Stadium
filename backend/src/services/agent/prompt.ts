/**
 * Concierge prompt builder.
 *
 * Loads the production system prompt (authored in Markdown, kept out of the
 * TypeScript so it can be edited without a rebuild) once at first use, caches
 * it, and appends a small per-turn "Current context" block so the model knows
 * where the fan is, what language to mirror, today's match, and any
 * accessibility preferences. The static prompt owns the behavioural rules; this
 * block only injects live facts.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

/** Sampling temperature for the concierge — low, to keep grounding tight. */
export const CONCIERGE_TEMPERATURE = 0.3;

const PROMPT_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  // agent -> services -> src -> backend -> repo root
  '../../../../data/prompts/concierge.system.md',
);

let cachedSystemPrompt: string | undefined;

function loadSystemPrompt(): string {
  if (cachedSystemPrompt === undefined) {
    cachedSystemPrompt = readFileSync(PROMPT_PATH, 'utf8').trim();
  }
  return cachedSystemPrompt;
}

/** Per-turn context injected beneath the static system prompt. */
export interface PromptContext {
  /** BCP-47-ish language tag or name of the fan's latest message, e.g. "bn", "es". */
  lang?: string;
  /** Human label of the fan's current location, e.g. "Section 144". */
  locationLabel?: string;
  /** Today's match, e.g. "Final — July 19, 2026". */
  matchLabel?: string;
  /** Accessibility preferences already known, e.g. ["step_free", "wheelchair"]. */
  accessibility?: string[];
  /** Context from frontend */
  context?: Record<string, unknown>;
}

/**
 * Build the full system prompt: the cached Markdown followed by a compact
 * "Current context" block with whatever live facts are known. Absent fields are
 * omitted rather than rendered empty, so the model never sees "location: unknown".
 */
export function buildSystemPrompt(ctx: PromptContext): string {
  const base = loadSystemPrompt();

  const lines: string[] = [];
  if (ctx.locationLabel) lines.push(`- Current location: ${ctx.locationLabel}`);
  if (ctx.lang) lines.push(`- Reply in this language: ${ctx.lang}`);
  if (ctx.matchLabel) lines.push(`- Today's match: ${ctx.matchLabel}`);
  if (ctx.accessibility && ctx.accessibility.length > 0) {
    lines.push(`- Accessibility preferences: ${ctx.accessibility.join(', ')} (route step-free)`);
  }
  if (ctx.context?.location) {
    lines.push(`- GPS Location: ${JSON.stringify(ctx.context.location)}`);
  }

  if (lines.length === 0) return base;
  return `${base}\n\n## Current context\n${lines.join('\n')}`;
}
