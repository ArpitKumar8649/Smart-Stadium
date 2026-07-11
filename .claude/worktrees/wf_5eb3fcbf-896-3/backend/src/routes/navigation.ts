import { Router } from 'express';
import { z } from 'zod';
import { ROUTING_MODES } from '@concourse/shared';
import { findNodeByLabel, getGraph, searchNodes } from '../services/graph/loader.js';
import { route } from '../services/graph/astar.js';
import { getCrowdSimulator } from '../services/crowd/simulator.js';

export const navigationRouter: Router = Router();

const RouteLookupSchema = z.object({
  from_label: z.string().min(1).max(120),
  to_label: z.string().min(1).max(120),
  mode: z.enum(ROUTING_MODES).default('fastest'),
});

function routerGraph() {
  const graph = getGraph();
  return { nodes: graph.nodeById, edgesFrom: graph.adjacency };
}

/**
 * POST /api/navigation/route
 *
 * Human labels in, deterministic A* route and map-ready coordinates out. The
 * frontend never receives an invented point: each point comes from a real
 * Mappedin routing node in the imported MetLife graph.
 */
navigationRouter.post('/navigation/route', (req, res) => {
  const parsed = RouteLookupSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: { code: 'validation_error', message: 'Invalid route request', details: parsed.error.flatten() },
    });
    return;
  }

  const { from_label, to_label, mode } = parsed.data;
  const from = findNodeByLabel(from_label);
  const to = findNodeByLabel(to_label);

  if (!from || !to) {
    const missing = !from ? from_label : to_label;
    res.status(404).json({
      error: {
        code: 'place_not_found',
        message: `Could not find "${missing}" in MetLife Stadium.`,
        candidates: searchNodes(missing, 5).map((node) => ({ label: node.label, level: node.level })),
      },
    });
    return;
  }

  const crowd = getCrowdSimulator();
  const result = route(routerGraph(), from.id, to.id, mode, (nodeId) =>
    crowd.crowdPenaltyForNode(nodeId),
  );

  if (!result) {
    res.status(404).json({
      error: { code: 'route_not_found', message: `No ${mode} route exists between those places.` },
    });
    return;
  }

  const graph = getGraph();
  const points = result.path.flatMap((id, order) => {
    const node = graph.nodeById.get(id);
    if (!node) return [];
    return [{ id: node.id, label: node.label, level: node.level, coords: node.coords, order }];
  });

  res.json({
    from: { label: from.label, level: from.level },
    to: { label: to.label, level: to.level },
    ...result,
    points,
  });
});

/** Lightweight autocomplete endpoint for map route controls. */
navigationRouter.get('/navigation/search', (req, res) => {
  const query = typeof req.query.q === 'string' ? req.query.q : '';
  if (query.trim().length < 2) {
    res.json({ candidates: [] });
    return;
  }
  res.json({
    candidates: searchNodes(query, 8).map((node) => ({
      label: node.label,
      type: node.type,
      level: node.level,
    })),
  });
});
