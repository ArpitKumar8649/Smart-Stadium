/**
 * Crowd simulator.
 *
 * There are no real sensors — so we model crowd density honestly and label it
 * as simulated (ADR 0005). Every reading carries `source: "sim"` (or "injected"
 * for an admin override), and each ships forward-looking T+15 / T+30 projections
 * sampled from the same phase curve that produced the current value (ADR 0008).
 *
 * Zones are derived from the REAL venue graph: nodes are grouped by
 * (level × kind) — e.g. "Level 1 restrooms", "200 Concourse food". The density
 * of a zone follows a continuous matchday curve (arrival ramp → first half →
 * halftime surge → second half → egress) keyed off a match clock the demo/admin
 * can advance or pin.
 */

import {
  VENUE_ID,
  CROWD_SIM_TICK_MS,
  type CrowdLevel,
  type CrowdPrediction,
  type CrowdHeatmap,
  type Node,
} from '@concourse/shared';
import { getGraph } from '../graph/loader.js';
import { logger } from '../../middleware/logger.js';

export type ZoneKind = 'gates' | 'concourse' | 'restrooms' | 'food' | 'seating';
export type MatchPhase =
  | 'pre_match'
  | 'first_half'
  | 'halftime'
  | 'second_half'
  | 'post_match';

export interface Zone {
  id: string;
  label: string;
  level: number;
  kind: ZoneKind;
  nodeIds: string[];
  centroid: [number, number];
}

const LEVEL_NAMES: Record<number, string> = {
  0: 'Plaza',
  1: '100 Concourse',
  2: 'Suite Level 3',
  3: '200 Concourse',
  4: 'Suite Level 5',
  5: 'Suite Level 6',
  6: '300 Concourse',
  7: 'Upper Concourse',
};

const KIND_LABEL: Record<ZoneKind, string> = {
  gates: 'gates',
  concourse: 'concourse',
  restrooms: 'restrooms',
  food: 'food & drink',
  seating: 'seating',
};

function kindOf(type: Node['type']): ZoneKind {
  switch (type) {
    case 'entry_gate':
    case 'security_check':
    case 'exit':
      return 'gates';
    case 'restroom':
      return 'restrooms';
    case 'concession':
    case 'merchandise':
      return 'food';
    case 'seating_section':
      return 'seating';
    default:
      return 'concourse';
  }
}

/** Peak wait (seconds) at density 1.0, by zone kind. Wait scales with density². */
const MAX_WAIT: Record<ZoneKind, number> = {
  restrooms: 300,
  food: 420,
  gates: 480,
  concourse: 60,
  seating: 0,
};

/**
 * Density keyframes per zone kind, as [matchMinute, density] pairs. Minute 0 is
 * kickoff; negative is pre-match. Linear interpolation between keyframes gives a
 * smooth, believable curve. Halftime is 45–60.
 */
const KEYFRAMES: Record<ZoneKind, Array<[number, number]>> = {
  gates: [
    [-120, 0.25], [-90, 0.7], [-40, 0.88], [-10, 0.55], [0, 0.18],
    [45, 0.1], [60, 0.14], [105, 0.2], [110, 0.92], [140, 0.6], [180, 0.15],
  ],
  concourse: [
    [-120, 0.2], [-60, 0.55], [-10, 0.7], [0, 0.35], [45, 0.2],
    [46, 0.85], [58, 0.8], [60, 0.35], [105, 0.25], [110, 0.85], [150, 0.4], [180, 0.15],
  ],
  restrooms: [
    [-120, 0.2], [-30, 0.55], [-5, 0.45], [0, 0.3], [44, 0.25],
    [46, 0.9], [55, 0.98], [60, 0.45], [104, 0.35], [106, 0.85], [120, 0.5], [180, 0.2],
  ],
  food: [
    [-120, 0.25], [-40, 0.65], [-10, 0.6], [0, 0.35], [44, 0.3],
    [46, 0.88], [56, 0.9], [60, 0.4], [105, 0.25], [140, 0.2], [180, 0.15],
  ],
  seating: [
    [-120, 0.1], [-30, 0.4], [-5, 0.75], [0, 0.92], [44, 0.95],
    [46, 0.35], [58, 0.4], [60, 0.9], [105, 0.9], [107, 0.4], [130, 0.15], [180, 0.05],
  ],
};

