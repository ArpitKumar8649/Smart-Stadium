import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Ion,
  IonGeocodeProviderType,
  Cartesian2,
  Cartesian3,
  Color,
  Math as CesiumMath,
  HeightReference,
  PolygonHierarchy,
  PolylineGlowMaterialProperty,
  PolylineDashMaterialProperty,
  type Viewer as CesiumViewer,
} from 'cesium';
import {
  Viewer,
  GooglePhotorealistic3DTileset,
  Entity,
  PolylineGraphics,
  PolygonGraphics,
  CylinderGraphics,
  PointGraphics,
  CameraFlyTo,
  type CesiumComponentRef,
} from 'resium';
import polyline from '@mapbox/polyline';
import {
  loadFloors,
  loadRooms,
  loadSections,
  loadConnections,
  routeToSection,
  floorHeights,
  floorColor,
  matchFacility,
  FACILITY_STYLE,
  CONNECTION_STYLE,
  type FloorInfo,
  type RoomShape,
  type FacilityKind,
  type SectionInfo,
  type RoutePoint,
  type ConnectionInfo,
  type ConnectionKind,
} from './floorData.ts';
import { LimelightNav, type NavItem } from '../../components/ui/LimelightNav.tsx';

// Globe (photorealistic) + layers (structure stack) glyphs for the view toggle.
const GlobeIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" /><path d="M2 12h20" /></svg>
);
const LayersIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z" /><path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65" /><path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65" /></svg>
);

interface StadiumMap3DProps {
  userLocation: { lat: number; lng: number } | null;
  encodedPolyline?: string | null;
  /** A seating section name (e.g. "128") to highlight — driven by the concierge. */
  focusSection?: string | null;
}

/** MetLife Stadium — same anchor the Leaflet map uses. */
const METLIFE = { lat: 40.8128, lng: -74.0742 };

/** Default route origin — the venue graph routes by label, so "walk me there"
 *  starts from a real public gate rather than GPS. */
const DEFAULT_START_LABEL = 'Metlife VIP Gate';

// Set the Ion token once at module load (before any Viewer mounts). Undefined
// when the user hasn't configured it — the component shows a "needs token" card.
const ION_TOKEN = import.meta.env.VITE_CESIUM_ION_TOKEN;
if (ION_TOKEN) Ion.defaultAccessToken = ION_TOKEN;

type ViewMode = 'photo' | 'structure';

interface SelectedRoom {
  name: string;
  floorName: string;
}

interface CesiumPerformanceProfile {
  isHandset: boolean;
  resolutionScale: number;
  maximumScreenSpaceError: number;
  targetFrameRate: number;
  tileCacheBytes: number;
}

interface DeviceNavigator extends Navigator {
  deviceMemory?: number;
}

function getCesiumPerformanceProfile(): CesiumPerformanceProfile {
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

function useCesiumPerformanceProfile(): CesiumPerformanceProfile {
  const [profile, setProfile] = useState(getCesiumPerformanceProfile);

  useEffect(() => {
    const update = () => setProfile(getCesiumPerformanceProfile());
    const coarsePointer = window.matchMedia('(pointer: coarse)');
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    coarsePointer.addEventListener('change', update);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
      coarsePointer.removeEventListener('change', update);
    };
  }, []);

  return profile;
}

