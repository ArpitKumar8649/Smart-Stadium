import { describe, expect, it } from 'vitest';
import { getCrowdSimulator } from './simulator.js';

/**
 * These assert the *shape* of the matchday curve, not exact densities (which
 * carry a small deterministic wobble). The curve is the demo centerpiece, so we
 * guard its qualitative behaviour: seating vs restrooms invert at halftime,
 * gates spike for egress, projections + override work.
 */
describe('crowd simulator', () => {
  const sim = getCrowdSimulator();

  const density = (endsWith: string): number => {
    const z = sim.getHeatmap().zones.find((zone) => zone.zone_id.endsWith(endsWith));
    return z?.density ?? -1;
  };

  it('derives zones from the real graph', () => {
    expect(sim.getZones().length).toBeGreaterThan(20);
  });

  it('fills seating and empties concourse during the first half', () => {
    sim.setSimMinute(20);
    expect(sim.phase()).toBe('first_half');
    expect(density('seating')).toBeGreaterThan(0.7);
    expect(density('restrooms')).toBeLessThan(0.5);
  });

  it('surges restrooms and empties seating at halftime', () => {
    sim.setSimMinute(52);
    expect(sim.phase()).toBe('halftime');
    expect(density('restrooms')).toBeGreaterThan(0.8);
    expect(density('seating')).toBeLessThan(0.5);
  });

  it('spikes the gates for post-match egress', () => {
    sim.setSimMinute(115);
    expect(sim.phase()).toBe('post_match');
    expect(density('gates')).toBeGreaterThan(0.7);
  });

  it('emits two forward projections with confidence', () => {
    sim.setSimMinute(30);
    const zone = sim.getHeatmap().zones[0]!;
    expect(zone.predictions).toHaveLength(2);
    expect(zone.predictions![0]!.offset_minutes).toBe(15);
    expect(zone.predictions![1]!.offset_minutes).toBe(30);
    for (const p of zone.predictions!) {
      expect(p.confidence).toBeGreaterThan(0);
      expect(p.confidence).toBeLessThanOrEqual(1);
    }
  });

  it('applies and expires an admin override', () => {
    const zoneId = sim.getZones()[0]!.id;
    expect(sim.override(zoneId, 0.97, 300, 60)).toBe(true);
    const z = sim.getZone(zoneId)!;
    expect(z.density).toBe(0.97);
    expect(z.source).toBe('injected');
    sim.clearOverride(zoneId);
    expect(sim.getZone(zoneId)!.source).toBe('sim');
  });

  it('produces a non-zero crowd penalty for a node in a busy zone', () => {
    sim.setSimMinute(52); // halftime — restrooms packed
    const restroomZone = sim.getZones().find((z) => z.kind === 'restrooms');
    const nodeId = restroomZone?.nodeIds[0];
    expect(nodeId).toBeDefined();
    expect(sim.crowdPenaltyForNode(nodeId!)).toBeGreaterThan(0);
  });
});
