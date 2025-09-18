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
  /* ----- State holding all latest user locations ------------- */
  const [userLocations, setUserLocations] = useState<UserLocation[]>([]);

  /* ----- Refs --------------------------------------------------- */
  const mapRef = useRef<google.maps.Map | null>(null);
  const mapEl   = useRef<HTMLDivElement | null>(null);
  const markersRef = useRef<google.maps.Marker[]>([]);

  /* -------------------------------------------------------------------------
   * 1️⃣  Fetch & subscribe to user_locations
   * --------------------------------------------------------------------- */
  const fetchLocations = async () => {
    const { data, error } = await supabase
      .from("user_locations")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Supabase user_locations error:", error);
      return;
    }

    /* Merge name from the profiles table */
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

  useEffect(() => {
    /* Initial load */
    fetchLocations();

    /* Real‑time subscription –  user_locations inserts/updates */
    const channel = supabase
      .channel("user_locations")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "user_locations" },
        () => fetchLocations()
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "user_locations" },
        () => fetchLocations()
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, []);

  /* -------------------------------------------------------------------------
   * 2️⃣  Load Google Maps script (free tier)
   * --------------------------------------------------------------------- */
  useEffect(() => {
    /* Script already present? */
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

  /* -------------------------------------------------------------------------
   * 3️⃣  Initialise Map
   * --------------------------------------------------------------------- */
  const initMap = () => {
    if (!mapEl.current || !window.google) return;

    /* Default centre – the newest point if any */
    const defaultCenter =
      userLocations[0] !== undefined
        ? { lat: userLocations[0].latitude, lng: userLocations[0].longitude }
        : { lat: 0, lng: 0 };

    mapRef.current = new window.google.maps.Map(mapEl.current, {
      center: defaultCenter,
      zoom: userLocations.length ? 13 : 2,
    });

    /* Draw the initial markers */
    addMarkers(userLocations);
  };

  /* -------------------------------------------------------------------------
   * 4️⃣  Add or replace markers
   * --------------------------------------------------------------------- */
  const addMarkers = (locations: UserLocation[]) => {
    /* Remove old markers */
    markersRef.current.forEach((m) => m.setMap(null));
    markersRef.current = [];

    /* Add new markers */
    const newMarkers: google.maps.Marker[] = locations.map((loc) => {
      const marker = new window.google.maps.Marker({
        position: { lat: loc.latitude, lng: loc.longitude },
        map: mapRef.current!,
        title: loc.profiles?.full_name ?? "Unknown User",
        icon: {
          url: "https://maps.google.com/mapfiles/ms/icons/green-dot.png",
          scaledSize: new window.google.maps.Size(32, 32),
        },
      });

      /* Small popup with name & timestamp */
      const info = new window.google.maps.InfoWindow({
        content: `<strong>${loc.profiles?.full_name ?? "Unknown User"}</strong><br>${new Date(
          loc.created_at
        ).toLocaleString()}`,
      });

      marker.addListener("click", () => {
        info.open({ anchor: marker, map: mapRef.current! });
      });

      return marker;
    });

    markersRef.current = newMarkers;
  };

  /* When the array changes – re‑draw markers */
  useEffect(() => {
    if (!mapRef.current) return;
    addMarkers(userLocations);
  }, [userLocations]);

  /* -------------------------------------------------------------------------
   * 5️⃣  Render
   * --------------------------------------------------------------------- */
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
        <div ref={mapEl} className="w-full h-96 rounded-lg border bg-muted/10" />
      </CardContent>
    </Card>
  );
};

/* ----- Helper: pluralise “user” -------------------------------- */
function s(n: number): string {
  return n === 1 ? "" : "s";
}

export default AdminMap;
