import { z } from 'zod';
import { type Node, type NodeType, type RouteResponse } from '@concourse/shared';
import { getGraph, findNodeByLabel, nearestNodesByType } from '../../../graph/loader.js';
import { route } from '../../../graph/astar.js';
import { getCrowdSimulator } from '../../../crowd/simulator.js';

import { fail, ok, zodMessage, candidateLabels, humanDuration, compactRoute, routerGraph, facilityView, FACILITY_TYPES } from '../formatters.js';
import type { ToolResult } from '../index.js';

const FindNearestArgs = z.object({
  from_label: z.string().min(1),
  facility_type: z.enum(FACILITY_TYPES),
  step_free: z.boolean().default(false),
  dietary: z.enum(['halal', 'vegetarian']).optional(),
});


function findReachableCandidate(candidates: Node[], fromId: string, mode: 'step_free' | 'fastest'): { chosen: Node | undefined; result: RouteResponse | null } {
  const graph = routerGraph(getGraph());
  const sim = getCrowdSimulator();
  let chosen: Node | undefined;
  let result: RouteResponse | null = null;
  for (const candidate of candidates) {
    const r = route(graph, fromId, candidate.id, mode, (id) => sim.crowdPenaltyForNode(id));
    if (r) {
      chosen = candidate;
      result = r;
      break;
    }
  }
  return { chosen, result };
}

export function handleFindNearest(raw: unknown): ToolResult {
  
  const parsed = FindNearestArgs.safeParse(raw);
  if (!parsed.success) return fail(`Invalid find_nearest arguments: ${zodMessage(parsed.error)}`);
  const { from_label, facility_type, step_free, dietary } = parsed.data;

  const from = findNodeByLabel(from_label);
  if (!from) {
    const hints = candidateLabels(from_label);
    return fail(
      `Could not find your location "${from_label}".` +
        (hints.length ? ` Did you mean: ${hints.join(', ')}?` : ''),
      `Unknown location: "${from_label}"`,
    );
  }

  // Dietary filter only applies to food outlets.
  const dietaryActive = dietary && facility_type === 'concession';
  const candidates = nearestNodesByType(from.id, facility_type as NodeType, {
    limit: 5,
    requireStepFree: step_free,
    ...(dietaryActive ? { dietary } : {}),
  });
  if (candidates.length === 0) {
    const dietaryNote = dietaryActive ? ` tagged ${dietary}` : '';
    return fail(
      `No ${facility_type.replaceAll('_', ' ')}${dietaryNote} found near "${from.label}"` +
        (step_free ? ' with step-free access.' : '.'),
      `No ${dietaryActive ? dietary + ' ' : ''}${facility_type} near ${from.label}`,
    );
  }


  // Straight-line ranking is a prefilter; confirm with a real route and, if the
  // nearest is unreachable in the requested mode, fall through to the next.
  const mode = step_free ? 'step_free' : 'fastest';
  const { chosen, result } = findReachableCandidate(candidates, from.id, mode);


  if (!chosen || !result) {
    return fail(
      `Found ${facility_type.replaceAll('_', ' ')} nearby but could not compute a route from "${from.label}".`,
      `No route to ${facility_type} from ${from.label}`,
    );
  }

  const data = {
    facility: facilityView(chosen),
    route: compactRoute(from.label, chosen.label, result),
    also_nearby: candidates
      .filter((c) => c.id !== chosen.id)
      .slice(0, 3)
      .map((c) => c.label),
  };
  const summary = `Nearest ${dietaryActive ? dietary + ' ' : ''}${facility_type.replaceAll('_', ' ')}: ${chosen.label}, ${humanDuration(result.total_seconds)}`;
  return ok(data, summary);
  
}