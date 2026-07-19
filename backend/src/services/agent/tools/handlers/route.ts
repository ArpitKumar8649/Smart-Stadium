import { z } from 'zod';
import { ROUTING_MODES } from '@concourse/shared';
import { getGraph, findNodeByLabel } from '../../../graph/loader.js';
import { route } from '../../../graph/astar.js';
import { getCrowdSimulator } from '../../../crowd/simulator.js';
import { fail, ok, zodMessage, candidateLabels, humanDuration, compactRoute, routerGraph } from '../formatters.js';
import type { ToolResult } from '../index.js';

const FindRouteArgs = z.object({
  from_label: z.string().min(1),
  to_label: z.string().min(1),
  mode: z.enum(ROUTING_MODES).default('fastest'),
});

export function handleFindRoute(raw: unknown): ToolResult {
  const parsed = FindRouteArgs.safeParse(raw);
  if (!parsed.success) return fail(`Invalid find_route arguments: ${zodMessage(parsed.error)}`);
  const { from_label, to_label, mode } = parsed.data;

  const from = findNodeByLabel(from_label);
  if (!from) {
    const hints = candidateLabels(from_label);
    return fail(
      `Could not find a place matching "${from_label}".` +
        (hints.length ? ` Did you mean: ${hints.join(', ')}?` : ''),
      `Unknown start: "${from_label}"`,
    );
  }
  const to = findNodeByLabel(to_label);
  if (!to) {
    const hints = candidateLabels(to_label);
    return fail(
      `Could not find a place matching "${to_label}".` +
        (hints.length ? ` Did you mean: ${hints.join(', ')}?` : ''),
      `Unknown destination: "${to_label}"`,
    );
  }

  const sim = getCrowdSimulator();
  const result = route(routerGraph(getGraph()), from.id, to.id, mode, (id) =>
    sim.crowdPenaltyForNode(id),
  );
  if (!result) {
    return fail(
      `No ${mode} route exists between "${from.label}" and "${to.label}".`,
      `No route ${from.label} → ${to.label}`,
    );
  }

  const summary = `Routed ${from.label} → ${to.label}, ${humanDuration(result.total_seconds)}`;
  return ok(compactRoute(from.label, to.label, result), summary);
}