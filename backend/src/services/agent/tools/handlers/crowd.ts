import { z } from 'zod';
import { findNodeByLabel } from '../../../graph/loader.js';
import { getCrowdSimulator } from '../../../crowd/simulator.js';
import { fail, ok, zodMessage, humanDuration } from '../formatters.js';
import type { ToolResult } from '../index.js';

const GetCrowdArgs = z.object({
  place: z.string().min(1).optional(),
});

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

export function handleGetCrowd(raw: unknown): ToolResult {
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