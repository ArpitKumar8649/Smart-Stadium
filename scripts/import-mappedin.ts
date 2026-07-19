/**
 * import-mappedin.ts — Path B adapter.
 *
 * Reads the raw Mappedin export in `stadium/` and emits a VenueGraph in
 * Concourse's own schema (`data/venue/metlife.graph.json`). Our runtime
 * code never reads a Mappedin file — it only reads the emitted graph.
 *
 * Runs in DRY-RUN mode by default: it transforms everything in memory,
 * validates against the Zod schema, prints a full coverage + connectivity
 * report, but writes nothing. Pass `--write` to persist the graph.
 *
 * Usage:
 *   npx tsx scripts/import-mappedin.ts            # dry-run + report
 *   npx tsx scripts/import-mappedin.ts --write    # also write the graph
 *
 * Join model (authoritative first, fallback second):
 *   location.nodes[]                          -> node.id   (authoritative)
 *   location.polygons[].id -> space.destinationNodes[] -> node.id (fallback)
 *   node.neighbors[]                          -> horizontal + vertical edges
 *   connection.nodes[]                        -> types + accessibility (vertical)
 *   categoryPriorities[locId] -> categories   -> rich 15-way classification
 */

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  VenueGraphSchema,
  NODE_TYPES,
  type Node as GraphNode,
  type Edge as GraphEdge,
  type NodeType,
} from '../shared/src/index.js';

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const STADIUM = join(ROOT, 'stadium');
const OUT_FILE = join(ROOT, 'data', 'venue', 'metlife.graph.json');

const WRITE = process.argv.includes('--write');
const BRIDGE_MAX_M = 60; // max same-floor gap we will bridge for an orphan POI

// ---------------------------------------------------------------------------
// Raw Mappedin shapes (only the fields we consume)
// ---------------------------------------------------------------------------

interface MapFloor {
  id: string;
  elevation: number;
  name: string;
  shortName: string;
}

interface RawNode {
  type: 'Feature';
  geometry: { type: 'Point'; coordinates: [number, number] };
  properties: {
    id: string;
    map: string;
    neighbors: Array<{ id: string; weight: number }>;
    space: string[];
    flags: number[];
  };
}

interface RawSpaceFeature {
  properties: {
    id: string;
    destinationNodes: string[];
    center?: [number, number];
    details?: { name?: string; description?: string };
  };
}

interface RawConnection {
  id: string;
  type: 'stairs' | 'escalator' | 'elevator' | 'ramp' | 'door' | 'security';
  accessible: boolean;
  nodes: string[];
  details?: { name?: string };
}

interface RawLocation {
  id: string;
  name: string;
  type: string; // seating | tenant | amenities | gate | building
  hidden?: boolean;
  amenity?: string;
  tags?: string[];
  description?: string;
  nodes?: Array<{ map: string; id: string }>;
  polygons: Array<{ map: string; id: string }>;
}

// ---------------------------------------------------------------------------
// Loaders
// ---------------------------------------------------------------------------

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

function loadFloors(): Map<string, MapFloor> {
  const floors = readJson<MapFloor[]>(join(STADIUM, 'map.geojson'));
  const byId = new Map<string, MapFloor>();
  for (const f of floors) byId.set(f.id, f);
  return byId;
}

function loadNodes(): RawNode[] {
  return readJson<{ features: RawNode[] }>(join(STADIUM, 'node.geojson')).features;
}

function loadConnections(): RawConnection[] {
  return readJson<RawConnection[]>(join(STADIUM, 'connection.json'));
}

function loadLocations(): RawLocation[] {
  return readJson<RawLocation[]>(join(STADIUM, 'enterprise', 'locations.json'));
}

