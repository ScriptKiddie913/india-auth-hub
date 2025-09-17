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

const Dashboard = () => {
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [destinations, setDestinations] = useState<Destination[]>([]);
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(
    null
  );

  // 🔹 OSM Search
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<any[]>([]);

  // 🔹 Google Map Refs
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<google.maps.Map | null>(null);
  const markerRef = useRef<google.maps.Marker | null>(null);
  const isFirstLoad = useRef(true);

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

  // ✅ Real-time location tracking + Google Map
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
  }, [toast]);

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
    <div className="min-h-screen bg-gradient-to-br from-background via-secondary/20 to-accent/10">
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
          {/* Welcome Section */}
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
              </CardHeader>
              <CardContent>
                <div ref={mapRef} className="w-full h-64 rounded-lg border" />
              </CardContent>
            </Card>
          )}

          {/* ✅ Destinations Section with OSM Search */}
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
  );
};

export default Dashboard;
