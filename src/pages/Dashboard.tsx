import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { User, LogOut, MapPin, Calendar, Users, Star, Trash2, Navigation } from "lucide-react";
import type { User as SupabaseUser } from "@supabase/supabase-js";

const Dashboard = () => {
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [destinations, setDestinations] = useState<string[]>([]);
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);
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

  // ✅ Google Places Autocomplete
  useEffect(() => {
    if (window.google && inputRef.current) {
      autocompleteRef.current = new google.maps.places.Autocomplete(inputRef.current, {
        types: ["geocode", "establishment"],
      });

      autocompleteRef.current.addListener("place_changed", () => {
        const place = autocompleteRef.current?.getPlace();
        if (place && place.formatted_address) {
          setDestinations((prev) => [...prev, place.formatted_address!]);
        }
      });
    }
  }, []);

  // ✅ Real-time location + Google Map
  useEffect(() => {
    if ("geolocation" in navigator) {
      const watchId = navigator.geolocation.watchPosition(
        (pos) => {
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          setLocation({ lat, lng });

          // Init map once
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

          // Update marker position
          if (markerRef.current) {
            markerRef.current.setPosition({ lat, lng });
          }

          // Recenter map smoothly
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
                <div
                  ref={mapRef}
                  className="w-full h-64 rounded-lg border"
                ></div>
              </CardContent>
            </Card>
          )}

          {/* Destinations Section */}
          <Card>
            <CardHeader>
              <CardTitle className="text-2xl font-bold">Plan Your Destinations</CardTitle>
              <CardDescription>
                Search for locations using Google Maps and add them to your travel list.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center space-x-2 mb-4">
                <input
                  ref={inputRef}
                  type="text"
                  placeholder="Search for a location..."
                  className="w-full px-4 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                />
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
