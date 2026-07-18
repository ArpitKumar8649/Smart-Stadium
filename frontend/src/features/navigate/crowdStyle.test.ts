import { describe, expect, it } from 'vitest';
import { densityColor, densityLabel, zoneForecast } from './crowdStyle.ts';
import type { CrowdMapZone } from '@concourse/shared';

const zone = (density: number, predictions: CrowdMapZone['predictions'] = []): CrowdMapZone => ({
  zone_id: 'z1',
  label: 'Gate A',
  level: 1,
  kind: 'gates',
  centroid: [-74.07, 40.81],
  density,
  wait_seconds: 30,
  source: 'sim',
  updated_at: '2026-07-18T00:00:00.000Z',
  predictions,
});

describe('crowdStyle', () => {
  it('maps density thresholds to accessible labels and colors', () => {
    expect(densityLabel(0.1)).toBe('Quiet');
    expect(densityLabel(0.2)).toBe('Light');
    expect(densityLabel(0.4)).toBe('Moderate');
    expect(densityLabel(0.6)).toBe('Busy');
    expect(densityLabel(0.8)).toBe('Packed');

    expect(densityColor(0.1)).toBe('#5B6672');
    expect(densityColor(0.2)).toBe('#00B67A');
    expect(densityColor(0.4)).toBe('#FFC300');
    expect(densityColor(0.6)).toBe('#F97316');
    expect(densityColor(0.8)).toBe('#EF4444');
  });

  it('uses future predictions when present and falls back to current density', () => {
    const current = zone(0.35, [
      { offset_minutes: 15, density: 0.62, wait_seconds: 140, confidence: 0.8 },
      { offset_minutes: 30, density: 0.84, wait_seconds: 240, confidence: 0.7 },
    ]);

    expect(zoneForecast(current, 0)).toBe(0.35);
    expect(zoneForecast(current, 15)).toBe(0.62);
    expect(zoneForecast(current, 30)).toBe(0.84);
    expect(zoneForecast(zone(0.27), 30)).toBe(0.27);
  });
});
