import type { NavigationRouteResponse } from '@concourse/shared';

function humanTime(seconds: number): string {
  if (seconds < 60) return `${Math.max(1, Math.round(seconds))} sec`;
  return `${Math.round(seconds / 60)} min`;
}

export function RouteSummaryPanel({
  route,
  routeFromCache,
}: {
  route: NavigationRouteResponse | null;
  routeFromCache: boolean;
}) {
  return (
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
          {routeFromCache && (
            <p className="mt-3 text-xs text-amber-200">Showing your saved route while live routing reconnects.</p>
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
  );
}