function lerpDensity(kind: ZoneKind, minute: number): number {
  const kf = KEYFRAMES[kind];
  const first = kf[0]!;
  const last = kf.at(-1)!;
  if (minute <= first[0]) return first[1];
  if (minute >= last[0]) return last[1];
  for (let i = 0; i < kf.length - 1; i++) {
    const a = kf[i]!;
    const b = kf[i + 1]!;
    if (minute >= a[0] && minute <= b[0]) {
      const t = (minute - a[0]) / (b[0] - a[0]);
      return a[1] + t * (b[1] - a[1]);
    }
  }
  return last[1];
}

/** Small deterministic per-zone wobble so sibling zones differ and evolve. */
function wobble(zoneId: string, minute: number): number {
  let h = 0;
  for (let i = 0; i < zoneId.length; i++) {
    h = (h * 31 + (zoneId.codePointAt(i) ?? 0)) % 1000;
  }
  return 0.05 * Math.sin(h + minute / 6);
}

function clamp01(n: number): number {
  return Math.min(Math.max(n, 0), 1);
}

function phaseFor(minute: number): MatchPhase {
  if (minute < 0) return 'pre_match';
  if (minute < 45) return 'first_half';
  if (minute < 60) return 'halftime';
  if (minute < 105) return 'second_half';
  return 'post_match';
}

interface Override {
  density: number;
  waitSeconds: number;
  expiresAt: number;
  source: 'injected';
}

export class CrowdSimulator {
  private readonly zones: Zone[];
  private readonly zoneById = new Map<string, Zone>();
  private readonly nodeToZone = new Map<string, string>();
  private readonly overrides = new Map<string, Override>();

  // Match clock: simMinute advances in real time from an anchor. Demo/admin can
  // re-anchor (jump to a phase) or change speed.
  private anchorMs = Date.now();
  private startMinute = 40; // opens the demo just before the halftime surge
  private speed = 1;

  private timer: NodeJS.Timeout | undefined;
  private snapshot: Map<string, CrowdLevel> = new Map();

  constructor() {
    this.zones = deriveZones();
    for (const z of this.zones) {
      this.zoneById.set(z.id, z);
      for (const nid of z.nodeIds) this.nodeToZone.set(nid, z.id);
    }
    this.recompute();
    logger.info({ zones: this.zones.length }, 'crowd simulator ready');
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.recompute(), CROWD_SIM_TICK_MS);
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  getSimMinute(): number {
    return this.startMinute + ((Date.now() - this.anchorMs) / 60_000) * this.speed;
  }

  /** Jump the simulated match clock to a specific minute (demo/admin control). */
  setSimMinute(minute: number): void {
    this.startMinute = minute;
    this.anchorMs = Date.now();
    this.recompute();
  }

  setSpeed(speed: number): void {
    this.startMinute = this.getSimMinute();
    this.anchorMs = Date.now();
    this.speed = speed;
  }

  phase(): MatchPhase {
    return phaseFor(this.getSimMinute());
  }

  getZones(): Zone[] {
    return this.zones;
  }

  getHeatmap(): CrowdHeatmap {
    return {
      venue_id: VENUE_ID,
      zones: [...this.snapshot.values()],
      generated_at: new Date().toISOString(),
    };
  }

  getZone(zoneId: string): CrowdLevel | undefined {
    return this.snapshot.get(zoneId);
  }

  getZoneForNode(nodeId: string): CrowdLevel | undefined {
    const zid = this.nodeToZone.get(nodeId);
    return zid ? this.snapshot.get(zid) : undefined;
  }

  /** Extra seconds A* should add for entering a node, from its zone density. */
  crowdPenaltyForNode(nodeId: string): number {
    const level = this.getZoneForNode(nodeId);
    if (!level) return 0;
    // A packed zone adds up to ~150s of avoidance cost; quadratic so only real
    // congestion bites.
    return level.density * level.density * 150;
  }