/** location id -> rich category name (via categoryPriorities + categories). */
function loadLocationCategories(): Map<string, string> {
  const cats = readJson<Array<{ id: string; name: string }>>(
    join(STADIUM, 'enterprise', 'categories.json'),
  );
  const catName = new Map(cats.map((c) => [c.id, c.name]));
  const priorities = readJson<Record<string, string[]>>(
    join(STADIUM, 'enterprise', 'categoryPriorities.json'),
  );
  const byLoc = new Map<string, string>();
  for (const [locId, catIds] of Object.entries(priorities)) {
    const first = catIds[0];
    if (first && catName.has(first)) byLoc.set(locId, catName.get(first)!);
  }
  return byLoc;
}

/** Maps every space id -> its details, across all floor space files. */
function loadSpaces(): Map<string, RawSpaceFeature['properties']> {
  const dir = join(STADIUM, 'space');
  const byId = new Map<string, RawSpaceFeature['properties']>();
  for (const file of readdirSync(dir)) {
    if (!file.endsWith('.geojson')) continue;
    const fc = readJson<{ features: RawSpaceFeature[] }>(join(dir, file));
    for (const feat of fc.features) byId.set(feat.properties.id, feat.properties);
  }
  return byId;
}

// ---------------------------------------------------------------------------
// Classification: Mappedin location -> our NodeType
// ---------------------------------------------------------------------------

/** Rich 15-way category -> our NodeType (the authoritative first pass). */
const CATEGORY_TO_TYPE: Record<string, NodeType> = {
  Seating: 'seating_section',
  Suite: 'seating_section',
  'Premium Areas': 'information_kiosk',
  'Food & Drink': 'concession',
  Merchandise: 'merchandise',
  Restroom: 'restroom',
  'Premium Platinum Parking': 'parking_link',
  'General Gold Parking': 'parking_link',
  Parking: 'parking_link',
  Nursing: 'family_room',
  Gate: 'entry_gate',
  Services: 'information_kiosk',
  Ticketing: 'information_kiosk',
  ATM: 'atm',
  Attraction: 'information_kiosk',
};

interface Classified {
  type: NodeType;
  halal?: boolean;
  vegetarian?: boolean;
  accessibility: GraphNode['accessibility'];
}


function getOverrideType(hay: string): Classified | null {
  if (/first[- ]?aid|\baed\b|medical|emergency care|nurse station/.test(hay)) {
    return { type: 'first_aid', accessibility: ['step_free', 'wheelchair'] };
  }
  if (/sensory|quiet room|calm|relaxation/.test(hay)) {
    return { type: 'sensory_safe_zone', accessibility: ['sensory_safe', 'step_free', 'wheelchair'] };
  }
  if (/prayer|chapel|worship|meditation|multi[- ]?faith/.test(hay)) {
    return { type: 'prayer_room', accessibility: ['step_free'] };
  }
  if (/rideshare|ride ?share|pick ?up|drop ?off|shuttle|\bbus\b|taxi|\btrain\b|\brail\b|nj transit|light rail|park.?ride/.test(hay)) {
    return { type: 'transit_link', accessibility: ['step_free', 'wheelchair'] };
  }
  if (/nursing|lactation|mother.?s room|feeding/.test(hay)) {
    return { type: 'family_room', accessibility: ['step_free', 'wheelchair', 'family'] };
  }
  return null;
}

function getFallbackType(locType: string | undefined): NodeType {
  if (locType === 'seating') return 'seating_section';
  if (locType === 'gate') return 'entry_gate';
  if (locType === 'tenant') return 'concession';
  if (locType === 'building') return 'concourse_segment';
  return 'information_kiosk';
}

function enrichType(type: NodeType, hay: string): Classified {
  const acc: GraphNode['accessibility'] = [];
  const out: Classified = { type, accessibility: acc };

  if (type === 'restroom') {
    acc.push('wheelchair', 'step_free');
    if (/family|companion|all[- ]?gender/.test(hay)) acc.push('family');
  } else if (type === 'entry_gate') {
    acc.push('step_free', 'wheelchair');
  } else if (type === 'parking_link') {
    if (/accessible|ada|handicap/.test(hay)) acc.push('wheelchair');
  } else if (type === 'seating_section') {
    acc.push('step_free');
    if (/accessible|ada|wheelchair|companion/.test(hay)) acc.push('wheelchair');
  } else if (type === 'atm' || type === 'merchandise' || type === 'information_kiosk') {
    acc.push('step_free');
  }

  if (type === 'concession') {
    acc.push('step_free');
    if (/halal/.test(hay)) out.halal = true;
    if (/vegan|vegetarian|veggie|plant[- ]?based|garden/.test(hay)) out.vegetarian = true;
  }

  return out;
}

