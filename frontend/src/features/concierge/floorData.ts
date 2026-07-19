import { Cartesian3, PolygonHierarchy, Color } from 'cesium';
import { NavigationRouteResponseSchema, type NavigationRouteResponse } from '@concourse/shared';
import type { Feature, FeatureCollection, Geometry, Polygon, MultiPolygon } from 'geojson';
import { getCachedRoute, saveRouteToCache } from '../../lib/stadiumCache.ts';

// Empty locally (Vite proxies /api); Firebase builds set this to the public
// Azure Web App URL so 3D route requests reach the deployed backend.
const API_BASE = import.meta.env.VITE_API_BASE ?? '';

/**
 * Loads MetLife's real Mappedin floor + room geometry and converts it into
 * Cesium polygon hierarchies for 3D extrusion. The data is the same export the
 * 2D indoor map uses; here we stack the 8 building levels into a cutaway model.
 */

/** Metres of vertical space allotted to each stacked level in the 3D model.
 *  The source elevations are integer level indices (0–7), not surveyed metres,
 *  so this is an honest visualization constant, not measured data. */
export const FLOOR_HEIGHT_M = 9;

/** Slab thickness (leaves a visible gap between stacked levels). */
export const SLAB_THICKNESS_M = 6.5;

export interface FloorInfo {
  id: string;
  name: string;
  elevation: number;
  /** GeoJSON footprint geometry for the whole level. */
  geometry: Polygon | MultiPolygon;
}

export interface RoomShape {
  id: string;
  name: string;
  hierarchies: PolygonHierarchy[];
  /** [lng, lat] label/pin anchor from the source data, if present. */
  center: [number, number] | null;
}

interface FloorProps {
  id: string;
  name: string;
  elevation: number;
}

interface SpaceProps {
  id: string;
  externalId?: string;
  center?: [number, number];
  details?: { name?: string };
}

/** Convert a GeoJSON Polygon/MultiPolygon into one or more Cesium hierarchies
 *  (outer ring + holes), ready for `PolygonGraphics`. */
export function geometryToHierarchies(geometry: Geometry): PolygonHierarchy[] {
  const buildRing = (ring: number[][]): Cartesian3[] =>
    Cartesian3.fromDegreesArray((ring as [number, number][]).flatMap(([lng, lat]) => [lng, lat]));

  const buildPolygon = (rings: number[][][]): PolygonHierarchy => {
    const outer = buildRing(rings[0] ?? []);
    const holes = rings.slice(1).map((r) => new PolygonHierarchy(buildRing(r)));
    return new PolygonHierarchy(outer, holes);
  };

  if (geometry.type === 'Polygon') return [buildPolygon(geometry.coordinates)];
  if (geometry.type === 'MultiPolygon') return geometry.coordinates.map(buildPolygon);
  return [];
}