  /** Admin override: pin a zone's density for a TTL (source "injected"). */
  override(zoneId: string, density: number, waitSeconds: number, ttlSeconds: number): boolean {
    if (!this.zoneById.has(zoneId)) return false;
    this.overrides.set(zoneId, {
      density: clamp01(density),
      waitSeconds: Math.max(0, waitSeconds),
      expiresAt: Date.now() + ttlSeconds * 1000,
      source: 'injected',
    });
    this.recompute();
    return true;
  }

  clearOverride(zoneId: string): void {
    this.overrides.delete(zoneId);
    this.recompute();
  }

  /** Recompute every zone's current density + T+15/T+30 projections. */
  private recompute(): void {
    const minute = this.getSimMinute();
    const now = new Date().toISOString();
    const nowMs = Date.now();
    const next = new Map<string, CrowdLevel>();

    for (const z of this.zones) {
      const ov = this.overrides.get(z.id);
      if (ov && ov.expiresAt > nowMs) {
        next.set(z.id, {
          venue_id: VENUE_ID,
          zone_id: z.id,
          density: ov.density,
          wait_seconds: ov.waitSeconds,
          updated_at: now,
          source: 'injected',
        });
        continue;
      }
      if (ov) this.overrides.delete(z.id); // expired

      const density = clamp01(lerpDensity(z.kind, minute) + wobble(z.id, minute));
      const waitSeconds = Math.round(density * density * MAX_WAIT[z.kind]);
      const predictions = this.project(z.kind, z.id, minute);

      next.set(z.id, {
        venue_id: VENUE_ID,
        zone_id: z.id,
        density: round2(density),
        wait_seconds: waitSeconds,
        updated_at: now,
        source: 'sim',
        predictions,
      });
    }
    this.snapshot = next;
  }

  private project(kind: ZoneKind, zoneId: string, minute: number): CrowdPrediction[] {
    return [15, 30].map((offset) => {
      const m = minute + offset;
      const density = clamp01(lerpDensity(kind, m) + wobble(zoneId, m));
      const slopePerMin = Math.abs(
        lerpDensity(kind, m) - lerpDensity(kind, m - 1),
      );
      const confidence = clampRange(1 - slopePerMin * 8, 0.45, 0.97);
      return {
        offset_minutes: offset,
        density: round2(density),
        wait_seconds: Math.round(density * density * MAX_WAIT[kind]),
        confidence: round2(confidence),
      };
    });
  }
}

function deriveZones(): Zone[] {
  const graph = getGraph();
  const groups = new Map<string, { level: number; kind: ZoneKind; nodes: Node[] }>();
  for (const node of graph.allNodes) {
    const kind = kindOf(node.type);
    const id = `l${node.level}-${kind}`;
    let g = groups.get(id);
    if (!g) {
      g = { level: node.level, kind, nodes: [] };
      groups.set(id, g);
    }
    g.nodes.push(node);
  }
  const zones: Zone[] = [];
  for (const [id, g] of groups) {
    let lng = 0;
    let lat = 0;
    for (const n of g.nodes) {
      lng += n.coords[0];
      lat += n.coords[1];
    }
    const count = g.nodes.length || 1;
    zones.push({
      id,
      label: `${LEVEL_NAMES[g.level] ?? 'Level ' + g.level} ${KIND_LABEL[g.kind]}`,
      level: g.level,
      kind: g.kind,
      nodeIds: g.nodes.map((n) => n.id),
      centroid: [lng / count, lat / count],
    });
  }
  // Stable, human-friendly order: by level then kind.
  const kindOrder: ZoneKind[] = ['gates', 'concourse', 'restrooms', 'food', 'seating'];
  zones.sort((a, b) => a.level - b.level || kindOrder.indexOf(a.kind) - kindOrder.indexOf(b.kind));
  return zones;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
function clampRange(n: number, lo: number, hi: number): number {
  return Math.min(Math.max(n, lo), hi);
}

let singleton: CrowdSimulator | undefined;
export function getCrowdSimulator(): CrowdSimulator {
  singleton ??= new CrowdSimulator();
  return singleton;
}
