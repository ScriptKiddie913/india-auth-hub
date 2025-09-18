/*  src/components/AdminMap.tsx  */
import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MapPin, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

/* ----- Types --------------------------------------------------- */
interface UserLocation {
  id: string;
  user_id: string;
  latitude: number;
  longitude: number;
  created_at: string;
  profiles?: { full_name: string };
}

/* ----- Map Component ------------------------------------------ */
const AdminMap = () => {
  /* ----- Local state ------------------------------------------- */
  const [userLocations, setUserLocations] = useState<UserLocation[]>([]);

  /* ----- Refs --------------------------------------------------- */
  const mapRef = useRef<google.maps.Map | null>(null);
  const mapElement = useRef<HTMLDivElement | null>(null);
  const markersRef = useRef<google.maps.Marker[]>([]);

  /* ----- Fetch user locations from Supabase -------------------- */
  const fetchUserLocations = async () => {
    const { data, error } = await supabase
      .from("user_locations")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Supabase location fetch error:", error);
      return;
    }

    /* Merge user names via profiles table (just like the dashboard) */
    if (data && data.length) {
      const ids = [...new Set(data.map((l) => l.user_id))];
      const { data: pro } = await supabase
        .from("profiles")
        .select("user_id, full_name")
        .in("user_id", ids);

      const merged = data.map((loc) => ({
        ...loc,
        profiles: pro?.find((p) => p.user_id === loc.user_id),
      }));
      setUserLocations(merged as UserLocation[]);
    } else {
      setUserLocations([]);
    }
  };

  /* ----- Real‑time subscription ------------------------------- */
  useEffect(() => {
    fetchUserLocations(); // initial load

    const channel = supabase
      .channel("user-locations")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "user_locations",
        },
        () => fetchUserLocations()
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, []);

  /* ----- Load Google Maps script ------------------------------ */
  useEffect(() => {
    if (window.google?.maps?.Map) {
      initMap();
      return;
    }

    const script = document.createElement("script");
    script.src =
      "https://maps.googleapis.com/maps/api/js?key=YOUR_GOOGLE_MAPS_API_KEY";
    script.async = true;
    script.defer = true;
    script.onload = initMap;
    document.head.appendChild(script);
  }, []);

  /* ----- Initialise map --------------------------------------- */
  const initMap = () => {
    if (!mapElement.current || !window.google) return;

    const initialCenter =
      userLocations[0] !== undefined
        ? { lat: userLocations[0].latitude, lng: userLocations[0].longitude }
        : { lat: 0, lng: 0 };

    mapRef.current = new window.google.maps.Map(mapElement.current, {
      center: initialCenter,
      zoom: userLocations.length ? 13 : 2,
    });

    addMarkers(userLocations);
  };

  /* ----- Add / update markers --------------------------------- */
  const addMarkers = (locations: UserLocation[]) => {
    markersRef.current.forEach((m) => m.setMap(null));
    markersRef.current = [];

    const newMarkers = locations.map((loc) => {
      const marker = new window.google.maps.Marker({
        position: { lat: loc.latitude, lng: loc.longitude },
        map: mapRef.current!,
        title: loc.profiles?.full_name ?? "Unknown User",
        icon: {
          url: "https://maps.google.com/mapfiles/ms/icons/green-dot.png",
          scaledSize: new window.google.maps.Size(32, 32),
        },
      });

      const info = new window.google.maps.InfoWindow({
        content: `<strong>${loc.profiles?.full_name ?? "Unknown User"}</strong><br>${new Date(
          loc.created_at
        ).toLocaleString()}`,
      });

      marker.addListener("click", () => {
        info.open({
          anchor: marker,
          map: mapRef.current!,
          shouldFocus: false,
        });
      });

      return marker;
    });

    markersRef.current = newMarkers;
  };

  /* ----- Re‑render markers when location data changes ----- */
  useEffect(() => {
    if (!mapRef.current) return;
    addMarkers(userLocations);
  }, [userLocations]);

  /* ----- Render ---------------------------------------------- */
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-2xl font-bold flex items-center gap-2">
          <MapPin className="h-6 w-6 text-primary" />
          Live User Locations Map
        </CardTitle>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Users className="h-4 w-4" />
          {userLocations.length} active user{s(userLocations.length)}
        </div>
      </CardHeader>
      <CardContent>
        <div ref={mapElement} className="w-full h-96 rounded-lg border bg-muted/10" />
      </CardContent>
    </Card>
  );
};

/* ----- Helper: pluralise ‘user’ -------------------------------- */
function s(n: number): string {
  return n === 1 ? "" : "s";
}

export default AdminMap;
