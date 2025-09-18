// src/pages/AdminMap.tsx
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

interface Tourist {
  id: string;
  name: string;
  email: string;
  latitude: number;
  longitude: number;
}

export default function AdminMap() {
  const [tourists, setTourists] = useState<Tourist[]>([]);
  const [loading, setLoading] = useState(true);
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<google.maps.Marker[]>([]);

  // ✅ Load Google Maps script dynamically
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
  const initMap = () => {
    if (mapRef.current && !mapInstance.current) {
      mapInstance.current = new google.maps.Map(mapRef.current, {
        center: { lat: 20.5937, lng: 78.9629 }, // Center on India
        zoom: 5,
      });
    }
  };

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

    // ✅ Realtime updates (optional)
    const channel = supabase
      .channel("realtime-tourists")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tourists" },
        (payload) => {
          console.log("Realtime update:", payload);
          fetchTourists();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // ✅ Add markers on the map when tourists change
  useEffect(() => {
    if (mapInstance.current) {
      // Clear old markers
      markersRef.current.forEach((m) => m.setMap(null));
      markersRef.current = [];

      tourists.forEach((tourist) => {
        if (tourist.latitude && tourist.longitude) {
          const marker = new google.maps.Marker({
            position: { lat: tourist.latitude, lng: tourist.longitude },
            map: mapInstance.current!,
            title: tourist.name,
          });

          const infoWindow = new google.maps.InfoWindow({
            content: `
              <div>
                <h3>${tourist.name}</h3>
                <p>${tourist.email}</p>
                <p>Lat: ${tourist.latitude}, Lng: ${tourist.longitude}</p>
              </div>
            `,
          });

          marker.addListener("click", () => {
            infoWindow.open(mapInstance.current, marker);
          });

          markersRef.current.push(marker);
        }
      });
    }
  }, [tourists]);

  return (
    <div className="p-6">
      <Card>
        <CardHeader>
          <CardTitle>Admin Map - Tourist Tracking</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p>Loading tourists...</p>
          ) : (
            <div ref={mapRef} className="w-full h-[600px] rounded-lg shadow-lg" />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
