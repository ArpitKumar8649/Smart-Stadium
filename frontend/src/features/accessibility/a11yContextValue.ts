import { createContext } from 'react';
import type { AccessibilityPrefs } from '@concourse/shared';

export const DEFAULT_PREFS: AccessibilityPrefs = {
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

export const A11yContext = createContext<A11yContextType>({
  prefs: DEFAULT_PREFS,
  updatePref: () => {},
});
