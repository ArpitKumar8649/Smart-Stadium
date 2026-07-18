import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  floorHeights,
  geometryToHierarchies,
  loadConnections,
  loadFloors,
  loadRooms,
  loadSections,
  matchFacility,
  parseSectionRef,
  routeToSection,
} from './floorData.ts';
import { makeNavigationRouteResponse } from '../../test/factories.ts';
import { installCacheStorage } from '../../test/cacheStorageMock.ts';

describe('floorData transforms', () => {
  beforeEach(() => {
    installCacheStorage();
  });

  it('converts polygons and multipolygons, filters/sorts floors, and normalizes rooms', async () => {
    const fetchMock = vi.fn(async (url: RequestInfo | URL) => {
      if (String(url).includes('floor.geojson')) {
        return Response.json({
          type: 'FeatureCollection',
          features: [
            { type: 'Feature', properties: { id: 'out', name: 'Outdoors', elevation: 0 }, geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [0, 0]]] } },
            { type: 'Feature', properties: { id: 'l2', name: ' Level 2 ', elevation: 2 }, geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [0, 0]]] } },
            { type: 'Feature', properties: { id: 'l1', name: 'Level 1', elevation: 1 }, geometry: { type: 'MultiPolygon', coordinates: [[[[0, 0], [1, 0], [0, 0]]]] } },
          ],
        });
      }
      return Response.json({
        type: 'FeatureCollection',
        features: [
          { type: 'Feature', properties: { id: 'room-1', center: [1, 2], details: { name: 'Family Restroom' } }, geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [0, 0]]] } },
          { type: 'Feature', properties: { id: 'bad' }, geometry: { type: 'Point', coordinates: [0, 0] } },
        ],
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    expect(geometryToHierarchies({ type: 'Polygon', coordinates: [[[0, 0], [1, 0], [0, 0]], [[0.2, 0.2], [0.3, 0.2], [0.2, 0.2]]] })).toHaveLength(1);
    expect(geometryToHierarchies({ type: 'MultiPolygon', coordinates: [[[[0, 0], [1, 0], [0, 0]]], [[[2, 2], [3, 2], [2, 2]]]] })).toHaveLength(2);

    await expect(loadFloors()).resolves.toEqual([
      expect.objectContaining({ id: 'l1', name: 'Level 1', elevation: 1 }),
      expect.objectContaining({ id: 'l2', name: 'Level 2', elevation: 2 }),
    ]);
    await expect(loadRooms('l1')).resolves.toEqual([
      expect.objectContaining({ id: 'room-1', name: 'Family Restroom', center: [1, 2] }),
    ]);
  });

  it('classifies facilities and parses explicit section references without false positives', () => {
    expect(floorHeights(2)).toEqual({ base: 18, top: 24.5 });
    expect(matchFacility('Women’s restroom')).toBe('restroom');
    expect(matchFacility('First Aid AED')).toBe('first_aid');
    expect(matchFacility('Elevator Lobby')).toBe('elevator');
    expect(matchFacility('HCL Gate')).toBe('gate');
    expect(matchFacility('Beer garden market')).toBe('concession');
    expect(matchFacility('Generic lounge')).toBeNull();
    expect(parseSectionRef('take me to Section 128')).toBe('128');
    expect(parseSectionRef('suite 3-30 please')).toBe('Suite 3-30');
    expect(parseSectionRef('row 128')).toBeNull();
  });

  it('loads sections and connections and falls back to cached routes on network failures', async () => {
    const route = makeNavigationRouteResponse();
    const fetchMock = vi.fn(async (url: RequestInfo | URL) => {
      if (String(url).includes('sections.json')) return Response.json([{ name: '128', floorId: 'l1', elevation: 1, polygonId: 'p1', center: [1, 2] }]);
      if (String(url).includes('connections.json')) return Response.json([{ id: 'e1', type: 'elevator', name: 'Elevator 1', accessible: true, points: [] }]);
      return Response.json(route);
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(loadSections()).resolves.toHaveLength(1);
    await expect(loadConnections()).resolves.toEqual([expect.objectContaining({ accessible: true })]);
    await expect(routeToSection('Section 108', 'Section 144', true)).resolves.toEqual([
      { coords: route.points[0]!.coords, level: 1, label: 'Section 144' },
      { coords: route.points[1]!.coords, level: 1, label: 'Section 108' },
    ]);

    fetchMock.mockResolvedValueOnce(new Response('', { status: 500 }));
    await expect(routeToSection('Section 108', 'Section 144', true)).resolves.toHaveLength(2);
  });
});
