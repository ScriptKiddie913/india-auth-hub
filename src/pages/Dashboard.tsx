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
import type { User as SupabaseUser } from "@supabase/supabase-js";

interface Destination {
  id: string;
  name: string;
  latitude?: number;
  longitude?: number;
}

// ✅ Haversine formula to calculate distance (in meters)
const getDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const R = 6371e3; // Earth radius in meters
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const φ1 = toRad(lat1);
  const φ2 = toRad(lat2);
  const Δφ = toRad(lat2 - lat1);
  const Δλ = toRad(lon2 - lon1);

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // in meters
};

const Dashboard = () => {
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [destinations, setDestinations] = useState<Destination[]>([]);
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(
    null
  );
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [isSafe, setIsSafe] = useState(true); // ✅ Safe / Unsafe status

  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<google.maps.Map | null>(null);
  const markerRef = useRef<google.maps.Marker | null>(null);
  const isFirstLoad = useRef(true);

  // ✅ Geofence state
  const geofenceStatus = useRef<Record<string, boolean>>({});
  const geofenceCircles = useRef<Record<string, google.maps.Circle>>({});
  const GEOFENCE_RADIUS = 5000; // meters

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

  // ✅ Real-time location tracking + Google Map + Geofencing
  useEffect(() => {
    if ("geolocation" in navigator) {
      const watchId = navigator.geolocation.watchPosition(
        (pos) => {
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          setLocation({ lat, lng });

          // Initialize map once
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

          // Only auto-pan on first load
          if (mapInstance.current && isFirstLoad.current) {
            mapInstance.current.panTo({ lat, lng });
            isFirstLoad.current = false;
          }

          // ✅ Draw geofence circles
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

            // Remove circles for deleted destinations
            Object.keys(geofenceCircles.current).forEach((id) => {
              if (!destinations.find((d) => d.id === id)) {
                geofenceCircles.current[id].setMap(null);
                delete geofenceCircles.current[id];
              }
            });
          }

          // ✅ Check geofences
          if (user && destinations.length > 0) {
            let insideAnyGeofence = false;

            destinations.forEach((dest) => {
              if (dest.latitude && dest.longitude) {
                const distance = getDistance(
                  lat,
                  lng,
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
                }
              }
            });

            // ✅ Update Safe/Unsafe
            setIsSafe(insideAnyGeofence);
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

  // ✅ Fetch destinations from Supabase
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

  // ✅ Sign Out
  const handleSignOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      toast({
        title: "Error signing out",
        description: error.message,
        variant: "destructive",
      });
    } else {
      toast({
        title: "Signed out successfully",
        description: "Come back soon!",
      });
      navigate("/signin");
    }
  };

  // ✅ Fetch location suggestions from OpenStreetMap
  const fetchSuggestions = async (value: string) => {
    setQuery(value);
    if (value.length < 3) {
      setSuggestions([]);
      return;
    }
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
          value
        )}`
      );
      const data = await res.json();
      setSuggestions(data);
    } catch (err) {
      console.error("Error fetching location suggestions:", err);
    }
  };

  // ✅ Add destination
  const addDestination = async (place: any) => {
    if (!user) return;
    try {
      const { error } = await supabase.from("destinations").insert({
        user_id: user.id,
        name: place.display_name,
        latitude: parseFloat(place.lat),
        longitude: parseFloat(place.lon),
      });
      if (error) throw error;
      await fetchDestinations(user.id);
      setQuery("");
      setSuggestions([]);
      toast({
        title: "Destination added",
        description: "Successfully added to your travel list!",
      });
    } catch (error: any) {
      toast({
        title: "Error adding destination",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  // ✅ Remove destination
  const removeDestination = async (destinationId: string) => {
    try {
      const { error } = await supabase
        .from("destinations")
        .delete()
        .eq("id", destinationId);
      if (error) throw error;
      setDestinations((prev) =>
        prev.filter((dest) => dest.id !== destinationId)
      );
      toast({
        title: "Destination removed",
        description: "Removed from your travel list!",
      });
    } catch (error: any) {
      toast({
        title: "Error removing destination",
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
      className="min-h-screen bg-cover bg-center bg-no-repeat"
      style={{
        backgroundImage: "url('/mountainbg.jpg')", // ✅ Place sea.jpg in /public
      }}
    >
      {/* Gradient overlay */}
      <div className="min-h-screen bg-gradient-to-br from-white/40 via-white/30 to-white/20">
        {/* Header */}
        <header className="border-b bg-card/95 backdrop-blur-sm sticky top-0 z-50">
          <div className="container mx-auto px-4 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <div className="w-10 h-10 bg-gradient-to-br from-primary to-accent rounded-full flex items-center justify-center">
                  <MapPin className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                    Incredible India
                  </h1>
                  <p className="text-sm text-muted-foreground">
                    Tourism Dashboard
                  </p>
                </div>
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
          </div>
        </header>

        {/* Main Content */}
        <main className="container mx-auto px-4 py-8">
          <div className="grid gap-6">
            {/* Welcome */}
            <Card className="bg-gradient-to-r from-primary to-accent text-white border-0 shadow-xl">
              <CardHeader className="pb-6">
                <div className="flex items-center space-x-4">
                  <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center">
                    <User className="w-8 h-8" />
                  </div>
                  <div>
                    <CardTitle className="text-3xl font-bold">
                      Welcome,{" "}
                      {user.user_metadata?.full_name ||
                        user.email?.split("@")[0]}
                      !
                    </CardTitle>
                    <CardDescription className="text-white/80 text-lg">
                      Ready to explore the wonders of India?
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
            </Card>

            {/* ✅ Real-Time Location Map */}
            {location && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-2xl font-bold flex items-center gap-2">
                    <Navigation className="h-5 w-5 text-primary" /> Your Live
                    Location
                  </CardTitle>
                  <CardDescription>
                    Latitude: {location.lat.toFixed(6)}, Longitude:{" "}
                    {location.lng.toFixed(6)}
                  </CardDescription>
                  {/* ✅ Safe / Unsafe Indicator */}
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

            {/* ✅ Destinations Section */}
            <Card>
              <CardHeader>
                <CardTitle className="text-2xl font-bold">
                  Plan Your Destinations
                </CardTitle>
                <CardDescription>
                  Search for locations using OpenStreetMap and add them to your
                  travel list.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="relative mb-4">
                  <input
                    type="text"
                    value={query}
                    onChange={(e) => fetchSuggestions(e.target.value)}
                    placeholder="Search for a location..."
                    className="w-full px-4 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
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
          </div>
        </main>
      </div>
    </div>
  );
};

export default Dashboard;
