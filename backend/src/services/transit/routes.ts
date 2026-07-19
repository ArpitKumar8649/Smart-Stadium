/**
 * Google Routes helper — the single seam between Concourse and the Google
 * Routes v2 `computeRoutes` API. Used by both the concierge's
 * `find_outdoor_route` tool and the Transit Agent.
 *
 * Never throws. Missing modes resolve to null and the caller filters them out
 * so a single unsupported mode never poisons the whole plan.
 */

import { env } from '../../config/env.js';

export const OUTDOOR_MODES = [
  { mode: 'DRIVE', label: 'Driving' },
  { mode: 'TWO_WHEELER', label: 'Two-wheeler' },
  { mode: 'TRANSIT', label: 'Public transit' },
  { mode: 'BICYCLE', label: 'Cycling' },
  { mode: 'WALK', label: 'Walking' },
] as const;
export type OutdoorMode = (typeof OUTDOOR_MODES)[number];
export type OutdoorModeCode = OutdoorMode['mode'];

export const METLIFE_LATLNG = { latitude: 40.8128, longitude: -74.0742 };

export interface OutdoorModeResult {
  mode: OutdoorModeCode;
  label: string;
  distance_meters: number;
  duration_seconds: number;
  polyline: string;
}

/** Query Google Routes for a single travel mode. Never throws; null = no route. */
export async function computeOutdoorMode(
  origin: { lat: number; lng: number },
  entry: OutdoorMode,
): Promise<OutdoorModeResult | null> {
  if (!env.GOOGLE_ROUTES_API_KEY) return null;
  try {
    const response = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': env.GOOGLE_ROUTES_API_KEY,
        'X-Goog-FieldMask': 'routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline',
      },
      body: JSON.stringify({
        origin: { location: { latLng: { latitude: origin.lat, longitude: origin.lng } } },
        destination: { location: { latLng: METLIFE_LATLNG } },
        travelMode: entry.mode,
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) return null;
    const data = (await response.json()) as {
      routes?: { distanceMeters?: number; duration?: string; polyline?: { encodedPolyline?: string } }[];
    };
    const route = data.routes?.[0];
    if (!route || typeof route.distanceMeters !== 'number' || !route.duration) return null;

    return {
      mode: entry.mode,
      label: entry.label,
      distance_meters: route.distanceMeters,
      duration_seconds: Number.parseInt(route.duration, 10),
      polyline: route.polyline?.encodedPolyline ?? '',
    };
  } catch {
    return null;
  }
}

/** Query every configured mode in parallel. Returns only the modes that succeeded. */
export async function planGroundRoutes(origin: { lat: number; lng: number }): Promise<OutdoorModeResult[]> {
  const settled = await Promise.all(OUTDOOR_MODES.map((entry) => computeOutdoorMode(origin, entry)));
  return settled.filter((r): r is OutdoorModeResult => r !== null);
}

export function formatKm(meters: number): string {
  if (meters >= 1000) {
    return `${(meters / 1000).toFixed(meters >= 10000 ? 0 : 1)} km`;
  }
  return `${Math.round(meters)} m`;
}

export function formatDuration(seconds: number): string {
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}
