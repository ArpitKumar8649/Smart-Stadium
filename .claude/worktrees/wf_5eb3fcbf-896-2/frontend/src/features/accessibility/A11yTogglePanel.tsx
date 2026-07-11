import { useA11y } from './A11yContext.tsx';
import type { AccessibilityPrefs } from '@concourse/shared';

const PREF_LABELS: Record<keyof AccessibilityPrefs, string> = {
  step_free: 'Avoid stairs & escalators',
  sensory_safe: 'Avoid loud/crowded areas',
  large_text: 'Large text',
  reduce_motion: 'Reduce motion',
  screen_reader: 'Optimize for screen readers',
};

export function A11yTogglePanel() {
  const { prefs, updatePref } = useA11y();

  return (
    <div className="rounded-2xl border border-surface-800 bg-surface-900 p-4 shadow-xl">
      <h3 className="mb-4 font-display text-sm font-semibold uppercase tracking-wider text-surface-300">
        Accessibility Preferences
      </h3>
      <div className="space-y-3">
        {(Object.keys(PREF_LABELS) as Array<keyof AccessibilityPrefs>).map((key) => (
          <label key={key} className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-transparent p-2 transition hover:bg-surface-800 focus-within:border-primary">
            <span className="text-sm text-surface-100">{PREF_LABELS[key]}</span>
            <input
              type="checkbox"
              className="sr-only"
              checked={prefs[key]}
              onChange={(e) => updatePref(key, e.target.checked)}
            />
            <div className={`relative h-6 w-11 rounded-full transition-colors ${prefs[key] ? 'bg-primary' : 'bg-surface-700'}`}>
              <div className={`absolute top-1 h-4 w-4 rounded-full bg-surface-50 transition-transform ${prefs[key] ? 'left-6' : 'left-1'}`} />
            </div>
          </label>
        ))}
      </div>
    </div>
  );
}
