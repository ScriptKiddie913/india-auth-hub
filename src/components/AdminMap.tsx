import { useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MapPin, Users } from "lucide-react";

interface UserLocation {
  id: string;
  user_id: string;
  latitude: number;
  longitude: number;
  created_at: string;
  profiles?: {
    full_name: string;
  };
}

interface AdminMapProps {
  userLocations: UserLocation[];
}

const AdminMap = ({ userLocations }: AdminMapProps) => {
  const mapRef = useRef<HTMLDivElement | null>(null);
  const mapInstance = useRef<google.maps.Map>();

  useEffect(() => {
    // Load Google Maps script dynamically
    const loadGoogleMaps = () => {
      if (document.getElementById("google-maps-script")) return;

      const script = document.createElement("script");
      script.id = "google-maps-script";
      script.src = `https://maps.googleapis.com/maps/api/js?key=${
        import.meta.env.VITE_GOOGLE_MAPS_API_KEY
      }&libraries=places`;
      script.async = true;
      script.defer = true;
      document.body.appendChild(script);
    };

    loadGoogleMaps();

    const initMap = () => {
      if (!mapRef.current || !window.google) return;

      const defaultCenter = {
        lat: userLocations[0]?.latitude || 20.5937, // Default India center
        lng: userLocations[0]?.longitude || 78.9629,
      };

      const map = new google.maps.Map(mapRef.current, {
        center: defaultCenter,
        zoom: 5,
      });

      // Save instance for reuse
      mapInstance.current = map;

      // Add markers
      userLocations.forEach((loc) => {
        new google.maps.Marker({
          position: { lat: loc.latitude, lng: loc.longitude },
          map,
          title: loc.profiles?.full_name || `User ${loc.user_id}`,
        });
      });
    };

    // Initialize after script loads
    const interval = setInterval(() => {
      if (window.google && mapRef.current && !mapInstance.current) {
        initMap();
        clearInterval(interval);
      }
    }, 500);

    return () => clearInterval(interval);
  }, [userLocations]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-2xl font-bold flex items-center gap-2">
          <MapPin className="h-6 w-6 text-primary" />
          Live User Locations Map
        </CardTitle>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Users className="h-4 w-4" />
          {userLocations.length} active users
        </div>
      </CardHeader>
      <CardContent>
        <div
          ref={mapRef}
          className="w-full h-96 rounded-lg border bg-muted/10"
        />
      </CardContent>
    </Card>
  );
};

export default AdminMap;