function classifyLocation(loc: RawLocation, category: string | undefined): Classified {
  const name = loc.name.toLowerCase();
  const amenity = (loc.amenity ?? '').toLowerCase();
  const tags = (loc.tags ?? []).map((t) => t.toLowerCase());
  const hay = `${name} ${amenity} ${tags.join(' ')}`;

  const override = getOverrideType(hay);
  if (override) return override;

  const type = (category ? CATEGORY_TO_TYPE[category] : undefined) || getFallbackType(loc.type);

  return enrichType(type, hay);
}

/** Human-facing label for a node backed by a location. */
function locationLabel(loc: RawLocation): string {
  if (loc.type === 'seating' && /^\d/.test(loc.name)) return `Section ${loc.name}`;
  return loc.name;
}

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

const WALK_SPEED_MPS = 1.2;

function haversineM(a: [number, number], b: [number, number]): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const [lng1, lat1] = a;
  const [lng2, lat2] = b;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

function connectionEdgeModel(type: RawConnection['type'], accessible: boolean, floorDelta: number) {
  const floors = Math.max(1, Math.abs(floorDelta));
  const perFloor: Record<RawConnection['type'], number> = {
    elevator: 45,
    stairs: 18,
    escalator: 28,
    ramp: 40,
    door: 5,
    security: 60,
  };
  const capacity: Record<RawConnection['type'], GraphEdge['capacity_class']> = {
    elevator: 'narrow',
    stairs: 'narrow',
    escalator: 'narrow',
    ramp: 'normal',
    door: 'normal',
    security: 'wide',
  };
  const stepFree = type === 'elevator' || type === 'ramp' || type === 'door' || type === 'security';
  return {
    seconds: perFloor[type] * floors,
    capacity_class: capacity[type],
    step_free: stepFree,
    wheelchair_accessible: accessible,
  };
}

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

interface BuildStats {
  floors: MapFloor[];
  nodeCount: number;
  poiCount: number;
  perType: Record<string, number>;
  perFloorNodes: Record<string, number>;
  locationsTotal: number;
  locationsMapped: number;
  locationsViaNodes: number;
  locationsViaSpace: number;
  unmappedLocations: string[];
  edgeHorizontal: number;
  edgeVertical: number;
  edgeBridged: number;
  edgePerConnType: Record<string, number>;
  edgeAccessible: number;
  edgeNotAccessible: number;
}


function buildNodeLinks(locations: RawLocation[], spaces: Map<string, RawSpace>, rawNodes: RawNode[]) {
  const nodeExists = new Set(rawNodes.map((n) => n.properties.id));
  const nodeToLoc = new Map<string, RawLocation>();
  const mappedViaNodes = new Set<string>();
  const mappedViaSpace = new Set<string>();

  for (const loc of locations) {
    if (loc.hidden) continue;
    let linked = false;
    for (const n of loc.nodes ?? []) {
      if (!nodeExists.has(n.id)) continue;
      if (!nodeToLoc.has(n.id)) nodeToLoc.set(n.id, loc);
      linked = true;
    }
    if (linked) mappedViaNodes.add(loc.id);
  }

  const spaceToLoc = new Map<string, RawLocation>();
  for (const loc of locations) {
    if (loc.hidden || mappedViaNodes.has(loc.id)) continue;
    for (const poly of loc.polygons) {
      if (!spaceToLoc.has(poly.id)) spaceToLoc.set(poly.id, loc);
    }
  }
  for (const [spaceId, props] of spaces) {
    const loc = spaceToLoc.get(spaceId);
    if (!loc) continue;
    for (const nid of props.destinationNodes ?? []) {
      if (nodeExists.has(nid) && !nodeToLoc.has(nid)) {
        nodeToLoc.set(nid, loc);
        mappedViaSpace.add(loc.id);
      }
    }
  }

  return { nodeToLoc, mappedViaNodes, mappedViaSpace };
}

