import type { Edge, Node, RouteResponse, RouteStep, VenueGraph } from '@concourse/shared';
import type { RoutingMode } from '@concourse/shared';

/**
 * The indexed view of the venue graph the router consumes. The loader owns the
 * live singleton; the router only ever receives a `GraphIndex` as a parameter so
 * it stays pure and unit-testable. `loader.ts` is expected to build (or re-export)
 * a value structurally identical to this — use {@link buildGraphIndex} to make one.
 */
export interface GraphIndex {
  /** Every node keyed by id. */
  readonly nodes: ReadonlyMap<string, Node>;
  /** Outgoing edges keyed by their `from` node id (adjacency list). */
  readonly edgesFrom: ReadonlyMap<string, readonly Edge[]>;
}

/** Optional hook the crowd simulator wires in later; returns extra seconds for entering a node. */
export type CrowdPenalty = (nodeId: string) => number;

/**
 * Penalty (seconds) added to a non-step-free edge in `step_free` mode. Large enough
 * that stairs/escalators are only ever chosen when there is literally no alternative —
 * accessibility is a WEIGHT, never a hard filter (see brain rule), so a route always exists.
 */
const STEP_FREE_PENALTY = 100_000;
/** Softer version of the above for `sensory_safe`, which cares about stairs but less absolutely. */
const SENSORY_STEP_PENALTY = 5_000;
/** Mild nudge away from tight/crowded corridors in `sensory_safe`. */
const SENSORY_NARROW_PENALTY = 60;
/** Walking speed used by the admissible heuristic (m/s). */
const WALK_SPEED_MPS = 1.4;
/** Hard cap on instruction length (requirement: < 90 chars). */
const MAX_INSTRUCTION = 89;

/**
 * Build a {@link GraphIndex} from a raw (schema-valid) venue graph. Exposed so the
 * loader and tests can construct the router's input without duplicating the indexing.
 */
export function buildGraphIndex(graph: VenueGraph): GraphIndex {
  const nodes = new Map<string, Node>();
  for (const node of graph.nodes) nodes.set(node.id, node);

  const edgesFrom = new Map<string, Edge[]>();
  for (const edge of graph.edges) {
    const list = edgesFrom.get(edge.from);
    if (list) list.push(edge);
    else edgesFrom.set(edge.from, [edge]);
  }
  return { nodes, edgesFrom };
}

/** Great-circle distance in metres between two [lng, lat] coordinates. */
function haversineMeters(a: readonly [number, number], b: readonly [number, number]): number {
  const R = 6_371_000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const lat1 = toRad(a[1]);
  const lat2 = toRad(b[1]);
  const dLat = toRad(b[1] - a[1]);
  const dLng = toRad(b[0] - a[0]);
  const s =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

/**
 * Mode-aware edge weight in seconds. `base` is the honest walk time; every mode only
 * ever ADDS to it, which keeps the haversine/1.4 heuristic admissible for all modes.
 */
function edgeWeight(edge: Edge, mode: RoutingMode, crowdPenalty: CrowdPenalty): number {
  const base = edge.avg_walk_seconds;
  switch (mode) {
    case 'fastest':
      return base;
    case 'step_free':
      return base + (edge.step_free ? 0 : STEP_FREE_PENALTY);
    case 'sensory_safe': {
      const stairs = edge.step_free ? 0 : SENSORY_STEP_PENALTY;
      const narrow = edge.capacity_class === 'narrow' ? SENSORY_NARROW_PENALTY : 0;
      return base + stairs + narrow;
    }
    case 'low_crowd':
      return base + Math.max(0, crowdPenalty(edge.to));
    default:
      return base;
  }
}

/** A tiny binary min-heap keyed by priority; `seq` gives deterministic tie-breaking. */
class MinHeap {
  private readonly items: { p: number; seq: number; id: string }[] = [];

  get size(): number {
    return this.items.length;
  }

  push(p: number, seq: number, id: string): void {
    const items = this.items;
    items.push({ p, seq, id });
    let i = items.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.less(items[i]!, items[parent]!)) {
        [items[i], items[parent]] = [items[parent]!, items[i]!];
        i = parent;
      } else break;
    }
  }

  pop(): string | undefined {
    const items = this.items;
    const top = items[0];
    if (top === undefined) return undefined;
    const last = items.pop()!;
    if (items.length > 0) {
      items[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = 2 * i + 2;
        let smallest = i;
        if (l < items.length && this.less(items[l]!, items[smallest]!)) smallest = l;
        if (r < items.length && this.less(items[r]!, items[smallest]!)) smallest = r;
        if (smallest === i) break;
        [items[i], items[smallest]] = [items[smallest]!, items[i]!];
        i = smallest;
      }
    }
    return top.id;
  }

  private less(a: { p: number; seq: number }, b: { p: number; seq: number }): boolean {
    return a.p < b.p || (a.p === b.p && a.seq < b.seq);
  }
}

function truncate(text: string): string {
  return text.length <= MAX_INSTRUCTION ? text : `${text.slice(0, MAX_INSTRUCTION - 1)}…`;
}

