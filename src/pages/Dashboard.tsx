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
import { User, LogOut, MapPin, Trash2, Navigation, AlertTriangle, Send } from "lucide-react";
import type { User as SupabaseUser } from "@supabase/supabase-js";

interface Destination {
  id: string;
  name: string;
  latitude?: number;
  longitude?: number;
}

// ✅ Haversine formula
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

const Dashboard = () => {
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [destinations, setDestinations] = useState<Destination[]>([]);
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [message, setMessage] = useState(""); // ✅ custom message

  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<google.maps.Map | null>(null);
  const markerRef = useRef<google.maps.Marker | null>(null);
  const isFirstLoad = useRef(true);

  const geofenceStatus = useRef<Record<string, boolean>>({});
  const geofenceCircles = useRef<Record<string, google.maps.Circle>>({});
  const GEOFENCE_RADIUS = 5000;

  const navigate = useNavigate();
  const { toast } = useToast();

  // ✅ Authentication
  useEffect(() => {
    const getUser = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        setUser(user);
        await fetchDestinations(user.id);
      } else {
        navigate("/signin");
      }
      setLoading(false);
    };
    getUser();

    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT" || !session) {
        navigate("/signin");
      }
    });

    return () => data.subscription.unsubscribe();
  }, [navigate]);

  // ✅ Real-time location tracking
  useEffect(() => {
    if ("geolocation" in navigator) {
      const watchId = navigator.geolocation.watchPosition(
        (pos) => {
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          setLocation({ lat, lng });

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

          if (markerRef.current) markerRef.current.setPosition({ lat, lng });

          if (mapInstance.current && isFirstLoad.current) {
            mapInstance.current.panTo({ lat, lng });
            isFirstLoad.current = false;
          }

          if (mapInstance.current) {
            destinations.forEach((dest) => {
              if (dest.latitude && dest.longitude) {
                if (!geofenceCircles.current[dest.id]) {
                  const circle = new google.maps.Circle({
                    strokeColor: "#00FF00",
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

            Object.keys(geofenceCircles.current).forEach((id) => {
              if (!destinations.find((d) => d.id === id)) {
                geofenceCircles.current[id].setMap(null);
                delete geofenceCircles.current[id];
              }
            });
          }

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
        (err) => {
          console.error("Error getting location:", err);
          toast({
            title: "Location Error",
            description: err.message,
            variant: "destructive",
          });
        },
        { enableHighAccuracy: true, maximumAge: 0 }
      );
      return () => navigator.geolocation.clearWatch(watchId);
    }
  }, [toast, destinations, user]);

  // ✅ Fetch destinations
  const fetchDestinations = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from("destinations")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      setDestinations(data || []);
    } catch (error: any) {
      toast({
        title: "Error fetching destinations",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  // ✅ Panic button → send alert to admin
  const handlePanic = async () => {
    if (!user) return;
    try {
      const { error } = await supabase.from("alerts").insert({
        user_id: user.id,
        message: "🚨 Panic Alert! User needs help.",
        latitude: location?.lat,
        longitude: location?.lng,
      });
      if (error) throw error;
      toast({
        title: "🚨 Panic Alert Sent",
        description: "Admin has been notified with your location.",
        variant: "destructive",
      });
    } catch (error: any) {
      toast({
        title: "Error sending panic alert",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  // ✅ Send message
  const sendMessage = async () => {
    if (!user || !message.trim()) return;
    try {
      const { error } = await supabase.from("messages").insert({
        user_id: user.id,
        message,
        latitude: location?.lat,
        longitude: location?.lng,
      });
      if (error) throw error;
      setMessage("");
      toast({
        title: "Message sent",
        description: "Your message was delivered to Admin.",
      });
    } catch (error: any) {
      toast({
        title: "Error sending message",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-secondary/20 to-accent/10">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div
      className="min-h-screen bg-cover bg-center bg-fixed"
      style={{ backgroundImage: "url('/mountain bg.png')" }}
    >
      <div className="min-h-screen bg-black/40">
        {/* Header */}
        <header className="border-b bg-card/95 backdrop-blur-sm sticky top-0 z-50">
          <div className="container mx-auto px-4 py-4 flex justify-between items-center">
            <div className="flex items-center space-x-4">
              <MapPin className="w-6 h-6 text-primary" />
              <h1 className="text-2xl font-bold text-white">Incredible India</h1>
            </div>
            <Button
              onClick={handleSignOut}
              variant="outline"
              className="flex items-center space-x-2 hover:bg-destructive hover:text-destructive-foreground"
            >
              <LogOut className="w-4 h-4" />
              <span>Sign Out</span>
            </Button>
          </div>
        </header>

        {/* Main */}
        <main className="container mx-auto px-4 py-8 space-y-6">
          {/* Welcome */}
          <Card className="bg-gradient-to-r from-primary to-accent text-white border-0 shadow-xl">
            <CardHeader>
              <CardTitle className="text-3xl font-bold">
                Welcome, {user.user_metadata?.full_name || user.email?.split("@")[0]}!
              </CardTitle>
              <CardDescription className="text-white/80">
                Ready to explore the wonders of India?
              </CardDescription>
            </CardHeader>
          </Card>

          {/* Location Map */}
          {location && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-2xl font-bold">
                  <Navigation className="h-5 w-5 text-primary" /> Your Live Location
                </CardTitle>
                <CardDescription>
                  Latitude: {location.lat.toFixed(6)}, Longitude: {location.lng.toFixed(6)}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div ref={mapRef} className="w-full h-64 rounded-lg border" />
              </CardContent>
            </Card>
          )}

          {/* Destinations */}
          <Card>
            <CardHeader>
              <CardTitle className="text-2xl font-bold">Plan Your Destinations</CardTitle>
              <CardDescription>Search and add places from OpenStreetMap</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="relative mb-4">
                <input
                  type="text"
                  value={query}
                  onChange={(e) => fetchSuggestions(e.target.value)}
                  placeholder="Search for a location..."
                  className="w-full px-4 py-2 border rounded-md focus:ring-2 focus:ring-primary"
                />
                {suggestions.length > 0 && (
                  <ul className="absolute z-10 bg-white border rounded-md shadow-md w-full mt-1 max-h-60 overflow-auto">
                    {suggestions.map((place, index) => (
                      <li
                        key={index}
                        className="px-4 py-2 hover:bg-secondary cursor-pointer flex items-center space-x-2"
                        onClick={() => addDestination(place)}
                      >
                        <MapPin className="w-4 h-4 text-primary" />
                        <span>{place.display_name}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              {destinations.length > 0 && (
                <ul className="space-y-2">
                  {destinations.map((dest) => (
                    <li
                      key={dest.id}
                      className="flex justify-between items-center bg-secondary/20 px-4 py-2 rounded-md"
                    >
                      <span>{dest.name}</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeDestination(dest.id)}
                      >
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {/* ✅ Message Section */}
          <Card>
            <CardHeader>
              <CardTitle className="text-2xl font-bold">Send a Message to Admin</CardTitle>
              <CardDescription>Share your updates or concerns</CardDescription>
            </CardHeader>
            <CardContent>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Type your message..."
                className="w-full p-3 border rounded-md focus:ring-2 focus:ring-primary mb-3"
                rows={4}
              />
              <Button onClick={sendMessage} className="flex items-center space-x-2">
                <Send className="w-4 h-4" />
                <span>Send</span>
              </Button>
            </CardContent>
          </Card>
        </main>

        {/* ✅ Panic Button (Floating) */}
        <button
          onClick={handlePanic}
          className="fixed bottom-6 right-6 bg-red-600 hover:bg-red-700 text-white px-6 py-4 rounded-full shadow-xl flex items-center space-x-2"
        >
          <AlertTriangle className="w-6 h-6" />
          <span className="font-bold">PANIC</span>
        </button>
      </div>
    </div>
  );
};

export default Dashboard;
