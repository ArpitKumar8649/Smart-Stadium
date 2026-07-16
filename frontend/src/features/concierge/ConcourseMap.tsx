import React, { useState, useEffect, lazy, Suspense, type ComponentType, type ReactNode } from 'react';
import { OutdoorMap } from './OutdoorMap.tsx';
import { LimelightNav, type NavItem } from '../../components/ui/LimelightNav.tsx';

// 2D map (folded map) + 3D (cube) glyphs for the mode limelight.
const MapIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.106 5.553a2 2 0 0 0 1.788 0l3.659-1.83A1 1 0 0 1 21 4.619v12.764a1 1 0 0 1-.553.894l-4.553 2.277a2 2 0 0 1-1.788 0l-4.212-2.106a2 2 0 0 0-1.788 0l-3.659 1.83A1 1 0 0 1 3 19.381V6.618a1 1 0 0 1 .553-.894l4.553-2.277a2 2 0 0 1 1.788 0z" /><path d="M15 5.764v15" /><path d="M9 3.236v15" /></svg>
);
const CubeIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /><path d="m3.3 7 8.7 5 8.7-5" /><path d="M12 22V12" /></svg>
);

interface ConcourseMapProps {
  userLocation: { lat: number; lng: number } | null;
  encodedPolyline?: string | null;
  onSetLocation?: (loc: { lat: number; lng: number }) => void;
  /** Seating section from the conversation — flips to 3D and highlights it. */
  focusSection?: string | null;
  /** Keep constrained/mobile layouts on the lightweight 2D view until chosen. */
  prefer2d?: boolean;
}

interface StadiumMap3DProps {
  userLocation: { lat: number; lng: number } | null;
  encodedPolyline?: string | null;
  focusSection?: string | null;
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

  // When the conversation names a seating section, jump to 3D so the fan sees
  // it light up (unless 3D has failed — then stay on the working 2D map).
  const { focusSection, prefer2d = false } = props;
  useEffect(() => {
    if (focusSection && !threeFailed && !prefer2d) setMode('3d');
  }, [focusSection, prefer2d, threeFailed]);

  const mapNavItems: NavItem[] = [
    { id: '2d', icon: <MapIcon />, label: '2D map' },
    { id: '3d', icon: <CubeIcon />, label: '3D view' },
  ];

  return (
    <div className="flex flex-col h-full w-full">
      <div className="flex items-center justify-between border-b border-surface-800 bg-surface-900/90 px-3 py-1.5 backdrop-blur">
        <span className="text-[10px] font-mono uppercase tracking-wider text-surface-400">
          Stadium Map
        </span>
        <LimelightNav
          className="h-11 rounded-xl px-1"
          iconContainerClassName="!p-3"
          iconClassName="w-5 h-5"
          items={mapNavItems}
          activeIndex={mode === '2d' ? 0 : 1}
          onTabChange={(i) => setMode(i === 0 ? '2d' : '3d')}
        />
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
                {...(props.focusSection !== undefined ? { focusSection: props.focusSection } : {})}
              />
            </Suspense>
          </ThreeDErrorBoundary>
        )}
      </div>
    </div>
  );
};
