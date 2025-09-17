import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { AlertTriangle, LogOut, MapPin, Shield, User, Clock, Plus, Trash2 } from "lucide-react";

interface AppUser {
  id: string;
  email?: string;
}

interface UserLocation {
  id: string;
  user_id: string;
  latitude: number;
  longitude: number;
  created_at: string;
}

interface PanicAlert {
  id: string;
  user_id: string;
  message: string;
  latitude: number;
  longitude: number;
  status: string;
  created_at: string;
}

interface Destination {
  id: string;
  user_id: string;
  name: string;
  latitude: number | null;
  longitude: number | null;
  created_at: string;
}

// ✅ Utility: haversine distance (meters)
function getDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371000;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

const GEOFENCE_RADIUS = 500; // meters

const Dashboard = () => {
  const [user, setUser] = useState<AppUser | null>(null);
  const [userLocations, setUserLocations] = useState<UserLocation[]>([]);
  const [panicAlerts, setPanicAlerts] = useState<PanicAlert[]>([]);
  const [destinations, setDestinations] = useState<Destination[]>([]);
  const [currentLocation, setCurrentLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [panicMessage, setPanicMessage] = useState("");
  const [newDestination, setNewDestination] = useState("");
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const { toast } = useToast();

  // ✅ Refs for map + markers + circles
  const mapRef = useRef<HTMLDivElement | null>(null);
  const mapInstance = useRef<google.maps.Map | null>(null);
  const markerRef = useRef<google.maps.Marker | null>(null);
  const geofenceCircles = useRef<Record<string, google.maps.Circle>>({});
  const geofenceStatus = useRef<Record<string, boolean>>({});
  const isFirstLoad = useRef(true);

  // --- AUTH ---
  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate("/signin");
        return;
      }
      setUser(session.user);
      setLoading(false);
    };
    checkAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT" || !session) {
        navigate("/signin");
      } else {
        setUser(session.user);
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  // --- Fetch data ---
  useEffect(() => {
    if (!user) return;
    fetchDestinations();
    fetchUserLocations();
    fetchPanicAlerts();
    startLocationTracking();
  }, [user]);

  const fetchDestinations = async () => {
    const { data, error } = await supabase
      .from("destinations")
      .select("*")
      .eq("user_id", user?.id)
      .order("created_at", { ascending: false });
    if (!error) setDestinations(data || []);
  };

  const fetchUserLocations = async () => {
    const { data, error } = await supabase
      .from("user_locations")
      .select("*")
      .eq("user_id", user?.id)
      .order("created_at", { ascending: false })
      .limit(10);
    if (!error) setUserLocations(data || []);
  };

  const fetchPanicAlerts = async () => {
    const { data, error } = await supabase
      .from("panic_alerts")
      .select("*")
      .eq("user_id", user?.id)
      .order("created_at", { ascending: false });
    if (!error) setPanicAlerts(data || []);
  };

  // --- Location tracking + Geofencing ---
  const startLocationTracking = () => {
    if ("geolocation" in navigator) {
      const watchId = navigator.geolocation.watchPosition(
        (pos) => {
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          setCurrentLocation({ latitude: lat, longitude: lng });
          saveUserLocation(lat, lng);

          // Init map
          if (mapRef.current && !mapInstance.current && window.google) {
            mapInstance.current = new google.maps.Map(mapRef.current, {
              center: { lat, lng },
              zoom: 15,
            });
            markerRef.current = new google.maps.Marker({
              position: { lat, lng },
              map: mapInstance.current,
              title: "You are here",
            });
          }

          // Update marker
          if (markerRef.current) {
            markerRef.current.setPosition({ lat, lng });
          }
          if (mapInstance.current && isFirstLoad.current) {
            mapInstance.current.panTo({ lat, lng });
            isFirstLoad.current = false;
          }

          // ✅ Draw circles
          if (mapInstance.current) {
            destinations.forEach((dest) => {
              if (dest.latitude && dest.longitude) {
                if (!geofenceCircles.current[dest.id]) {
                  const circle = new google.maps.Circle({
                    strokeColor: "#00FF00", // green
                    strokeOpacity: 0.8,
                    strokeWeight: 2,
                    fillColor: "#00FF00",
                    fillOpacity: 0.2,
                    map: mapInstance.current,
                    center: { lat: dest.latitude, lng: dest.longitude },
                    radius: GEOFENCE_RADIUS,
                  });
                  geofenceCircles.current[dest.id] = circle;
                }
              }
            });

            // Remove circles for deleted
            Object.keys(geofenceCircles.current).forEach((id) => {
              if (!destinations.find((d) => d.id === id)) {
                geofenceCircles.current[id].setMap(null);
                delete geofenceCircles.current[id];
              }
            });
          }

          // ✅ Check geofence entry/exit
          if (user && destinations.length > 0) {
            destinations.forEach((dest) => {
              if (dest.latitude && dest.longitude) {
                const distance = getDistance(lat, lng, dest.latitude, dest.longitude);
                const isInside = distance <= GEOFENCE_RADIUS;
                const wasInside = geofenceStatus.current[dest.id] || false;

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
                }
              }
            });
          }
        },
        (err) => console.error("Location error", err),
        { enableHighAccuracy: true, maximumAge: 0 }
      );
      return () => navigator.geolocation.clearWatch(watchId);
    }
  };

  const saveUserLocation = async (latitude: number, longitude: number) => {
    await supabase.from("user_locations").insert([{ user_id: user?.id, latitude, longitude }]);
  };

  // --- Panic Alert ---
  const handlePanicAlert = async () => {
    if (!currentLocation) {
      toast({ title: "Location Required", description: "Enable GPS", variant: "destructive" });
      return;
    }
    await supabase.from("panic_alerts").insert([{
      user_id: user?.id,
      message: panicMessage || "Emergency assistance needed",
      latitude: currentLocation.latitude,
      longitude: currentLocation.longitude,
      status: "active",
    }]);
    toast({ title: "🚨 Panic Alert Sent!", description: "Authorities notified", variant: "destructive" });
    setPanicMessage("");
    fetchPanicAlerts();
  };

  // --- Destinations ---
  const addDestination = async () => {
    if (!newDestination.trim()) return;
    await supabase.from("destinations").insert([{
      user_id: user?.id,
      name: newDestination.trim(),
      latitude: currentLocation?.latitude || null,
      longitude: currentLocation?.longitude || null,
    }]);
    setNewDestination("");
    fetchDestinations();
  };

  const deleteDestination = async (id: string) => {
    await supabase.from("destinations").delete().eq("id", id);
    fetchDestinations();
  };

  // --- Logout ---
  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/");
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-secondary/20 to-accent/10">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-secondary/20 to-accent/10">
      {/* Header */}
      <header className="border-b bg-card/95 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <User className="w-6 h-6" />
            <h1 className="text-xl font-bold">Tourist Dashboard</h1>
          </div>
          <Button onClick={handleLogout} variant="outline">
            <LogOut className="w-4 h-4 mr-2" /> Logout
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 grid gap-6">
        {/* ✅ Map */}
        <Card>
          <CardHeader>
            <CardTitle>Live Map with Geofencing</CardTitle>
          </CardHeader>
          <CardContent>
            <div ref={mapRef} className="w-full h-[400px] rounded-lg border" />
          </CardContent>
        </Card>

        {/* Panic Alert */}
        <Card className="border-destructive">
          <CardHeader>
            <CardTitle className="flex gap-2 items-center text-destructive">
              <AlertTriangle /> Emergency Alert
            </CardTitle>
            <CardDescription>Send an immediate alert</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input
              placeholder="Describe your emergency..."
              value={panicMessage}
              onChange={(e) => setPanicMessage(e.target.value)}
            />
            <Button onClick={handlePanicAlert} className="bg-destructive text-white w-full">
              <AlertTriangle className="mr-2" /> SEND ALERT
            </Button>
          </CardContent>
        </Card>

        {/* Destinations */}
        <Card>
          <CardHeader>
            <CardTitle>My Destinations</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Input
                placeholder="Add new destination..."
                value={newDestination}
                onChange={(e) => setNewDestination(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addDestination()}
              />
              <Button onClick={addDestination}><Plus /></Button>
            </div>
            {destinations.map((d) => (
              <div key={d.id} className="flex justify-between p-2 border rounded">
                <span>{d.name}</span>
                <Button size="sm" variant="ghost" onClick={() => deleteDestination(d.id)}>
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default Dashboard;
