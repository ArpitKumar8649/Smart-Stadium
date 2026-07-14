import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Ion,
  IonGeocodeProviderType,
  Cartesian2,
  Cartesian3,
  Color,
  Math as CesiumMath,
  HeightReference,
  PolygonHierarchy,
  type Viewer as CesiumViewer,
} from 'cesium';
import {
  Viewer,
  GooglePhotorealistic3DTileset,
  Entity,
  PolylineGraphics,
  PolygonGraphics,
  CameraFlyTo,
  type CesiumComponentRef,
} from 'resium';
import polyline from '@mapbox/polyline';
import {
  loadFloors,
  loadRooms,
  floorHeights,
  floorColor,
  matchFacility,
  FACILITY_STYLE,
  type FloorInfo,
  type RoomShape,
  type FacilityKind,
} from './floorData.ts';

interface StadiumMap3DProps {
  userLocation: { lat: number; lng: number } | null;
  encodedPolyline?: string | null;
}

/** MetLife Stadium — same anchor the Leaflet map uses. */
const METLIFE = { lat: 40.8128, lng: -74.0742 };

// Set the Ion token once at module load (before any Viewer mounts). Undefined
// when the user hasn't configured it — the component shows a "needs token" card.
const ION_TOKEN = import.meta.env.VITE_CESIUM_ION_TOKEN;
if (ION_TOKEN) Ion.defaultAccessToken = ION_TOKEN;

type ViewMode = 'photo' | 'structure';

interface SelectedRoom {
  name: string;
  floorName: string;
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
export const StadiumMap3D: React.FC<StadiumMap3DProps> = ({ userLocation, encodedPolyline }) => {
  const [errored, setErrored] = useState<string | null>(null);
  const [mode, setMode] = useState<ViewMode>('photo');
  const [floors, setFloors] = useState<FloorInfo[]>([]);
  const [selectedFloor, setSelectedFloor] = useState<string | null>(null);
  const [rooms, setRooms] = useState<RoomShape[]>([]);
  const [picked, setPicked] = useState<SelectedRoom | null>(null);
  const roomsReqRef = useRef(0);
  const viewerRef = useRef<CesiumComponentRef<CesiumViewer> | null>(null);

  // Lazy-load the floor footprints the first time Structure mode is opened.
  useEffect(() => {
    if (mode !== 'structure' || floors.length > 0) return;
    const ctrl = new AbortController();
    loadFloors(ctrl.signal)
      .then((f) => setFloors(f))
      .catch((e) => {
        if (!ctrl.signal.aborted) setErrored(e instanceof Error ? e.message : 'Could not load floor data.');
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
      // Frame the stack from a low three-quarter angle.
      viewer.camera.flyTo({
        destination: Cartesian3.fromDegrees(METLIFE.lng, METLIFE.lat - 0.0042, 360),
        orientation: { heading: CesiumMath.toRadians(15), pitch: CesiumMath.toRadians(-24), roll: 0 },
        duration: 1.6,
      });
    } else {
      scene.globe.show = true;
      if (scene.skyBox) scene.skyBox.show = true;
      if (scene.skyAtmosphere) scene.skyAtmosphere.show = true;
    }
  }, [mode]);

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

  // Camera target: the fan's location if known, otherwise the stadium.
  const focus = userLocation ?? METLIFE;

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

  const showTiles = mode === 'photo';

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
      >
        {/* Photorealistic tiles — only shown in photo mode. */}
        <GooglePhotorealistic3DTileset
          show={showTiles}
          onlyUsingWithGoogleGeocoder
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

        {/* --- Selected floor's real rooms, extruded and clickable --- */}
        {mode === 'structure' &&
          selectedElevation !== null &&
          rooms.map((room) => {
            const { top } = floorHeights(selectedElevation);
            return room.hierarchies.map((h, i) => (
              <Entity
                key={`${room.id}-${i}`}
                {...(room.name ? { name: room.name } : {})}
                onClick={() => room.name && setPicked({ name: room.name, floorName: selectedFloorName })}
              >
                <PolygonGraphics
                  hierarchy={h}
                  height={top}
                  extrudedHeight={top + 4}
                  material={Color.fromCssColorString('#cbd5e1').withAlpha(0.82)}
                  outline
                  outlineColor={Color.fromCssColorString('#334155')}
                />
              </Entity>
            ));
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
      </Viewer>

      {/* Mode toggle */}
      <div className="absolute left-3 top-3 z-10 flex overflow-hidden rounded-full border border-surface-700 bg-surface-900/85 text-[11px] font-semibold backdrop-blur">
        <button
          onClick={() => setMode('photo')}
          className={`px-3 py-1 transition ${mode === 'photo' ? 'bg-primary text-surface-950' : 'text-surface-300 hover:text-surface-100'}`}
        >
          Photorealistic
        </button>
        <button
          onClick={() => setMode('structure')}
          className={`px-3 py-1 transition ${mode === 'structure' ? 'bg-primary text-surface-950' : 'text-surface-300 hover:text-surface-100'}`}
        >
          Structure
        </button>
      </div>

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

      {/* Clicked-room popup */}
      {picked && (
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
