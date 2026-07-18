import type { RoutingMode } from '@concourse/shared';

export function RouteSearchForm({
  fromLabel,
  setFromLabel,
  toLabel,
  setToLabel,
  mode,
  setMode,
  loadingRoute,
  planRoute,
}: {
  fromLabel: string;
  setFromLabel: (label: string) => void;
  toLabel: string;
  setToLabel: (label: string) => void;
  mode: RoutingMode;
  setMode: (mode: RoutingMode) => void;
  loadingRoute: boolean;
  planRoute: () => void;
}) {
  return (
    <form
      className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_170px_auto]"
      onSubmit={(event) => {
        event.preventDefault();
        planRoute();
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
  );
}
