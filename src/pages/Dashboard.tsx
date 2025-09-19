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
import {
  User,
  LogOut,
  MapPin,
  Trash2,
  Navigation,
  AlertTriangle,
  HelpCircle,
  Phone,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import HelpDesk from "@/components/HelpDesk";
import type { User as SupabaseUser } from "@supabase/supabase-js";

/* ------------------------------------------------------------------
 * Types
 * ------------------------------------------------------------------ */
interface Destination {
  id: string;
  name: string;
  latitude?: number;
  longitude?: number;
}

interface ThreatZone {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  radius: number;     // meters
  color: string;      // for Google‑Maps circle color
  description?: string;
}

/* ------------------------------------------------------------------
 * Utility: Haversine distance (meters)
 * ------------------------------------------------------------------ */
const getDistance = (
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
) => {
  const R = 6371e3;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) *
      Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

/* ------------------------------------------------------------------
 * Hard‑coded threat zones (free, no API key)
 * ------------------------------------------------------------------ */
const THREAT_ZONES: ThreatZone[] = [
  // Kashmir – high political tension & armed clashes
  {
    id: "kashmir",
    name: "Kashmir Conflict Zone",
    latitude: 34.085,
    longitude: 74.771,
    radius: 20000, // 20 km
    color: "#ff001a",
    description:
      "High risk area with frequent clashes. Avoid if possible.",
  },
  // Chhattisgarh forest fire hotspot
  {
    id: "chhattisgarh",
    name: "Chhattisgarh Forest Fire Hotspot",
    latitude: 21.593,
    longitude: 82.580,
    radius: 15000,
    color: "#ffa500",
    description:
      "Recent forest fires reported in this area. Avoid travel.",
  },
  // Arunachal Pradesh – remote border area
  {
    id: "arunachal",
    name: "Arunachal Pradesh Border Area",
    latitude: 27.223,
    longitude: 94.860,
    radius: 25000,
    color: "#ff7f00",
    description:
      "Border area with limited services. Proceed with caution.",
  },
  // Andaman & Nicobar Islands – restricted zones for foreigners
  {
    id: "andaman",
    name: "Andaman Restricted Zone",
    latitude: 13.743,
    longitude: 93.324,
    radius: 20000,
    color: "#ff0066",
    description:
      "Restricted military zone. Non‑residents not permitted.",
  },
  // Additional zones can be added in the same pattern
];

/* ------------------------------------------------------------------
 * Main component
 * ------------------------------------------------------------------ */
const Dashboard = () => {
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [destinations, setDestinations] = useState<Destination[]>([]);
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(
    null,
  );
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [isSafe, setIsSafe] = useState(true); // Safe/Unsafe relative to threat zones
  const [activeTab, setActiveTab] = useState("dashboard");

  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const isFirstLoad = useRef(true);

  /* ------------------------------------------------------------------
   * Geofencing state for destinations
   * ------------------------------------------------------------------ */
  const geofenceStatus = useRef<Record<string, boolean>>({});
  const geofenceCircles = useRef<Record<string, any>>({});
  const GEOFENCE_RADIUS = 3000; // meters

  /* ------------------------------------------------------------------
   * Threat Zone state
   * ------------------------------------------------------------------ */
  const threatStatus = useRef<Record<string, boolean>>({}); // inside / outside
  const threatCircles = useRef<Record<string, any>>({}); // google maps Circle refs

  /* ------------------------------------------------------------------
   * Beep sound
   * ------------------------------------------------------------------ */
  const beepRef = useRef<HTMLAudioElement | null>(null);

  const navigate = useNavigate();
  const { toast } = useToast();

  /* ------------------------------------------------------------------
   * Unlock audio after first user interaction
   * ------------------------------------------------------------------ */
  useEffect(() => {
    const unlockAudio = () => {
      if (beepRef.current) {
        beepRef.current.play().then(() => {
          beepRef.current?.pause();
          beepRef.current.currentTime = 0;
        });
      }
      window.removeEventListener("click", unlockAudio);
    };
    window.addEventListener("click", unlockAudio);
  }, []);

  /* ------------------------------------------------------------------
   * Authentication & profile check
   * ------------------------------------------------------------------ */
  useEffect(() => {
    const getUser = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        setUser(user);

        // Check user profile completeness
        const { data: profile } = await supabase
          .from("profiles")
          .select("nationality, phone")
          .eq("user_id", user.id)
          .maybeSingle();

        if (!profile || !profile.nationality || !profile.phone) {
          navigate("/profile-completion");
          return;
        }

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

  /* ------------------------------------------------------------------
   * Real‑time location, Google Map & Geo‑/Threat‑fencing
   * ------------------------------------------------------------------ */
  useEffect(() => {
    if (!("geolocation" in navigator)) return;

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setLocation({ lat, lng });

        /* ---- Google Map init ------------------------------------- */
        if (mapRef.current && !mapInstance.current && (window as any).google) {
          mapInstance.current = new (window as any).google.maps.Map(mapRef.current, {
            center: { lat, lng },
            zoom: 15,
          });

          markerRef.current = new (window as any).google.maps.Marker({
            position: { lat, lng },
            map: mapInstance.current,
            title: "You are here",
          });

          /* ---- Draw destination circles --------------------------------- */
          destinations.forEach((dest) => {
            if (dest.latitude && dest.longitude) {
              if (!geofenceCircles.current[dest.id]) {
                geofenceCircles.current[dest.id] = new (window as any).google.maps.Circle({
                  strokeColor: "#00FF00",
                  strokeOpacity: 0.8,
                  strokeWeight: 2,
                  fillColor: "#00FF00",
                  fillOpacity: 0.2,
                  map: mapInstance.current,
                  center: { lat: dest.latitude, lng: dest.longitude },
                  radius: GEOFENCE_RADIUS,
                });
              }
            }
          });

          /* ---- Draw threat zone circles --------------------------------- */
          THREAT_ZONES.forEach((zone) => {
            if (!threatCircles.current[zone.id]) {
              threatCircles.current[zone.id] = new (window as any).google.maps.Circle({
                strokeColor: zone.color,
                strokeOpacity: 0.9,
                strokeWeight: 2,
                fillColor: zone.color,
                fillOpacity: 0.15,
                map: mapInstance.current,
                center: { lat: zone.latitude, lng: zone.longitude },
                radius: zone.radius,
              });
            }
          });
        }

        /* ---- Update user marker ------------------------------------- */
        if (markerRef.current) {
          markerRef.current.setPosition({ lat, lng });
        }

        /* ---- Pan only on first load ------------------------------- */
        if (mapInstance.current && isFirstLoad.current) {
          mapInstance.current.panTo({ lat, lng });
          isFirstLoad.current = false;
        }

        /* ---- Geofence check ---------------------------------------- */
        if (user && destinations.length > 0) {
          let insideAnyGeofence = false;

          destinations.forEach((dest) => {
            if (dest.latitude && dest.longitude) {
              const distance = getDistance(lat, lng, dest.latitude, dest.longitude);
              const isInside = distance <= GEOFENCE_RADIUS;
              const wasInside = geofenceStatus.current[dest.id] || false;

              if (isInside) insideAnyGeofence = true;

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

                if (beepRef.current) {
                  beepRef.current.currentTime = 0;
                  beepRef.current.play().catch(() => {
                    console.warn("Autoplay prevented. User interaction required.");
                  });
                }

                geofenceStatus.current[dest.id] = false;
              }
            }
          });

          setIsSafe(insideAnyGeofence);
        }

        /* ---- Threat zone check ------------------------------------- */
        if (THREAT_ZONES.length > 0) {
          let insideAnyThreat = false;

          THREAT_ZONES.forEach((zone) => {
            const distance = getDistance(lat, lng, zone.latitude, zone.longitude);
            const isInside = distance <= zone.radius;
            const wasInside = threatStatus.current[zone.id] || false;

            if (isInside) insideAnyThreat = true;

            if (isInside && !wasInside) {
              toast({
                title: "⚠️ High‑Risk Area",
                description: `${zone.name} – ${zone.description ?? "High risk!"}`,
              });
              threatStatus.current[zone.id] = true;
            }

            if (!isInside && wasInside) {
              toast({
                title: "✅ Safe Zone",
                description: `You left ${zone.name}`,
                variant: "success",
              });
              threatStatus.current[zone.id] = false;
            }
          });

          /* Update UI flag – if any threat is active => unsafe */
          setIsSafe(!insideAnyThreat);
        }

        /* ---- Update user location in DB (every poll) --------------- */
        if (user) {
          updateUserLocation(user.id, lat, lng);
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
      { enableHighAccuracy: true, maximumAge: 0 },
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [toast, destinations, user]);

  /* ------------------------------------------------------------------
   * Periodic location uploads (every 15 s)
   * ------------------------------------------------------------------ */
  useEffect(() => {
    if (!user || !location) return;

    const locationInterval = setInterval(() => {
      if (location && user) {
        updateUserLocation(user.id, location.lat, location.lng);
      }
    }, 15000);

    return () => clearInterval(locationInterval);
  }, [user, location]);

  /* ------------------------------------------------------------------
   * Update user location helper
   * ------------------------------------------------------------------ */
  const updateUserLocation = async (
    userId: string,
    latitude: number,
    longitude: number,
  ) => {
    try {
      // Replace old location first
      await supabase.from("user_locations").delete().eq("user_id", userId);

      // Then insert new location
      const { error } = await supabase
        .from("user_locations")
        .insert({ user_id: userId, latitude, longitude });

      if (error) throw error;
    } catch (error: any) {
      console.error("Error updating location:", error);
    }
  };

  /* ------------------------------------------------------------------
   * Panic button handler
   * ------------------------------------------------------------------ */
  const handlePanicButton = async () => {
    if (!user || !location) return;

    try {
      const { error } = await supabase
        .from("panic_alerts")
        .insert({
          user_id: user.id,
          message: "Emergency! User needs immediate assistance.",
          latitude: location.lat,
          longitude: location.lng,
          status: "active",
        });

      if (error) throw error;

      toast({
        title: "🚨 Panic Alert Sent!",
        description: "Emergency services have been notified of your location.",
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

  /* ------------------------------------------------------------------
   * Fetch destinations
   * ------------------------------------------------------------------ */
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

  /* ------------------------------------------------------------------
   * Sign‑out handler
   * ------------------------------------------------------------------ */
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

  /* ------------------------------------------------------------------
   * Debounce for location suggestions
   * ------------------------------------------------------------------ */
  const debounce = (func: Function, delay: number) => {
    let timer: NodeJS.Timeout;
    return (...args: any[]) => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        func(...args);
      }, delay);
    };
  };

  /* ------------------------------------------------------------------
   * Photon search for suggestions
   * ------------------------------------------------------------------ */
  const fetchSuggestions = async (value: string) => {
    setQuery(value);
    if (value.length < 3) {
      setSuggestions([]);
      return;
    }
    try {
      const res = await fetch(
        `https://photon.komoot.io/api/?q=${encodeURIComponent(value)}&limit=10`,
      );
      const data = await res.json();
      if (data && data.features) {
        setSuggestions(data.features);
      }
    } catch (err) {
      console.error("Error fetching location suggestions:", err);
    }
  };

  const debouncedFetchSuggestions = useRef(debounce(fetchSuggestions, 400)).current;

  /* ------------------------------------------------------------------
   * Add a destination
   * ------------------------------------------------------------------ */
  const addDestination = async (place: any) => {
    if (!user) return;
    try {
      const coords = place.geometry.coordinates;
      const { error } = await supabase.from("destinations").insert({
        user_id: user.id,
        name:
          place.properties.name ||
          place.properties.city ||
          place.properties.country ||
          "Unnamed Place",
        latitude: parseFloat(coords[1]),
        longitude: parseFloat(coords[0]),
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

  /* ------------------------------------------------------------------
   * Remove an existing destination
   * ------------------------------------------------------------------ */
  const removeDestination = async (destinationId: string) => {
    try {
      const { error } = await supabase
        .from("destinations")
        .delete()
        .eq("id", destinationId);
      if (error) throw error;
      setDestinations((prev) =>
        prev.filter((dest) => dest.id !== destinationId),
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

  /* ------------------------------------------------------------------
   * Loading state
   * ------------------------------------------------------------------ */
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-secondary/20 to-accent/10">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!user) return null;

  /* ------------------------------------------------------------------
   * Main JSX
   * ------------------------------------------------------------------ */
  return (
    <div
      className="min-h-screen bg-cover bg-center bg-no-repeat"
      style={{ backgroundImage: "url('/mountainbg.jpg')" }}
    >
      {/* Hidden audio player for the beep sound */}
      <audio ref={beepRef} src="/beep.mp3" preload="auto" />

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
                variant="outline"
                className="flex items-center space-x-2"
                onClick={() => navigate("/profile")}
              >
                <User className="w-4 h-4" />
                <span>Profile</span>
              </Button>
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
          <Tabs
            value={activeTab}
            onValueChange={setActiveTab}
            className="space-y-6"
          >
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
              <TabsTrigger value="helpdesk">Help & Support</TabsTrigger>
            </TabsList>

            <TabsContent value="dashboard" className="space-y-6">
              {/* Welcome card */}
              <Card className="bg-gradient-to-r from-primary to-accent text-white border-0 shadow-xl">
                <CardHeader className="pb-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                      <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center">
                        <User className="w-8 h-8" />
                      </div>
                      <div>
                        <CardTitle className="text-3xl font-bold">
                          Welcome,
                          {user.user_metadata?.full_name ||
                            user.email?.split("@")[0]}
                          !
                        </CardTitle>
                        <CardDescription className="text-white/80 text-lg">
                          Ready to explore the wonders of India?
                        </CardDescription>
                      </div>
                    </div>

                    <Button
                      onClick={handlePanicButton}
                      variant="destructive"
                      size="lg"
                      className="bg-red-600 hover:bg-red-700 text-white font-bold animate-pulse"
                    >
                      <AlertTriangle className="w-5 h-5 mr-2" />
                      PANIC
                    </Button>
                  </div>
                </CardHeader>
              </Card>

              {/* Live location map */}
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
                    <div className="mt-2">
                      {isSafe ? (
                        <span className="px-3 py-1 rounded-full bg-green-500 text-white font-semibold">
                          ✅ Safe (Outside Threat Zones)
                        </span>
                      ) : (
                        <span className="px-3 py-1 rounded-full bg-red-500 text-white font-semibold">
                          ⚠️ Unsafe (Inside Threat Zone)
                        </span>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div ref={mapRef} className="w-full h-64 rounded-lg border" />
                  </CardContent>
                </Card>
              )}

              {/* Destinations search + list */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-2xl font-bold">
                    Plan Your Destinations
                  </CardTitle>
                  <CardDescription>
                    Search for locations using Photon API and add them to your
                    travel list.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="relative mb-4">
                    <input
                      type="text"
                      value={query}
                      onChange={(e) => {
                        setQuery(e.target.value);
                        debouncedFetchSuggestions(e.target.value);
                      }}
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
                            <span>
                              {place.properties.name ||
                                place.properties.city ||
                                place.properties.country}
                            </span>
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
            </TabsContent>

            {/* Help & Support tab */}
            <TabsContent value="helpdesk">
              <Card>
                <CardHeader>
                  <CardTitle className="text-2xl font-bold flex items-center gap-2">
                    <HelpCircle className="h-6 w-6 text-primary" />
                    Help & Support
                  </CardTitle>
                  <CardDescription>
                    Get assistance from our support team. You can send
                    messages and images.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <HelpDesk />
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </main>
      </div>
    </div>
  );
};

export default Dashboard;
