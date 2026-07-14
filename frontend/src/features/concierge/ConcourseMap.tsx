import React, { useState, lazy, Suspense, type ComponentType, type ReactNode } from 'react';
import { OutdoorMap } from './OutdoorMap.tsx';

interface ConcourseMapProps {
  userLocation: { lat: number; lng: number } | null;
  encodedPolyline?: string | null;
  onSetLocation?: (loc: { lat: number; lng: number }) => void;
}

interface StadiumMap3DProps {
  userLocation: { lat: number; lng: number } | null;
  encodedPolyline?: string | null;
}

// CesiumJS is heavy (~4–5MB). Lazy-load the 3D view so opening the page with
// the 2D tab costs nothing. The 3D module is only fetched the first time the
// user flips to "3D".
const StadiumMap3D: ComponentType<StadiumMap3DProps> = lazy(() =>
  import('./StadiumMap3D.tsx').then((m) => ({ default: m.StadiumMap3D })),
);

type Mode = '2d' | '3d';

/** Class error boundary so a Cesium init crash never takes the route down. */
class ThreeDErrorBoundary extends React.Component<
  { children: ReactNode; onError: () => void },
  { tripped: boolean }
> {
  state = { tripped: false };
  static getDerivedStateFromError() {
    return { tripped: true };
  }
  componentDidCatch() {
    this.props.onError();
  }
  render() {
    if (this.state.tripped) return null;
    return this.props.children;
  }
}

export const ConcourseMap: React.FC<ConcourseMapProps> = (props) => {
  const [mode, setMode] = useState<Mode>('2d');
  // Once any error surfaces in 3D, we never retry in this session — fall back
  // to 2D permanently so the user doesn't sit in a broken state.
  const [threeFailed, setThreeFailed] = useState(false);

  return (
    <div className="flex flex-col h-full w-full">
      <div className="flex items-center justify-between border-b border-surface-800 bg-surface-900/90 px-3 py-1.5 backdrop-blur">
        <span className="text-[10px] font-mono uppercase tracking-wider text-surface-400">
          Stadium Map
        </span>
        <div className="flex gap-1 rounded-full border border-surface-700 bg-surface-950 p-0.5">
          <button
            type="button"
            onClick={() => setMode('2d')}
            aria-pressed={mode === '2d'}
            className={`rounded-full px-3 py-0.5 text-xs font-semibold transition ${
              mode === '2d'
                ? 'bg-surface-800 text-surface-50'
                : 'text-surface-400 hover:text-surface-100'
            }`}
          >
            2D
          </button>
          <button
            type="button"
            onClick={() => setMode('3d')}
            aria-pressed={mode === '3d'}
            className={`rounded-full px-3 py-0.5 text-xs font-semibold transition ${
              mode === '3d'
                ? 'bg-primary text-surface-950'
                : 'text-surface-400 hover:text-surface-100'
            }`}
          >
            3D
          </button>
        </div>
      </div>

      <div className="relative flex-1 min-h-[300px]">
        {mode === '2d' ? (
          <OutdoorMap
            userLocation={props.userLocation}
            {...(props.encodedPolyline !== undefined ? { encodedPolyline: props.encodedPolyline } : {})}
            {...(props.onSetLocation ? { onSetLocation: props.onSetLocation } : {})}
          />
        ) : threeFailed ? (
          <div className="flex h-full w-full items-center justify-center bg-surface-950 p-6 text-center text-sm text-surface-300">
            <div>
              <p className="font-semibold text-surface-100">3D map unavailable</p>
              <p className="mt-1 text-xs text-surface-500">
                The 3D service didn't load. Try the 2D view — works everywhere.
              </p>
              <button
                type="button"
                onClick={() => setMode('2d')}
                className="mt-3 rounded-lg border border-surface-700 px-3 py-1.5 text-xs hover:border-surface-500"
              >
                ← Back to 2D
              </button>
            </div>
          </div>
        ) : (
          <ThreeDErrorBoundary onError={() => setThreeFailed(true)}>
            <Suspense
              fallback={
                <div className="flex h-full w-full items-center justify-center bg-surface-950 text-xs text-surface-400">
                  Loading 3D tiles…
                </div>
              }
            >
              <StadiumMap3D
                userLocation={props.userLocation}
                {...(props.encodedPolyline !== undefined ? { encodedPolyline: props.encodedPolyline } : {})}
              />
            </Suspense>
          </ThreeDErrorBoundary>
        )}
      </div>
    </div>
  );
};
