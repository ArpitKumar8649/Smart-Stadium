import { useMemo, useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Wordmark } from '../components/brand/Logo.tsx';
import { MapCanvas } from '../features/navigate/MapCanvas.tsx';
import { densityColor, densityLabel } from '../features/navigate/crowdStyle.ts';
import { useAlerts } from '../features/alerts/useAlerts.ts';
import { useA11y } from '../features/accessibility/useA11y.ts';
import { A11yTogglePanel } from '../features/accessibility/A11yTogglePanel.tsx';
import type { RoutingMode, CrowdMapZone } from '@concourse/shared';

// Extracted modules
import { useNavigationSearch } from '../features/navigate/useNavigationSearch.ts';
import { useCrowdHeatmap } from '../features/navigate/useCrowdHeatmap.ts';
import { useRouteAdvisoryRefresh } from '../features/navigate/useRouteAdvisoryRefresh.ts';
import { RouteSearchForm } from '../features/navigate/RouteSearchForm.tsx';
import { RouteSummaryPanel } from '../features/navigate/RouteSummaryPanel.tsx';
import { AlertFeedPanel } from '../features/navigate/AlertFeedPanel.tsx';
import { BusiestZonesPanel } from '../features/navigate/BusiestZonesPanel.tsx';

const FLOORS = [
  { level: 0, label: 'Plaza' },
  { level: 1, label: '100' },
  { level: 2, label: 'Suite 3' },
  { level: 3, label: '200' },
  { level: 4, label: 'Suite 5' },
  { level: 5, label: 'Suite 6' },
  { level: 6, label: '300' },
  { level: 7, label: 'Upper' },
] as const;

type ForecastOffset = 0 | 15 | 30;

function densityAt(zone: CrowdMapZone, forecast: ForecastOffset): number {
  if (forecast === 0) return zone.density;
  return zone.predictions?.find((prediction) => prediction.offset_minutes === forecast)?.density ?? zone.density;
}

function humanTime(seconds: number): string {
  if (seconds < 60) return `${Math.max(1, Math.round(seconds))} sec`;
  return `${Math.round(seconds / 60)} min`;
}

