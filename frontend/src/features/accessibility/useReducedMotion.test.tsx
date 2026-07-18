import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { A11yProvider } from './A11yContext.tsx';
import { useA11y } from './useA11y.ts';
import { useReducedMotion } from './useReducedMotion.ts';
import { mediaQueries } from '../../test/setup.ts';

function usePrefsAndMotion() {
  const a11y = useA11y();
  return { ...a11y, reduceMotion: useReducedMotion() };
}

describe('useReducedMotion', () => {
  it('combines in-app preference and operating-system media query changes', () => {
    const { result } = renderHook(() => usePrefsAndMotion(), { wrapper: A11yProvider });

    expect(result.current.reduceMotion).toBe(false);

    act(() => {
      mediaQueries.get('(prefers-reduced-motion: reduce)')?.dispatch(true);
    });
    expect(result.current.reduceMotion).toBe(true);

    act(() => {
      mediaQueries.get('(prefers-reduced-motion: reduce)')?.dispatch(false);
    });
    expect(result.current.reduceMotion).toBe(false);

    act(() => {
      result.current.updatePref('reduce_motion', true);
    });
    expect(result.current.reduceMotion).toBe(true);
  });
});
