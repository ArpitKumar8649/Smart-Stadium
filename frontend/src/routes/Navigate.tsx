import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Wordmark } from '../components/brand/Logo.tsx';
import {
  MapCanvas,
  type CrowdMapZone,
  type RouteMapPoint,
} from '../features/navigate/MapCanvas.tsx';
import { densityColor, densityLabel } from '../features/navigate/crowdStyle.ts';
import { useAlerts } from '../features/alerts/AlertContext.tsx';
import { useA11y } from '../features/accessibility/A11yContext.tsx';
import { A11yTogglePanel } from '../features/accessibility/A11yTogglePanel.tsx';

const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:8080';

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

type RoutingMode = 'fastest' | 'step_free' | 'sensory_safe' | 'low_crowd';
type ForecastOffset = 0 | 15 | 30;

type CrowdResponse = {
  phase: string;
  sim_minute: number;
  zones: CrowdMapZone[];
};

type RouteResponse = {
  from: { label: string; level: number };
  to: { label: string; level: number };
  mode: RoutingMode;
  total_distance_m: number;
  total_seconds: number;
  step_free: boolean;
  wheelchair_accessible: boolean;
  crowd_penalty: number;
  steps: Array<{ instruction: string; seconds: number }>;
  warnings: string[];
  points: RouteMapPoint[];
};

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
  const [toLabel, setToLabel] = useState("Women's Restroom");
  const [mode, setMode] = useState<RoutingMode>(prefs.step_free ? 'step_free' : 'low_crowd');
  const [activeFloor, setActiveFloor] = useState(1);
  const [forecast, setForecast] = useState<ForecastOffset>(0);
  const [route, setRoute] = useState<RouteResponse | null>(null);
  const [crowd, setCrowd] = useState<CrowdResponse | null>(null);
  const [selectedZone, setSelectedZone] = useState<CrowdMapZone | null>(null);
  const [loadingRoute, setLoadingRoute] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { activeAlerts, dismissAlert } = useAlerts();

  const refreshCrowd = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/api/crowd/metlife/heatmap`);
      if (!response.ok) throw new Error(`Crowd endpoint returned ${response.status}`);
      const data = (await response.json()) as CrowdResponse;
      setCrowd(data);
    } catch (caught) {
      console.error('Failed to refresh crowd heatmap', caught);
    }
  }, []);

  useEffect(() => {
    void refreshCrowd();
    const timer = window.setInterval(() => void refreshCrowd(), 15_000);
    return () => window.clearInterval(timer);
  }, [refreshCrowd]);

  const planRoute = useCallback(async () => {
    if (!fromLabel.trim() || !toLabel.trim()) return;
    setLoadingRoute(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE}/api/navigation/route`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from_label: fromLabel, to_label: toLabel, mode }),
      });
      const body = (await response.json()) as RouteResponse | { error?: { message?: string } };
      if (!response.ok || !('points' in body)) {
        throw new Error(('error' in body && body.error?.message) || 'Could not calculate that route.');
      }
      setRoute(body);
      setActiveFloor(body.from.level);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not calculate that route.');
      setRoute(null);
    } finally {
      setLoadingRoute(false);
    }
  }, [fromLabel, mode, toLabel]);

  useEffect(() => {
    void planRoute();
    // The default route makes the map meaningful on first render. Subsequent
    // updates only happen through the explicit Plan route button.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const activeZones = useMemo(
    () => (crowd?.zones ?? []).filter((zone) => zone.level === activeFloor),
    [activeFloor, crowd?.zones],
  );

  const sortedZones = useMemo(
    () => [...activeZones].sort((a, b) => densityAt(b, forecast) - densityAt(a, forecast)),
    [activeZones, forecast],
  );

  const selectedDensity = selectedZone ? densityAt(selectedZone, forecast) : 0;
  const forecastLabel = forecast === 0 ? 'Now' : `+${forecast} min`;

  return (
    <main className="mx-auto min-h-screen max-w-7xl px-4 py-4 sm:px-6">
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

        <form
          className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_170px_auto]"
          onSubmit={(event) => {
            event.preventDefault();
            void planRoute();
          }}
        >
          <label className="grid gap-1 text-xs text-surface-400">
            From
            <input
              value={fromLabel}
              onChange={(event) => setFromLabel(event.target.value)}
              className="rounded-xl border border-surface-700 bg-surface-950 px-3 py-2.5 text-sm text-surface-50 outline-none focus:border-primary focus:ring-2 focus:ring-primary/30"
              placeholder="e.g. Section 144"
            />
          </label>
          <label className="grid gap-1 text-xs text-surface-400">
            To
            <input
              value={toLabel}
              onChange={(event) => setToLabel(event.target.value)}
              className="rounded-xl border border-surface-700 bg-surface-950 px-3 py-2.5 text-sm text-surface-50 outline-none focus:border-primary focus:ring-2 focus:ring-primary/30"
              placeholder="e.g. Women's Restroom"
            />
          </label>
          <label className="grid gap-1 text-xs text-surface-400">
            Preference
            <select
              value={mode}
              onChange={(event) => setMode(event.target.value as RoutingMode)}
              className="rounded-xl border border-surface-700 bg-surface-950 px-3 py-2.5 text-sm text-surface-50 outline-none focus:border-primary focus:ring-2 focus:ring-primary/30"
            >
              <option value="fastest">Fastest</option>
              <option value="low_crowd">Avoid crowds</option>
              <option value="step_free">Step-free</option>
              <option value="sensory_safe">Sensory-safe</option>
            </select>
          </label>
          <button
            type="submit"
            disabled={loadingRoute}
            className="mt-auto rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-surface-950 transition hover:bg-primary-400 disabled:opacity-50"
          >
            {loadingRoute ? 'Routing…' : 'Plan route'}
          </button>
        </form>
        {error && <p role="alert" className="mt-3 text-sm text-red-300">{error}</p>}
      </section>

      <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0">

          {/* Fan Alert Feed */}
          {activeAlerts.length > 0 && (
            <div className="mb-4 space-y-2">
              {activeAlerts.map(alert => (
                <div key={alert.id} className={`flex items-start justify-between gap-4 rounded-xl border p-3 shadow-lg ${
                  alert.severity === 'critical' ? 'border-red-900 bg-red-950/40 text-red-100' :
                  alert.severity === 'warn' ? 'border-amber-900 bg-amber-950/40 text-amber-100' :
                  'border-blue-900 bg-blue-950/40 text-blue-100'
                }`}>
                  <div>
                    <h3 className="text-sm font-bold">{alert.title}</h3>
                    <p className="mt-1 text-xs opacity-90">{alert.body}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      onClick={() => void planRoute()}
                      className="rounded-lg bg-surface-950/50 px-3 py-1.5 text-xs font-semibold hover:bg-surface-900/50"
                    >
                      Re-plan Route
                    </button>
                    <button
                      onClick={() => dismissAlert(alert.id)}
                      className="rounded-lg px-2 py-1.5 text-xs opacity-70 hover:bg-surface-950/50 hover:opacity-100"
                      aria-label="Dismiss alert"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex max-w-full gap-1 overflow-x-auto rounded-xl border border-surface-800 bg-surface-900 p-1" role="tablist" aria-label="Stadium floor">
              {FLOORS.map((floor) => (
                <button
                  key={floor.level}
                  role="tab"
                  aria-selected={activeFloor === floor.level}
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
          <section className="rounded-2xl border border-surface-800 bg-surface-900 p-4">
            <p className="font-mono text-xs uppercase tracking-widest text-primary">Route</p>
            {route ? (
              <>
                <div className="mt-3 flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-surface-50">{route.from.label}</p>
                    <p className="mt-1 text-xs text-surface-400">to {route.to.label}</p>
                  </div>
                  <span className="rounded-pill bg-primary-900 px-2.5 py-1 text-xs font-bold text-primary-200">
                    {humanTime(route.total_seconds)}
                  </span>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-lg bg-surface-950 p-2.5">
                    <span className="block text-surface-500">Distance</span>
                    <strong className="mt-1 block text-surface-100">{Math.round(route.total_distance_m)}m</strong>
                  </div>
                  <div className="rounded-lg bg-surface-950 p-2.5">
                    <span className="block text-surface-500">Access</span>
                    <strong className="mt-1 block text-surface-100">{route.step_free ? 'Step-free' : 'Standard'}</strong>
                  </div>
                </div>
                {route.warnings.length > 0 && (
                  <div className="mt-3 rounded-lg border border-amber-700/60 bg-amber-950/30 p-2.5 text-xs text-amber-200">
                    {route.warnings[0]}
                  </div>
                )}
                <ol className="mt-4 max-h-48 space-y-2 overflow-y-auto border-s border-surface-700 ps-3 text-xs text-surface-300">
                  {route.steps.slice(0, 12).map((step, index) => (
                    <li key={`${step.instruction}-${index}`} className="relative ps-1">
                      <i className="absolute -start-[19px] top-1.5 h-2 w-2 rounded-full bg-accent" aria-hidden="true" />
                      {step.instruction}
                    </li>
                  ))}
                </ol>
              </>
            ) : (
              <p className="mt-3 text-sm text-surface-400">Plan a route to see turn-by-turn guidance.</p>
            )}
          </section>

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

          <A11yTogglePanel />
        </aside>
      </section>
    </main>
  );
}
