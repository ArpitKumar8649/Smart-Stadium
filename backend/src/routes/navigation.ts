import { Router } from 'express';
import { NavigationRouteRequestSchema } from '@concourse/shared';
import { z } from 'zod';
import { findNodeByLabel, getGraph, searchNodes } from '../services/graph/loader.js';
import { route } from '../services/graph/astar.js';
import { getCrowdSimulator } from '../services/crowd/simulator.js';
import { alertStore } from '../services/alerts/store.js';

export const navigationRouter: Router = Router();

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
  const parsed = NavigationRouteRequestSchema.safeParse(req.body);
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
  const blockedNodes = alertStore.activeAffectedNodeIds();
  const result = route(
    routerGraph(),
    from.id,
    to.id,
    mode,
    (nodeId) => crowd.crowdPenaltyForNode(nodeId),
    (nodeId) => blockedNodes.has(nodeId),
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
    return [{
      id: node.id,
      label: node.label,
      level: node.level,
      ...(node.zone ? { zone: node.zone } : {}),
      coords: node.coords,
      order,
    }];
  });

  res.json({
    from: { label: from.label, level: from.level },
    to: { label: to.label, level: to.level },
    ...result,
    points,
  });
});

const SearchQuerySchema = z.string().trim().max(120).default('');

/** Lightweight autocomplete endpoint for map route controls. */
navigationRouter.get('/navigation/search', (req, res) => {
  const queryResult = SearchQuerySchema.safeParse(req.query.q);
  const query = queryResult.success ? queryResult.data : '';

  if (query.length < 2) {
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
