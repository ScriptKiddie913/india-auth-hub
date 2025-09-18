/*  src/components/PoliceMap.tsx  */
import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

interface Incident {
  id: string;
  latitude: number;
  longitude: number;
  title: string;
}

const PoliceMap = () => {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<L.Map>();

  // Dummy incident data – replace with a real API or Supabase query as needed
  const incidents: Incident[] = [
    {
      id: "1",
      latitude: 40.748817,
      longitude: -73.985428,
      title: "Suspicious Activity",
    },
    {
      id: "2",
      latitude: 40.752946,
      longitude: -73.977564,
      title: "Traffic Stop",
    },
  ];

  useEffect(() => {
    // initialise map only once
    if (!mapInstance.current && mapRef.current) {
      const map = L.map(mapRef.current).setView([40.748817, -73.985428], 13);
      mapInstance.current = map;

      L.tileLayer(
        "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
        {
          attribution:
            '&copy; <a href="https://openstreetmap.org">OpenStreetMap</a> contributors',
        }
      ).addTo(map);

      // officer marker – use browser geolocation if you want live position
      const officerIcon = L.icon({
        iconUrl: "/icons/officer.svg", // optional custom icon
        iconSize: [32, 32],
      });
      L.marker([40.748817, -73.985428], { icon: officerIcon })
        .addTo(map)
        .bindPopup("You are here");

      // incident markers
      incidents.forEach((inc) => {
        L.marker([inc.latitude, inc.longitude])
          .addTo(map)
          .bindPopup(inc.title);
      });
    }
  }, [incidents]);

  return (
    <div>
      <h2 className="text-xl font-semibold mb-2">Field Map</h2>
      <div
        ref={mapRef}
        style={{ height: "300px" }}
        className="rounded shadow"
      />
    </div>
  );
};

export default PoliceMap;
