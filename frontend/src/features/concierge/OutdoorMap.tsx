import React, { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, useMap } from 'react-leaflet';
import polyline from '@mapbox/polyline';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// Fix Leaflet's default icon path issues with webpack/vite
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

interface OutdoorMapProps {
  userLocation: { lat: number; lng: number } | null;
  encodedPolyline?: string | null;
}

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

export const OutdoorMap: React.FC<OutdoorMapProps> = ({ userLocation, encodedPolyline }) => {
  // Default to a central stadium location if no user location
  const defaultLocation: [number, number] = [37.7749, -122.4194]; 
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
    </div>
  );
};
