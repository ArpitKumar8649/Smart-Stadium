import { describe, it, expect } from 'vitest';
import { recommendMode } from './transit_tools/scorer.js';
import { estimateCarbonForOptions, EMISSION_FACTORS } from '../transit/carbon.js';
import type { CarbonAttachedOption } from '../transit/carbon.js';
import type { TransitMode } from '@concourse/shared';

// A representative slate: driving is fastest but dirty, transit is close on time
// and much cleaner, walking is greenest but far too slow.
function slate(): CarbonAttachedOption[] {
  return [
    { mode: 'DRIVE', duration_seconds: 25 * 60, co2_grams: 3400 },
    { mode: 'TWO_WHEELER', duration_seconds: 24 * 60, co2_grams: 2060 },
    { mode: 'TRANSIT', duration_seconds: 32 * 60, co2_grams: 820 },
    { mode: 'BICYCLE', duration_seconds: 90 * 60, co2_grams: 0 },
    { mode: 'WALK', duration_seconds: 240 * 60, co2_grams: 0 },
  ];
}

describe('recommendMode', () => {
  it('always names the true fastest and greenest', () => {
    const rec = recommendMode(slate(), 'balanced');
    expect(rec.fastest_mode).toBe<TransitMode>('TWO_WHEELER');
    // BICYCLE and WALK tie at 0g; scorer must pick a stable one, either is fine.
    expect(['BICYCLE', 'WALK']).toContain(rec.greenest_mode);
  });

  it("priority 'time' picks the fastest", () => {
    const rec = recommendMode(slate(), 'time');
    expect(rec.recommended_mode).toBe<TransitMode>('TWO_WHEELER');
    expect(rec.time_cost_vs_fastest_seconds).toBe(0);
  });

  it("priority 'carbon' picks a zero-carbon mode", () => {
    const rec = recommendMode(slate(), 'carbon');
    expect(['BICYCLE', 'WALK']).toContain(rec.recommended_mode);
  });

  it("priority 'balanced' avoids both extremes on this slate", () => {
    // Balanced score: normalised (t, c) ∈ [0,1] on the option set, 50/50 weight.
    // Driving is fastest but max carbon; walking is zero carbon but max time.
    // Transit sits near the Pareto knee — that's what balanced should pick.
    const rec = recommendMode(slate(), 'balanced');
    expect(rec.recommended_mode).toBe<TransitMode>('TRANSIT');
  });

  it('reports co2 saved vs driving as a positive number for cleaner options', () => {
    const rec = recommendMode(slate(), 'balanced');
    expect(rec.co2_saved_vs_drive_grams).toBeGreaterThan(0);
  });

  it("time_cost is 0 when priority is 'time'", () => {
    const rec = recommendMode(slate(), 'time');
    expect(rec.time_cost_vs_fastest_seconds).toBe(0);
  });

  it('throws when called with no options', () => {
    expect(() => recommendMode([], 'balanced')).toThrow(/no options/);
  });

  it('degenerates gracefully with a single option', () => {
    const single: CarbonAttachedOption[] = [{ mode: 'DRIVE', duration_seconds: 1200, co2_grams: 3000 }];
    const rec = recommendMode(single, 'balanced');
    expect(rec.recommended_mode).toBe<TransitMode>('DRIVE');
    expect(rec.fastest_mode).toBe<TransitMode>('DRIVE');
    expect(rec.greenest_mode).toBe<TransitMode>('DRIVE');
    expect(rec.co2_saved_vs_drive_grams).toBe(0);
  });
});

describe('estimateCarbonForOptions', () => {
  it('produces g CO2 = distance_km × emission_factor for driving', async () => {
    const est = await estimateCarbonForOptions([
      { mode: 'DRIVE', distance_meters: 20_000, duration_seconds: 1500 },
    ]);
    expect(est[0]?.co2_grams).toBe(Math.round(20 * EMISSION_FACTORS.DRIVE.g_per_km));
    expect(est[0]?.emission_factor_g_per_km).toBe(EMISSION_FACTORS.DRIVE.g_per_km);
    expect(est[0]?.carbon_source).toBe('emissions_factor_table');
  });

  it('reports zero CO2 for walking and cycling', async () => {
    const est = await estimateCarbonForOptions([
      { mode: 'WALK', distance_meters: 5000, duration_seconds: 3600 },
      { mode: 'BICYCLE', distance_meters: 15_000, duration_seconds: 3000 },
    ]);
    expect(est[0]?.co2_grams).toBe(0);
    expect(est[1]?.co2_grams).toBe(0);
  });

  it('preserves input order in output', async () => {
    const est = await estimateCarbonForOptions([
      { mode: 'TRANSIT', distance_meters: 10_000, duration_seconds: 1800 },
      { mode: 'DRIVE', distance_meters: 10_000, duration_seconds: 1500 },
    ]);
    expect(est).toHaveLength(2);
    // DRIVE factor > TRANSIT factor, so the second option must have more CO2.
    expect(est[1]?.co2_grams).toBeGreaterThan(est[0]?.co2_grams ?? 0);
  });

  it("driving emits significantly more per km than public transit", () => {
    expect(EMISSION_FACTORS.DRIVE.g_per_km).toBeGreaterThan(EMISSION_FACTORS.TRANSIT.g_per_km * 2);
  });
});
