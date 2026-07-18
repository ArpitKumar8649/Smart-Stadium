import { useMemo } from 'react';
import type { CrowdMapZone } from '@concourse/shared';
import { densityColor } from './crowdStyle';

type ForecastOffset = 0 | 15 | 30;

function densityAt(zone: CrowdMapZone, forecast: ForecastOffset): number {
  if (forecast === 0) return zone.density;
  return zone.predictions?.find((prediction) => prediction.offset_minutes === forecast)?.density ?? zone.density;
}

export function BusiestZonesPanel({
  activeZones,
  forecast,
  setSelectedZone,
}: {
  activeZones: CrowdMapZone[];
  forecast: ForecastOffset;
  setSelectedZone: (zone: CrowdMapZone) => void;
}) {
  const sortedZones = useMemo(
    () => [...activeZones].sort((a, b) => densityAt(b, forecast) - densityAt(a, forecast)),
    [activeZones, forecast]
  );

  return (
    <section className="rounded-2xl border border-surface-800 bg-surface-900 p-4">
      <p className="font-mono text-xs uppercase tracking-widest text-primary">Busiest on this floor</p>
      <ul className="mt-3 space-y-2">
        {sortedZones.slice(0, 4).map((zone) => {
          const density = densityAt(zone, forecast);
          return (
            <li key={zone.zone_id}>
              <button
                onClick={() => setSelectedZone(zone)}
                className="flex w-full items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-left text-xs transition hover:bg-surface-800 focus-visible:ring-2 focus-visible:ring-primary"
              >
                <span className="min-w-0 truncate text-surface-300">{zone.label}</span>
                <span className="inline-flex shrink-0 items-center gap-1.5 font-semibold text-surface-100">
                  <i className="h-2 w-2 rounded-full" style={{ background: densityColor(density) }} aria-hidden="true" />
                  {Math.round(density * 100)}%
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
