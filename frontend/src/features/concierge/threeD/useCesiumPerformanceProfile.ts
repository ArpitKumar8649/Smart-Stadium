import { useState, useEffect } from 'react';

export interface CesiumPerformanceProfile {
  isHandset: boolean;
  resolutionScale: number;
  maximumScreenSpaceError: number;
  targetFrameRate: number;
  tileCacheBytes: number;
}

interface DeviceNavigator extends Navigator {
  deviceMemory?: number;
}

type LegacyMediaQueryList = MediaQueryList & {
  addListener(listener: (event: MediaQueryListEvent) => void): void;
  removeListener(listener: (event: MediaQueryListEvent) => void): void;
};

export function getCesiumPerformanceProfile(): CesiumPerformanceProfile {
  if (typeof window === 'undefined') {
    return {
      isHandset: false,
      resolutionScale: 1,
      maximumScreenSpaceError: 16,
      targetFrameRate: 60,
      tileCacheBytes: 256 * 1024 * 1024,
    };
  }

  const navigatorWithMemory = navigator as DeviceNavigator;
  const isHandset = window.matchMedia('(pointer: coarse)').matches || window.innerWidth < 900;
  const lowPower =
    (navigatorWithMemory.deviceMemory !== undefined && navigatorWithMemory.deviceMemory <= 4) ||
    (navigator.hardwareConcurrency !== undefined && navigator.hardwareConcurrency <= 4);

  if (isHandset && lowPower) {
    return {
      isHandset: true,
      resolutionScale: 0.65,
      maximumScreenSpaceError: 38,
      targetFrameRate: 30,
      tileCacheBytes: 64 * 1024 * 1024,
    };
  }

  if (isHandset) {
    return {
      isHandset: true,
      resolutionScale: 0.8,
      maximumScreenSpaceError: 26,
      targetFrameRate: 30,
      tileCacheBytes: 96 * 1024 * 1024,
    };
  }

  return {
    isHandset: false,
    resolutionScale: 1,
    maximumScreenSpaceError: 16,
    targetFrameRate: 60,
    tileCacheBytes: 256 * 1024 * 1024,
  };
}

export function useCesiumPerformanceProfile(): CesiumPerformanceProfile {
  const [profile, setProfile] = useState(getCesiumPerformanceProfile);

  useEffect(() => {
    const update = () => setProfile(getCesiumPerformanceProfile());
    const coarsePointer = window.matchMedia('(pointer: coarse)');
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    const legacyPointer = coarsePointer as LegacyMediaQueryList;
    if (typeof coarsePointer.addEventListener === 'function') {
      coarsePointer.addEventListener('change', update);
      return () => {
        window.removeEventListener('resize', update);
        window.removeEventListener('orientationchange', update);
        coarsePointer.removeEventListener('change', update);
      };
    }

    // eslint-disable-next-line @typescript-eslint/unbound-method
    if (typeof legacyPointer.addListener === 'function') {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore Typescript considers this deprecated, but it's needed for old Safari.
      legacyPointer.addListener(update);
      return () => {
        window.removeEventListener('resize', update);
        window.removeEventListener('orientationchange', update);
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore Same reason
        legacyPointer.removeListener(update);
      };
    }
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
    };
  }, []);

  return profile;
}
