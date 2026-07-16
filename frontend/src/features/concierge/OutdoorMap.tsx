import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, useMap } from 'react-leaflet';
import polyline from '@mapbox/polyline';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// Fix Leaflet's default icon path issues with webpack/vite.
// Leaflet keeps this internal method off its public type definition.
type DefaultIconPrototype = typeof L.Icon.Default.prototype & {
  _getIconUrl?: () => string;
};

const defaultIconPrototype = L.Icon.Default.prototype as DefaultIconPrototype;
delete defaultIconPrototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

interface OutdoorMapProps {
  userLocation: { lat: number; lng: number } | null;
  encodedPolyline?: string | null;
  /** Called when the user manually types/overrides a location on the map. */
  onSetLocation?: (loc: { lat: number; lng: number }) => void;
}

// A handy preset so testers far from the venue (e.g. overseas) can demo instantly.
const DEMO_LOCATION = { lat: 40.7357, lng: -74.1724, label: 'Newark, NJ (demo)' };

const RecenterMap = ({ center, bounds }: { center: [number, number], bounds: L.LatLngBounds | null }) => {
  const map = useMap();
  useEffect(() => {
    if (bounds) {
      map.fitBounds(bounds, { padding: [50, 50] });
    } else {
      map.setView(center, map.getZoom());
    }
  }, [center, bounds, map]);
  return null;
};

/** Floating control that lets the user override their location by typing coordinates. */
const LocationOverride: React.FC<{
  userLocation: { lat: number; lng: number } | null;
  onSetLocation?: ((loc: { lat: number; lng: number }) => void) | undefined;
}> = ({ userLocation, onSetLocation }) => {
  const [open, setOpen] = useState(false);
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Prefill the inputs with the current location when the panel opens.
  useEffect(() => {
    if (open) {
      setLat(userLocation ? String(userLocation.lat) : '');
      setLng(userLocation ? String(userLocation.lng) : '');
      setError(null);
    }
  }, [open, userLocation]);

  const apply = (loc: { lat: number; lng: number }) => {
    onSetLocation?.(loc);
    setOpen(false);
  };

  const submit = () => {
    const nLat = Number(lat);
    const nLng = Number(lng);
    if (!Number.isFinite(nLat) || !Number.isFinite(nLng)) {
      setError('Enter valid numbers.');
      return;
    }
    if (nLat < -90 || nLat > 90 || nLng < -180 || nLng > 180) {
      setError('Lat must be −90…90, lng −180…180.');
      return;
    }
    apply({ lat: nLat, lng: nLng });
  };

  return (
    <div
      className="absolute right-3 top-3 z-[1000]"
      // Keep clicks/scroll from reaching the Leaflet map underneath.
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          title="Set / override my location"
          aria-label="Set or override my location"
          className="flex h-10 w-10 items-center justify-center rounded-full border border-surface-700 bg-surface-900/95 text-lg shadow-lg backdrop-blur transition hover:border-primary-500 hover:bg-surface-800"
        >
          📍
        </button>
      ) : (
        <div className="w-64 rounded-xl border border-surface-700 bg-surface-900/97 p-3 shadow-xl backdrop-blur">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-semibold text-surface-100">Set my location</span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="text-surface-400 hover:text-surface-100"
            >
              ✕
            </button>
          </div>
          <div className="space-y-2">
            <label className="block">
              <span className="mb-0.5 block text-xs text-surface-400">Latitude</span>
              <input
                value={lat}
                onChange={(e) => setLat(e.target.value)}
                inputMode="decimal"
                placeholder="40.7357"
                className="w-full rounded-lg border border-surface-700 bg-surface-950 px-2.5 py-1.5 text-sm text-surface-100 focus:border-primary-500 focus:outline-none"
              />
            </label>
            <label className="block">
              <span className="mb-0.5 block text-xs text-surface-400">Longitude</span>
              <input
                value={lng}
                onChange={(e) => setLng(e.target.value)}
                inputMode="decimal"
                placeholder="-74.1724"
                className="w-full rounded-lg border border-surface-700 bg-surface-950 px-2.5 py-1.5 text-sm text-surface-100 focus:border-primary-500 focus:outline-none"
              />
            </label>
            {error && <p className="text-xs text-red-400">{error}</p>}
            <button
              type="button"
              onClick={submit}
              className="w-full rounded-lg bg-primary-500 px-3 py-1.5 text-sm font-semibold text-surface-950 transition hover:bg-primary-400"
            >
              Set location
            </button>
            <button
              type="button"
              onClick={() => apply({ lat: DEMO_LOCATION.lat, lng: DEMO_LOCATION.lng })}
              className="w-full rounded-lg border border-surface-700 px-3 py-1.5 text-xs text-surface-300 transition hover:border-surface-500 hover:text-surface-100"
            >
              Use {DEMO_LOCATION.label}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export const OutdoorMap: React.FC<OutdoorMapProps> = ({ userLocation, encodedPolyline, onSetLocation }) => {
  // Default to a central stadium location if no user location
  const defaultLocation: [number, number] = [40.8128, -74.0742];
  const center: [number, number] = userLocation ? [userLocation.lat, userLocation.lng] : defaultLocation;

  let decodedPath: [number, number][] = [];
  let bounds: L.LatLngBounds | null = null;

  if (encodedPolyline) {
    try {
      // @mapbox/polyline returns [lat, lng][]
      decodedPath = polyline.decode(encodedPolyline) as [number, number][];
      if (decodedPath.length > 0) {
        bounds = L.latLngBounds(decodedPath);
        if (userLocation) {
          bounds.extend([userLocation.lat, userLocation.lng]);
        }
      }
    } catch (e) {
      console.error("Failed to decode polyline", e);
    }
  }

  return (
    <div className="w-full h-full relative" style={{ minHeight: '300px' }}>
      <MapContainer
        center={center}
        zoom={15}
        style={{ height: '100%', width: '100%', position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {userLocation && (
          <Marker position={[userLocation.lat, userLocation.lng]} />
        )}
        {decodedPath.length > 0 && (
          <Polyline positions={decodedPath} color="#3b82f6" weight={5} opacity={0.8} />
        )}
        <RecenterMap center={center} bounds={bounds} />
      </MapContainer>
      <LocationOverride userLocation={userLocation} onSetLocation={onSetLocation} />
    </div>
  );
};
