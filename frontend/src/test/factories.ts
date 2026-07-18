import {
  NavigationRouteResponseSchema,
  type Alert,
  type Briefing,
  type NavigationRouteResponse,
  type CrowdMapZone,
} from '@concourse/shared';

export function makeRoutePoint(overrides: Partial<NavigationRouteResponse['points'][number]> = {}) {
  return {
    id: 'n-start',
    label: 'Section 144',
    level: 1,
    zone: 'l1-concourse',
    coords: [-74.074, 40.813] as [number, number],
    order: 0,
    ...overrides,
  };
}

export function makeNavigationRouteResponse(
  overrides: Partial<NavigationRouteResponse> = {},
): NavigationRouteResponse {
  const response = {
    mode: 'low_crowd',
    total_distance_m: 260,
    total_seconds: 320,
    step_free: true,
    wheelchair_accessible: true,
    crowd_penalty: 12,
    steps: [
      {
        from_node_id: 'n-start',
        to_node_id: 'n-end',
        distance_m: 260,
        seconds: 320,
        instruction: 'Walk toward Section 108.',
      },
    ],
    path: ['n-start', 'n-end'],
    warnings: [],
    from: { label: 'Section 144', level: 1 },
    to: { label: 'Section 108', level: 1 },
    points: [
      makeRoutePoint(),
      makeRoutePoint({ id: 'n-end', label: 'Section 108', coords: [-74.072, 40.815], order: 1 }),
    ],
    ...overrides,
  } satisfies NavigationRouteResponse;

  return NavigationRouteResponseSchema.parse(response);
}

export function makeCrowdZone(overrides: Partial<CrowdMapZone> = {}): CrowdMapZone {
  return {
    zone_id: 'l1-concourse',
    label: '100 Concourse',
    level: 1,
    kind: 'concourse',
    centroid: [-74.073, 40.814],
    density: 0.64,
    wait_seconds: 120,
    source: 'sim',
    updated_at: '2026-07-18T00:00:00.000Z',
    predictions: [
      { offset_minutes: 15, density: 0.72, wait_seconds: 160, confidence: 0.82 },
      { offset_minutes: 30, density: 0.86, wait_seconds: 260, confidence: 0.72 },
    ],
    ...overrides,
  };
}

export function makeCrowdHeatmapResponse(overrides: { zones?: CrowdMapZone[]; phase?: string; sim_minute?: number } = {}) {
  return {
    venue_id: 'metlife',
    generated_at: '2026-07-18T00:00:00.000Z',
    phase: overrides.phase ?? 'halftime',
    sim_minute: overrides.sim_minute ?? 40,
    zones: overrides.zones ?? [makeCrowdZone()],
  };
}

export function makeAlert(overrides: Partial<Alert> = {}): Alert {
  return {
    id: 'alert-1',
    kind: 'facility_closure',
    severity: 'warn',
    title: '100 Concourse route advisory',
    body: 'A simulated advisory affects the current concourse path.',
    emitted_at: '2026-07-18T00:00:00.000Z',
    affected_node_id: 'n-start',
    affected_zone_id: 'l1-concourse',
    ...overrides,
  };
}

export function makeBriefing(overrides: Partial<Briefing> = {}): Briefing {
  return {
    id: 'briefing-1',
    venue_id: 'metlife',
    generated_at: '2026-07-18T00:00:00.000Z',
    window_start: '2026-07-18T00:00:00.000Z',
    window_end: '2026-07-18T00:05:00.000Z',
    occupancy_pct: 78,
    headline: 'Halftime crowd pressure rising',
    summary: 'Food and restroom zones are getting busy.',
    concerns: [
      { zone_id: 'l1-concourse', concern: 'Queue pressure near the 100 Concourse.', severity: 'warn' },
    ],
    recommendations: [
      { action: 'Open extra restroom signage.', reversible: true, affected_zone_id: 'l1-concourse' },
    ],
    top_fan_questions: ['Where is the nearest restroom?'],
    model: 'test-model',
    lang: 'en',
    ...overrides,
  };
}

export function makeFloorGeoJson(level = 1) {
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: {
          id: `floor-${level}`,
          elevation: level,
          name: `Level ${level}`,
          shortName: `L${level}`,
        },
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [-74.08, 40.81],
              [-74.07, 40.81],
              [-74.07, 40.82],
              [-74.08, 40.82],
              [-74.08, 40.81],
            ],
          ],
        },
      },
    ],
  };
}

export function sseFrame(data: unknown): string {
  return `data: ${typeof data === 'string' ? data : JSON.stringify(data)}\n\n`;
}
