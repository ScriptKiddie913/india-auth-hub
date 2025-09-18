// src/pages/AdminDashboard.tsx
import { useEffect, useState, useRef } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface Tourist {
  id: string;
  name: string;
  email: string;
  phone: string;
  latitude: number;
  longitude: number;
}

export default function AdminDashboard() {
  const [tourists, setTourists] = useState<Tourist[]>([]);
  const [loading, setLoading] = useState(true);
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<google.maps.Map | null>(null);

  // ✅ Load Google Maps script
  useEffect(() => {
    const existingScript = document.getElementById("google-maps");
    if (!existingScript) {
      const script = document.createElement("script");
      script.id = "google-maps";
      script.src = `https://maps.googleapis.com/maps/api/js?key=${
        import.meta.env.VITE_GOOGLE_MAPS_API_KEY
      }&libraries=places`;
      script.async = true;
      script.defer = true;
      script.onload = initMap;
      document.body.appendChild(script);
    } else {
      initMap();
    }
  }, []);

  // ✅ Initialize map
  function initMap() {
    if (mapRef.current && !mapInstance.current) {
      mapInstance.current = new google.maps.Map(mapRef.current, {
        center: { lat: 20.5937, lng: 78.9629 }, // India center
        zoom: 4,
      });
    }
  }

  // ✅ Fetch tourists from Supabase
  useEffect(() => {
    const fetchTourists = async () => {
      setLoading(true);
      const { data, error } = await supabase.from("tourists").select("*");
      if (error) {
        console.error("Error fetching tourists:", error);
      } else {
        setTourists(data || []);
      }
      setLoading(false);
    };

    fetchTourists();
  }, []);

  // ✅ Add markers on the map
  useEffect(() => {
    if (mapInstance.current && tourists.length > 0) {
      tourists.forEach((tourist) => {
        new google.maps.Marker({
          position: { lat: tourist.latitude, lng: tourist.longitude },
          map: mapInstance.current!,
          title: tourist.name,
        });
      });
    }
  }, [tourists]);

  return (
    <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-6">
      {/* Map */}
      <Card className="md:col-span-2">
        <CardHeader>
          <CardTitle>Tourist Locations</CardTitle>
        </CardHeader>
        <CardContent>
          <div ref={mapRef} className="w-full h-[500px] rounded-lg" />
        </CardContent>
      </Card>

      {/* Tourist List */}
      <Card>
        <CardHeader>
          <CardTitle>Registered Tourists</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p>Loading...</p>
          ) : tourists.length > 0 ? (
            <ul className="space-y-3">
              {tourists.map((t) => (
                <li
                  key={t.id}
                  className="border rounded-lg p-3 shadow-sm hover:bg-gray-50"
                >
                  <p className="font-semibold">{t.name}</p>
                  <p className="text-sm text-gray-600">{t.email}</p>
                  <p className="text-sm text-gray-600">{t.phone}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p>No tourists found</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
