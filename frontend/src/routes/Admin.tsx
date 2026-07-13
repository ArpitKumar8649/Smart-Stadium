import { useCallback, useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Wordmark } from '../components/brand/Logo.tsx';
import { MapCanvas, type CrowdMapZone } from '../features/navigate/MapCanvas.tsx';
import { densityColor } from '../features/navigate/crowdStyle.ts';
import { PaTranslatorPanel } from '../features/admin/PaTranslatorPanel.tsx';
import type { Briefing, BriefingConcern, BriefingRecommendation } from '@concourse/shared';

const API_BASE = import.meta.env.VITE_API_BASE ?? '';

// Simple passcode gate (falls back to env var if deployed, otherwise hardcoded demo)
const DEMO_TOKEN = import.meta.env.VITE_ADMIN_DEMO_TOKEN ?? 'concourse-local-admin-2026';

type CrowdResponse = { phase: string; sim_minute: number; zones: CrowdMapZone[] };

export default function Admin() {
  const [token, setToken] = useState(() => localStorage.getItem('concourse.admin_token') || '');
  const [authed, setAuthed] = useState(false);
  const [authError, setAuthError] = useState(false);

  const [crowd, setCrowd] = useState<CrowdResponse | null>(null);
  const [briefing, setBriefing] = useState<Briefing | null>(null);
  const [briefingLoading, setBriefingLoading] = useState(false);
  const [activeFloor, setActiveFloor] = useState(1);

  // Incident injection state
  const [incidentLoading, setIncidentLoading] = useState(false);
  const [incidentTarget, setIncidentTarget] = useState('');

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
    try {
      const res = await fetch(`${API_BASE}/api/admin/briefing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ lang: 'en', force_refresh: force }),
      });
      if (res.ok) setBriefing((await res.json()) as Briefing);
      else if (res.status === 401) setAuthed(false);
    } catch { /* ignore */ }
    finally { setBriefingLoading(false); }
  }, [authed, token]);

  useEffect(() => {
    if (token === DEMO_TOKEN) {
      setAuthed(true);
      localStorage.setItem('concourse.admin_token', token);
      setAuthError(false);
    }
  }, [token]);

  useEffect(() => {
    if (authed) {
      void refreshCrowd();
      void fetchBriefing();
      const cTimer = window.setInterval(refreshCrowd, 15_000);
      return () => window.clearInterval(cTimer);
    }
  }, [authed, refreshCrowd, fetchBriefing]);

  const handleInject = async (type: string) => {
    if (!incidentTarget) return;
    setIncidentLoading(true);
    try {
      let body = {};
      if (type === 'close') {
        body = {
          venue_id: 'metlife', kind: 'facility_closure', severity: 'warn',
          title: `Facility Closed: ${incidentTarget}`, body: `The ${incidentTarget} area is temporarily closed. Please use alternative routes.`,
          expires_in_minutes: 30
        };
      } else {
        body = {
          venue_id: 'metlife', zone_id: incidentTarget,
          density: 0.98, wait_seconds: 400, ttl_seconds: 300
        };
      }

      const res = await fetch(`${API_BASE}/api/admin/${type === 'close' ? 'incident' : 'crowd/override'}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });

      if (res.ok) void refreshCrowd();
    } finally {
      setIncidentLoading(false);
      setIncidentTarget('');
    }
  };

  const activeZones = useMemo(() => (crowd?.zones ?? []).filter(z => z.level === activeFloor), [activeFloor, crowd?.zones]);

  if (!authed) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <form className="w-full max-w-sm space-y-4 rounded-2xl border border-surface-800 bg-surface-900 p-6 shadow-xl"
          onSubmit={(e) => { e.preventDefault(); if (token !== DEMO_TOKEN) setAuthError(true); }}>
          <Wordmark className="justify-center" />
          <p className="text-center text-sm text-surface-400">Operations Command Center</p>
          <div>
            <input
              type="password"
              placeholder="Admin Passcode"
              value={token}
              onChange={(e) => { setToken(e.target.value); setAuthError(false); }}
              className="w-full rounded-xl border border-surface-700 bg-surface-950 px-4 py-3 text-surface-50 focus:border-primary focus:ring-1 focus:ring-primary"
            />
            {authError && <p className="mt-2 text-xs text-red-400">Invalid passcode</p>}
          </div>
          <button type="submit" className="w-full rounded-xl bg-primary px-4 py-3 font-semibold text-surface-950 transition hover:bg-primary-400">
            Authenticate
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-surface-950 text-surface-50">
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
              <div className="animate-pulse rounded-xl bg-surface-800 p-6 text-center text-sm text-surface-400">
                Synthesizing stadium telemetry...
              </div>
            )}
          </section>

          <PaTranslatorPanel />

          <section className="mt-auto border-t border-surface-800 pt-6">
            <h2 className="mb-3 font-display text-sm font-semibold uppercase tracking-wider text-accent">Demo Injection</h2>
            <p className="mb-3 text-xs text-surface-400">Trigger these to demonstrate live fan-app rerouting.</p>

            <div className="flex gap-2">
              <select value={incidentTarget} onChange={e => setIncidentTarget(e.target.value)} className="flex-1 rounded-lg border border-surface-700 bg-surface-950 px-2 py-1.5 text-xs text-surface-100">
                <option value="">Select a zone...</option>
                {crowd?.zones.filter(z => z.kind === 'food' || z.kind === 'restrooms' || z.kind === 'gates').map(z => (
                  <option key={z.zone_id} value={z.zone_id}>{z.label}</option>
                ))}
              </select>
            </div>

            <div className="mt-2 grid grid-cols-2 gap-2">
              <button disabled={!incidentTarget || incidentLoading} onClick={() => handleInject('spike')} className="rounded-lg bg-surface-800 py-2 text-xs font-semibold text-surface-100 transition hover:bg-surface-700 disabled:opacity-50">
                Spike Crowd
              </button>
              <button disabled={!incidentTarget || incidentLoading} onClick={() => handleInject('close')} className="rounded-lg bg-red-900/50 py-2 text-xs font-semibold text-red-200 transition hover:bg-red-900 disabled:opacity-50">
                Close Facility
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
    </div>
  );
}
