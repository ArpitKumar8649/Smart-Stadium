import { useState, useEffect } from 'react';

export function useGPS() {
  const [gpsContext, setGpsContext] = useState<{ lat: number, lng: number } | undefined>(undefined);

  useEffect(() => {
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setGpsContext({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        },
        () => {
          // Ignore errors, we just don't have GPS
        },
        { maximumAge: 60000, timeout: 5000 }
      );
    }
  }, []);

  return gpsContext;
}
