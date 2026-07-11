import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { AccessibilityPrefs } from '@concourse/shared';

const PREFS_KEY = 'concourse.a11y_prefs';

const DEFAULT_PREFS: AccessibilityPrefs = {
  step_free: false,
  sensory_safe: false,
  large_text: false,
  reduce_motion: false,
  screen_reader: false,
};

type A11yContextType = {
  prefs: AccessibilityPrefs;
  updatePref: (key: keyof AccessibilityPrefs, value: boolean) => void;
};

const A11yContext = createContext<A11yContextType>({
  prefs: DEFAULT_PREFS,
  updatePref: () => {},
});

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
    if (prefs.large_text) root.classList.add('text-lg');
    else root.classList.remove('text-lg');

    if (prefs.reduce_motion) root.style.setProperty('--reduce-motion', '1');
    else root.style.removeProperty('--reduce-motion');
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

export function useA11y() {
  return useContext(A11yContext);
}