function buildNodesList(
  rawNodes: RawNode[],
  floors: Map<string, MapFloor>,
  nodeToLoc: Map<string, RawLocation>,
  locCategory: Map<string, string>
) {
  const nodes: GraphNode[] = [];
  const nodeById = new Map<string, GraphNode>();
  const perType: Record<string, number> = {};
  const perFloorNodes: Record<string, number> = {};
  let poiCount = 0;

  for (const rn of rawNodes) {
    const p = rn.properties;
    const floor = floors.get(p.map);
    const floorName = floor?.name.trim() ?? p.map;
    perFloorNodes[floorName] = (perFloorNodes[floorName] ?? 0) + 1;

    const loc = nodeToLoc.get(p.id);
    let type: NodeType;
    let label: string;
    let accessibility: GraphNode['accessibility'];
    let halal: boolean | undefined;
    let vegetarian: boolean | undefined;

    if (loc) {
      const c = classifyLocation(loc, locCategory.get(loc.id));
      type = c.type;
      accessibility = c.accessibility;
      halal = c.halal;
      vegetarian = c.vegetarian;
      label = locationLabel(loc);
      poiCount++;
    } else {
      type = 'concourse_segment';
      label = `${floorName} walkway`;
      accessibility = [];
    }
    perType[type] = (perType[type] ?? 0) + 1;

    const node: GraphNode = {
      id: p.id,
      type,
      label,
      level: floor?.elevation ?? 0,
      coords: rn.geometry.coordinates,
      zone: slug(floorName),
      accessibility,
    };
    if (halal !== undefined) node.halal = halal;
    if (vegetarian !== undefined) node.vegetarian = vegetarian;
    nodes.push(node);
    nodeById.set(node.id, node);
  }

  return { nodes, nodeById, perType, perFloorNodes, poiCount };
}