export default function Navigate() {
  const { prefs } = useA11y();
  const [fromLabel, setFromLabel] = useState('Section 144');
  const [toLabel, setToLabel] = useState('Section 108');
  const [mode, setMode] = useState<RoutingMode>(
    prefs.step_free ? 'step_free' : prefs.sensory_safe ? 'sensory_safe' : 'low_crowd'
  );

  const [activeFloor, setActiveFloor] = useState(1);
  const [forecast, setForecast] = useState<ForecastOffset>(0);
  const [selectedZone, setSelectedZone] = useState<CrowdMapZone | null>(null);

  const { activeAlerts, dismissAlert } = useAlerts();

  // 1) Navigation Search
  const {
    route,
    routeFromCache,
    loadingRoute,
    error,
    lastAutoRefresh,
    setLastAutoRefresh,
    planRoute,
  } = useNavigationSearch({
    fromLabel,
    toLabel,
    mode,
    onRouteFound: (foundRoute) => setActiveFloor(foundRoute.from.level),
  });

  // 2) Crowd Heatmap Polling
  const { crowd } = useCrowdHeatmap();

  // 3) Advisory Auto-Refresh
  useRouteAdvisoryRefresh({ activeAlerts, route, planRoute, setLastAutoRefresh });

  // Sync preference mode
  useEffect(() => {
    const preference = prefs.step_free ? 'step_free' : prefs.sensory_safe ? 'sensory_safe' : null;
    if (!preference || preference === mode) return;
    setMode(preference);
  }, [mode, prefs.sensory_safe, prefs.step_free]);

  const activeZones = useMemo(
    () => (crowd?.zones ?? []).filter((zone) => zone.level === activeFloor),
    [activeFloor, crowd?.zones]
  );

  const selectedDensity = selectedZone ? densityAt(selectedZone, forecast) : 0;
  const forecastLabel = forecast === 0 ? 'Now' : `+${forecast} min`;

  return (
    <main id="main-content" tabIndex={-1} className="mx-auto min-h-screen max-w-7xl px-4 py-4 sm:px-6">
      <header className="mb-5 flex items-center justify-between">
        <Link to="/" aria-label="Back to Concourse home">
          <Wordmark />
        </Link>
        <div className="flex items-center gap-2 text-xs text-surface-400">
          <span className="inline-flex h-2 w-2 rounded-full bg-primary" aria-hidden="true" />
          {crowd ? `Simulated · ${crowd.phase.replace('_', ' ')}` : 'Connecting…'}
        </div>
      </header>

      <section className="mb-5 rounded-2xl border border-surface-800 bg-surface-900 p-4 shadow-lg">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="font-mono text-xs uppercase tracking-widest text-primary">Live wayfinding</p>
            <h1 className="mt-1 font-display text-xl font-semibold">MetLife Stadium navigation</h1>
          </div>
          <p className="max-w-sm text-xs text-surface-400">
            Routes use real venue graph data. Crowd values are simulated for this preview.
          </p>
        </div>

        <RouteSearchForm
          fromLabel={fromLabel}
          setFromLabel={setFromLabel}
          toLabel={toLabel}
          setToLabel={setToLabel}
          mode={mode}
          setMode={setMode}
          loadingRoute={loadingRoute}
          planRoute={() => void planRoute()}
        />

        {error && <p role="alert" className="mt-3 text-sm text-red-300">{error}</p>}
        {lastAutoRefresh && <p role="status" className="mt-3 text-sm text-primary-200">{lastAutoRefresh}</p>}
      </section>

      <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0">
          <AlertFeedPanel
            activeAlerts={activeAlerts}
            planRoute={() => void planRoute()}
            dismissAlert={dismissAlert}
          />

          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex max-w-full gap-1 overflow-x-auto rounded-xl border border-surface-800 bg-surface-900 p-1" role="group" aria-label="Stadium floor">
              {FLOORS.map((floor) => (
                <button
                  key={floor.level}
                  aria-pressed={activeFloor === floor.level}
                  onClick={() => setActiveFloor(floor.level)}
                  className={[
                    'min-h-10 whitespace-nowrap rounded-lg px-3 text-xs font-semibold transition',
                    activeFloor === floor.level
                      ? 'bg-primary text-surface-950'
                      : 'text-surface-400 hover:bg-surface-800 hover:text-surface-100',
                  ].join(' ')}
                >
                  {floor.label}
                </button>
              ))}
            </div>

            <div className="flex rounded-xl border border-surface-800 bg-surface-900 p-1" role="group" aria-label="Crowd forecast time">
              {([0, 15, 30] as ForecastOffset[]).map((offset) => (
                <button
                  key={offset}
                  onClick={() => setForecast(offset)}
                  className={[
                    'min-h-10 rounded-lg px-3 text-xs font-semibold transition',
                    forecast === offset ? 'bg-surface-700 text-surface-50' : 'text-surface-400 hover:text-surface-100',
                  ].join(' ')}
                  aria-pressed={forecast === offset}
                >
                  {offset === 0 ? 'Now' : `+${offset}m`}
                </button>
              ))}
            </div>
          </div>

          <div className="h-[min(62vh,620px)]">
            <MapCanvas
              level={activeFloor}
              {...(route ? { routePoints: route.points } : {})}
              {...(crowd ? { crowdZones: crowd.zones } : {})}
              forecastOffset={forecast}
              onZoneFocus={setSelectedZone}
            />
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-surface-800 bg-surface-900 px-3 py-2 text-xs text-surface-300" aria-label="Crowd density legend">
            <span className="font-semibold text-surface-100">Crowd · {forecastLabel}</span>
            {[
              ['Quiet', '#5B6672'],
              ['Light', '#00B67A'],
              ['Moderate', '#FFC300'],
              ['Busy', '#F97316'],
              ['Packed', '#EF4444'],
            ].map(([label, color]) => (
              <span key={label} className="inline-flex items-center gap-1.5">
                <i className="h-2.5 w-2.5 rounded-full" style={{ background: color }} aria-hidden="true" />
                {label}
              </span>
            ))}
            <span className="ms-auto text-surface-500">Textured red = packed · click a zone for details</span>
          </div>
        </div>

        <aside className="space-y-4">
          <RouteSummaryPanel route={route} routeFromCache={routeFromCache} />

          <section className="rounded-2xl border border-surface-800 bg-surface-900 p-4" aria-live="polite">
            <p className="font-mono text-xs uppercase tracking-widest text-primary">Zone detail</p>
            {selectedZone ? (
              <>
                <div className="mt-3 flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-surface-50">{selectedZone.label}</p>
                  <span
                    className="rounded-pill px-2.5 py-1 text-xs font-bold text-surface-950"
                    style={{ background: densityColor(selectedDensity) }}
                  >
                    {densityLabel(selectedDensity)}
                  </span>
                </div>
                <p className="mt-3 text-sm text-surface-300">
                  {Math.round(selectedDensity * 100)}% density · estimated wait {humanTime(selectedZone.wait_seconds)}
                </p>
                {forecast > 0 && (
                  <p className="mt-2 text-xs text-surface-400">
                    Projection is derived from the simulated matchday curve. It is not live sensor data.
                  </p>
                )}
                <p className="mt-3 text-xs text-surface-500">Source: {selectedZone.source === 'injected' ? 'admin scenario' : 'simulation'}</p>
              </>
            ) : (
              <p className="mt-3 text-sm text-surface-400">Select a map zone to inspect its crowd level and wait estimate.</p>
            )}
          </section>

          <BusiestZonesPanel
            activeZones={activeZones}
            forecast={forecast}
            setSelectedZone={setSelectedZone}
          />

          <A11yTogglePanel />
        </aside>
      </section>
    </main>
  );
}
