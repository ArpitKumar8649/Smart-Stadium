import { describe, expect, it } from 'vitest';
import type { Edge, Node, VenueGraph } from '@concourse/shared';
import { buildGraphIndex, route } from './astar.js';

/**
 * Hand-built mini venue used to exercise every routing mode deterministically.
 *
 * Layout (level in parens):
 *   A(1) ──10s── B(1) ──stairs 18s── C(2) ── goal
 *                 │                    │
 *          elevator 45s          horiz 5s
 *                 ▼                    │
 *                D(2) ──── 5s ─────────┘
 *
 * Fastest B→C is the stairs (18s). Step-free must detour B→D→C (45+5=50s).
 * Z(1) is isolated — used for the no-path case.
 */
function node(id: string, level: number, lng: number, lat: number, acc: string[] = []): Node {
  return {
    id,
    type: 'concourse_segment',
    label: id,
    level,
    coords: [lng, lat],
    accessibility: acc as Node['accessibility'],
  };
}

function edge(from: string, to: string, seconds: number, stepFree: boolean): Edge {
  return {
    from,
    to,
    distance_m: seconds * 1.2,
    avg_walk_seconds: seconds,
    indoor: true,
    step_free: stepFree,
    wheelchair_accessible: stepFree,
    capacity_class: 'normal',
    bidirectional: false,
    ...(stepFree ? {} : { notes: 'stairs: Stairs 1' }),
  };
}

function bidir(from: string, to: string, seconds: number, stepFree: boolean): Edge[] {
  return [edge(from, to, seconds, stepFree), edge(to, from, seconds, stepFree)];
}

function miniGraph(): VenueGraph {
  const nodes: Node[] = [
    node('A', 1, 0, 0),
    node('B', 1, 0.0001, 0),
    node('C', 2, 0.0002, 0),
    node('D', 2, 0.0001, 0.0001),
    node('Z', 1, 1, 1), // isolated
  ];
  const edges: Edge[] = [
    ...bidir('A', 'B', 10, true),
    ...bidir('B', 'C', 18, false), // stairs
    ...bidir('B', 'D', 45, true), // elevator
    ...bidir('D', 'C', 5, true),
  ];
  return { venue_id: 'test', version: '0', generated_at: '2026-01-01T00:00:00Z', nodes, edges };
}

/** A stairs-only version: the only way B→C is the stairs (no elevator). */
function stairsOnlyGraph(): VenueGraph {
  const g = miniGraph();
  return { ...g, edges: g.edges.filter((e) => !(e.from === 'B' && e.to === 'D') && !(e.from === 'D' && e.to === 'B') && !(e.from === 'D' && e.to === 'C') && !(e.from === 'C' && e.to === 'D')) };
}

describe('A* router', () => {
  it('fastest mode takes the stairs (shorter)', () => {
    const idx = buildGraphIndex(miniGraph());
    const r = route(idx, 'A', 'C', 'fastest');
    expect(r).not.toBeNull();
    expect(r!.path).toEqual(['A', 'B', 'C']);
    expect(r!.total_seconds).toBe(28); // 10 + 18
    expect(r!.step_free).toBe(false);
  });

  it('step_free mode detours via the elevator (longer, no stairs)', () => {
    const idx = buildGraphIndex(miniGraph());
    const r = route(idx, 'A', 'C', 'step_free');
    expect(r).not.toBeNull();
    expect(r!.path).toEqual(['A', 'B', 'D', 'C']);
    expect(r!.total_seconds).toBe(60); // 10 + 45 + 5
    expect(r!.step_free).toBe(true);
    expect(r!.wheelchair_accessible).toBe(true);
    expect(r!.warnings).toHaveLength(0);
  });

  it('returns null when no path exists', () => {
    const idx = buildGraphIndex(miniGraph());
    expect(route(idx, 'A', 'Z', 'fastest')).toBeNull();
  });

  it('emits a warning when step_free is forced onto stairs', () => {
    const idx = buildGraphIndex(stairsOnlyGraph());
    const r = route(idx, 'A', 'C', 'step_free');
    expect(r).not.toBeNull();
    expect(r!.path).toEqual(['A', 'B', 'C']); // no alternative
    expect(r!.step_free).toBe(false);
    expect(r!.warnings).toContain('Step-free route unavailable; this path includes stairs.');
  });

  it('low_crowd mode steers around a congested node via crowdPenalty', () => {
    const idx = buildGraphIndex(miniGraph());
    // Make node C hugely congested so entering it directly is penalized; the
    // detour through D still reaches C but the penalty is attributed on arrival.
    const penalty = (id: string) => (id === 'B' ? 500 : 0);
    const r = route(idx, 'A', 'C', 'low_crowd', penalty);
    expect(r).not.toBeNull();
    // B is unavoidable here, so crowd_penalty should reflect the applied cost.
    expect(r!.crowd_penalty).toBeGreaterThan(0);
  });

  it('trivial route (same start and goal) is zero-cost', () => {
    const idx = buildGraphIndex(miniGraph());
    const r = route(idx, 'B', 'B', 'fastest');
    expect(r).not.toBeNull();
    expect(r!.total_seconds).toBe(0);
    expect(r!.steps).toHaveLength(0);
  });
});
