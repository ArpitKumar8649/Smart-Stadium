import { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Wordmark } from '../components/brand/Logo.tsx';
import { MapCanvas } from '../features/navigate/MapCanvas.tsx';
import { densityColor } from '../features/navigate/crowdStyle.ts';
import { PaTranslatorPanel } from '../features/admin/PaTranslatorPanel.tsx';

import { useAdminSession } from '../features/admin/useAdminSession.ts';
import { useAdminCrowd } from '../features/admin/useAdminCrowd.ts';
import { useOperationalBriefing } from '../features/admin/useOperationalBriefing.ts';
import { useDemoMode } from '../features/admin/useDemoMode.ts';

import { AdminLoginForm } from '../features/admin/AdminLoginForm.tsx';
import { BriefingPanel } from '../features/admin/BriefingPanel.tsx';
import { DemoControls } from '../features/admin/DemoControls.tsx';
import { CrowdScenarioControls } from '../features/admin/CrowdScenarioControls.tsx';

const API_BASE = import.meta.env.VITE_API_BASE ?? '';

export default function Admin() {
  const {
    token,
    authed,
    setAuthed,
    authError,
    authLoading,
    signOut,
    clearError,
  } = useAdminSession();

  const [pageVisible, setPageVisible] = useState(() => !document.hidden);
  const [activeFloor, setActiveFloor] = useState(1);

  // Incident injection state
  const [incidentLoading, setIncidentLoading] = useState(false);
  const [incidentTarget, setIncidentTarget] = useState('');

  const { crowd, refreshCrowd } = useAdminCrowd(authed);
  const { briefing, briefingLoading, briefingError, fetchBriefing } = useOperationalBriefing(authed, token, setAuthed);
  const { demoActive, demoLoading, demoMessage, refreshDemoStatus, toggleDemoMode } = useDemoMode(authed, token, setAuthed);

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

  const activeZones = useMemo(() => (crowd?.zones ?? []).filter(z => z.level === activeFloor), [activeFloor, crowd?.zones]);

  if (!authed || authLoading) {
    return (
      <AdminLoginForm
        error={authError}
        clearError={clearError}
      />
    );
  }

  return (
    <main id="main-content" tabIndex={-1} className="flex h-screen flex-col overflow-hidden bg-surface-950 text-surface-50">
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-surface-800 bg-surface-900 px-6">
        <div className="flex items-center gap-4">
          <Wordmark />
          <span className="rounded bg-surface-800 px-2 py-0.5 font-mono text-xs text-surface-300" aria-label="Tournament Operations Console">TOURNAMENT OPS</span>
        </div>
        <div className="flex items-center gap-4 text-xs font-mono">
          <span className="text-surface-400">Phase: <strong className="text-surface-100">{crowd?.phase || '...'}</strong></span>
          <span className="text-surface-400">Min: <strong className="text-surface-100">{crowd?.sim_minute || '...'}</strong></span>
          <button onClick={signOut} className="text-primary hover:underline bg-transparent border-none cursor-pointer">Sign Out</button>
          <Link to="/" className="text-primary hover:underline">Exit to fan view</Link>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Left Column: Briefing + Injection */}
        <div className="flex w-96 shrink-0 flex-col border-r border-surface-800 bg-surface-900/50 p-4 overflow-y-auto">

          <BriefingPanel
            briefing={briefing}
            loading={briefingLoading}
            error={briefingError}
            onRefresh={fetchBriefing}
          />

          <PaTranslatorPanel adminToken={token} onUnauthorized={() => setAuthed(false)} />

          <DemoControls
            demoActive={demoActive}
            demoLoading={demoLoading}
            demoMessage={demoMessage}
            toggleDemoMode={toggleDemoMode}
          />

          <CrowdScenarioControls
            crowd={crowd}
            incidentLoading={incidentLoading}
            incidentTarget={incidentTarget}
            setIncidentTarget={setIncidentTarget}
            handleInject={handleInject}
          />

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