function buildEdgesList(
  rawNodes: RawNode[],
  floors: Map<string, MapFloor>,
  nodeCoord: Map<string, [number, number]>,
  nodeFloor: Map<string, string>,
  connections: RawConnection[]
) {
  const connByPair = new Map<string, RawConnection>();
  for (const c of connections) {
    for (let i = 0; i < c.nodes.length; i++) {
      for (let j = i + 1; j < c.nodes.length; j++) {
        connByPair.set(pairKey(c.nodes[i]!, c.nodes[j]!), c);
      }
    }
  }

  const edges: GraphEdge[] = [];
  const edgePerConnType: Record<string, number> = {};
  let edgeHorizontal = 0;
  let edgeVertical = 0;
  let edgeAccessible = 0;
  let edgeNotAccessible = 0;
  
  const floorElev = (fid: string) => floors.get(fid)?.elevation ?? 0;
  const OUTDOOR_FLOOR = [...floors.values()].find((f) => /outdoor/i.test(f.name))?.id;

  for (const rn of rawNodes) {
    const from = rn.properties.id;
    const fromCoord = nodeCoord.get(from)!;
    for (const nb of rn.properties.neighbors) {
      const to = nb.id;
      if (to === from) continue; 
      const toCoord = nodeCoord.get(to);
      if (!toCoord) continue;
      const dist = haversineM(fromCoord, toCoord);
      const sameFloor = nodeFloor.get(from) === nodeFloor.get(to);
      const outdoor =
        OUTDOOR_FLOOR !== undefined &&
        (nodeFloor.get(from) === OUTDOOR_FLOOR || nodeFloor.get(to) === OUTDOOR_FLOOR);

      let edge: GraphEdge;
      if (nb.weight === 0 && sameFloor) {
        edge = {
          from,
          to,
          distance_m: round(dist, 2),
          avg_walk_seconds: round(dist / WALK_SPEED_MPS, 1),
          indoor: !outdoor,
          step_free: true,
          wheelchair_accessible: true,
          capacity_class: 'normal',
          bidirectional: false,
        };
        edgeHorizontal++;
      } else {
        const conn = connByPair.get(pairKey(from, to));
        const floorDelta = floorElev(nodeFloor.get(to)!) - floorElev(nodeFloor.get(from)!);
        if (conn) {
          const m = connectionEdgeModel(conn.type, conn.accessible, floorDelta);
          edge = {
            from,
            to,
            distance_m: round(dist + Math.abs(floorDelta) * 4, 2),
            avg_walk_seconds: m.seconds,
            indoor: !outdoor,
            step_free: m.step_free,
            wheelchair_accessible: m.wheelchair_accessible,
            capacity_class: m.capacity_class,
            bidirectional: false,
            notes: conn.details?.name ? `${conn.type}: ${conn.details.name}` : conn.type,
          };
          edgePerConnType[conn.type] = (edgePerConnType[conn.type] ?? 0) + 1;
        } else {
          edge = {
            from,
            to,
            distance_m: round(dist + Math.abs(floorDelta) * 4, 2),
            avg_walk_seconds: round(dist / WALK_SPEED_MPS + Math.abs(floorDelta) * 20, 1),
            indoor: !outdoor,
            step_free: false,
            wheelchair_accessible: false,
            capacity_class: 'normal',
            bidirectional: false,
            notes: 'unclassified level change',
          };
          edgePerConnType['unclassified'] = (edgePerConnType['unclassified'] ?? 0) + 1;
        }
        edgeVertical++;
      }
      if (edge.wheelchair_accessible) edgeAccessible++;
      else edgeNotAccessible++;
      edges.push(edge);
    }
  }

  return { edges, edgeHorizontal, edgeVertical, edgeAccessible, edgeNotAccessible, edgePerConnType };
}

function build(): { nodes: GraphNode[]; edges: GraphEdge[]; stats: BuildStats } {
  const floors = loadFloors();
  const rawNodes = loadNodes();
  const connections = loadConnections();
  const locations = loadLocations();
  const spaces = loadSpaces();
  const locCategory = loadLocationCategories();

    const { nodeToLoc, mappedViaNodes, mappedViaSpace } = buildNodeLinks(locations, spaces, rawNodes);

  // --- Node coord + floor lookups. ---
  const nodeCoord = new Map<string, [number, number]>();
  const nodeFloor = new Map<string, string>();
  for (const rn of rawNodes) {
    nodeCoord.set(rn.properties.id, rn.geometry.coordinates);
    nodeFloor.set(rn.properties.id, rn.properties.map);
  }

  const { nodes, nodeById, perType, perFloorNodes, poiCount } = buildNodesList(rawNodes, floors, nodeToLoc, locCategory);

  let { edgeAccessible, edgeNotAccessible } = buildEdgesList(rawNodes, floors, nodeCoord, nodeFloor, connections);
  const { edges, edgeHorizontal, edgeVertical, edgePerConnType }  = buildEdgesList(rawNodes, floors, nodeCoord, nodeFloor, connections);
// --- Connectivity bridging for orphaned POIs (same floor, <= BRIDGE_MAX_M). ---
  const edgeBridged = bridgeOrphanPois(nodes, edges, nodeById, nodeFloor);
  for (const e of edges.slice(edges.length - edgeBridged)) {
    if (e.wheelchair_accessible) edgeAccessible++;
    else edgeNotAccessible++;
  }

  // --- Coverage accounting. ---
  const mappedLocIds = new Set([...mappedViaNodes, ...mappedViaSpace]);
  const unmappedLocations = locations
    .filter((l) => !l.hidden && !mappedLocIds.has(l.id))
    .map((l) => `${l.name} (${l.type}${l.nodes?.length ? ', has nodes' : ', no nodes'})`);

  const stats: BuildStats = {
    floors: [...floors.values()].sort((a, b) => a.elevation - b.elevation),
    nodeCount: nodes.length,
    poiCount,
    perType,
    perFloorNodes,
    locationsTotal: locations.filter((l) => !l.hidden).length,
    locationsMapped: mappedLocIds.size,
    locationsViaNodes: mappedViaNodes.size,
    locationsViaSpace: mappedViaSpace.size,
    unmappedLocations,
    edgeHorizontal,
    edgeVertical,
    edgeBridged,
    edgePerConnType,
    edgeAccessible,
    edgeNotAccessible,
  };

  return { nodes, edges, stats };
}

