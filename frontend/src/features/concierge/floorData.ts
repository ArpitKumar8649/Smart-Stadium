import { Cartesian3, PolygonHierarchy, Color } from 'cesium';
import type { Feature, FeatureCollection, Geometry, Polygon, MultiPolygon } from 'geojson';

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
}

interface FloorProps {
  id: string;
  name: string;
  elevation: number;
}

interface SpaceProps {
  id: string;
  externalId?: string;
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
      return {
        id: p.id ?? p.externalId ?? Math.random().toString(36),
        name: p.details?.name ?? '',
        hierarchies: geometryToHierarchies(f.geometry as Geometry),
      };
    })
    .filter((r) => r.hierarchies.length > 0);
}

/** Base (floor) and top (ceiling) absolute heights, in metres, for a level index. */
export function floorHeights(elevation: number): { base: number; top: number } {
  const base = elevation * FLOOR_HEIGHT_M;
  return { base, top: base + SLAB_THICKNESS_M };
}

/** A calm blue→violet ramp so stacked levels read as distinct strata. */
export function floorColor(elevation: number, total: number, alpha: number): Color {
  const t = total > 1 ? elevation / (total - 1) : 0;
  // hue 210° (blue) → 265° (violet)
  const hue = (210 + t * 55) / 360;
  return Color.fromHsl(hue, 0.65, 0.55, alpha);
}
