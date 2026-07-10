/**
 * Graph loader + indexes.
 *
 * Loads the real MetLife venue graph (3,479 nodes / 8,167 edges) once at
 * module import, validates it against the shared Zod contract, and builds
 * O(1) lookup indexes. Everything the concierge's routing + lookup tools
 * need to ground themselves in real node ids lives here.
 *
 * The LLM never invents node ids: it calls tools that resolve labels to
 * real nodes through {@link findNodeByLabel} / {@link searchNodes}, and the
 * A* router walks the {@link GraphIndex.adjacency} map. This module is the
 * single source of truth for "what exists in the building".
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
// Prefer the package alias; it resolves via shared/dist/index.js. If that ever
// fails at runtime, swap for a relative import to ../../../../shared/src/index.js.
import { VenueGraphSchema, type Node, type Edge, type NodeType } from '@concourse/shared';
import { logger } from '../../middleware/logger.js';

/** Immutable, indexed view of the venue graph. */
export interface GraphIndex {
  /** Every node keyed by its id. */
  readonly nodeById: ReadonlyMap<string, Node>;
  /** Outgoing edges keyed by their `from` node id. */
  readonly adjacency: ReadonlyMap<string, readonly Edge[]>;
  /** Nodes grouped by {@link NodeType}. */
  readonly byType: ReadonlyMap<NodeType, readonly Node[]>;
  /** Nodes grouped by concourse level (0–7). */
  readonly byLevel: ReadonlyMap<number, readonly Node[]>;
  readonly allNodes: readonly Node[];
  readonly allEdges: readonly Edge[];
}

const GRAPH_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  // graph -> services -> src -> backend -> repo root
  '../../../../data/venue/metlife.graph.json',
);

let singleton: GraphIndex | undefined;