/**
 * Connect POI nodes that fell outside the main walkable component to their
 * nearest same-floor neighbour within BRIDGE_MAX_M. Honest + conservative:
 * we never bridge across floors or through long gaps (that would fabricate a
 * path). Returns the count of synthetic edges appended.
 */
function bridgeOrphanPois(
  nodes: GraphNode[],
  edges: GraphEdge[],
  nodeById: Map<string, GraphNode>,
  nodeFloor: Map<string, string>,
): number {
  const main = largestComponent(nodes, edges);
  const orphanPois = nodes.filter(
    (n) => !main.has(n.id) && n.type !== 'concourse_segment',
  );
  let added = 0;
  for (const poi of orphanPois) {
    let best: { id: string; d: number } | undefined;
    for (const cand of nodes) {
      if (!main.has(cand.id)) continue;
      if (nodeFloor.get(cand.id) !== nodeFloor.get(poi.id)) continue;
      const d = haversineM(poi.coords, cand.coords);
      if (d <= BRIDGE_MAX_M && (!best || d < best.d)) best = { id: cand.id, d };
    }
    if (!best) continue;
    const secs = round(best.d / 1.2, 1);
    const newEdges = [
      {
        from: poi.id,
        to: best.id,
        distance_m: round(best.d, 2),
        avg_walk_seconds: secs,
        indoor: true,
        step_free: true,
        wheelchair_accessible: true,
        capacity_class: 'normal' as const,
        bidirectional: false,
        notes: 'connectivity bridge',
      },
      {
        from: best.id,
        to: poi.id,
        distance_m: round(best.d, 2),
        avg_walk_seconds: secs,
        indoor: true,
        step_free: true,
        wheelchair_accessible: true,
        capacity_class: 'normal' as const,
        bidirectional: false,
        notes: 'connectivity bridge',
      },
    ];
    edges.push(...newEdges);
    added += 2;
  }
  
  return added;
}

// ---------------------------------------------------------------------------
// Connectivity + sample routing
// ---------------------------------------------------------------------------

function buildUndirectedAdj(nodes: GraphNode[], edges: GraphEdge[]): Map<string, string[]> {
  const adj = new Map<string, string[]>();
  for (const n of nodes) adj.set(n.id, []);
  for (const e of edges) {
    adj.get(e.from)?.push(e.to);
    adj.get(e.to)?.push(e.from);
  }
  return adj;
}

function largestComponent(nodes: GraphNode[], edges: GraphEdge[]): Set<string> {
  const adj = buildUndirectedAdj(nodes, edges);
  const seen = new Set<string>();
  let best = new Set<string>();
  for (const n of nodes) {
    if (seen.has(n.id)) continue;
    const comp = new Set<string>();
    const stack = [n.id];
    seen.add(n.id);
    while (stack.length) {
      const cur = stack.pop()!;
      comp.add(cur);
      for (const nb of adj.get(cur) ?? []) {
        if (!seen.has(nb)) {
          seen.add(nb);
          stack.push(nb);
        }
      }
    }
    if (comp.size > best.size) best = comp;
  }
  return best;
}


