import { useEffect, useState } from 'react';
import { useA11y } from './useA11y.ts';

type LegacyMediaQueryList = MediaQueryList & {
  addListener(listener: (event: MediaQueryListEvent) => void): void;
  removeListener(listener: (event: MediaQueryListEvent) => void): void;
};

/** Respects both the in-app choice and the operating system preference. */
export function useReducedMotion(): boolean {
  const { prefs } = useA11y();
  const [systemPreference, setSystemPreference] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setSystemPreference(media.matches);
    sync();
    const legacyMedia = media as LegacyMediaQueryList;
    if (typeof media.addEventListener === 'function') {
      media.addEventListener('change', sync);
      return () => media.removeEventListener('change', sync);
    }

    // Safari before version 14 exposes the legacy MediaQueryList listener API.
    legacyMedia.addListener(sync);
    return () => legacyMedia.removeListener(sync);
  }, []);

  return prefs.reduce_motion || systemPreference;
}
