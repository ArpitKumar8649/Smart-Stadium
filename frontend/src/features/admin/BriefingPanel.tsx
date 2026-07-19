import { type Briefing, type BriefingConcern, type BriefingRecommendation } from '@concourse/shared';

interface BriefingPanelProps {
  briefing: Briefing | null;
  loading: boolean;
  error: string | null;
  onRefresh: (force?: boolean) => void;
}

export function BriefingPanel({ briefing, loading, error, onRefresh }: Readonly<BriefingPanelProps>) {
  return (
    <section className="mb-6">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="font-display text-sm font-semibold uppercase tracking-wider text-surface-300">Operational Intelligence Briefing</h2>
          <p className="text-[10px] uppercase tracking-wider text-surface-500">AI synthesis · headline · concerns · recommendations</p>
        </div>
        <button type="button" onClick={() => onRefresh(true)} disabled={loading} className="text-xs text-primary hover:underline disabled:opacity-50">
          {loading ? 'Syncing...' : 'Refresh'}
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
                {briefing.concerns.map((c: BriefingConcern) => (
                  <li key={c.zone_id + c.concern.substring(0, 10)} className="flex gap-2 rounded-lg bg-surface-900 p-2 text-xs">
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
                {briefing.recommendations.map((r: BriefingRecommendation) => (
                  <li key={r.affected_zone_id + r.action.substring(0, 10)} className="rounded-lg border border-surface-800 bg-surface-900 p-2 text-xs text-surface-200">
                    {r.action}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-xl bg-surface-800 p-6 text-center text-sm text-surface-400">
          {loading ? 'Synthesizing stadium telemetry...' : error ?? 'No operational briefing is available yet.'}
        </div>
      )}
      {error && briefing && <p className="mt-2 text-xs text-red-400" role="alert">{error}</p>}
    </section>
  );
}
