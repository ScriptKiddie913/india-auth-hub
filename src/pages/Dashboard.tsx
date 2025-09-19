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
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import HelpDesk from "@/components/HelpDesk";
import type { User as SupabaseUser } from "@supabase/supabase-js";

interface Destination {
  id: string;
  name: string;
  latitude?: number;
  longitude?: number;
}

// ✅ Haversine formula to calculate distance (in meters)
const getDistance = (
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
) => {
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
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [isSafe, setIsSafe] = useState(true);
  const [activeTab, setActiveTab] = useState("dashboard");

  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const isFirstLoad = useRef(true);

  // ✅ Normal geofence state
  const geofenceStatus = useRef<Record<string, boolean>>({});
  const geofenceCircles = useRef<Record<string, any>>({});
  const GEOFENCE_RADIUS = 3000; // meters

  // MobileShield
  const [mobileShieldActive, setMobileShieldActive] = useState(false);
  const shieldCircleRef = useRef<any>(null);
  const MOBILE_SHIELD_RADIUS = 200; // meters (diameter = 400m)

  // ✅ Beep sound
  const beepRef = useRef<HTMLAudioElement | null>(null);

  const navigate = useNavigate();
  const { toast } = useToast();

  /* ==========================
     1️⃣ Unlock audio on first click
  ========================== */
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

  /* ==========================
     2️⃣ Authentication and profile check
  ========================== */
  useEffect(() => {
    const getUser = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        setUser(user);

        // Check if user has completed profile
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

  /* ==========================
     3️⃣ Real‑time location + map + geofencing
  ========================== */
  useEffect(() => {
    if (!("geolocation" in navigator)) return;

    const watchId = navigator.geolocation.watchPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setLocation({ lat, lng });

        // 3.1 Map initialization
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
        }

        // 3.2 Marker update
        if (markerRef.current) {
          markerRef.current.setPosition({ lat, lng });
        }

        // 3.3 Auto‑pan on first load
        if (mapInstance.current && isFirstLoad.current) {
          mapInstance.current.panTo({ lat, lng });
          isFirstLoad.current = false;
        }

        // 3.4 Regular geofence circles
        if (mapInstance.current) {
          destinations.forEach((dest) => {
            if (dest.latitude && dest.longitude) {
              if (!geofenceCircles.current[dest.id]) {
                const circle = new (window as any).google.maps.Circle({
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

        // 3.5 MobileShield circle
        if (mobileShieldActive) {
          if (!shieldCircleRef.current && mapInstance.current) {
            shieldCircleRef.current = new (window as any).google.maps.Circle({
              strokeColor: "#0000ff",
              strokeOpacity: 0.8,
              strokeWeight: 2,
              fillColor: "#0000ff",
              fillOpacity: 0.2,
              map: mapInstance.current,
              center: { lat, lng },
              radius: MOBILE_SHIELD_RADIUS,
            });
          } else if (shieldCircleRef.current) {
            shieldCircleRef.current.setCenter({ lat, lng });
          }
        }

        // 3.6 Geofence checks
        if (user && destinations.length) {
          let insideAny = false;

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

              if (isInside) insideAny = true;

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

                // ⚠️ Beep on exit
                if (beepRef.current) {
                  beepRef.current.currentTime = 0;
                  beepRef.current.play().catch(() => {
                    console.warn(
                      "Autoplay prevented. User interaction required."
                    );
                  });
                }

                geofenceStatus.current[dest.id] = false;
              }
            }
          });

          setIsSafe(insideAny);
        }

        // 3.7 Sync location to DB
        if (user) {
          updateUserLocation(user.id, lat, lng);
        }
      },
      (err) => {
        console.error("Location error:", err);
        toast({
          title: "Location Error",
          description: err.message,
          variant: "destructive",
        });
      },
      { enableHighAccuracy: true, maximumAge: 0 }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [toast, destinations, user, mobileShieldActive]);

  /* ==========================
     4️⃣ Update user location in DB
  ========================== */
  const updateUserLocation = async (
    userId: string,
    latitude: number,
    longitude: number
  ) => {
    try {
      await supabase
        .from("user_locations")
        .delete()
        .eq("user_id", userId);

      const { error } = await supabase
        .from("user_locations")
        .insert({
          user_id: userId,
          latitude,
          longitude,
        });

      if (error) throw error;
    } catch (err: any) {
      console.error("Error updating location:", err);
    }
  };

  /* ==========================
     5️⃣ Periodic location sync (15 s)
  ========================== */
  useEffect(() => {
    if (!user || !location) return;
    const interval = setInterval(() => {
      updateUserLocation(user.id, location.lat, location.lng);
    }, 15000);
    return () => clearInterval(interval);
  }, [user, location]);

  /* ==========================
     6️⃣ Panic button
  ========================== */
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
    } catch (err: any) {
      toast({
        title: "Error sending panic alert",
        description: err.message,
        variant: "destructive",
      });
    }
  };

  /* ==========================
     7️⃣ Fetch destinations
  ========================== */
  const fetchDestinations = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from("destinations")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setDestinations(data || []);
    } catch (err: any) {
      toast({
        title: "Error fetching destinations",
        description: err.message,
        variant: "destructive",
      });
    }
  };

  /* ==========================
     8️⃣ Sign‑out
  ========================== */
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

  /* ==========================
     9️⃣ Debounce helper
  ========================== */
  const debounce = (fn: Function, delay: number) => {
    let timer: NodeJS.Timeout;
    return (...args: any[]) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), delay);
    };
  };

  /* ==========================
     🔟 Fetch location suggestions (Photon API)
  ========================== */
  const fetchSuggestions = async (value: string) => {
    setQuery(value);
    if (value.length < 3) {
      setSuggestions([]);
      return;
    }
    try {
      const res = await fetch(
        `https://photon.komoot.io/api/?q=${encodeURIComponent(value)}&limit=10`
      );
      const data = await res.json();
      if (data && data.features) setSuggestions(data.features);
    } catch (e) {
      console.error("Suggestion error:", e);
    }
  };

  const debouncedFetchSuggestions = useRef(
    debounce(fetchSuggestions, 400)
  ).current;

  /* ==========================
     🔒 Add destination
  ========================== */
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
    } catch (err: any) {
      toast({
        title: "Error adding destination",
        description: err.message,
        variant: "destructive",
      });
    }
  };

  /* ==========================
     ✂️ Remove destination
  ========================== */
  const removeDestination = async (id: string) => {
    try {
      const { error } = await supabase
        .from("destinations")
        .delete()
        .eq("id", id);
      if (error) throw error;
      setDestinations((prev) => prev.filter((d) => d.id !== id));
      toast({
        title: "Destination removed",
        description: "Removed from your travel list!",
      });
    } catch (err: any) {
      toast({
        title: "Error removing destination",
        description: err.message,
        variant: "destructive",
      });
    }
  };

  /* ==========================
     📋 Mobile Shield toggle
  ========================== */
  const toggleMobileShield = () => {
    const newState = !mobileShieldActive;
    setMobileShieldActive(newState);

    if (!newState && shieldCircleRef.current) {
      shieldCircleRef.current.setMap(null);
      shieldCircleRef.current = null;
    }
  };

  /* ==========================
     11️⃣ Loading screen
  ========================== */
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-secondary/20 to-accent/10">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary"></div>
      </div>
    );
  }

  /* ==========================
     12️⃣ Main Dashboard UI
  ========================== */
  return (
    <div
      className="min-h-screen bg-cover bg-center bg-no-repeat"
      style={{ backgroundImage: "url('/mountainbg.jpg')" }}
    >
      <audio ref={beepRef} src="/beep.mp3" preload="auto" />

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

        {/* Content */}
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

              {/* Live location & Mobile Shield */}
              {location && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-2xl font-bold flex items-center gap-2">
                      <Navigation className="h-5 w-5 text-primary" />
                      Your Live Location
                    </CardTitle>
                    <CardDescription>
                      Latitude: {location.lat.toFixed(6)}, Longitude:{" "}
                      {location.lng.toFixed(6)}
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
                    <div className="mt-4 flex justify-center">
                      <Button
                        variant={mobileShieldActive ? "destructive" : "outline"}
                        onClick={toggleMobileShield}
                        className="w-48"
                      >
                        {mobileShieldActive
                          ? "Disable Mobile Shield"
                          : "Enable Mobile Shield"}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Destination search & list */}
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
                        {suggestions.map((place, idx) => (
                          <li
                            key={idx}
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

            <TabsContent value="helpdesk">
              <Card>
                <CardHeader>
                  <CardTitle className="text-2xl font-bold flex items-center gap-2">
                    <HelpCircle className="h-6 w-6 text-primary" />
                    Help & Support
                  </CardTitle>
                  <CardDescription>
                    Get assistance from our support team. You can send messages
                    and images.
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





