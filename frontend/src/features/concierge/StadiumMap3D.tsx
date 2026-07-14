import { useMemo, useState } from 'react';
import { Ion, IonGeocodeProviderType, Cartesian2, Cartesian3, Color, Math as CesiumMath } from 'cesium';
import { Viewer, GooglePhotorealistic3DTileset, Entity, PolylineGraphics, CameraFlyTo } from 'resium';
import polyline from '@mapbox/polyline';

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

/**
 * 3D stadium view — Resium (declarative CesiumJS) + Google Photorealistic 3D
 * Tiles. Resium owns the Cesium lifecycle, so React StrictMode's double-mount
 * no longer double-fetches the tileset (the bug the raw-Cesium version hit).
 *
 * The same `userLocation` + `encodedPolyline` that drive the 2D Leaflet map
 * render here as a pin and a route line, so both views stay in sync.
 */
export const StadiumMap3D: React.FC<StadiumMap3DProps> = ({ userLocation, encodedPolyline }) => {
  const [errored, setErrored] = useState<string | null>(null);

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
          <p className="text-sm font-semibold text-red-300">3D tiles could not load</p>
          <p className="mt-2 break-words text-xs text-surface-400">{errored}</p>
          <p className="mt-2 text-[11px] text-surface-500">Switch to 2D — route guidance remains available.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full" style={{ minHeight: '300px' }}>
      <Viewer
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
        <GooglePhotorealistic3DTileset
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

        {/* Stadium anchor label. */}
        <Entity
          position={Cartesian3.fromDegrees(METLIFE.lng, METLIFE.lat, 60)}
          point={{ pixelSize: 14, color: Color.fromCssColorString('#3b82f6'), outlineColor: Color.WHITE, outlineWidth: 2 }}
          label={{ text: 'MetLife Stadium', font: '14px sans-serif', fillColor: Color.WHITE, outlineColor: Color.BLACK, outlineWidth: 2, pixelOffset: new Cartesian2(0, -22) }}
        />

        {/* Fan location pin. */}
        {userLocation && (
          <Entity
            position={Cartesian3.fromDegrees(userLocation.lng, userLocation.lat, 20)}
            point={{ pixelSize: 12, color: Color.fromCssColorString('#22c55e'), outlineColor: Color.WHITE, outlineWidth: 2 }}
            label={{ text: 'You', font: '12px sans-serif', fillColor: Color.WHITE, outlineColor: Color.BLACK, outlineWidth: 2, pixelOffset: new Cartesian2(0, -18) }}
          />
        )}

        {/* Outdoor route line, clamped to the ground. */}
        {routePositions && (
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

      <div className="pointer-events-none absolute right-3 top-3 z-10 rounded-full border border-surface-700 bg-surface-900/85 px-2 py-0.5 text-[10px] font-mono text-surface-300 backdrop-blur">
        3D · Cesium Ion
      </div>
    </div>
  );
};