function usePageVisible(): boolean {
  const [pageVisible, setPageVisible] = useState(
    () => typeof document === 'undefined' || !document.hidden,
  );

  useEffect(() => {
    const update = () => setPageVisible(!document.hidden);
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, []);

  return pageVisible;
}

/**
 * 3D stadium view — Resium (declarative CesiumJS).
 *
 * Two modes:
 *  - "photo"     → Google Photorealistic 3D Tiles (the real exterior shell).
 *  - "structure" → tiles hidden, and MetLife's 8 real Mappedin levels are
 *                  extruded as a stacked cutaway model on a clean dark stage.
 *                  Selecting a level extrudes that floor's actual rooms, drops
 *                  facility pins (restrooms, first aid, food…), and lets you
 *                  click a room to read its name.
 *
 * Both modes share the same `userLocation` + route polyline as the 2D map.
 */
export const StadiumMap3D: React.FC<StadiumMap3DProps> = ({ userLocation, encodedPolyline, focusSection }) => {
  const performanceProfile = useCesiumPerformanceProfile();
  const pageVisible = usePageVisible();
  const [errored, setErrored] = useState<string | null>(null);
  const [mode, setMode] = useState<ViewMode>('photo');
  const [floors, setFloors] = useState<FloorInfo[]>([]);
  const [selectedFloor, setSelectedFloor] = useState<string | null>(null);
  const [rooms, setRooms] = useState<RoomShape[]>([]);
  const [picked, setPicked] = useState<SelectedRoom | null>(null);
  const [sections, setSections] = useState<SectionInfo[]>([]);
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  // Vertical circulation (elevators/stairs/escalators/ramps) + which kinds show.
  const [connections, setConnections] = useState<ConnectionInfo[]>([]);
  const [connFilter, setConnFilter] = useState<Record<ConnectionKind, boolean>>({
    elevator: true,
    escalator: false,
    stairs: false,
    ramp: true,
  });
  const [accessibleOnly, setAccessibleOnly] = useState(false);
  // Indoor walking path to the active section (null = none shown).
  const [routePts, setRoutePts] = useState<RoutePoint[] | null>(null);
  const [routing, setRouting] = useState(false);
  const roomsReqRef = useRef(0);
  const routeReqRef = useRef(0);
  const viewerRef = useRef<CesiumComponentRef<CesiumViewer> | null>(null);

  // Lazy-load the floor footprints + section index the first time Structure
  // mode is opened (both are small and needed together for section highlight).
  useEffect(() => {
    if (mode !== 'structure' || floors.length > 0) return;
    const ctrl = new AbortController();
    loadFloors(ctrl.signal)
      .then((f) => setFloors(f))
      .catch((e) => {
        if (!ctrl.signal.aborted) setErrored(e instanceof Error ? e.message : 'Could not load floor data.');
      });
    loadSections(ctrl.signal)
      .then((s) => setSections(s))
      .catch(() => {
        /* Section highlight is optional — the stack still works without it. */
      });
    loadConnections(ctrl.signal)
      .then((c) => setConnections(c))
      .catch(() => {
        /* Vertical circulation is optional — the stack still works without it. */
      });
    return () => ctrl.abort();
  }, [mode, floors.length]);

  // When a floor is selected, fetch its rooms (a race guard keeps the latest).
  useEffect(() => {
    if (!selectedFloor) {
      setRooms([]);
      setPicked(null);
      return;
    }
    const reqId = ++roomsReqRef.current;
    const ctrl = new AbortController();
    loadRooms(selectedFloor, ctrl.signal)
      .then((r) => {
        if (reqId === roomsReqRef.current) setRooms(r);
      })
      .catch(() => {
        if (reqId === roomsReqRef.current) setRooms([]);
      });
    return () => ctrl.abort();
  }, [selectedFloor]);

  // Activate a section by name: switch to Structure, select its floor, mark it
  // active, and fly the camera to it. Shared by the search box, section clicks,
  // and the concierge-driven `focusSection` prop.
  const activateSection = useCallback(
    (name: string) => {
      const sec = sections.find((s) => s.name.toUpperCase() === name.toUpperCase());
      if (!sec) return false;
      // Only set state here; the camera fly-to lives in a dedicated effect so it
      // runs *after* the mode-staging effect and never gets overridden by it.
      setMode('structure');
      setSelectedFloor(sec.floorId);
      setActiveSection(sec.name);
      setQuery('');
      return true;
    },
    [sections],
  );

  // The active section's record (name → floor, elevation, center). Declared
  // before the camera effects that depend on it to avoid a temporal-dead-zone.
  const activeSectionObj = useMemo(
    () => sections.find((s) => s.name === activeSection) ?? null,
    [sections, activeSection],
  );

  // Draw the walking path to the active section. Starts from a public gate
  // (the graph routes by label, not GPS), step-free if the fan is on GPS-less
  // accessibility — kept simple here. A race guard keeps only the latest route.
  const showRouteToActive = useCallback(
    (stepFree = false) => {
      if (!activeSection) return;
      const reqId = ++routeReqRef.current;
      setRouting(true);
      routeToSection(activeSection, DEFAULT_START_LABEL, stepFree)
        .then((pts) => {
          if (reqId !== routeReqRef.current) return;
          setRoutePts(pts);
          setRouting(false);
        })
        .catch(() => {
          if (reqId !== routeReqRef.current) return;
          setRoutePts(null);
          setRouting(false);
        });
    },
    [activeSection],
  );

  // Clearing the active section also clears any drawn route.
  useEffect(() => {
    if (!activeSection) setRoutePts(null);
  }, [activeSection]);

  // The indoor route as Cesium positions, lifted to each point's floor height so
  // the path climbs the stack visibly (level 0 at ground, upper levels raised).
  const routePositions3D = useMemo(() => {
    if (!routePts) return null;
    const heights = routePts.flatMap((p) => {
      const top = floorHeights(p.level).top;
      return [p.coords[0], p.coords[1], top + 6];
    });
    return Cartesian3.fromDegreesArrayHeights(heights);
  }, [routePts]);

  // The route's first point (start gate) — extracted so TS narrows it for the pin.
  const routeStart = routePts && routePts.length > 0 ? routePts[0] : null;

  // Concierge-driven highlight: when the conversation names a section, load the
  // index if needed and fly to it. Runs whenever the focused section changes.
  useEffect(() => {
    if (!focusSection) return;
    if (sections.length === 0) {
      const ctrl = new AbortController();
      loadSections(ctrl.signal)
        .then((s) => setSections(s))
        .catch(() => {});
      return () => ctrl.abort();
    }
    activateSection(focusSection);
    return undefined;
  }, [focusSection, sections.length, activateSection]);

  // Stage the scene per mode: in Structure, hide the globe/sky so the extruded
  // model floats on a clean dark backdrop (the navy was Cesium's empty globe).
  useEffect(() => {
    const viewer = viewerRef.current?.cesiumElement;
    if (!viewer) return;
    const scene = viewer.scene;
    if (mode === 'structure') {
      scene.globe.show = false;
      scene.backgroundColor = Color.fromCssColorString('#0a0e16');
      if (scene.skyBox) scene.skyBox.show = false;
      if (scene.skyAtmosphere) scene.skyAtmosphere.show = false;
      // Frame the whole stack — unless we entered Structure to show a specific
      // section, in which case the section fly-to effect owns the camera.
      if (!activeSection) {
        viewer.camera.flyTo({
          destination: Cartesian3.fromDegrees(METLIFE.lng, METLIFE.lat - 0.0042, 360),
          orientation: { heading: CesiumMath.toRadians(15), pitch: CesiumMath.toRadians(-24), roll: 0 },
          duration: 1.6,
        });
      }
    } else {
      scene.globe.show = true;
      if (scene.skyBox) scene.skyBox.show = true;
      if (scene.skyAtmosphere) scene.skyAtmosphere.show = true;
    }
    scene.requestRender();
    // `activeSection` intentionally omitted from deps: we only want stack-framing
    // on a genuine mode switch, not every time the highlighted section changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  // Fly to the active section. Declared after the staging effect so, on the same
  // render that switches into Structure, this camera move runs last and wins.
  useEffect(() => {
    if (mode !== 'structure' || !activeSectionObj) return;
    const viewer = viewerRef.current?.cesiumElement;
    if (!viewer) return;
    const { top } = floorHeights(activeSectionObj.elevation);
    viewer.camera.flyTo({
      destination: Cartesian3.fromDegrees(
        activeSectionObj.center[0],
        activeSectionObj.center[1] - 0.0016,
        top + 190,
      ),
      orientation: { heading: CesiumMath.toRadians(0), pitch: CesiumMath.toRadians(-42), roll: 0 },
      duration: 1.8,
    });
    viewer.scene.requestRender();
  }, [mode, activeSectionObj]);

  // Decode the Google Routes polyline (lat,lng pairs) into Cesium positions.
  const routePositions = useMemo(() => {
    if (!encodedPolyline) return null;
    try {
      const pairs = polyline.decode(encodedPolyline) as [number, number][];
      if (pairs.length < 2) return null;
      return Cartesian3.fromDegreesArrayHeights(pairs.flatMap(([lat, lng]) => [lng, lat, 8]));
    } catch {
      return null;
    }
  }, [encodedPolyline]);

  const selectedElevation = useMemo(
    () => floors.find((f) => f.id === selectedFloor)?.elevation ?? null,
    [floors, selectedFloor],
  );
  const selectedFloorName = useMemo(
    () => floors.find((f) => f.id === selectedFloor)?.name ?? '',
    [floors, selectedFloor],
  );

  // Facility rooms on the selected floor that have a usable center + a match.
  const facilityPins = useMemo(() => {
    if (selectedElevation === null) return [];
    const { top } = floorHeights(selectedElevation);
    return rooms
      .filter((r) => r.center && r.name)
      .map((r) => ({ room: r, kind: matchFacility(r.name) }))
      .filter((x): x is { room: typeof x.room; kind: FacilityKind } => x.kind !== null)
      .map((x) => {
        const style = FACILITY_STYLE[x.kind];
        const c = x.room.center as [number, number];
        return {
          id: x.room.id,
          name: x.room.name,
          label: `${style.icon} ${style.label}`,
          color: style.color,
          position: Cartesian3.fromDegrees(c[0], c[1], top + 6),
        };
      });
  }, [rooms, selectedElevation]);

  // Reverse index: which polygon ids on the selected floor are seating sections
  // (so a room click can activate the section instead of just naming it).
  const sectionByPolygon = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of sections) {
      if (s.floorId === selectedFloor) m.set(s.polygonId, s.name);
    }
    return m;
  }, [sections, selectedFloor]);

  // Type-ahead matches for the section search box. Matches anywhere in the name
  // (so "club" finds "MetLife 50 Club", "suite 3" finds the suites) but ranks
  // prefix matches first, then alphabetically/numerically. Cap the list.
  const searchMatches = useMemo(() => {
    const q = query.trim().toUpperCase();
    if (!q) return [];
    return sections
      .filter((s) => s.name.toUpperCase().includes(q))
      .sort((a, b) => {
        const ap = a.name.toUpperCase().startsWith(q) ? 0 : 1;
        const bp = b.name.toUpperCase().startsWith(q) ? 0 : 1;
        if (ap !== bp) return ap - bp;
        return a.name.localeCompare(b.name, undefined, { numeric: true });
      })
      .slice(0, 12);
  }, [query, sections]);

  // Visible vertical connections → drawable columns. A connection shows when
  // its kind is enabled, passes the accessible-only filter, and — when a
  // specific floor is selected — actually stops at that floor. "All levels"
  // (selectedElevation === null) shows every enabled connection.
  //
  // Each is drawn through its REAL per-floor stops (no averaging): an elevator
  // rises straight (stacked stops), while an escalator/ramp travels
  // horizontally as it climbs, so its line reads as a true diagonal. We also
  // expose every stop (for per-floor discs) and the stop on the selected floor
  // (emphasised + labelled so a fan knows exactly where to board on their level).
  const connectionColumns = useMemo(() => {
    if (connections.length === 0) return [];
    return connections
      .filter((c) => connFilter[c.type] && (!accessibleOnly || c.accessible))
      .filter(
        (c) =>
          selectedElevation === null ||
          c.points.some((p) => p.elevation === selectedElevation),
      )
      .flatMap((c) => {
        const stops = [...c.points].sort((a, b) => a.elevation - b.elevation);
        if (stops.length < 2) return [];
        const hi = stops[stops.length - 1];
        const lo = stops[0];
        if (!hi || !lo) return [];
        const style = CONNECTION_STYLE[c.type];
        // One vertex per real stop, each at its own [lng, lat] + floor height.
        const coords = stops.flatMap((p) => [
          p.coords[0],
          p.coords[1],
          floorHeights(p.elevation).base + 1,
        ]);
        const color = Color.fromCssColorString(style.color);
        // Per-floor stop discs, with the selected floor's stop flagged.
        const stopDiscs = stops.map((p) => ({
          id: `${c.id}-${p.elevation}`,
          position: Cartesian3.fromDegrees(p.coords[0], p.coords[1], floorHeights(p.elevation).base + 1),
          onSelectedFloor: p.elevation === selectedElevation,
        }));
        // Elevator shaft: a slim translucent cylinder at the lowest stop's exact
        // coords, spanning its true vertical extent (elevators barely drift).
        const shaftBase = floorHeights(lo.elevation).base;
        const shaftTop = floorHeights(hi.elevation).top;
        const shaftLength = Math.max(shaftTop - shaftBase, 1);
        return [{
          id: c.id,
          name: c.name,
          type: c.type,
          accessible: c.accessible,
          color,
          colorCss: style.color,
          icon: style.icon,
          label: style.label,
          positions: Cartesian3.fromDegreesArrayHeights(coords),
          stopDiscs,
          shaftCenter: Cartesian3.fromDegrees(lo.coords[0], lo.coords[1], shaftBase + shaftLength / 2),
          shaftLength,
          // Label caps the highest real stop, not an averaged point.
          topPosition: Cartesian3.fromDegrees(hi.coords[0], hi.coords[1], floorHeights(hi.elevation).top + 4),
        }];
      });
  }, [connections, connFilter, accessibleOnly, selectedElevation]);

  // Live count of currently-visible connections (drives the legend badge).
  const visibleConnCount = connectionColumns.length;

  // Camera target: the fan's location if known, otherwise the stadium.
  const focus = userLocation ?? METLIFE;

  const viewNavItems: NavItem[] = [
    { id: 'photo', icon: <GlobeIcon />, label: 'Photorealistic' },
    { id: 'structure', icon: <LayersIcon />, label: 'Structure' },
  ];
  const showTiles = mode === 'photo';

  // Request-render mode means React/Cesium state changes must explicitly ask
  // for a frame. This makes static 3D views idle instead of continuously
  // consuming the phone GPU between interactions.
  useEffect(() => {
    if (!pageVisible) return;
    const viewer = viewerRef.current?.cesiumElement;
    if (!viewer || viewer.isDestroyed()) return;
    viewer.scene.requestRender();
  }, [
    pageVisible,
    performanceProfile.resolutionScale,
    performanceProfile.maximumScreenSpaceError,
    performanceProfile.tileCacheBytes,
    mode,
    floors,
    selectedFloor,
    rooms,
    activeSection,
    routePositions,
    routePositions3D,
    connectionColumns,
    facilityPins,
    userLocation,
  ]);

  if (!ION_TOKEN) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-surface-950 p-6 text-center" style={{ minHeight: '300px' }}>
        <div className="max-w-xs">
          <p className="text-sm font-semibold text-surface-100">Enable the 3D MetLife view</p>
          <p className="mt-2 text-xs leading-relaxed text-surface-400">
            Add your free Cesium Ion token to <code className="text-primary-300">frontend/.env</code> as
            {' '}<code className="text-primary-300">VITE_CESIUM_ION_TOKEN=…</code>, then restart Vite.
          </p>
          <p className="mt-2 text-[11px] text-surface-500">The 2D map and all navigation work without it.</p>
        </div>
      </div>
    );
  }

  if (errored) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-surface-950/90 p-6 text-center backdrop-blur" style={{ minHeight: '300px' }}>
        <div className="max-w-xs">
          <p className="text-sm font-semibold text-red-300">3D view could not load</p>
          <p className="mt-2 break-words text-xs text-surface-400">{errored}</p>
          <p className="mt-2 text-[11px] text-surface-500">Switch to 2D — route guidance remains available.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full" style={{ minHeight: '300px' }}>
      <Viewer
        ref={viewerRef}
        full
        // Google Photorealistic Tiles require Google's geocoder. The Ion enum
        // uses Cesium Ion's Google-backed geocoding — no separate Google key.
        geocoder={IonGeocodeProviderType.GOOGLE}
        baseLayer={false}
        baseLayerPicker={false}
        homeButton={false}
        sceneModePicker={false}
        navigationHelpButton={false}
        animation={false}
        timeline={false}
        fullscreenButton={false}
        infoBox={false}
        selectionIndicator={false}
        scene3DOnly
        requestRenderMode
        maximumRenderTimeChange={Infinity}
        // Turn Cesium's main render loop off while the browser tab is hidden.
        useDefaultRenderLoop={pageVisible}
        resolutionScale={performanceProfile.resolutionScale}
        useBrowserRecommendedResolution={false}
        targetFrameRate={performanceProfile.targetFrameRate}
        // This is a creation-only Cesium setting, kept low and stable to avoid
        // recreating the viewer as a phone changes orientation.
        msaaSamples={1}
      >
        {/* Photorealistic tiles — only shown in photo mode. */}
        <GooglePhotorealistic3DTileset
          show={showTiles && pageVisible}
          onlyUsingWithGoogleGeocoder
          maximumScreenSpaceError={performanceProfile.maximumScreenSpaceError}
          cacheBytes={performanceProfile.tileCacheBytes}
          cullRequestsWhileMoving
          preloadWhenHidden={false}
          preloadFlightDestinations={false}
          foveatedScreenSpaceError
          skipLevelOfDetail={performanceProfile.isHandset}
          onError={(err) => setErrored(err instanceof Error ? err.message : 'Google 3D Tiles could not load.')}
        />

        {/* Fly to the fan (or the stadium) once, from a low tilted angle. */}
        <CameraFlyTo
          duration={2}
          destination={Cartesian3.fromDegrees(focus.lng, focus.lat, 700)}
          orientation={{
            heading: CesiumMath.toRadians(0),
            pitch: CesiumMath.toRadians(-38),
            roll: 0,
          }}
          once
        />

        {/* --- Structure mode: extruded floor stack --- */}
        {mode === 'structure' &&
          floors.map((floor) => {
            const { base, top } = floorHeights(floor.elevation);
            const isSel = floor.id === selectedFloor;
            const dimmed = selectedFloor !== null && !isSel;
            const alpha = dimmed ? 0.1 : 0.42;
            return floor.geometry.type === 'Polygon'
              ? renderSlab(floor.id, floor.geometry.coordinates, base, top, floorColor(floor.elevation, floors.length, alpha), isSel)
              : floor.geometry.coordinates.map((rings, i) =>
                  renderSlab(`${floor.id}-${i}`, rings, base, top, floorColor(floor.elevation, floors.length, alpha), isSel),
                );
          })}

        {/* --- Floating floor-name labels, stacked at each level's height --- */}
        {mode === 'structure' &&
          floors.map((floor) => {
            const { base } = floorHeights(floor.elevation);
            const isSel = floor.id === selectedFloor;
            return (
              <Entity
                key={`lbl-${floor.id}`}
                position={Cartesian3.fromDegrees(METLIFE.lng - 0.0026, METLIFE.lat + 0.0022, base + 2)}
                label={{
                  text: floor.name,
                  font: isSel ? 'bold 13px sans-serif' : '12px sans-serif',
                  fillColor: isSel ? Color.fromCssColorString('#7dd3fc') : Color.fromCssColorString('#cbd5e1'),
                  outlineColor: Color.BLACK,
                  outlineWidth: 3,
                  showBackground: true,
                  backgroundColor: Color.fromCssColorString('#0f172a').withAlpha(0.6),
                  pixelOffset: new Cartesian2(0, 0),
                }}
              />
            );
          })}

        {/* --- Selected floor's real rooms, extruded and clickable. A room
             that is a seating section, when active, glows amber and rises. --- */}
        {mode === 'structure' &&
          selectedElevation !== null &&
          rooms.map((room) => {
            const { top } = floorHeights(selectedElevation);
            const sectionName = sectionByPolygon.get(room.id) ?? null;
            const isActive = sectionName !== null && sectionName === activeSection;
            const onClick = sectionName
              ? () => activateSection(sectionName)
              : () => room.name && setPicked({ name: room.name, floorName: selectedFloorName });
            return room.hierarchies.map((h, i) => (
              <Entity
                key={`${room.id}-${i}`}
                {...(room.name ? { name: room.name } : {})}
                onClick={onClick}
              >
                <PolygonGraphics
                  hierarchy={h}
                  height={top}
                  extrudedHeight={isActive ? top + 20 : top + 4}
                  material={
                    isActive
                      ? Color.fromCssColorString('#f59e0b').withAlpha(0.92)
                      : Color.fromCssColorString('#cbd5e1').withAlpha(0.82)
                  }
                  outline
                  outlineColor={isActive ? Color.fromCssColorString('#fde68a') : Color.fromCssColorString('#334155')}
                />
              </Entity>
            ));
          })}

        {/* --- Vertical circulation: each connection drawn through its real
             per-floor stops. Elevators also get a translucent shaft cylinder;
             escalators/ramps use a dashed (inclined) line; stairs glow. --- */}
        {mode === 'structure' &&
          connectionColumns.map((col) => {
            const clickInfo = () =>
              setPicked({ name: `${col.icon} ${col.name}`, floorName: col.accessible ? 'Accessible · step-free' : col.label });
            const dashed = col.type === 'escalator' || col.type === 'ramp';
            return (
              <Entity key={`conn-${col.id}`} onClick={clickInfo}>
                <PolylineGraphics
                  positions={col.positions}
                  width={col.accessible ? 7 : 5}
                  material={
                    dashed
                      ? new PolylineDashMaterialProperty({
                          color: col.color.withAlpha(0.95),
                          dashLength: 12,
                        })
                      : new PolylineGlowMaterialProperty({
                          glowPower: 0.25,
                          color: col.color.withAlpha(0.9),
                        })
                  }
                />
              </Entity>
            );
          })}

        {/* Elevator shafts — slim translucent cylinders so they read as real
             vertical shafts rather than a bare line. */}
        {mode === 'structure' &&
          connectionColumns
            .filter((col) => col.type === 'elevator')
            .map((col) => (
              <Entity key={`conn-shaft-${col.id}`} position={col.shaftCenter} onClick={() => setPicked({ name: `${col.icon} ${col.name}`, floorName: 'Accessible · step-free' })}>
                <CylinderGraphics
                  length={col.shaftLength}
                  topRadius={2.2}
                  bottomRadius={2.2}
                  material={col.color.withAlpha(0.22)}
                  outline
                  outlineColor={col.color.withAlpha(0.7)}
                  slices={16}
                />
              </Entity>
            ))}

        {/* Per-floor stop discs — one per level a connection serves. The stop on
             the currently-selected floor is enlarged so a fan sees exactly where
             to board on their level. */}
        {mode === 'structure' &&
          connectionColumns.flatMap((col) =>
            col.stopDiscs.map((d) => (
              <Entity key={`stop-${d.id}`} position={d.position}>
                <PointGraphics
                  pixelSize={d.onSelectedFloor ? 15 : 7}
                  color={col.color}
                  outlineColor={d.onSelectedFloor ? Color.WHITE : Color.fromCssColorString('#0f172a')}
                  outlineWidth={d.onSelectedFloor ? 3 : 1}
                />
              </Entity>
            )),
          )}

        {/* Connection name label — on the selected floor's stop when a floor is
             chosen, otherwise capping the highest stop. */}
        {mode === 'structure' &&
          connectionColumns.map((col) => {
            const onFloor = col.stopDiscs.find((d) => d.onSelectedFloor);
            const labelPos = onFloor ? onFloor.position : col.topPosition;
            return (
              <Entity
                key={`conn-name-${col.id}`}
                position={labelPos}
                label={{
                  text: `${col.icon} ${col.name}`,
                  font: onFloor ? 'bold 11px sans-serif' : '10px sans-serif',
                  fillColor: Color.WHITE,
                  outlineColor: Color.BLACK,
                  outlineWidth: 2,
                  pixelOffset: new Cartesian2(0, -14),
                  showBackground: true,
                  backgroundColor: col.color.withAlpha(onFloor ? 0.6 : 0.4),
                }}
              />
            );
          })}

        {/* --- Facility pins on the selected floor --- */}
        {mode === 'structure' &&
          facilityPins.map((pin) => (
            <Entity
              key={`fac-${pin.id}`}
              position={pin.position}
              onClick={() => setPicked({ name: pin.name, floorName: selectedFloorName })}
              point={{
                pixelSize: 10,
                color: Color.fromCssColorString(pin.color),
                outlineColor: Color.WHITE,
                outlineWidth: 2,
              }}
              label={{
                text: pin.label,
                font: '11px sans-serif',
                fillColor: Color.WHITE,
                outlineColor: Color.BLACK,
                outlineWidth: 2,
                pixelOffset: new Cartesian2(0, -16),
                showBackground: true,
                backgroundColor: Color.fromCssColorString(pin.color).withAlpha(0.35),
              }}
            />
          ))}

        {/* --- Active section beacon: a bright label floating above it --- */}
        {mode === 'structure' && activeSectionObj && selectedElevation !== null && (
          <Entity
            position={Cartesian3.fromDegrees(
              activeSectionObj.center[0],
              activeSectionObj.center[1],
              floorHeights(selectedElevation).top + 30,
            )}
            point={{ pixelSize: 12, color: Color.fromCssColorString('#f59e0b'), outlineColor: Color.WHITE, outlineWidth: 2 }}
            label={{
              text: `Section ${activeSectionObj.name}`,
              font: 'bold 14px sans-serif',
              fillColor: Color.fromCssColorString('#fde68a'),
              outlineColor: Color.BLACK,
              outlineWidth: 3,
              showBackground: true,
              backgroundColor: Color.fromCssColorString('#78350f').withAlpha(0.85),
              pixelOffset: new Cartesian2(0, -18),
            }}
          />
        )}

        {/* Stadium anchor label (photo mode only — noisy over the stack). */}
        {mode === 'photo' && (
          <Entity
            position={Cartesian3.fromDegrees(METLIFE.lng, METLIFE.lat, 60)}
            point={{ pixelSize: 14, color: Color.fromCssColorString('#3b82f6'), outlineColor: Color.WHITE, outlineWidth: 2 }}
            label={{ text: 'MetLife Stadium', font: '14px sans-serif', fillColor: Color.WHITE, outlineColor: Color.BLACK, outlineWidth: 2, pixelOffset: new Cartesian2(0, -22) }}
          />
        )}

        {/* Fan location pin. */}
        {userLocation && (
          <Entity
            position={Cartesian3.fromDegrees(userLocation.lng, userLocation.lat, 20)}
            point={{ pixelSize: 12, color: Color.fromCssColorString('#22c55e'), outlineColor: Color.WHITE, outlineWidth: 2, heightReference: HeightReference.NONE }}
            label={{ text: 'You', font: '12px sans-serif', fillColor: Color.WHITE, outlineColor: Color.BLACK, outlineWidth: 2, pixelOffset: new Cartesian2(0, -18) }}
          />
        )}

        {/* Outdoor route line, clamped to the ground (photo mode). */}
        {routePositions && mode === 'photo' && (
          <Entity>
            <PolylineGraphics
              positions={routePositions}
              width={5}
              material={Color.fromCssColorString('#3b82f6').withAlpha(0.96)}
              clampToGround
            />
          </Entity>
        )}

        {/* Indoor route to the active section (structure mode) — an amber path
            that climbs the stack from the start gate to the seat. */}
        {routePositions3D && mode === 'structure' && (
          <Entity>
            <PolylineGraphics
              positions={routePositions3D}
              width={6}
              material={
                new PolylineGlowMaterialProperty({
                  color: Color.fromCssColorString('#f59e0b'),
                  glowPower: 0.25,
                })
              }
            />
          </Entity>
        )}
        {routeStart && mode === 'structure' && (
          <Entity
            position={Cartesian3.fromDegrees(
              routeStart.coords[0],
              routeStart.coords[1],
              floorHeights(routeStart.level).top + 10,
            )}
            point={{ pixelSize: 12, color: Color.fromCssColorString('#22c55e'), outlineColor: Color.WHITE, outlineWidth: 2 }}
            label={{
              text: `Start · ${routeStart.label}`,
              font: '11px sans-serif',
              fillColor: Color.WHITE,
              outlineColor: Color.BLACK,
              outlineWidth: 2,
              showBackground: true,
              backgroundColor: Color.fromCssColorString('#065f46').withAlpha(0.85),
              pixelOffset: new Cartesian2(0, -16),
            }}
          />
        )}
      </Viewer>

      {/* Mode toggle — Photorealistic (globe) vs Structure (layers) */}
      <div className="absolute left-3 top-3 z-10 flex items-center gap-2">
        <LimelightNav
          className="h-11 rounded-xl px-1"
          iconContainerClassName="!p-3"
          iconClassName="w-5 h-5"
          items={viewNavItems}
          activeIndex={mode === 'photo' ? 0 : 1}
          onTabChange={(i) => setMode(i === 0 ? 'photo' : 'structure')}
        />
        <span className="rounded-full bg-surface-900/85 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-surface-300 backdrop-blur">
          {mode === 'photo' ? 'Photorealistic' : 'Structure'}
        </span>
      </div>

      {/* Find my seat (structure mode) — type a section/suite from your ticket to
          fly + glow, then optionally route a walking path to it. */}
      {mode === 'structure' && sections.length > 0 && (
        <div className="absolute left-1/2 top-3 z-20 w-60 -translate-x-1/2">
          <div className="rounded-2xl border border-surface-700 bg-surface-900/90 p-2 backdrop-blur">
            <p className="mb-1.5 flex items-center justify-center gap-1 text-[10px] font-mono uppercase tracking-wider text-surface-400">
              <span aria-hidden>🎟️</span> Find my seat
            </p>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && searchMatches[0]) activateSection(searchMatches[0].name);
                if (e.key === 'Escape') setQuery('');
              }}
              type="text"
              autoComplete="off"
              placeholder="Section or suite from your ticket…"
              className="w-full rounded-full border border-surface-700 bg-surface-950/80 px-3 py-1.5 text-center text-xs text-surface-100 placeholder:text-surface-500 focus:border-primary focus:outline-none"
            />
            {searchMatches.length > 0 && (
              <div className="mt-1.5 flex max-h-56 flex-col gap-1 overflow-y-auto">
                {searchMatches.map((s) => (
                  <button
                    key={s.name}
                    onClick={() => activateSection(s.name)}
                    className="flex items-center justify-between gap-2 rounded-lg bg-surface-800 px-2.5 py-1.5 text-left text-[11px] font-semibold text-surface-100 transition hover:bg-primary hover:text-surface-950"
                  >
                    <span className="truncate">{s.name}</span>
                    <span className="shrink-0 rounded bg-surface-950/50 px-1.5 py-0.5 text-[9px] font-normal opacity-70">
                      Lvl {s.elevation}
                    </span>
                  </button>
                ))}
              </div>
            )}
            {query.trim() && searchMatches.length === 0 && (
              <p className="mt-1.5 text-center text-[10px] text-surface-500">No match — try a number or "suite".</p>
            )}
          </div>
        </div>
      )}

      {/* Floor selector (structure mode) */}
      {mode === 'structure' && floors.length > 0 && (
        <div className="absolute bottom-3 left-3 z-10 flex max-h-[70%] flex-col-reverse gap-1 overflow-y-auto rounded-xl border border-surface-700 bg-surface-900/85 p-1.5 backdrop-blur">
          <button
            onClick={() => setSelectedFloor(null)}
            className={`rounded-lg px-2.5 py-1 text-left text-[11px] transition ${selectedFloor === null ? 'bg-primary text-surface-950' : 'text-surface-300 hover:bg-surface-800'}`}
          >
            All levels
          </button>
          {floors.map((f) => (
            <button
              key={f.id}
              onClick={() => setSelectedFloor(f.id)}
              className={`rounded-lg px-2.5 py-1 text-left text-[11px] transition ${selectedFloor === f.id ? 'bg-primary text-surface-950' : 'text-surface-300 hover:bg-surface-800'}`}
            >
              {f.name}
            </button>
          ))}
        </div>
      )}

      {/* Vertical-circulation legend + filter (structure mode) */}
      {mode === 'structure' && connections.length > 0 && (
        <div className="absolute right-3 top-14 z-10 w-[168px] rounded-xl border border-surface-700 bg-surface-900/85 p-2 backdrop-blur">
          <p className="mb-1.5 text-[10px] font-mono uppercase tracking-wider text-surface-400">Getting around</p>
          <div className="flex flex-col gap-1">
            {(Object.keys(CONNECTION_STYLE) as ConnectionKind[]).map((kind) => {
              const style = CONNECTION_STYLE[kind];
              const on = connFilter[kind];
              const count = connections.filter((c) => c.type === kind).length;
              return (
                <button
                  key={kind}
                  onClick={() => setConnFilter((prev) => ({ ...prev, [kind]: !prev[kind] }))}
                  className={`flex items-center justify-between gap-2 rounded-lg px-2 py-1 text-left text-[11px] transition ${on ? 'bg-surface-800 text-surface-50' : 'text-surface-500 hover:bg-surface-800/50'}`}
                >
                  <span className="flex items-center gap-1.5">
                    <span
                      aria-hidden
                      className="inline-block h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: on ? style.color : 'transparent', border: `1px solid ${style.color}` }}
                    />
                    {style.icon} {style.label}
                  </span>
                  <span className="text-[9px] opacity-60">{count}</span>
                </button>
              );
            })}
          </div>
          <label className="mt-1.5 flex cursor-pointer items-center gap-1.5 border-t border-surface-800 pt-1.5 text-[10px] text-surface-300">
            <input
              type="checkbox"
              checked={accessibleOnly}
              onChange={(e) => setAccessibleOnly(e.target.checked)}
              className="h-3 w-3 accent-primary"
            />
            ♿ Step-free only
          </label>
          <p className="mt-1 text-[9px] text-surface-500">
            {selectedElevation === null
              ? `${visibleConnCount} shown · all levels`
              : `${visibleConnCount} on ${selectedFloorName || 'this level'}`}
          </p>
        </div>
      )}

      {/* Active-section card (structure mode) */}
      {mode === 'structure' && activeSectionObj && (
        <div className="absolute bottom-3 right-3 z-10 w-[230px] rounded-xl border border-amber-500/40 bg-surface-900/92 p-3 backdrop-blur">
          <button
            onClick={() => setActiveSection(null)}
            className="absolute right-2 top-2 text-surface-500 hover:text-surface-200"
            aria-label="Clear section"
          >
            ×
          </button>
          <p className="text-[10px] font-mono uppercase tracking-wider text-amber-400">Seating section</p>
          <p className="pr-4 text-lg font-bold text-surface-50">
            {/^\d/.test(activeSectionObj.name) ? `Section ${activeSectionObj.name}` : activeSectionObj.name}
          </p>
          <p className="mt-0.5 text-[11px] text-surface-400">
            {floors.find((f) => f.id === activeSectionObj.floorId)?.name ?? 'Seating bowl'}
          </p>
          <div className="mt-2.5 flex items-center gap-1.5">
            {routePts ? (
              <button
                onClick={() => setRoutePts(null)}
                className="flex-1 rounded-lg border border-surface-600 px-2 py-1.5 text-[11px] font-semibold text-surface-200 transition hover:bg-surface-800"
              >
                Hide path
              </button>
            ) : (
              <button
                onClick={() => showRouteToActive(false)}
                disabled={routing}
                className="flex-1 rounded-lg bg-amber-500 px-2 py-1.5 text-[11px] font-bold text-surface-950 transition hover:bg-amber-400 disabled:opacity-50"
              >
                {routing ? 'Routing…' : 'Walk me there'}
              </button>
            )}
          </div>
          {routePts && (
            <p className="mt-1.5 text-[10px] text-surface-500">
              Path from {routePts[0]?.label ?? 'gate'} · {routePts.length} steps
            </p>
          )}
        </div>
      )}

      {/* Clicked-room popup (non-section rooms) */}
      {picked && !activeSectionObj && (
        <div className="absolute bottom-3 right-3 z-10 max-w-[220px] rounded-xl border border-surface-700 bg-surface-900/90 p-3 backdrop-blur">
          <button
            onClick={() => setPicked(null)}
            className="absolute right-2 top-2 text-surface-500 hover:text-surface-200"
            aria-label="Close"
          >
            ×
          </button>
          <p className="pr-4 text-sm font-semibold text-surface-100">{picked.name}</p>
          <p className="mt-0.5 text-[11px] text-surface-400">{picked.floorName}</p>
        </div>
      )}

      <div className="pointer-events-none absolute right-3 top-3 z-10 rounded-full border border-surface-700 bg-surface-900/85 px-2 py-0.5 text-[10px] font-mono text-surface-300 backdrop-blur">
        {mode === 'photo' ? '3D · Cesium Ion' : '3D · MetLife structure'}
      </div>
    </div>
  );
};

/** Render one extruded slab (a floor footprint ring set) as a Resium entity. */
function renderSlab(
  key: string,
  rings: number[][][],
  base: number,
  top: number,
  color: Color,
  selected: boolean,
) {
  const ring0 = rings[0] ?? [];
  const outer = Cartesian3.fromDegreesArray(ring0.flatMap((c) => [c[0] as number, c[1] as number]));
  return (
    <Entity key={key}>
      <PolygonGraphics
        hierarchy={new PolygonHierarchy(outer)}
        height={base}
        extrudedHeight={top}
        material={color}
        outline
        outlineColor={selected ? Color.WHITE.withAlpha(0.9) : Color.fromCssColorString('#0f172a').withAlpha(0.6)}
      />
    </Entity>
  );
}
