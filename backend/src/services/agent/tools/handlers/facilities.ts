import { z } from 'zod';
import type { NodeType } from '@concourse/shared';
import { getGraph } from '../../../graph/loader.js';

import { fail, ok, zodMessage, facilityView, FACILITY_TYPES, LEVEL_NAMES } from '../formatters.js';
import type { ToolResult } from '../index.js';

const ListFacilitiesArgs = z.object({
  facility_type: z.enum(FACILITY_TYPES),
  level: z.number().int().min(0).max(7).optional(),
});

export function handleListFacilities(raw: unknown): ToolResult {
  const parsed = ListFacilitiesArgs.safeParse(raw);
  if (!parsed.success) return fail(`Invalid list_facilities arguments: ${zodMessage(parsed.error)}`);
  const { facility_type, level } = parsed.data;
  const graph = getGraph();

  let nodes = [...(graph.byType.get(facility_type as NodeType) ?? [])];
  if (level !== undefined) nodes = nodes.filter((n) => n.level === level);

  // Named facilities first; sort by level then label for a stable, readable list.
  nodes.sort((a, b) => a.level - b.level || a.label.localeCompare(b.label, undefined, { numeric: true }));

  const CAP = 40;
  const items = nodes.slice(0, CAP).map(facilityView);
  const label = facility_type.replaceAll('_', ' ');
  const scope = level !== undefined ? ` on ${LEVEL_NAMES[level] ?? 'level ' + level}` : '';
  const data = {
    facility_type,
    level: level ?? null,
    count: nodes.length,
    truncated: nodes.length > CAP,
    items,
  };
  let summary: string;
  if (nodes.length === 0) {
    summary = `No ${label} found${scope}`;
  } else {
    const plural = nodes.length === 1 ? '' : 's';
    summary = `${nodes.length} ${label}${plural}${scope}`;
  }
  return ok(data, summary);
}