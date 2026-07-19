import { z } from 'zod';
import type { ToolResult } from './index.js';
import type { RouteResponse, Node } from '@concourse/shared';

// Human names for the concourse levels, for get_venue_info.
export const LEVEL_NAMES: Readonly<Record<number, string>> = {
  0: 'Plaza & Outdoors',
  1: '100 Concourse',
  2: '200 Level',
  3: '300 Level',
  4: '400 Level',
  5: '500 Level',
  6: '600 Level',
  7: 'Upper Concourse',
};

/** Build a ToolResult without tripping exactOptionalPropertyTypes on absent fields. */
export function ok(data: unknown, summary: string): ToolResult {
  return { ok: true, data, summary };
}

export function fail(error: string, summary?: string): ToolResult {
  return { ok: false, error, summary: summary ?? error };
}

/** Flatten a Zod error into a short, single-line message. */
export function zodMessage(err: z.ZodError): string {
  return err.issues
    .map((i) => `${i.path.join('.') || 'args'}: ${i.message}`)
    .join('; ');
}

/** "2 min", "45 sec" — compact duration for chip summaries. */
export function humanDuration(totalSeconds: number): string {
  const secs = Math.round(totalSeconds);
  if (secs < 60) return `${secs} sec`;
  return `${Math.round(secs / 60)} min`;
}

/**
 * Collapse a RouteResponse into the compact, LLM-friendly payload described in
 * the module contract: resolved endpoints, totals, accessibility, ordered
 * instruction strings, and warnings. Node ids stay out — the model never needs them.
 */
export function compactRoute(
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
    steps: (r.steps || []).map((s) => s.instruction),
    warnings: r.warnings,
  };
}

/** Compact public view of a node (no ids/coords leaked to the model). */
export function facilityView(node: Node): Record<string, unknown> {
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
import { searchNodes, type GraphIndex as LoaderGraphIndex } from '../../graph/loader.js';

export function routerGraph(g: LoaderGraphIndex): { nodes: typeof g.nodeById; edgesFrom: typeof g.adjacency } {
  return { nodes: g.nodeById, edgesFrom: g.adjacency };
}

export function candidateLabels(query: string, n = 5): string[] {
  return searchNodes(query, n).map((node) => node.label);
}

export const FACILITY_TYPES = [
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
