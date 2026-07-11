/**
 * Concierge agent tools — definitions + deterministic handlers.
 *
 * These are the ONLY things the language model may call. Every tool resolves
 * fuzzy human labels to REAL node ids through the graph loader and routes with
 * the A* service; the model never invents node ids or fabricates steps. Tool
 * output is kept compact and human-narratable — the LLM turns it into prose.
 *
 * Contract for the integrator:
 *   - TOOL_DEFINITIONS: ToolDefinition[]  — pass straight to LlmProvider.chat/streamChat.
 *   - handleToolCall(name, args): Promise<ToolResult>  — args is the JSON-parsed
 *     object from ToolCall.arguments. Never throws; always resolves to a ToolResult.
 */

import { z } from 'zod';
import { ROUTING_MODES, type Node, type NodeType, type RouteResponse } from '@concourse/shared';
import type { ToolDefinition } from '../llm/provider.js';
import {
  getGraph,
  findNodeByLabel,
  nearestNodesByType,
  searchNodes,
  type GraphIndex as LoaderGraphIndex,
} from '../graph/loader.js';
import { route } from '../graph/astar.js';
import { getCrowdSimulator } from '../crowd/simulator.js';

/** Uniform result envelope for every tool call. */
export interface ToolResult {
  ok: boolean;
  data?: unknown;
  error?: string;
  /** Short, human line for the tool-call chip in the UI. */
  summary: string;
}

/**
 * Facility types the user-facing tools expose. A curated subset of NODE_TYPES —
 * the things a guest actually asks to find. Kept as a const tuple so it can seed
 * both the Zod enums and the JSON-Schema `enum` arrays.
 */
const FACILITY_TYPES = [
  'restroom',
  'concession',
  'first_aid',
  'exit',
  'atm',
  'elevator',
  'information_kiosk',
  'merchandise',
  'transit_link',
  'parking_link',
  'family_room',
] as const;

/** Human names for the concourse levels, for get_venue_info. */
const LEVEL_NAMES: Readonly<Record<number, string>> = {
  0: 'Plaza & Outdoors',
  1: '100 Concourse',
  2: '200 Level',
  3: '300 Level',
  4: '400 Level',
  5: '500 Level',
  6: '600 Level',
  7: 'Upper Concourse',
};

// ---------------------------------------------------------------------------
// Tool definitions (OpenAI / Qwen function-calling JSON Schema)
// ---------------------------------------------------------------------------

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: 'find_route',
    description:
      'Route between two named places in the stadium (e.g. "Section 144" to "Women\'s Restroom"). ' +
      'Returns turn-by-turn walking directions with total time and distance. ' +
      'Use mode to honor accessibility or comfort needs.',
    parameters: {
      type: 'object',
      properties: {
        from_label: {
          type: 'string',
          description: 'Starting place as the guest names it, e.g. "Section 144" or "Gate A".',
        },
        to_label: {
          type: 'string',
          description: 'Destination place, e.g. "nearest restroom label" or "Prayer Room".',
        },
        mode: {
          type: 'string',
          enum: [...ROUTING_MODES],
          description:
            'Routing preference. fastest = shortest time; step_free = avoid stairs/escalators ' +
            '(wheelchair/stroller); sensory_safe = gentler, quieter path; low_crowd = avoid congestion.',
        },
      },
      required: ['from_label', 'to_label'],
      additionalProperties: false,
    },
  },
  {
    name: 'find_nearest',
    description:
      'Find the nearest facility of a given type to a starting place, and return a walking route to it. ' +
      'Use for "where is the closest restroom / ATM / first aid" style questions.',
    parameters: {
      type: 'object',
      properties: {
        from_label: {
          type: 'string',
          description: 'The guest\'s current location, e.g. "Section 210".',
        },
        facility_type: {
          type: 'string',
          enum: [...FACILITY_TYPES],
          description: 'Kind of facility to locate.',
        },
        step_free: {
          type: 'boolean',
          description:
            'If true, prefer a step-free facility and route (wheelchair/stroller friendly). Default false.',
        },
        dietary: {
          type: 'string',
          enum: ['halal', 'vegetarian'],
          description:
            'Only for facility_type "concession": restrict to halal or vegetarian food outlets. ' +
            'Set this whenever the guest asks for halal or vegetarian/vegan food.',
        },
      },
      required: ['from_label', 'facility_type'],
      additionalProperties: false,
    },
  },
  {
    name: 'get_venue_info',
    description:
      'Static orientation facts about MetLife Stadium: the list of levels/floors, the entry gates, ' +
      'and what facilities exist on each level. Use for "how is the stadium laid out" questions.',
    parameters: {
      type: 'object',
      properties: {
        topic: {
          type: 'string',
          enum: ['floors', 'gates', 'levels', 'overview'],
          description:
            'Which slice of orientation info to return. Omit or use "overview" for everything.',
        },
      },
      required: [],
      additionalProperties: false,
    },
  },
  {
    name: 'list_facilities',
    description:
      'List named facilities of a type, optionally restricted to one level. ' +
      'Use for "what food options are on level 1" or "list the ATMs".',
    parameters: {
      type: 'object',
      properties: {
        facility_type: {
          type: 'string',
          enum: [...FACILITY_TYPES],
          description: 'Kind of facility to list.',
        },
        level: {
          type: 'integer',
          minimum: 0,
          maximum: 7,
          description: 'Optional concourse level (0–7) to filter to.',
        },
      },
      required: ['facility_type'],
      additionalProperties: false,
    },
  },
  {
    name: 'resolve_place',
    description:
      'Disambiguate a vague or partial place name into a ranked list of real candidate labels. ' +
      'Call this first when the guest is unclear about where they mean, then confirm before routing.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The fuzzy place name to resolve, e.g. "the taco place near me" or "144".',
        },
      },
      required: ['query'],
      additionalProperties: false,
    },
  },
  {
    name: 'find_outdoor_route',
    description:
      'Find a driving route to the stadium from the user\'s current outdoor location or another specified address. ' +
      'Requires the user to have provided GPS permissions unless they specify a starting address. ' +
      'Always use this when the user asks how to get to the stadium from outside (e.g., "How do I get to the stadium?", ' +
      '"Directions from JFK to MetLife").',
    parameters: {
      type: 'object',
      properties: {
        destinationName: {
          type: 'string',
          description: 'Optional destination name to clarify route (e.g. "MetLife Stadium"). Assume MetLife if not provided.',
        },
      },
      required: [],
      additionalProperties: false,
    },
  },
  {
    name: 'get_crowd',
    description:
      'Current crowd density and queue wait for a place or zone, with a short-term projection ' +
      '(T+15 / T+30 min). Call this for "is it busy", "how long is the line", "should I go now" ' +
      'questions, or before recommending a facility during the halftime rush. Crowd data is ' +
      'simulated for this preview — say so if asked. Omit `place` to get the busiest zones overall.',
    parameters: {
      type: 'object',
      properties: {
        place: {
          type: 'string',
          description:
            'A place or area the guest names, e.g. "Section 144", "Level 1 restrooms", "food court". ' +
            'Omit to summarise the most crowded zones in the venue right now.',
        },
      },
      required: [],
      additionalProperties: false,
    },
  },
];