/** Straight-line distance between two `[lng, lat]` coordinates, in metres. */
export function haversineMeters(a: readonly [number, number], b: readonly [number, number]): number {
  const R = 6_371_000; // Earth mean radius, metres
  const [lng1, lat1] = a;
  const [lng2, lat2] = b;
  const toRad = (d: number): number => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

function buildIndex(): GraphIndex {
  const raw: unknown = JSON.parse(readFileSync(GRAPH_PATH, 'utf8'));
  const graph = VenueGraphSchema.parse(raw);

  const nodeById = new Map<string, Node>();
  const byType = new Map<NodeType, Node[]>();
  const byLevel = new Map<number, Node[]>();
  for (const node of graph.nodes) {
    nodeById.set(node.id, node);
    const typeBucket = byType.get(node.type);
    if (typeBucket) typeBucket.push(node);
    else byType.set(node.type, [node]);
    const levelBucket = byLevel.get(node.level);
    if (levelBucket) levelBucket.push(node);
    else byLevel.set(node.level, [node]);
  }

  const adjacency = new Map<string, Edge[]>();
  for (const edge of graph.edges) {
    const out = adjacency.get(edge.from);
    if (out) out.push(edge);
    else adjacency.set(edge.from, [edge]);
  }

  const index: GraphIndex = {
    nodeById,
    adjacency,
    byType,
    byLevel,
    allNodes: graph.nodes,
    allEdges: graph.edges,
  };

  logger.info(
    {
      venue: graph.venue_id,
      version: graph.version,
      nodes: graph.nodes.length,
      edges: graph.edges.length,
      types: byType.size,
      levels: byLevel.size,
    },
    'venue graph loaded',
  );

  return Object.freeze(index);
}

/** The lazily-loaded, frozen graph singleton. */
export function getGraph(): GraphIndex {
  if (!singleton) singleton = buildIndex();
  return singleton;
}

/** Lowercase, strip punctuation, collapse whitespace — for tolerant matching. */
function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const STOPWORDS = new Set(['the', 'a', 'an', 's', 'to', 'at', 'of', 'near', 'nearest']);

/**
 * Score a node against a normalized query. Higher is better; 0 means no match.
 * Ordering intent: exact label > label startsWith > label includes > token
 * overlap, with a strong boost when a numeric query matches a seating section's
 * number as a whole word (so "144" → "Section 144", not "Section 1442").
 */
function scoreNode(node: Node, q: string, tokens: readonly string[]): number {
  const label = normalize(node.label);
  if (!label) return 0;

  let score = 0;
  if (label === q) score = 1000;
  else if (q.length > 0 && label.startsWith(q)) score = 600;
  else if (q.length > 0 && label.includes(q)) score = 420;

  if (tokens.length > 0) {
    const labelTokens = label.split(' ');
    const labelTokenSet = new Set(labelTokens);
    let matched = 0;
    for (const t of tokens) {
      if (STOPWORDS.has(t)) {
        matched += 1;
        continue;
      }
      if (labelTokenSet.has(t)) matched += 1;
      else if (label.includes(t)) matched += 0.5;
    }
    const ratio = matched / tokens.length;
    score += ratio * 300;

    // Whole-word numeric match is decisive for seating sections / gates.
    for (const t of tokens) {
      if (/^\d+$/.test(t) && labelTokenSet.has(t)) {
        score += node.type === 'seating_section' ? 500 : 250;
      }
    }
  }

  // Gentle tie-break toward shorter, more specific labels.
  if (score > 0) score -= Math.min(20, label.length * 0.05);
  return score;
}

/**
 * Resolve a human label to a single real node. Case-insensitive and tolerant
 * of noise ("section 144", "144", "women restroom"). Returns undefined when
 * nothing scores above the noise floor. Ties break toward the higher-scored,
 * then lexicographically-stable first node.
 */
export function findNodeByLabel(query: string): Node | undefined {
  const q = normalize(query);
  if (!q) return undefined;
  const tokens = q.split(' ').filter(Boolean);

  let best: Node | undefined;
  let bestScore = 0;
  for (const node of getGraph().allNodes) {
    const s = scoreNode(node, q, tokens);
    if (s > bestScore) {
      bestScore = s;
      best = node;
    }
  }
  // Require a meaningful match, not an incidental single-token overlap.
  return bestScore >= 150 ? best : undefined;
}

/** Fuzzy, ranked matches for autocomplete / disambiguation suggestions. */
export function searchNodes(query: string, limit = 8): Node[] {
  const q = normalize(query);
  if (!q) return [];
  const tokens = q.split(' ').filter(Boolean);

  const scored: Array<{ node: Node; score: number }> = [];
  for (const node of getGraph().allNodes) {
    const s = scoreNode(node, q, tokens);
    if (s > 0) scored.push({ node, score: s });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, Math.max(0, limit)).map((x) => x.node);
}

const STEP_FREE_TAGS: ReadonlyArray<Node['accessibility'][number]> = ['step_free', 'wheelchair'];

/**
 * Nodes of a given type ranked by straight-line distance from an origin node
 * (a cheap prefilter — true walkable distance is the A* router's job).
 *
 * `requireStepFree` filters to nodes whose OWN accessibility advertises
 * 'step_free' or 'wheelchair'; it does not guarantee a step-free path exists.
 * Returns [] if the origin node is unknown.
 */
export function nearestNodesByType(
  fromNodeId: string,
  type: NodeType,
  opts: { limit?: number; requireStepFree?: boolean } = {},
): Node[] {
  const { limit = 5, requireStepFree = false } = opts;
  const graph = getGraph();
  const origin = graph.nodeById.get(fromNodeId);
  if (!origin) return [];

  const candidates = graph.byType.get(type) ?? [];
  const ranked: Array<{ node: Node; dist: number }> = [];
  for (const node of candidates) {
    if (node.id === fromNodeId) continue;
    if (requireStepFree && !node.accessibility.some((a) => STEP_FREE_TAGS.includes(a))) continue;
    ranked.push({ node, dist: haversineMeters(origin.coords, node.coords) });
  }
  ranked.sort((a, b) => a.dist - b.dist);
  return ranked.slice(0, Math.max(0, limit)).map((x) => x.node);
}
