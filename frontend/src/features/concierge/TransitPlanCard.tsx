import type { TransitResponse, TransitMode } from '@concourse/shared';

const MODE_META: Record<TransitMode, { icon: string; label: string }> = {
  DRIVE: { icon: '🚗', label: 'Driving' },
  TWO_WHEELER: { icon: '🛵', label: 'Two-wheeler' },
  TRANSIT: { icon: '🚆', label: 'Public transit' },
  BICYCLE: { icon: '🚲', label: 'Cycling' },
  WALK: { icon: '🚶', label: 'Walking' },
};

function formatDurationMin(sec: number): string {
  const mins = Math.round(sec / 60);
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

function formatKm(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(m >= 10000 ? 0 : 1)} km` : `${Math.round(m)} m`;
}

function formatCo2(g: number): string {
  if (g === 0) return '0 g CO₂';
  if (g >= 1000) return `${(g / 1000).toFixed(1)} kg CO₂`;
  return `${g} g CO₂`;
}

export interface TransitPlanCardProps {
  plan: TransitResponse;
}

/**
 * Renders the Transit Agent's plan under the assistant's reply — a ranked list
 * of ground-travel options with time, distance, and CO₂, and a highlighted
 * recommendation. Deliberately compact so it doesn't crowd the chat stream.
 */
export function TransitPlanCard({ plan }: TransitPlanCardProps) {
  const { options, recommendation } = plan;
  const sorted = [...options].sort((a, b) => {
    if (a.mode === recommendation.recommended_mode) return -1;
    if (b.mode === recommendation.recommended_mode) return 1;
    return a.duration_seconds - b.duration_seconds;
  });

  const carbonSaved = recommendation.co2_saved_vs_drive_grams;
  const carbonNote =
    carbonSaved > 0
      ? `Saves about ${formatCo2(carbonSaved)} vs. driving.`
      : carbonSaved < 0
        ? `Emits about ${formatCo2(-carbonSaved)} more than driving.`
        : 'Same footprint as driving.';

  return (
    <section
      className="mt-3 rounded-2xl border border-surface-800 bg-surface-950/60 p-4"
      aria-label="Transit Agent plan to MetLife Stadium"
    >
      <header className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-surface-500">
            Transit Agent · to MetLife Stadium
          </p>
          <p className="mt-0.5 text-sm font-semibold text-surface-100">
            {MODE_META[recommendation.recommended_mode].icon} {recommendation.reason}
          </p>
        </div>
        <span className="rounded-full border border-primary-800/60 bg-primary-950/40 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary-300">
          {plan.priority}
        </span>
      </header>

      <ul className="space-y-1.5">
        {sorted.map((o) => {
          const isRecommended = o.mode === recommendation.recommended_mode;
          const isGreenest = o.mode === recommendation.greenest_mode;
          const isFastest = o.mode === recommendation.fastest_mode;
          return (
            <li
              key={o.mode}
              className={`flex items-center justify-between gap-3 rounded-lg px-2.5 py-1.5 text-xs ${
                isRecommended
                  ? 'border border-primary-800/70 bg-primary-950/30'
                  : 'border border-transparent'
              }`}
            >
              <span className="flex items-center gap-2 truncate">
                <span aria-hidden="true">{MODE_META[o.mode].icon}</span>
                <span className="font-medium text-surface-100">{o.label}</span>
                {isFastest && !isRecommended && (
                  <span className="rounded bg-surface-800 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-surface-300">
                    Fastest
                  </span>
                )}
                {isGreenest && !isRecommended && (
                  <span className="rounded bg-emerald-950/50 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-emerald-300">
                    Greenest
                  </span>
                )}
              </span>
              <span className="flex shrink-0 items-center gap-3 font-mono text-[11px] text-surface-400">
                <span>{formatDurationMin(o.duration_seconds)}</span>
                <span>{formatKm(o.distance_meters)}</span>
                <span className={o.co2_grams === 0 ? 'text-emerald-400' : 'text-surface-300'}>
                  {formatCo2(o.co2_grams)}
                </span>
              </span>
            </li>
          );
        })}
      </ul>

      <footer className="mt-3 border-t border-surface-800 pt-2 text-[10px] leading-relaxed text-surface-500">
        {carbonNote} · CO₂ figures are per-passenger estimates from the DEFRA 2023 emissions-factor table, not measurements.
      </footer>
    </section>
  );
}
