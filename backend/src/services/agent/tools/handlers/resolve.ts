import { z } from 'zod';
import { searchNodes } from '../../../graph/loader.js';
import { fail, ok, zodMessage, LEVEL_NAMES } from '../formatters.js';
import type { ToolResult } from '../index.js';

const ResolvePlaceArgs = z.object({
  query: z.string().min(1),
});

export function handleResolvePlace(raw: unknown): ToolResult {
  const parsed = ResolvePlaceArgs.safeParse(raw);
  if (!parsed.success) return fail(`Invalid resolve_place arguments: ${zodMessage(parsed.error)}`);
  const { query } = parsed.data;

  const matches = searchNodes(query, 8);
  const candidates = matches.map((n) => ({
    label: n.label,
    type: n.type,
    level: n.level,
    level_name: LEVEL_NAMES[n.level] ?? `Level ${n.level}`,
  }));
  const data = { query, candidates };
  let summary: string;
  if (candidates.length === 0) {
    summary = `No matches for "${query}"`;
  } else {
    const plural = candidates.length === 1 ? '' : 'es';
    summary = `${candidates.length} match${plural} for "${query}"`;
  }
  return ok(data, summary);
}