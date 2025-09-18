/*  src/components/AdminMap.tsx  */
import { useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MapPin, Users } from "lucide-react";

/* ------- Types --------------------------------------------------- */
interface UserLocation {
  id: string;
  user_id: string;
  latitude: number;
  longitude: number;
  created_at: string;
  profiles?: { full_name: string };
}

interface AdminMapProps {
  userLocations: UserLocation[];
}

/* ------- Google Map Component ----------------------------------- */
const AdminMap = ({ userLocations }: AdminMapProps) => {
  /* ----- Refs --------------------------------------------------- */
  const mapRef = useRef<google.maps.Map | null>(null);
  const mapElement = useRef<HTMLDivElement | null>(null);
  const markersRef = useRef<google.maps.Marker[]>([]);

  /* ----- Load Google Maps script ----------------------------------------------------- */
  useEffect(() => {
    /* 1. If the api is already loaded, just initialise the map */
    if (window.google?.maps?.Map) {
      initMap();
      return;
    }

    /* 2. If it has not yet loaded create a new script tag */
    const script = document.createElement("script");
    script.src =
      "https://maps.googleapis.com/maps/api/js?key=YOUR_GOOGLE_MAPS_API_KEY"; // <‑‑ put your key here
    script.async = true;
    script.defer = true;
    script.onload = initMap;
    document.head.appendChild(script);
  }, []);

  /* ----- Initialise map ----------------------------------------------------- */
  const initMap = () => {
    if (!mapElement.current || !window.google) return;

    const initialCenter =
      userLocations[0] !== undefined
        ? { lat: userLocations[0].latitude, lng: userLocations[0].longitude }
        : { lat: 0, lng: 0 };

    mapRef.current = new window.google.maps.Map(mapElement.current, {
      center: initialCenter,
      zoom: userLocations.length ? 13 : 2,
      mapId: "YOUR_CUSTOM_MAP_ID_IF_DESIRED", // optional
    });

    /* Add markers for the current data set */
    addMarkers(userLocations);
  };

  /* ----- Add / Update markers ----------------------------------------------------- */
  const addMarkers = (locations: UserLocation[]) => {
    /* 1️⃣ Remove old markers */
    markersRef.current.forEach((m) => m.setMap(null));
    markersRef.current = [];

    /* 2️⃣ Create new ones */
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

      /* Optional: add a small infowindow */
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

  /* ----- Re‑render markers when data changes ------------------------------------ */
  useEffect(() => {
    if (!mapRef.current) return;
    addMarkers(userLocations);
  }, [userLocations]);

  /* ----- Render --------------------------------------------------- */
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
        <div
          ref={mapElement}
          className="w-full h-96 rounded-lg border bg-muted/10"
        />
      </CardContent>
    </Card>
  );
};

/* ------- Helper : pluralise ‘user’ ------------------------------ */
function s(n: number): string {
  return n === 1 ? "" : "s";
}

export default AdminMap;
