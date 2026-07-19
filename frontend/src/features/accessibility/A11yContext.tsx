import { useEffect, useState, useMemo, useCallback, type ReactNode } from 'react';
import type { AccessibilityPrefs } from '@concourse/shared';
import { A11yContext, DEFAULT_PREFS } from './a11yContextValue.ts';

const PREFS_KEY = 'concourse.a11y_prefs';

export function A11yProvider({ children }: Readonly<{ children: ReactNode }>) {
  const [prefs, setPrefs] = useState<AccessibilityPrefs>(() => {
    try {
      const stored = localStorage.getItem(PREFS_KEY);
      if (stored) return { ...DEFAULT_PREFS, ...JSON.parse(stored) };
    } catch { /* ignore */ }
    return DEFAULT_PREFS;
  });

  useEffect(() => {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));

    // Apply DOM effects
    const root = document.documentElement;
    // Data attributes let global CSS affect explicit Tailwind text sizes and
    // motion utilities too, rather than relying on inherited font-size alone.
    root.dataset.concourseLargeText = String(prefs.large_text);
    root.dataset.concourseReduceMotion = String(prefs.reduce_motion);
    root.dataset.concourseScreenReader = String(prefs.screen_reader);
  }, [prefs]);

  const updatePref = useCallback((key: keyof AccessibilityPrefs, value: boolean) => {
    setPrefs((p) => ({ ...p, [key]: value }));
  }, []);

  const value = useMemo(() => ({ prefs, updatePref }), [prefs, updatePref]);

  return (
    <A11yContext.Provider value={value}>
      {children}
    </A11yContext.Provider>
  );
}
