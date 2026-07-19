interface DemoControlsProps {
  demoActive: boolean;
  demoLoading: boolean;
  demoMessage: string | null;
  toggleDemoMode: () => void;
}

export function DemoControls({ demoActive, demoLoading, demoMessage, toggleDemoMode }: Readonly<DemoControlsProps>) {
  let buttonLabel = 'Enable guided demo';
  if (demoLoading) {
    buttonLabel = 'Updating…';
  } else if (demoActive) {
    buttonLabel = 'Restore live simulation';
  }

  return (
    <section className="mb-6 rounded-xl border border-accent/30 bg-accent/5 p-3">
      <h2 className="font-display text-sm font-semibold uppercase tracking-wider text-accent">Guided demo</h2>
      <p className="mt-1 text-xs text-surface-300">
        Pin simulated match conditions for a repeatable operator walkthrough.
      </p>
      <button
        type="button"
        onClick={() => toggleDemoMode()}
        disabled={demoLoading}
        aria-pressed={demoActive}
        className="mt-3 w-full rounded-lg border border-accent/50 px-3 py-2 text-xs font-semibold text-accent transition hover:bg-accent hover:text-surface-950 disabled:opacity-50"
      >
        {buttonLabel}
      </button>
      {demoMessage && <output className="mt-2 text-xs text-surface-300 block">{demoMessage}</output>}
    </section>
  );
}