/** Fetch the 8 building levels (excludes the "Outdoors" map), sorted bottom-up. */
export async function loadFloors(signal?: AbortSignal): Promise<FloorInfo[]> {
  const res = await fetch('/stadium/floor.geojson', signal ? { signal } : {});
  if (!res.ok) throw new Error(`floor.geojson ${res.status}`);
  const fc = (await res.json()) as FeatureCollection;

  return fc.features
    .filter((f): f is Feature<Polygon | MultiPolygon, FloorProps> => {
      const p = f.properties as FloorProps | null;
      return (
        !!p &&
        !!f.geometry &&
        (f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon') &&
        !/outdoor/i.test(p.name ?? '')
      );
    })
    .map((f) => ({
      id: f.properties.id,
      name: f.properties.name.trim(),
      elevation: f.properties.elevation,
      geometry: f.geometry,
    }))
    .sort((a, b) => a.elevation - b.elevation);
}

/** Fetch one level's room polygons (lazy — only when that level is selected). */
export async function loadRooms(floorId: string, signal?: AbortSignal): Promise<RoomShape[]> {
  const res = await fetch(`/stadium/space/${floorId}.geojson`, signal ? { signal } : {});
  if (!res.ok) throw new Error(`space ${floorId} ${res.status}`);
  const fc = (await res.json()) as FeatureCollection;

  return fc.features
    .filter((f) => f.geometry && (f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon'))
    .map((f) => {
      const p = (f.properties ?? {}) as SpaceProps;
      const center = Array.isArray(p.center) && p.center.length === 2
        ? ([p.center[0], p.center[1]] as [number, number])
        : null;
      return {
        id: p.id ?? p.externalId ?? crypto.randomUUID(),
        name: p.details?.name ?? '',
        hierarchies: geometryToHierarchies(f.geometry as Geometry),
        center,
      };
    })
    .filter((r) => r.hierarchies.length > 0);
}

/** Base (floor) and top (ceiling) absolute heights, in metres, for a level index. */
export function floorHeights(elevation: number): { base: number; top: number } {
  const base = elevation * FLOOR_HEIGHT_M;
  return { base, top: base + SLAB_THICKNESS_M };
}

/** A cool light-grey ramp so stacked levels read as translucent glass strata —
 *  barely tinted blue→violet by height, kept desaturated and light so the slabs
 *  look like frosted glass rather than solid coloured blocks. */
export function floorColor(elevation: number, total: number, alpha: number): Color {
  const t = total > 1 ? elevation / (total - 1) : 0;
  // hue 210° (blue) → 265° (violet), very low saturation, high lightness = greyish.
  const hue = (210 + t * 55) / 360;
  return Color.fromHsl(hue, 0.12, 0.78, alpha);
}

/** Facility kinds we surface as 3D pins, matched from a room's name. */
export type FacilityKind = 'restroom' | 'first_aid' | 'concession' | 'gate' | 'elevator';

/** Classify a room by its real name → a facility kind (or null if it's not one). */
export function matchFacility(name: string): FacilityKind | null {
  const n = name.toLowerCase();
  if (!n) return null;
  if (/(restroom|washroom|toilet|bathroom|men'?s|women'?s|family room)/.test(n)) return 'restroom';
  if (/(first aid|medical|aid station|aed)/.test(n)) return 'first_aid';
  if (/(elevator|escalator|lift)/.test(n)) return 'elevator';
  if (/(gate|entrance|entry)/.test(n)) return 'gate';
  if (/(concession|food|bar|grill|kitchen|cafe|market|store|shop|beer)/.test(n)) return 'concession';
  return null;
}

/** Emoji + colour for each facility kind (for 3D pins). */
export const FACILITY_STYLE: Record<FacilityKind, { icon: string; color: string; label: string }> = {
  restroom: { icon: '🚻', color: '#38bdf8', label: 'Restroom' },
  first_aid: { icon: '➕', color: '#f87171', label: 'First aid' },
  concession: { icon: '🍔', color: '#fbbf24', label: 'Food & retail' },
  gate: { icon: '🚪', color: '#4ade80', label: 'Gate' },
  elevator: { icon: '🛗', color: '#c084fc', label: 'Elevator' },
};

/** A seating section — MetLife's 367 real bowl sections, each a highlightable
 *  polygon. `polygonId` matches a `RoomShape.id` on the section's floor, so the
 *  geometry comes from the same `loadRooms` data already fetched for that level. */
export interface SectionInfo {
  name: string;
  floorId: string;
  elevation: number;
  polygonId: string;
  center: [number, number];
}

/** Load the pre-built section index (name → floor, elevation, polygon, center). */
export async function loadSections(signal?: AbortSignal): Promise<SectionInfo[]> {
  const res = await fetch('/stadium/sections.json', signal ? { signal } : {});
  if (!res.ok) throw new Error(`sections.json ${res.status}`);
  return (await res.json()) as SectionInfo[];
}

/** Extract a seating-section or suite reference from free text — used to drive
 *  the 3D highlight from the concierge conversation. Matches "Section 128",
 *  "sec 320", "Suite 12", "Suite 3-30". Requires the keyword so a bare number
 *  never false-matches. Returns the searchable name the section index uses. */
export function parseSectionRef(text: string): string | null {
  // Suite first (e.g. "Suite 3-30", "suite 12") → index name "Suite 3-30".
  const suite = text.match(/\bsuite\s*#?\s*(\d{1,2}(?:-\d{1,2})?)\b/i);
  if (suite && suite[1]) return `Suite ${suite[1]}`;
  // Numeric section (e.g. "section 128", "sec 220a").
  const sec = text.match(/\bsec(?:tion)?\s*#?\s*([0-9]{1,3}[a-zA-Z]?)\b/i);
  return sec && sec[1] ? sec[1].toUpperCase() : null;
}

/** One point along an indoor route: [lng, lat] + which level it's on. */
export interface RoutePoint {
  coords: [number, number];
  level: number;
  label: string;
}

/** Ask the backend to route from a start label to a destination section, for
 *  drawing the walking path in 3D. Returns the ordered points (with levels) or
 *  null if no route exists. `from` defaults to a sensible public gate. */
export async function routeToSection(
  toLabel: string,
  fromLabel: string,
  stepFree: boolean,
  signal?: AbortSignal,
): Promise<RoutePoint[] | null> {
  const mode = stepFree ? 'step_free' : 'fastest';
  const cacheKey = { fromLabel, toLabel, mode };

  const parseRoute = (data: unknown): NavigationRouteResponse | null => {
    const parsed = NavigationRouteResponseSchema.safeParse(data);
    return parsed.success && parsed.data.points.length >= 2 ? parsed.data : null;
  };

  const asRoutePoints = (data: NavigationRouteResponse): RoutePoint[] =>
    data.points.map((point) => ({ coords: point.coords, level: point.level, label: point.label }));

  try {
    const res = await fetch(`${API_BASE}/api/navigation/route`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ from_label: fromLabel, to_label: toLabel, mode }),
      ...(signal ? { signal } : {}),
    });
    if (!res.ok) throw new Error(`navigation route ${res.status}`);
    const route = parseRoute(await res.json());
    if (!route) throw new Error('navigation route returned an invalid response');
    void saveRouteToCache(cacheKey, route);
    return asRoutePoints(route);
  } catch {
    if (signal?.aborted) return null;
    const cached = await getCachedRoute<unknown>(cacheKey);
    const route = parseRoute(cached);
    return route ? asRoutePoints(route) : null;
  }
}

/** Vertical circulation types we render as columns through the floor stack. */
export type ConnectionKind = 'elevator' | 'escalator' | 'stairs' | 'ramp';

/** One vertical connection (elevator/stairs/…): its stops, ordered by level. */
export interface ConnectionInfo {
  id: string;
  type: ConnectionKind;
  name: string;
  accessible: boolean;
  points: { coords: [number, number]; elevation: number }[];
}

/** Emoji + colour + label for each connection kind (legend + 3D columns). */
export const CONNECTION_STYLE: Record<
  ConnectionKind,
  { icon: string; color: string; label: string }
> = {
  elevator: { icon: '🛗', color: '#38bdf8', label: 'Elevator' },
  escalator: { icon: '↗', color: '#fbbf24', label: 'Escalator' },
  stairs: { icon: '🪜', color: '#94a3b8', label: 'Stairs' },
  ramp: { icon: '♿', color: '#4ade80', label: 'Ramp' },
};

/** Load the pre-built vertical-connection index (elevators, stairs, …). */
export async function loadConnections(signal?: AbortSignal): Promise<ConnectionInfo[]> {
  const res = await fetch('/stadium/connections.json', signal ? { signal } : {});
  if (!res.ok) throw new Error(`connections.json ${res.status}`);
  return (await res.json()) as ConnectionInfo[];
}
