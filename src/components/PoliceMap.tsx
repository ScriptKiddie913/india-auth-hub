/**
 * src/components/PoliceMap.tsx
 *
 * Lightweight map implementation that renders an embedded OpenStreetMap
 * inside an iframe.  No external mapping libraries or API keys are used.
 *
 * The map can be centred on any lat/lng – change the constants below or
 * replace `defaultCenter` with dynamic geolocation data.
 */
import { useEffect, useState } from "react";

const DEFAULT_LAT = 40.748817;   // Example: New York, Empire State
const DEFAULT_LNG = -73.985428;

const POLICE_MAP_IFRAME_SRC = (lat: number, lng: number) => {
  // Build a small bbox around the point so the map has some context
  const delta = 0.02;
  const minLat = lat - delta;
  const maxLat = lat + delta;
  const minLng = lng - delta;
  const maxLng = lng + delta;
  const marker = `${lat},${lng}`;
  return `https://www.openstreetmap.org/export/embed.html?bbox=${minLng},${minLat},${maxLng},${maxLat}&layer=mapnik&marker=${marker}`;
};

const PoliceMap: React.FC = () => {
  const [coords, setCoords] = useState({ lat: DEFAULT_LAT, lng: DEFAULT_LNG });

  /* (Optional) Fetch the officer’s current location */
  useEffect(() => {
    if (!navigator.geolocation) return; // geolocation not available

    const watch = navigator.geolocation.watchPosition(
      (pos) => {
        setCoords({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        });
      },
      () => {
        /* ignore errors – fall back to default */
      },
      { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
    );

    return () => watch && navigator.geolocation.clearWatch(watch);
  }, []);

  const iframeSrc = POLICE_MAP_IFRAME_SRC(coords.lat, coords.lng);

  return (
    <div>
      <h2 className="text-xl font-semibold mb-2">Field Map</h2>
      <div className="rounded overflow-hidden shadow">
        <iframe
          src={iframeSrc}
          width="100%"
          height="300"
          frameBorder={0}
          allowFullScreen
          aria-label="OpenStreetMap"
        />
      </div>
    </div>
  );
};

export default PoliceMap;
