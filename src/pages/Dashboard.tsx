import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { User, LogOut, MapPin, Trash2, Navigation } from "lucide-react";

const Dashboard = () => {
  const [user, setUser] = useState<any>(null);
  const [destinations, setDestinations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [map, setMap] = useState<any>(null);
  const [userMarker, setUserMarker] = useState<any>(null);
  const mapRef = useRef<HTMLDivElement>(null);
  const geofenceStatus = useRef<Record<string, boolean>>({});
  const geofenceCircles = useRef<any[]>([]);
  const destinationsRef = useRef<any[]>([]);
  const navigate = useNavigate();
  const { toast } = useToast();

  const GEOFENCE_RADIUS = 5000; // ✅ 5 km radius

  // Haversine formula
  const getDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371e3;
    const toRad = (deg: number) => (deg * Math.PI) / 180;
    const φ1 = toRad(lat1);
    const φ2 = toRad(lat2);
    const Δφ = toRad(lat2 - lat1);
    const Δλ = toRad(lon2 - lon1);
    const a =
      Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  const loadGoogleMaps = () => {
    return new Promise<void>((resolve, reject) => {
      if (window.google && window.google.maps) {
        resolve();
        return;
      }
      const script = document.createElement("script");
      script.src = `https://maps.googleapis.com/maps/api/js?key=${import.meta.env.VITE_GOOGLE_MAPS_API_KEY || process.env.REACT_APP_GOOGLE_MAPS_API_KEY}`;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject("Google Maps failed to load");
      document.body.appendChild(script);
    });
  };

  useEffect(() => {
    const fetchUser = async () => {
      const { data, error } = await supabase.auth.getUser();
      if (error) {
        toast({ title: "Error", description: error.message, variant: "destructive" });
      } else {
        setUser(data.user);
      }
      setLoading(false);
    };
    fetchUser();
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user || null);
    });
    return () => subscription.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (user) {
      supabase.from("destinations").select("*").eq("user_id", user.id).then(({ data, error }) => {
        if (error) {
          toast({ title: "Error fetching destinations", description: error.message, variant: "destructive" });
        } else {
          setDestinations(data || []);
          destinationsRef.current = data || [];
        }
      });
    }
  }, [user]);

  useEffect(() => {
    if (!mapRef.current) return;
    loadGoogleMaps().then(() => {
      if (!navigator.geolocation) {
        toast({ title: "Geolocation not supported", variant: "destructive" });
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          const mapInstance = new window.google.maps.Map(mapRef.current!, {
            center: { lat: latitude, lng: longitude },
            zoom: 14,
          });
          setMap(mapInstance);
          const marker = new window.google.maps.Marker({
            position: { lat: latitude, lng: longitude },
            map: mapInstance,
            title: "Your Location",
          });
          setUserMarker(marker);
        },
        () => toast({ title: "Location access denied", variant: "destructive" }),
        { enableHighAccuracy: true }
      );
    });
  }, []);

  useEffect(() => {
    if (!map) return;
    geofenceCircles.current.forEach((c) => c.setMap(null));
    geofenceCircles.current = [];
    destinations.forEach((dest) => {
      if (dest.latitude && dest.longitude) {
        const circle = new window.google.maps.Circle({
          strokeColor: "#FF0000",
          strokeOpacity: 0.8,
          strokeWeight: 2,
          fillColor: "#FF0000",
          fillOpacity: 0.2,
          map,
          center: { lat: dest.latitude, lng: dest.longitude },
          radius: GEOFENCE_RADIUS,
        });
        geofenceCircles.current.push(circle);
      }
    });
  }, [destinations, map]);

  useEffect(() => {
    if (!navigator.geolocation) return;
    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        if (map) map.setCenter({ lat: latitude, lng: longitude });
        if (userMarker) userMarker.setPosition({ lat: latitude, lng: longitude });
        destinationsRef.current.forEach((dest) => {
          if (dest.latitude && dest.longitude) {
            const distance = getDistance(latitude, longitude, dest.latitude, dest.longitude);
            const isInside = distance <= GEOFENCE_RADIUS;
            const wasInside = geofenceStatus.current[dest.id] || false;
            if (isInside && !wasInside) {
              toast({ title: "📍 Geofence Entered", description: `You entered the area of ${dest.name}` });
              geofenceStatus.current[dest.id] = true;
            }
            if (!isInside && wasInside) {
              toast({ title: "🚪 Geofence Exited", description: `You left the area of ${dest.name}`, variant: "destructive" });
              geofenceStatus.current[dest.id] = false;
            }
          }
        });
      },
      (err) => console.error("Error watching position:", err),
      { enableHighAccuracy: true }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [map, userMarker]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/login");
  };

  const triggerPanicAlert = async () => {
    if (!user) return;
    const { error } = await supabase.from("panic_alerts").insert({ user_id: user.id, created_at: new Date() });
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "🚨 Panic Alert Triggered", description: "Your alert has been sent!" });
    }
  };

  if (loading) return <p>Loading...</p>;

  return (
    <div className="p-6 space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2"><User className="w-5 h-5" /> Dashboard</CardTitle>
          <Button variant="destructive" onClick={handleLogout} className="flex items-center gap-2"><LogOut className="w-4 h-4" /> Logout</Button>
        </CardHeader>
        <CardContent>
          <div ref={mapRef} className="w-full h-[400px] rounded-lg border"></div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Destinations</CardTitle><CardDescription>Your saved places</CardDescription></CardHeader>
        <CardContent>
          <ul className="space-y-2">
            {destinations.map((dest) => (
              <li key={dest.id} className="flex items-center justify-between p-2 border rounded">
                <span className="flex items-center gap-2"><MapPin className="w-4 h-4 text-muted-foreground" /> {dest.name}</span>
                <Button variant="ghost" size="icon" onClick={async () => {
                  const { error } = await supabase.from("destinations").delete().eq("id", dest.id);
                  if (error) {
                    toast({ title: "Error", description: error.message, variant: "destructive" });
                  } else {
                    setDestinations(destinations.filter((d) => d.id !== dest.id));
                    toast({ title: "Deleted", description: `${dest.name} removed.` });
                  }
                }}><Trash2 className="w-4 h-4" /></Button>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
      <Button onClick={triggerPanicAlert} className="w-full flex items-center gap-2 bg-red-600 hover:bg-red-700"><Navigation className="w-4 h-4" /> Trigger Panic Alert</Button>
    </div>
  );
};

export default Dashboard;
