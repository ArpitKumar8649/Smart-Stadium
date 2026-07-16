import { useCallback, useEffect, useState, useMemo, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Wordmark } from '../components/brand/Logo.tsx';
import { MapCanvas, type CrowdMapZone } from '../features/navigate/MapCanvas.tsx';
import { densityColor } from '../features/navigate/crowdStyle.ts';
import { PaTranslatorPanel } from '../features/admin/PaTranslatorPanel.tsx';
import type { Briefing, BriefingConcern, BriefingRecommendation } from '@concourse/shared';

const API_BASE = import.meta.env.VITE_API_BASE ?? '';

type CrowdResponse = { phase: string; sim_minute: number; zones: CrowdMapZone[] };

export default function Admin() {
  // The operator-provided token lives only in this mounted page's memory. It is
  // checked by the backend, never shipped in the Vite bundle or persisted.
  const [token, setToken] = useState('');
  const [authed, setAuthed] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [pageVisible, setPageVisible] = useState(() => !document.hidden);

  const [crowd, setCrowd] = useState<CrowdResponse | null>(null);
  const [briefing, setBriefing] = useState<Briefing | null>(null);
  const [briefingLoading, setBriefingLoading] = useState(false);
  const [briefingError, setBriefingError] = useState<string | null>(null);
  const [activeFloor, setActiveFloor] = useState(1);

  // Incident injection state
  const [incidentLoading, setIncidentLoading] = useState(false);
  const [incidentTarget, setIncidentTarget] = useState('');
  const [demoActive, setDemoActive] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);
  const [demoMessage, setDemoMessage] = useState<string | null>(null);

  const refreshCrowd = useCallback(async () => {
    if (!authed) return;
    try {
      const res = await fetch(`${API_BASE}/api/crowd/metlife/heatmap`);
      if (res.ok) setCrowd((await res.json()) as CrowdResponse);
    } catch { /* ignore */ }
  }, [authed]);

  const fetchBriefing = useCallback(async (force = false) => {
    if (!authed) return;
    setBriefingLoading(true);
    setBriefingError(null);
    try {
      const res = await fetch(`${API_BASE}/api/admin/briefing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ venue_id: 'metlife', lang: 'en', force_refresh: force }),
      });
      if (res.ok) {
        setBriefing((await res.json()) as Briefing);
      } else if (res.status === 401) {
        setAuthed(false);
      } else {
        setBriefingError('Could not generate the operational briefing. Try refreshing it.');
      }
    } catch {
      setBriefingError('Could not reach the briefing service.');
    } finally {
      setBriefingLoading(false);
    }
  }, [authed, token]);

  const refreshDemoStatus = useCallback(async () => {
    if (!authed) return;
    try {
      const response = await fetch(`${API_BASE}/api/admin/demo/status`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.status === 401) {
        setAuthed(false);
        return;
      }
      if (response.ok) {
        const payload = await response.json() as { active?: boolean };
        setDemoActive(payload.active === true);
      }
    } catch {
      // The control remains usable even when status hydration fails.
    }
  }, [authed, token]);

  useEffect(() => {
    const syncPageVisibility = () => setPageVisible(!document.hidden);
    document.addEventListener('visibilitychange', syncPageVisibility);
    return () => document.removeEventListener('visibilitychange', syncPageVisibility);
  }, []);

  useEffect(() => {
    if (authed && pageVisible) {
      void refreshCrowd();
      void fetchBriefing();
      void refreshDemoStatus();
      const cTimer = window.setInterval(refreshCrowd, 15_000);
      return () => window.clearInterval(cTimer);
    }
    return undefined;
  }, [authed, pageVisible, refreshCrowd, fetchBriefing, refreshDemoStatus]);

  const authenticate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const candidate = token.trim();
    if (!candidate) {
      setAuthError('Enter the operator passcode.');
      return;
    }

    setAuthLoading(true);
    setAuthError(null);
    try {
      const response = await fetch(`${API_BASE}/api/admin/session`, {
        headers: { Authorization: `Bearer ${candidate}` },
      });
      if (!response.ok) {
        setAuthError('Invalid passcode.');
        return;
      }
      setToken(candidate);
      setAuthed(true);
    } catch {
      setAuthError('Could not reach the admin service.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleInject = async (type: 'spike' | 'route_detour') => {
    if (type === 'spike' && !incidentTarget) return;
    setIncidentLoading(true);
    try {
      const routeDetour = type === 'route_detour';
      const body = routeDetour
        ? {
            venue_id: 'metlife',
            kind: 'facility_closure',
            severity: 'warn',
            title: '100 Concourse route advisory',
            body: 'A simulated advisory affects the current concourse path. Your active route will refresh automatically.',
            affected_zone_id: 'l1-concourse',
            // A real node on the default Section 144 → Section 108 demo route.
            affected_node_id: 'n_611e7c60150a2c2324000035',
            expires_in_minutes: 10,
          }
        : {
            venue_id: 'metlife',
            zone_id: incidentTarget,
            density: 0.98,
            wait_seconds: 400,
            ttl_seconds: 300,
          };

      const res = await fetch(`${API_BASE}/api/admin/${routeDetour ? 'incident' : 'crowd/override'}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });

      if (res.status === 401) setAuthed(false);
      if (res.ok) void refreshCrowd();
    } finally {
      setIncidentLoading(false);
      setIncidentTarget('');
    }
  };

  const toggleDemoMode = async () => {
    const enable = !demoActive;
    setDemoLoading(true);
    setDemoMessage(null);
    try {
      const response = await fetch(`${API_BASE}/api/admin/demo/${enable ? 'enable' : 'disable'}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        if (response.status === 401) setAuthed(false);
        setDemoMessage('Could not update the guided demo state.');
        return;
      }
      const payload = await response.json() as { message?: string };
      setDemoActive(enable);
      setDemoMessage(payload.message ?? (enable ? 'Guided demo enabled.' : 'Live simulation restored.'));
    } catch {
      setDemoMessage('Could not reach the demo service.');
    } finally {
      setDemoLoading(false);
    }
  };

  const activeZones = useMemo(() => (crowd?.zones ?? []).filter(z => z.level === activeFloor), [activeFloor, crowd?.zones]);

  if (!authed) {
    return (
      <main id="main-content" tabIndex={-1} className="flex min-h-screen items-center justify-center px-4">
        <form className="w-full max-w-sm space-y-4 rounded-2xl border border-surface-800 bg-surface-900 p-6 shadow-xl" onSubmit={authenticate}>
          <Wordmark className="justify-center" />
          <p className="text-center text-sm text-surface-400">Operations Command Center</p>
          <div>
            <label htmlFor="admin-passcode" className="sr-only">Admin passcode</label>
            <input
              id="admin-passcode"
              type="password"
              placeholder="Admin Passcode"
              value={token}
              onChange={(e) => { setToken(e.target.value); setAuthError(null); }}
              autoComplete="current-password"
              className="w-full rounded-xl border border-surface-700 bg-surface-950 px-4 py-3 text-surface-50 focus:border-primary focus:ring-1 focus:ring-primary"
            />
            {authError && <p className="mt-2 text-xs text-red-400" role="alert">{authError}</p>}
          </div>
          <button type="submit" disabled={authLoading} className="w-full rounded-xl bg-primary px-4 py-3 font-semibold text-surface-950 transition hover:bg-primary-400 disabled:opacity-60">
            {authLoading ? 'Checking…' : 'Authenticate'}
          </button>
        </form>
      </main>
    );
  }

  return (
    <main id="main-content" tabIndex={-1} className="flex h-screen flex-col overflow-hidden bg-surface-950 text-surface-50">
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-surface-800 bg-surface-900 px-6">
        <div className="flex items-center gap-4">
          <Wordmark />
          <span className="rounded bg-surface-800 px-2 py-0.5 font-mono text-xs text-surface-300">OPS COMMAND</span>
        </div>
        <div className="flex items-center gap-4 text-xs font-mono">
          <span className="text-surface-400">Phase: <strong className="text-surface-100">{crowd?.phase || '...'}</strong></span>
          <span className="text-surface-400">Min: <strong className="text-surface-100">{crowd?.sim_minute || '...'}</strong></span>
          <Link to="/" className="text-primary hover:underline">Exit to Fan App</Link>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Left Column: Briefing + Injection */}
        <div className="flex w-96 shrink-0 flex-col border-r border-surface-800 bg-surface-900/50 p-4 overflow-y-auto">

          <section className="mb-6">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-display text-sm font-semibold uppercase tracking-wider text-surface-300">Live AI Briefing</h2>
              <button onClick={() => fetchBriefing(true)} disabled={briefingLoading} className="text-xs text-primary hover:underline disabled:opacity-50">
                {briefingLoading ? 'Syncing...' : 'Refresh'}
              </button>
            </div>

            {briefing ? (
              <div className="space-y-4">
                <div className="rounded-xl border border-primary-900 bg-primary-950/30 p-3">
                  <h3 className="font-semibold text-primary-200">{briefing.headline}</h3>
                  <p className="mt-2 text-sm text-surface-200">{briefing.summary}</p>
                </div>

                {briefing.concerns.length > 0 && (
                  <div>
                    <h4 className="mb-2 text-xs font-semibold text-surface-400">Identified Concerns</h4>
                    <ul className="space-y-2">
                      {briefing.concerns.map((c: BriefingConcern, i) => (
                        <li key={i} className="flex gap-2 rounded-lg bg-surface-900 p-2 text-xs">
                          <span className={`shrink-0 rounded px-1.5 py-0.5 font-bold ${c.severity === 'warn' || c.severity === 'critical' ? 'bg-red-950 text-red-400' : 'bg-surface-800 text-surface-300'}`}>
                            {c.severity.toUpperCase()}
                          </span>
                          <span className="text-surface-200">{c.concern}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {briefing.recommendations.length > 0 && (
                  <div>
                    <h4 className="mb-2 text-xs font-semibold text-surface-400">Recommendations</h4>
                    <ul className="space-y-2">
                      {briefing.recommendations.map((r: BriefingRecommendation, i) => (
                        <li key={i} className="rounded-lg border border-surface-800 bg-surface-900 p-2 text-xs text-surface-200">
                          {r.action}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ) : (
              <div className="rounded-xl bg-surface-800 p-6 text-center text-sm text-surface-400">
                {briefingLoading ? 'Synthesizing stadium telemetry...' : briefingError ?? 'No operational briefing is available yet.'}
              </div>
            )}
            {briefingError && briefing && <p className="mt-2 text-xs text-red-400" role="alert">{briefingError}</p>}
          </section>

          <PaTranslatorPanel adminToken={token} onUnauthorized={() => setAuthed(false)} />

          <section className="mb-6 rounded-xl border border-accent/30 bg-accent/5 p-3">
            <h2 className="font-display text-sm font-semibold uppercase tracking-wider text-accent">Guided demo</h2>
            <p className="mt-1 text-xs text-surface-300">
              Pin simulated match conditions for a repeatable operator walkthrough.
            </p>
            <button
              type="button"
              onClick={() => void toggleDemoMode()}
              disabled={demoLoading}
              aria-pressed={demoActive}
              className="mt-3 w-full rounded-lg border border-accent/50 px-3 py-2 text-xs font-semibold text-accent transition hover:bg-accent hover:text-surface-950 disabled:opacity-50"
            >
              {demoLoading ? 'Updating…' : demoActive ? 'Restore live simulation' : 'Enable guided demo'}
            </button>
            {demoMessage && <p className="mt-2 text-xs text-surface-300" role="status">{demoMessage}</p>}
          </section>

          <section className="mt-auto border-t border-surface-800 pt-6">
            <h2 className="mb-3 font-display text-sm font-semibold uppercase tracking-wider text-accent">Demo scenarios</h2>
            <p className="mb-3 text-xs text-surface-400">
              Simulated operator scenarios are broadcast venue-wide to connected fan views. The route advisory refreshes the default fan route automatically.
            </p>

            <button
              type="button"
              disabled={incidentLoading}
              onClick={() => void handleInject('route_detour')}
              className="w-full rounded-lg bg-red-900/50 py-2 text-xs font-semibold text-red-200 transition hover:bg-red-900 disabled:opacity-50"
            >
              Trigger 100 Concourse route advisory
            </button>

            <div className="mt-4 flex gap-2">
              <label htmlFor="incident-target" className="sr-only">Crowd scenario zone</label>
              <select value={incidentTarget} onChange={e => setIncidentTarget(e.target.value)} className="flex-1 rounded-lg border border-surface-700 bg-surface-950 px-2 py-1.5 text-xs text-surface-100">
                <option value="">Select a crowd zone...</option>
                {crowd?.zones.filter(z => z.kind === 'food' || z.kind === 'restrooms' || z.kind === 'gates').map(z => (
                  <option key={z.zone_id} value={z.zone_id}>{z.label}</option>
                ))}
              </select>
              <button
                type="button"
                disabled={!incidentTarget || incidentLoading}
                onClick={() => void handleInject('spike')}
                className="rounded-lg bg-surface-800 px-3 py-2 text-xs font-semibold text-surface-100 transition hover:bg-surface-700 disabled:opacity-50"
              >
                Spike crowd
              </button>
            </div>
          </section>

        </div>

        {/* Right Column: Tactical Map */}
        <div className="relative flex-1 bg-surface-950 p-4">
          <div className="absolute right-8 top-8 z-10 flex gap-1 rounded-lg bg-surface-900/80 p-1 backdrop-blur">
            {[0, 1, 2, 3, 4, 5, 6, 7].map(lvl => (
              <button key={lvl} onClick={() => setActiveFloor(lvl)} className={`h-8 w-8 rounded-md text-xs font-bold transition ${activeFloor === lvl ? 'bg-primary text-surface-950' : 'text-surface-400 hover:bg-surface-800 hover:text-surface-100'}`}>
                {lvl}
              </button>
            ))}
          </div>

          <MapCanvas level={activeFloor} crowdZones={activeZones} forecastOffset={30} />

          <div className="absolute bottom-8 right-8 rounded-xl border border-surface-800 bg-surface-900/90 p-4 backdrop-blur-md w-64">
            <h3 className="mb-2 font-mono text-xs uppercase text-surface-400">Live Density (L{activeFloor})</h3>
            <ul className="space-y-1.5">
              {activeZones.sort((a,b) => b.density - a.density).slice(0, 5).map(z => (
                <li key={z.zone_id} className="flex items-center justify-between text-xs">
                  <span className="truncate pr-2 text-surface-200">{z.label}</span>
                  <span className="shrink-0 font-mono font-bold" style={{color: densityColor(z.density)}}>{Math.round(z.density * 100)}%</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </main>
  );
}
