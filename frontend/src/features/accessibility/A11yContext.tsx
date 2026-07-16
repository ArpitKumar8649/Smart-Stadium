import { useEffect, useState, type ReactNode } from 'react';
import type { AccessibilityPrefs } from '@concourse/shared';
import { A11yContext, DEFAULT_PREFS } from './a11yContextValue.ts';

const PREFS_KEY = 'concourse.a11y_prefs';

export function A11yProvider({ children }: { children: ReactNode }) {
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

  const updatePref = (key: keyof AccessibilityPrefs, value: boolean) => {
    setPrefs((p) => ({ ...p, [key]: value }));
  };

  return (
    <A11yContext.Provider value={{ prefs, updatePref }}>
      {children}
    </A11yContext.Provider>
  );
}
