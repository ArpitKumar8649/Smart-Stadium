import { logger } from "../../lib/telemetry.ts";
import { useEffect, useMemo, useState } from 'react';
import { geoMercator, geoPath } from 'd3-geo';
import type { Feature, FeatureCollection, Geometry } from 'geojson';
import { densityColor, densityLabel, zoneForecast } from './crowdStyle.ts';
import { useReducedMotion } from '../accessibility/useReducedMotion.ts';
import type { CrowdMapZone } from '@concourse/shared';

const VIEW_WIDTH = 1000;
const VIEW_HEIGHT = 700;

type FloorProperties = {
  id: string;
  elevation: number;
  name: string;
  shortName: string;
};

type FloorFeature = Feature<Geometry, FloorProperties>;

export type RouteMapPoint = {
  id: string;
  label: string;
  level: number;
  coords: [number, number];
  order: number;
};

export type MapCanvasProps = {
  level: number;
  routePoints?: RouteMapPoint[];
  crowdZones?: CrowdMapZone[];
  forecastOffset?: 0 | 15 | 30;
  onZoneFocus?: (zone: CrowdMapZone) => void;
};

function projectRouteSegments(
  points: RouteMapPoint[],
  activeLevel: number,
  project: (coords: [number, number]) => [number, number] | null,
): string[] {
  const segments: string[] = [];
  let current: Array<[number, number]> = [];

  for (const point of points) {
    if (point.level !== activeLevel) {
      if (current.length >= 2) segments.push(current.map(([x, y]) => `${x},${y}`).join(' '));
      current = [];
      continue;
    }
    const projected = project(point.coords);
    if (!projected) continue;
    current.push(projected);
  }

  if (current.length >= 2) segments.push(current.map(([x, y]) => `${x},${y}`).join(' '));
  return segments;
}

/**
 * Real MetLife floor geometry + map overlays.
 *
 * Geometry is drawn from the uploaded Mappedin export. Crowd is deliberately
 * represented as zone-centroid halos rather than pretending the export contains
 * sensor polygons. Route coordinates come from real A* nodes returned by the API.
 */