// ---------------------------------------------------------------------------
// Argument schemas (one per tool)
// ---------------------------------------------------------------------------

const FindRouteArgs = z.object({
  from_label: z.string().min(1),
  to_label: z.string().min(1),
  mode: z.enum(ROUTING_MODES).default('fastest'),
});

const FindNearestArgs = z.object({
  from_label: z.string().min(1),
  facility_type: z.enum(FACILITY_TYPES),
  step_free: z.boolean().default(false),
  dietary: z.enum(['halal', 'vegetarian']).optional(),
});

const GetVenueInfoArgs = z.object({
  topic: z.enum(['floors', 'gates', 'levels', 'overview']).default('overview'),
});

const ListFacilitiesArgs = z.object({
  facility_type: z.enum(FACILITY_TYPES),
  level: z.number().int().min(0).max(7).optional(),
});

const ResolvePlaceArgs = z.object({
  query: z.string().min(1),
});

const GetCrowdArgs = z.object({
  place: z.string().min(1).optional(),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a ToolResult without tripping exactOptionalPropertyTypes on absent fields. */
function ok(data: unknown, summary: string): ToolResult {
  return { ok: true, data, summary };
}
function fail(error: string, summary?: string): ToolResult {
  return { ok: false, error, summary: summary ?? error };
}

/** Flatten a Zod error into a short, single-line message. */
function zodMessage(err: z.ZodError): string {
  return err.issues
    .map((i) => `${i.path.join('.') || 'args'}: ${i.message}`)
    .join('; ');
}

/**
 * Adapt the loader's GraphIndex ({nodeById, adjacency}) to the shape the A*
 * router consumes ({nodes, edgesFrom}). Both are structurally the same maps;
 * this is a zero-copy view rebuilt cheaply per call (the maps are shared).
 */
function routerGraph(g: LoaderGraphIndex): { nodes: typeof g.nodeById; edgesFrom: typeof g.adjacency } {
  return { nodes: g.nodeById, edgesFrom: g.adjacency };
}

/** Up-to-`n` candidate labels for "did you mean" style errors. */
function candidateLabels(query: string, n = 5): string[] {
  return searchNodes(query, n).map((node) => node.label);
}

/** "2 min", "45 sec" — compact duration for chip summaries. */
function humanDuration(totalSeconds: number): string {
  const secs = Math.round(totalSeconds);
  if (secs < 60) return `${secs} sec`;
  return `${Math.round(secs / 60)} min`;
}

/**
 * Collapse a RouteResponse into the compact, LLM-friendly payload described in
 * the module contract: resolved endpoints, totals, accessibility, ordered
 * instruction strings, and warnings. Node ids stay out — the model never needs them.
 */
function compactRoute(
  fromLabel: string,
  toLabel: string,
  r: RouteResponse,
): Record<string, unknown> {
  return {
    from: fromLabel,
    to: toLabel,
    mode: r.mode,
    total_seconds: Math.round(r.total_seconds),
    total_distance_m: Math.round(r.total_distance_m),
    step_free: r.step_free,
    wheelchair_accessible: r.wheelchair_accessible,
    steps: r.steps.map((s) => s.instruction),
    warnings: r.warnings,
  };
}

/** Compact public view of a node (no ids/coords leaked to the model). */
function facilityView(node: Node): Record<string, unknown> {
  const view: Record<string, unknown> = {
    label: node.label,
    level: node.level,
    level_name: LEVEL_NAMES[node.level] ?? `Level ${node.level}`,
  };
  if (node.zone !== undefined) view.zone = node.zone;
  if (node.cuisine !== undefined) view.cuisine = node.cuisine;
  if (node.halal !== undefined) view.halal = node.halal;
  if (node.vegetarian !== undefined) view.vegetarian = node.vegetarian;
  if (node.accessibility.length > 0) view.accessibility = node.accessibility;
  return view;
}

// ---------------------------------------------------------------------------
// Per-tool handlers
// ---------------------------------------------------------------------------

function handleFindRoute(raw: unknown): ToolResult {
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

function handleFindNearest(raw: unknown): ToolResult {
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
      `No ${facility_type.replace(/_/g, ' ')}${dietaryNote} found near "${from.label}"` +
        (step_free ? ' with step-free access.' : '.'),
      `No ${dietaryActive ? dietary + ' ' : ''}${facility_type} near ${from.label}`,
    );
  }

  // Straight-line ranking is a prefilter; confirm with a real route and, if the
  // nearest is unreachable in the requested mode, fall through to the next.
  const mode = step_free ? 'step_free' : 'fastest';
  const graph = routerGraph(getGraph());
  const sim = getCrowdSimulator();
  let chosen: Node | undefined;
  let result: RouteResponse | null = null;
  for (const candidate of candidates) {
    const r = route(graph, from.id, candidate.id, mode, (id) => sim.crowdPenaltyForNode(id));
    if (r) {
      chosen = candidate;
      result = r;
      break;
    }
  }

  if (!chosen || !result) {
    return fail(
      `Found ${facility_type.replace(/_/g, ' ')} nearby but could not compute a route from "${from.label}".`,
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
  const summary = `Nearest ${dietaryActive ? dietary + ' ' : ''}${facility_type.replace(
    /_/g,
    ' ',
  )}: ${chosen.label}, ${humanDuration(result.total_seconds)}`;
  return ok(data, summary);
}

function handleGetVenueInfo(raw: unknown): ToolResult {
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

function handleListFacilities(raw: unknown): ToolResult {
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
  const label = facility_type.replace(/_/g, ' ');
  const scope = level !== undefined ? ` on ${LEVEL_NAMES[level] ?? `level ${level}`}` : '';
  const data = {
    facility_type,
    level: level ?? null,
    count: nodes.length,
    truncated: nodes.length > CAP,
    items,
  };
  const summary =
    nodes.length === 0
      ? `No ${label} found${scope}`
      : `${nodes.length} ${label}${nodes.length === 1 ? '' : 's'}${scope}`;
  return ok(data, summary);
}

function handleResolvePlace(raw: unknown): ToolResult {
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
  const summary =
    candidates.length === 0
      ? `No matches for "${query}"`
      : `${candidates.length} match${candidates.length === 1 ? '' : 'es'} for "${query}"`;
  return ok(data, summary);
}

function densityBand(d: number): string {
  if (d < 0.25) return 'quiet';
  if (d < 0.5) return 'moderate';
  if (d < 0.75) return 'busy';
  return 'packed';
}

function crowdView(level: {
  zone_id: string;
  density: number;
  wait_seconds: number;
  source: string;
  predictions?: Array<{ offset_minutes: number; density: number; confidence: number }> | undefined;
}, label?: string) {
  return {
    zone: label ?? level.zone_id,
    level: densityBand(level.density),
    density: level.density,
    wait: humanDuration(level.wait_seconds),
    simulated: level.source === 'sim' || level.source === 'injected',
    projection: (level.predictions ?? []).map((p) => ({
      in_minutes: p.offset_minutes,
      level: densityBand(p.density),
      confidence: p.confidence,
    })),
  };
}


const FindOutdoorRouteArgs = z.object({
  destinationName: z.string().optional(),
});

async function handleFindOutdoorRoute(raw: unknown, gpsContext?: { lat: number, lng: number }): Promise<ToolResult> {
  const parsed = FindOutdoorRouteArgs.safeParse(raw);
  if (!parsed.success) return fail(`Invalid find_outdoor_route arguments: ${zodMessage(parsed.error)}`);
  
  if (!gpsContext) {
    return fail('Could not find your location. Please ensure location services are enabled.', 'No GPS context');
  }

  const destLat = 40.8128;
  const destLng = -74.0742;

  try {
    const res = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': process.env.GOOGLE_ROUTES_API_KEY || 'AIzaSyA2OpxWOrsXFAfLOXxuYNbqyngXHBbuimw',
        'X-Goog-FieldMask': 'routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline',
      },
      body: JSON.stringify({
        origin: { location: { latLng: { latitude: gpsContext.lat, longitude: gpsContext.lng } } },
        destination: { location: { latLng: { latitude: destLat, longitude: destLng } } },
        travelMode: 'DRIVE'
      })
    });

    if (!res.ok) {
      throw new Error(`Google API returned ${res.status}`);
    }

    const data = await res.json() as any;
    if (!data.routes || data.routes.length === 0) {
      return fail('No route found to the stadium.', 'No route found');
    }

    const route = data.routes[0];
    const durationMins = Math.round(parseInt(route.duration.replace('s', '')) / 60);
    const distanceMiles = (route.distanceMeters * 0.000621371).toFixed(1);

    return ok({
      duration: `${durationMins} minutes`,
      distance: `${distanceMiles} miles`,
      polyline: route.polyline.encodedPolyline
    }, `Driving route to MetLife Stadium: ${durationMins} min (${distanceMiles} mi)`);

  } catch (error) {
    return fail(`Failed to compute route: ${(error as Error).message}`, 'Route computation failed');
  }
}
function handleGetCrowd(raw: unknown): ToolResult {
  const parsed = GetCrowdArgs.safeParse(raw);
  if (!parsed.success) return fail(`Invalid get_crowd arguments: ${zodMessage(parsed.error)}`);
  const { place } = parsed.data;
  const sim = getCrowdSimulator();

  // No place → summarise the busiest zones right now.
  if (!place) {
    const zones = [...sim.getZones()];
    const byId = new Map(zones.map((z) => [z.id, z.label]));
    const top = sim
      .getHeatmap()
      .zones.slice()
      .sort((a, b) => b.density - a.density)
      .slice(0, 5)
      .map((z) => crowdView(z, byId.get(z.zone_id)));
    return ok(
      { phase: sim.phase(), busiest: top },
      `Busiest now: ${top[0]?.zone ?? 'n/a'} (${top[0]?.level ?? '—'})`,
    );
  }

  // Resolve the place to a node → its zone.
  const node = findNodeByLabel(place);
  let level = node ? sim.getZoneForNode(node.id) : undefined;
  let label: string | undefined;

  if (level) {
    label = sim.getZones().find((z) => z.id === level!.zone_id)?.label;
  } else {
    // Fall back to a zone whose label loosely matches the query.
    const q = place.toLowerCase();
    const zone = sim.getZones().find((z) => z.label.toLowerCase().includes(q));
    if (zone) {
      level = sim.getZone(zone.id);
      label = zone.label;
    }
  }

  if (!level) {
    return fail(
      `Could not find crowd data for "${place}".`,
      `No crowd data for "${place}"`,
    );
  }

  const view = crowdView(level, label);
  return ok({ phase: sim.phase(), ...view }, `${view.zone}: ${view.level} (wait ${view.wait})`);
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

/**
 * Execute a tool call by name. `args` is the JSON-parsed arguments object the
 * model emitted (ToolCall.arguments after JSON.parse). Never throws: unknown
 * tools, bad args, and downstream failures all resolve to `{ ok: false }`.
 */
export async function handleToolCall(name: string, args: unknown, gpsContext?: { lat: number; lng: number }): Promise<ToolResult> {
  try {
    switch (name) {
      case 'find_route':
        return handleFindRoute(args);
      case 'find_nearest':
        return handleFindNearest(args);
      case 'get_venue_info':
        return handleGetVenueInfo(args);
      case 'list_facilities':
        return handleListFacilities(args);
      case 'resolve_place':
        return handleResolvePlace(args);
      case 'find_outdoor_route':
        return handleFindOutdoorRoute(args, gpsContext);
      case 'get_crowd':
        return handleGetCrowd(args);
      default:
        return fail(`Unknown tool: ${name}`, `Unknown tool: ${name}`);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return fail(`Tool "${name}" failed: ${message}`, `Tool "${name}" failed`);
  }
}
