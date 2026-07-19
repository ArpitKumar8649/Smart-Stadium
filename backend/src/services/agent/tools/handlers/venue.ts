import { z } from 'zod';
import { getGraph } from '../../../graph/loader.js';
import { fail, ok, zodMessage, LEVEL_NAMES } from '../formatters.js';
import type { ToolResult } from '../index.js';

const GetVenueInfoArgs = z.object({
  topic: z.enum(['floors', 'gates', 'levels', 'overview']).default('overview'),
});

export function handleGetVenueInfo(raw: unknown): ToolResult {
  const parsed = GetVenueInfoArgs.safeParse(raw);
  if (!parsed.success) return fail(`Invalid get_venue_info arguments: ${zodMessage(parsed.error)}`);
  const { topic } = parsed.data;
  const graph = getGraph();

  const levels = [...graph.byLevel.keys()].sort((a, b) => a - b);
  const floors = levels.map((lvl) => ({
    level: lvl,
    name: LEVEL_NAMES[lvl] ?? `Level ${lvl}`,
    node_count: graph.byLevel.get(lvl)?.length ?? 0,
  }));

  const gates = (graph.byType.get('entry_gate') ?? [])
    .map((n) => n.label)
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  // What kinds of facility live on each level — a lightweight "what's up there" map.
  const perLevel = levels.map((lvl) => {
    const nodes = graph.byLevel.get(lvl) ?? [];
    const types = new Map<string, number>();
    for (const n of nodes) types.set(n.type, (types.get(n.type) ?? 0) + 1);
    return {
      level: lvl,
      name: LEVEL_NAMES[lvl] ?? `Level ${lvl}`,
      facilities: Object.fromEntries([...types.entries()].sort((a, b) => b[1] - a[1])),
    };
  });

  const data: Record<string, unknown> = {};
  if (topic === 'overview' || topic === 'floors' || topic === 'levels') data.floors = floors;
  if (topic === 'overview' || topic === 'gates') data.gates = gates;
  if (topic === 'overview' || topic === 'levels') data.levels = perLevel;

  const summary =
    topic === 'gates'
      ? `${gates.length} entry gates`
      : `Venue info: ${floors.length} levels, ${gates.length} gates`;
  return ok(data, summary);
}