function computeComponentSize(startId: string, adj: Map<string, string[]>, seen: Set<string>): number {
  let size = 0;
  const stack = [startId];
  seen.add(startId);
  while (stack.length) {
    const cur = stack.pop()!;
    size++;
    const neighbors = adj.get(cur) ?? [];
    for (const nb of neighbors) {
      if (!seen.has(nb)) {
        seen.add(nb);
        stack.push(nb);
      }
    }
  }
  return size;
}

function analyzeConnectivity(nodes: GraphNode[], edges: GraphEdge[]) {
  const adj = buildUndirectedAdj(nodes, edges);
  const seen = new Set<string>();
  let components = 0;
  let largest = 0;
  let orphans = 0;
  for (const n of nodes) {
    if (seen.has(n.id)) continue;
    components++;
    const size = computeComponentSize(n.id, adj, seen);
    if (size === 1) orphans++;
    largest = Math.max(largest, size);
  }
  return { components, largest, orphans };
}

function route(
  nodes: GraphNode[],
  edges: GraphEdge[],
  fromId: string,
  toId: string,
  stepFreeOnly: boolean,
): { ok: boolean; steps: number; seconds: number } {
  const out = new Map<string, GraphEdge[]>();
  for (const e of edges) {
    if (stepFreeOnly && !e.step_free) continue;
    let arr = out.get(e.from);
    if (!arr) out.set(e.from, (arr = []));
    arr.push(e);
  }
  const dist = new Map<string, number>();
  const prev = new Map<string, string>();
  dist.set(fromId, 0);
  const pq: Array<{ id: string; d: number }> = [{ id: fromId, d: 0 }];
  while (pq.length) {
    pq.sort((a, b) => a.d - b.d);
    const { id, d } = pq.shift()!;
    if (id === toId) break;
    if (d > (dist.get(id) ?? Infinity)) continue;
    for (const e of out.get(id) ?? []) {
      const nd = d + e.avg_walk_seconds;
      if (nd < (dist.get(e.to) ?? Infinity)) {
        dist.set(e.to, nd);
        prev.set(e.to, id);
        pq.push({ id: e.to, d: nd });
      }
    }
  }
  if (!dist.has(toId)) return { ok: false, steps: 0, seconds: 0 };
  let steps = 0;
  let cur = toId;
  while (cur !== fromId && prev.has(cur)) {
    steps++;
    cur = prev.get(cur)!;
  }
  return { ok: true, steps, seconds: Math.round(dist.get(toId)!) };
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

function report(nodes: GraphNode[], edges: GraphEdge[], stats: BuildStats) {
  const line = '─'.repeat(70);
  console.log(`\n${line}\n  CONCOURSE · Mappedin → VenueGraph adapter  (${WRITE ? 'WRITE' : 'DRY-RUN'})\n${line}`);

  console.log(`\n▸ Floors (${stats.floors.length})`);
  for (const f of stats.floors) {
    const nm = f.name.trim();
    console.log(`    elev ${String(f.elevation).padStart(2)}  ${nm.padEnd(18)} ${stats.perFloorNodes[nm] ?? 0} nodes`);
  }

  console.log(`\n▸ Nodes: ${stats.nodeCount}  (POI: ${stats.poiCount}, waypoint: ${stats.nodeCount - stats.poiCount})`);
  for (const [t, c] of Object.entries(stats.perType).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${t.padEnd(20)} ${c}`);
  }

  console.log(`\n▸ Locations mapped: ${stats.locationsMapped}/${stats.locationsTotal}  (via nodes: ${stats.locationsViaNodes}, via space fallback: ${stats.locationsViaSpace})`);
  if (stats.unmappedLocations.length) {
    console.log(`    unmapped (${stats.unmappedLocations.length}):`);
    for (const n of stats.unmappedLocations) {
      console.log(`      · ${n}`);
    }
  } else {
    console.log('    all non-hidden locations linked to a routing node ✓');
  }

  console.log(`\n▸ Edges: ${edges.length}  (horizontal ${stats.edgeHorizontal}, vertical ${stats.edgeVertical}, bridged ${stats.edgeBridged})`);
  console.log(`    wheelchair-accessible: ${stats.edgeAccessible}   not: ${stats.edgeNotAccessible}`);
  for (const [t, c] of Object.entries(stats.edgePerConnType).sort((a, b) => b[1] - a[1])) {
    console.log(`    vertical:${t.padEnd(14)} ${c}`);
  }

  const { components, largest, orphans } = analyzeConnectivity(nodes, edges);
  console.log(`\n▸ Connectivity`);
  console.log(`    components: ${components}   largest: ${largest}/${nodes.length} (${((largest / nodes.length) * 100).toFixed(1)}%)`);
  console.log(`    orphan nodes (no edges): ${orphans}`);

  console.log(`\n▸ Sample routes (Dijkstra by seconds)`);
  const gate = nodes.find((n) => n.type === 'entry_gate');
  const section = nodes.find((n) => n.type === 'seating_section' && /1\d\d/.test(n.label));
  const restroom = nodes.find((n) => n.type === 'restroom');
  const family = nodes.find((n) => n.type === 'restroom' && n.accessibility.includes('family'));
  const parking = nodes.find((n) => n.type === 'parking_link');
  const transit = nodes.find((n) => n.type === 'transit_link');

  const printRoute = (label: string, a?: GraphNode, b?: GraphNode) => {
    if (!a || !b) {
      console.log(`    ${label}: endpoint missing (a=${a?.label ?? '—'}, b=${b?.label ?? '—'})`);
      return;
    }
    const fast = route(nodes, edges, a.id, b.id, false);
    const sf = route(nodes, edges, a.id, b.id, true);
    console.log(`    ${label}`);
    console.log(`      "${a.label}" → "${b.label}"`);
    console.log(`      fastest  : ${fast.ok ? `${fast.steps} hops, ${fast.seconds}s (~${Math.round(fast.seconds / 60)}m)` : 'NO PATH'}`);
    console.log(`      step-free: ${sf.ok ? `${sf.steps} hops, ${sf.seconds}s (~${Math.round(sf.seconds / 60)}m)` : 'NO PATH'}`);
  };

  printRoute('Gate → mid section', gate, section);
  printRoute('Section → restroom', section, restroom);
  printRoute('Gate → family restroom', gate, family);
  printRoute('Section → parking', section, parking);
  printRoute('Section → transit', section, transit);

  console.log(`\n${line}`);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}
function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}
function round(n: number, dp: number): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const started = Date.now();
  const { nodes, edges, stats } = build();

  const graph = {
    venue_id: 'metlife',
    version: '1.0.0',
    generated_at: new Date().toISOString(),
    nodes,
    edges,
  };

  const parsed = VenueGraphSchema.safeParse(graph);
  report(nodes, edges, stats);

  if (!parsed.success) {
    console.error('\n✗ SCHEMA VALIDATION FAILED:');
    console.error(JSON.stringify(parsed.error.issues.slice(0, 10), null, 2));
    process.exit(1);
  }
  console.log(`\n✓ Schema validation passed — ${nodes.length} nodes, ${edges.length} edges conform to VenueGraphSchema.`);

  const NODE_TYPE_SET = new Set<string>(NODE_TYPES);
  const badTypes = nodes.filter((n) => !NODE_TYPE_SET.has(n.type));
  if (badTypes.length) {
    console.error(`✗ ${badTypes.length} nodes have a type outside NODE_TYPES.`);
    process.exit(1);
  }

  if (WRITE) {
    writeFileSync(OUT_FILE, JSON.stringify(graph, null, 2));
    console.log(`\n✓ WROTE ${OUT_FILE}`);
  } else {
    console.log(`\n(dry-run — nothing written. Re-run with --write to persist.)`);
  }
  console.log(`  done in ${Date.now() - started}ms\n`);
}

main();
