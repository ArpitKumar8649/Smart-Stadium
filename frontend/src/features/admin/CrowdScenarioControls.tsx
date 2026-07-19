import { type CrowdHeatmapResponse } from '@concourse/shared';

interface CrowdScenarioControlsProps {
  crowd: CrowdHeatmapResponse | null;
  incidentLoading: boolean;
  incidentTarget: string;
  setIncidentTarget: (target: string) => void;
  handleInject: (type: 'spike' | 'route_detour') => void;
}

export function CrowdScenarioControls({
  crowd,
  incidentLoading,
  incidentTarget,
  setIncidentTarget,
  handleInject,
}: Readonly<CrowdScenarioControlsProps>) {
  return (
    <section className="mt-auto border-t border-surface-800 pt-6">
      <h2 className="mb-1 font-display text-sm font-semibold uppercase tracking-wider text-accent">Real-time Decision Support</h2>
      <p className="mb-3 text-[10px] uppercase tracking-wider text-surface-500">Broadcast an advisory · connected fans re-plan automatically</p>
      <p className="mb-3 text-xs text-surface-400">
        Operator advisories reach every connected fan view over SSE. The route advisory
        excludes the affected graph node and refreshes the fan&apos;s active route automatically.
      </p>

      <button
        type="button"
        disabled={incidentLoading}
        onClick={() => handleInject('route_detour')}
        className="w-full rounded-lg bg-red-900/50 py-2 text-xs font-semibold text-red-200 transition hover:bg-red-900 disabled:opacity-50"
      >
        Trigger 100 Concourse route advisory
      </button>

      <div className="mt-4 flex gap-2">
        <label htmlFor="incident-target" className="sr-only">Crowd scenario zone</label>
        <select
          id="incident-target"
          value={incidentTarget}
          onChange={e => setIncidentTarget(e.target.value)}
          className="flex-1 rounded-lg border border-surface-700 bg-surface-950 px-2 py-1.5 text-xs text-surface-100"
        >
          <option value="">Select a crowd zone...</option>
          {crowd?.zones.filter(z => z.kind === 'food' || z.kind === 'restrooms' || z.kind === 'gates').map(z => (
            <option key={z.zone_id} value={z.zone_id}>{z.label}</option>
          ))}
        </select>
        <button
          type="button"
          disabled={!incidentTarget || incidentLoading}
          onClick={() => handleInject('spike')}
          className="rounded-lg bg-surface-800 px-3 py-2 text-xs font-semibold text-surface-100 transition hover:bg-surface-700 disabled:opacity-50"
        >
          Spike crowd
        </button>
      </div>
    </section>
  );
}
