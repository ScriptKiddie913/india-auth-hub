import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { User, LogOut, MapPin, Trash2, Navigation } from "lucide-react";
import type { User as SupabaseUser } from "@supabase/supabase-js";

const Dashboard = () => {
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [destinations, setDestinations] = useState<string[]>([]);
  const [location, setLocation] = useState<{ lat: number; lng: number; address?: string } | null>(null);

  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<any[]>([]);

  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<google.maps.Map | null>(null);
  const markerRef = useRef<google.maps.Marker | null>(null);

  const navigate = useNavigate();
  const { toast } = useToast();

  // ✅ Authentication
  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setUser(user);
      } else {
        navigate("/signin");
      }
      setLoading(false);
    };

    getUser();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT" || !session) {
        navigate("/signin");
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  // ✅ Real-time location + Google Map + Reverse Geocoding
  useEffect(() => {
    if ("geolocation" in navigator) {
      const watchId = navigator.geolocation.watchPosition(
        async (pos) => {
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;

          // 🔹 Reverse geocode to get address from OpenStreetMap
          let address = "Fetching address...";
          try {
            const res = await fetch(
              `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}`
            );
            const data = await res.json();
            address = data.display_name || "Unknown location";
          } catch (err) {
            console.error("Error fetching address:", err);
            address = "Unable to fetch address";
          }

          setLocation({ lat, lng, address });

          // ✅ Initialize Google Map if not yet done
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

          // ✅ Update marker + center map
          if (markerRef.current) {
            markerRef.current.setPosition({ lat, lng });
          }
          if (mapInstance.current) {
            mapInstance.current.panTo({ lat, lng });
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

  // ✅ Sign out
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
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(value)}`
      );
      const data = await res.json();
      setSuggestions(data);
    } catch (err) {
      console.error("Error fetching location suggestions:", err);
    }
  };

  // ✅ Add destination
  const addDestination = (place: any) => {
    setDestinations((prev) => [...prev, place.display_name]);
    setQuery("");
    setSuggestions([]);
  };

  const removeDestination = (index: number) => {
    setDestinations((prev) => prev.filter((_, i) => i !== index));
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
                <p className="text-sm text-muted-foreground">Tourism Dashboard</p>
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
                    Welcome, {user.user_metadata?.full_name || user.email?.split("@")[0]}!
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
                  <Navigation className="h-5 w-5 text-primary" /> Your Live Location
                </CardTitle>
                <CardDescription>
                  Tracking your real-time location with Google Maps
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div ref={mapRef} className="w-full h-64 rounded-lg border"></div>
              </CardContent>
            </Card>
          )}

          {/* ✅ Real-Time Location Display */}
          {location && (
            <Card>
              <CardHeader>
                <CardTitle className="text-2xl font-bold flex items-center gap-2">
                  <Navigation className="h-5 w-5 text-primary" /> Your Live Location
                </CardTitle>
                <CardDescription>
                  Your current location tracked in real-time
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="p-4 bg-secondary/20 rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <MapPin className="h-4 w-4 text-primary" />
                      <span className="font-medium">Current Address:</span>
                    </div>
                    <p className="text-sm text-muted-foreground">{location.address}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-3 bg-primary/10 rounded-lg">
                      <span className="text-xs text-muted-foreground">Latitude</span>
                      <p className="font-mono text-sm">{location.lat.toFixed(6)}</p>
                    </div>
                    <div className="p-3 bg-accent/10 rounded-lg">
                      <span className="text-xs text-muted-foreground">Longitude</span>
                      <p className="font-mono text-sm">{location.lng.toFixed(6)}</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* ✅ Destinations Section with OSM Search */}
          <Card>
            <CardHeader>
              <CardTitle className="text-2xl font-bold">Plan Your Destinations</CardTitle>
              <CardDescription>
                Search for locations using OpenStreetMap and add them to your travel list.
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
                  {destinations.map((dest, index) => (
                    <li
                      key={index}
                      className="flex justify-between items-center bg-secondary/20 px-4 py-2 rounded-md"
                    >
                      <span>{dest}</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeDestination(index)}
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