export function MapCanvas({
  level,
  routePoints = [],
  crowdZones = [],
  forecastOffset = 0,
  onZoneFocus,
}: MapCanvasProps) {
  const [floors, setFloors] = useState<FloorFeature[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    const controller = new AbortController();
    void fetch('/floor.geojson', { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Map geometry failed (${response.status})`);
        return (await response.json()) as FeatureCollection<Geometry, FloorProperties>;
      })
      .then((data) => {
        setFloors(data.features);
        setLoadError(null);
      })
      .catch((error: unknown) => {
        if ((error as Error).name === 'AbortError') return;
        logger.error('Failed to load map geometry', error);
        setLoadError('The indoor map could not load. You can retry or use the route instructions below.');
      });
    return () => controller.abort();
  }, [loadAttempt]);

  const rendered = useMemo(() => {
    if (!floors.length) return null;

    const collection: FeatureCollection<Geometry, FloorProperties> = {
      type: 'FeatureCollection',
      features: floors,
    };
    const projection = geoMercator().fitExtent(
      [
        [36, 28],
        [VIEW_WIDTH - 36, VIEW_HEIGHT - 28],
      ],
      collection,
    );
    const path = geoPath(projection);

    // Plaza and Outdoors both use elevation 0. Prefer Plaza for an indoor fan map.
    const sameLevel = floors.filter((floor) => floor.properties.elevation === level);
    const activeFloor = sameLevel.find((floor) => !/outdoors/i.test(floor.properties.name)) ?? sameLevel[0] ?? null;
    const activePath = activeFloor ? path(activeFloor) : null;
    const project = (coords: [number, number]) => projection(coords) as [number, number] | null;
    return { activeFloor, activePath, project };
  }, [floors, level]);

  if (!rendered?.activeFloor || !rendered.activePath) {
    return (
      <div className="flex h-full min-h-[340px] w-full items-center justify-center rounded-2xl border border-surface-800 bg-surface-900">
        {loadError ? (
          <div className="max-w-sm p-6 text-center">
            <p className="text-sm text-surface-300" role="alert">{loadError}</p>
            <button
              type="button"
              onClick={() => setLoadAttempt((attempt) => attempt + 1)}
              className="mt-3 rounded-lg border border-surface-700 px-3 py-2 text-sm font-semibold text-surface-100 hover:border-primary"
            >
              Retry map
            </button>
          </div>
        ) : (
          <span className="text-sm text-surface-400" role="status">Loading MetLife geometry…</span>
        )}
      </div>
    );
  }

  const visibleZones = crowdZones.filter((zone) => zone.level === level);
  const visibleRoutePoints = routePoints.filter((point) => point.level === level);
  const routeSegments = projectRouteSegments(routePoints, level, rendered.project);
  const startPoint = visibleRoutePoints[0];
  const endPoint = visibleRoutePoints[visibleRoutePoints.length - 1];

  return (
    <div className="relative h-full min-h-[340px] w-full overflow-hidden rounded-2xl border border-surface-800 bg-surface-950 shadow-2xl">
      <svg viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`} className="h-full w-full" role="group" aria-label={`${rendered.activeFloor.properties.name} interactive stadium map`}>
        <defs>
          <pattern id="packed-hatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="8" stroke="#fff" strokeWidth="2" opacity="0.38" />
          </pattern>
          <filter id="route-glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <path d={rendered.activePath} className="fill-surface-900 stroke-surface-700" strokeWidth="3" />

        {/* Sequential crowd-magnitude halos. Text + legend carry the meaning too. */}
        {visibleZones.map((zone) => {
          const projected = rendered.project(zone.centroid);
          if (!projected) return null;
          const density = zoneForecast(zone, forecastOffset);
          const radius = 32 + density * 48;
          const color = densityColor(density);
          const packed = density >= 0.8;
          return (
            <g key={zone.zone_id}>
              <circle
                cx={projected[0]}
                cy={projected[1]}
                r={radius}
                fill={color}
                fillOpacity="0.19"
                stroke={color}
                strokeWidth="2"
                className="cursor-pointer transition-opacity hover:fill-opacity-40 focus:fill-opacity-40"
                tabIndex={0}
                role="button"
                aria-label={`${zone.label}: ${densityLabel(density)}, ${Math.round(density * 100)} percent density`}
                onClick={() => onZoneFocus?.(zone)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    onZoneFocus?.(zone);
                  }
                }}
              />
              {packed && <circle cx={projected[0]} cy={projected[1]} r={radius} fill="url(#packed-hatch)" pointerEvents="none" />}
              <text
                x={projected[0]}
                y={projected[1] + 4}
                textAnchor="middle"
                className="pointer-events-none fill-surface-50 text-[13px] font-bold"
              >
                {Math.round(density * 100)}%
              </text>
            </g>
          );
        })}

        {/* A real A* route: only continuous segments on the selected floor. */}
        {routeSegments.map((segment, index) => (
          <polyline
            key={`${segment.slice(0, 24)}-${index}`}
            points={segment}
            fill="none"
            stroke="#FFC300"
            strokeWidth="8"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray="12 10"
            filter="url(#route-glow)"
          >
            {!reduceMotion && (
              <animate attributeName="stroke-dashoffset" from="44" to="0" dur="1.8s" repeatCount="indefinite" />
            )}
          </polyline>
        ))}

        {startPoint && (() => {
          const point = rendered.project(startPoint.coords);
          return point ? <circle cx={point[0]} cy={point[1]} r="11" fill="#00B67A" stroke="#080A0E" strokeWidth="4" /> : null;
        })()}
        {endPoint && (() => {
          const point = rendered.project(endPoint.coords);
          return point ? <circle cx={point[0]} cy={point[1]} r="11" fill="#FFC300" stroke="#080A0E" strokeWidth="4" /> : null;
        })()}
      </svg>

      <div className="absolute bottom-4 left-4 rounded-pill border border-surface-700 bg-surface-900/90 px-3 py-1.5 font-mono text-xs text-surface-100 backdrop-blur-md">
        {rendered.activeFloor.properties.name.trim()} · L{level}
      </div>
      {forecastOffset > 0 && (
        <div className="absolute right-4 top-4 rounded-pill border border-primary-800 bg-primary-950/90 px-3 py-1.5 text-xs font-semibold text-primary-200 backdrop-blur-md">
          Projected +{forecastOffset} min
        </div>
      )}
    </div>
  );
}
