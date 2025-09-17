import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { User, LogOut, MapPin, Trash2, Navigation } from "lucide-react";

const GEOFENCE_RADIUS = 5000; // 5 km radius

export default function Dashboard() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [user, setUser] = useState<any>(null);
  const [destinations, setDestinations] = useState<any[]>([]);
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(
    null
  );
  const [isSafe, setIsSafe] = useState(true);

  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<any>(null);
  const userMarker = useRef<any>(null);
  const geofenceStatus = useRef<{ [key: string]: boolean }>({});
  const alertSound = useRef<HTMLAudioElement | null>(null);

  // ✅ Load alert sound once
  useEffect(() => {
    alertSound.current = new Audio("/a.mp3");
    alertSound.current.loop = true; // Loop until back inside
  }, []);

  // ✅ Get user session
  useEffect(() => {
    const getUser = async () => {
      const { data, error } = await supabase.auth.getUser();
      if (error) {
        console.error("Error fetching user:", error);
      } else {
        setUser(data.user);
      }
    };
    getUser();
  }, []);

  // ✅ Fetch destinations
  useEffect(() => {
    if (!user) return;
    const fetchDestinations = async () => {
      const { data, error } = await supabase
        .from("destinations")
        .select("*")
        .eq("user_id", user.id);
      if (error) {
        console.error("Error fetching destinations:", error);
      } else {
        setDestinations(data || []);
      }
    };
    fetchDestinations();
  }, [user]);

  // ✅ Initialize Google Maps
  useEffect(() => {
    if (!mapRef.current || !window.google) return;

    mapInstance.current = new window.google.maps.Map(mapRef.current, {
      zoom: 14,
      center: { lat: 22.5726, lng: 88.3639 },
    });
  }, []);

  // ✅ Watch real-time location
  useEffect(() => {
    if (!navigator.geolocation) {
      toast({
        title: "Geolocation not supported",
        description: "Your browser does not support location tracking.",
        variant: "destructive",
      });
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        setLocation({ lat: latitude, lng: longitude });

        if (mapInstance.current) {
          mapInstance.current.setCenter({ lat: latitude, lng: longitude });

          if (!userMarker.current) {
            userMarker.current = new window.google.maps.Marker({
              position: { lat: latitude, lng: longitude },
              map: mapInstance.current,
              title: "Your Location",
              icon: {
                path: window.google.maps.SymbolPath.CIRCLE,
                scale: 8,
                fillColor: "#007bff",
                fillOpacity: 1,
                strokeWeight: 2,
                strokeColor: "#ffffff",
              },
            });
          } else {
            userMarker.current.setPosition({ lat: latitude, lng: longitude });
          }
        }

        // ✅ Check geofences
        if (user && destinations.length > 0) {
          let insideAnyGeofence = false;

          destinations.forEach((dest) => {
            if (dest.latitude && dest.longitude) {
              const distance = getDistance(
                latitude,
                longitude,
                dest.latitude,
                dest.longitude
              );
              const isInside = distance <= GEOFENCE_RADIUS;
              const wasInside = geofenceStatus.current[dest.id] || false;

              if (isInside) {
                insideAnyGeofence = true;
              }

              if (isInside && !wasInside) {
                toast({
                  title: "📍 Geofence Entered",
                  description: `You entered the area of ${dest.name}`,
                });
                geofenceStatus.current[dest.id] = true;
              }

              if (!isInside && wasInside) {
                toast({
                  title: "🚪 Geofence Exited",
                  description: `You left the area of ${dest.name}`,
                  variant: "destructive",
                });
                geofenceStatus.current[dest.id] = false;

                // 🔊 Play alert sound
                if (alertSound.current) {
                  alertSound.current.play().catch((err) => {
                    console.error("Audio play error:", err);
                  });
                }
              }
            }
          });

          // ✅ Update global Safe/Unsafe
          setIsSafe(insideAnyGeofence);

          // 🔇 Stop sound if back inside
          if (insideAnyGeofence && alertSound.current) {
            alertSound.current.pause();
            alertSound.current.currentTime = 0;
          }
        }
      },
      (err) => {
        console.error("Geolocation error:", err);
        toast({
          title: "Location Error",
          description: "Unable to fetch your location.",
          variant: "destructive",
        });
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 5000 }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [user, destinations]);

  // ✅ Haversine distance
  const getDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371e3; // meters
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lon2 - lon1) * Math.PI) / 180;

    const a =
      Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
  };

  // ✅ Logout
  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/login");
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-secondary/20 to-accent/10 p-6">
      {/* Header */}
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <User className="h-8 w-8 text-primary" /> Welcome, {user?.email}
        </h1>
        <Button onClick={handleLogout} variant="outline" className="flex items-center gap-2">
          <LogOut className="h-4 w-4" /> Logout
        </Button>
      </div>

      {/* Live Location */}
      {location && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-2xl font-bold flex items-center gap-2">
              <Navigation className="h-5 w-5 text-primary" /> Your Live Location
            </CardTitle>
            <CardDescription>
              Latitude: {location.lat.toFixed(6)}, Longitude: {location.lng.toFixed(6)}
            </CardDescription>
            <div className="mt-2">
              {isSafe ? (
                <span className="px-3 py-1 rounded-full bg-green-500 text-white font-semibold">
                  ✅ Safe (Inside Geofence)
                </span>
              ) : (
                <span className="px-3 py-1 rounded-full bg-red-500 text-white font-semibold">
                  ⚠️ Unsafe (Outside Geofence)
                </span>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div ref={mapRef} className="w-full h-64 rounded-lg border" />
          </CardContent>
        </Card>
      )}

      {/* Saved Destinations */}
      <Card>
        <CardHeader>
          <CardTitle className="text-xl font-bold flex items-center gap-2">
            <MapPin className="h-5 w-5 text-primary" /> Saved Destinations
          </CardTitle>
        </CardHeader>
        <CardContent>
          {destinations.length > 0 ? (
            <ul className="space-y-2">
              {destinations.map((dest) => (
                <li key={dest.id} className="flex justify-between items-center p-2 border rounded-lg">
                  <span>
                    {dest.name} - ({dest.latitude}, {dest.longitude})
                  </span>
                  <Button
                    variant="destructive"
                    size="sm"
                    className="flex items-center gap-2"
                  >
                    <Trash2 className="h-4 w-4" /> Delete
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground">No destinations saved yet.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