/** Human, per-hop instruction built from node labels + edge notes. Kept under 90 chars. */
function buildInstruction(fromNode: Node, toNode: Node, edge: Edge): string {
  const dist = Math.round(edge.distance_m);
  const notes = (edge.notes ?? '').toLowerCase();
  const dir = toNode.level > fromNode.level ? 'up' : toNode.level < fromNode.level ? 'down' : '';
  const dirSuffix = dir ? ` ${dir}` : '';

  // Prefer a vertical-transport node's own label ("Elevator 3") as the transport name.
  const transport = [fromNode, toNode].find(
    (n) => n.type === 'elevator' || n.type === 'escalator' || n.type === 'ramp',
  );

  const mentions = (word: string) => notes.includes(word) || transport?.type === word;

  if (mentions('elevator')) {
    const name = transport?.label ?? 'the elevator';
    return truncate(
      toNode === transport ? `Take ${name}${dirSuffix}` : `Take ${name}${dirSuffix} to ${toNode.label}`,
    );
  }
  if (mentions('escalator')) {
    const name = transport?.label ?? 'the escalator';
    return truncate(
      toNode === transport ? `Take ${name}${dirSuffix}` : `Take ${name}${dirSuffix} to ${toNode.label}`,
    );
  }
  if (notes.includes('stair')) {
    return truncate(`Take the stairs${dirSuffix} to ${toNode.label}`);
  }
  if (mentions('ramp')) {
    return truncate(`Take the ramp${dirSuffix} to ${toNode.label}`);
  }
  return truncate(`Walk ${dist}m to ${toNode.label}`);
}

/**
 * Mode-aware A* over the directed venue graph.
 *
 * @param graph        Indexed venue graph (pass the loader's `GraphIndex`; never imported here).
 * @param fromNodeId   Origin node id.
 * @param toNodeId     Destination node id.
 * @param mode         One of ROUTING_MODES; changes edge weighting only, never reachability.
 * @param crowdPenalty Optional per-node crowd cost (seconds); only consulted in `low_crowd` mode.
 * @returns A {@link RouteResponse}, or `null` when either endpoint is unknown or no path exists.
 */
export function route(
  graph: GraphIndex,
  fromNodeId: string,
  toNodeId: string,
  mode: RoutingMode,
  crowdPenalty: CrowdPenalty = () => 0,
): RouteResponse | null {
  const start = graph.nodes.get(fromNodeId);
  const goal = graph.nodes.get(toNodeId);
  if (!start || !goal) return null;

  // Trivial route: already at the destination.
  if (fromNodeId === toNodeId) {
    return {
      mode,
      total_distance_m: 0,
      total_seconds: 0,
      step_free: true,
      wheelchair_accessible: true,
      crowd_penalty: 0,
      steps: [],
      path: [fromNodeId],
      warnings: [],
    };
  }

  const heuristic = (nodeId: string): number => {
    const node = graph.nodes.get(nodeId);
    if (!node) return 0;
    return haversineMeters(node.coords, goal.coords) / WALK_SPEED_MPS;
  };

  const gScore = new Map<string, number>([[fromNodeId, 0]]);
  const cameFrom = new Map<string, { prev: string; edge: Edge }>();
  const closed = new Set<string>();
  const open = new MinHeap();
  let seq = 0;
  open.push(heuristic(fromNodeId), seq++, fromNodeId);

  while (open.size > 0) {
    const current = open.pop()!;
    if (current === toNodeId) break;
    if (closed.has(current)) continue;
    closed.add(current);

    const g = gScore.get(current)!;
    const edges = graph.edgesFrom.get(current);
    if (!edges) continue;

    for (const edge of edges) {
      if (closed.has(edge.to)) continue;
      const tentative = g + edgeWeight(edge, mode, crowdPenalty);
      if (tentative < (gScore.get(edge.to) ?? Infinity)) {
        cameFrom.set(edge.to, { prev: current, edge });
        gScore.set(edge.to, tentative);
        open.push(tentative + heuristic(edge.to), seq++, edge.to);
      }
    }
  }

  if (!cameFrom.has(toNodeId)) return null;

  // Reconstruct the path (node ids) and the edges taken, origin-first.
  const pathEdges: Edge[] = [];
  const path: string[] = [toNodeId];
  let cursor = toNodeId;
  while (cursor !== fromNodeId) {
    const link = cameFrom.get(cursor);
    if (!link) return null; // defensive; shouldn't happen given the has() check above
    pathEdges.unshift(link.edge);
    path.unshift(link.prev);
    cursor = link.prev;
  }

  let totalDistance = 0;
  let totalSeconds = 0;
  let stepFree = true;
  let wheelchair = true;
  let crowdSum = 0;
  const steps: RouteStep[] = [];

  for (const edge of pathEdges) {
    const fromNode = graph.nodes.get(edge.from);
    const toNode = graph.nodes.get(edge.to);
    totalDistance += edge.distance_m;
    totalSeconds += edge.avg_walk_seconds;
    if (!edge.step_free) stepFree = false;
    if (!edge.wheelchair_accessible) wheelchair = false;
    if (mode === 'low_crowd') crowdSum += Math.max(0, crowdPenalty(edge.to));

    steps.push({
      from_node_id: edge.from,
      to_node_id: edge.to,
      distance_m: edge.distance_m,
      seconds: edge.avg_walk_seconds,
      instruction:
        fromNode && toNode
          ? buildInstruction(fromNode, toNode, edge)
          : truncate(`Walk ${Math.round(edge.distance_m)}m`),
    });
  }

  const warnings: string[] = [];
  if (mode === 'step_free' && !stepFree) {
    warnings.push('Step-free route unavailable; this path includes stairs.');
  }
  if (mode === 'sensory_safe' && !stepFree) {
    warnings.push('This route includes stairs or a non-step-free segment.');
  }

  return {
    mode,
    total_distance_m: totalDistance,
    total_seconds: totalSeconds,
    step_free: stepFree,
    wheelchair_accessible: wheelchair,
    crowd_penalty: crowdSum,
    steps,
    path,
    warnings,
  };
}
