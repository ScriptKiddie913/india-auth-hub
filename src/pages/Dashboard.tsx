/********************************************************************
 * Tourist / Admin Dashboard
 * ----------------------------------
 * Full TypeScript implementation that:
 *  • Authenticates users & validates profile completion
 *  • Tracks real‑time location (Geolocation + Google Maps)
 *  • Manages destinations (search → add → delete)
 *  • Provides a panic button → inserts a new alert
 *  • Listens to the panic_alerts table in realtime
 *  • Renders alerts on the map as red markers
 *  • Provides UI for safe/unsafe geofence status
 *  • Supports navigation + sign‑out
 ********************************************************************/

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
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { 
  LogOut, 
  MapPin, 
  User, 
  Trash2, 
  Navigation,
  AlertTriangle, 
  HelpCircle
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import HelpDesk from "@/components/HelpDesk";
import type { User as SupabaseUser } from "@supabase/supabase-js";

/**
 * ----------------------------------------------------------------
 * Types
 * ----------------------------------------------------------------
 */

interface Destination {
  id: string;
  name: string;
  latitude?: number;
  longitude?: number;
}

interface PanicAlert {
  id: string;
  user_id: string;
  latitude: number;
  longitude: number;
  status: string;
  created_at: string;
}

/**
 * ----------------------------------------------------------------
 * Utilities
 * ----------------------------------------------------------------
 */

/**
 * Haversine formula – returns distance in metres
 */
const getDistance = (
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
) => {
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

  return R * c; // metres
};

/**
 * Debounce helper
 */
const debounce = (func: Function, delay: number) => {
  let timer: NodeJS.Timeout;
  return (...args: any[]) => {
    clearTimeout(timer);
    timer = setTimeout(() => func(...args), delay);
  };
};

/**
 * ----------------------------------------------------------------
 * Dashboard Component
 * ----------------------------------------------------------------
 */

const Dashboard: React.FC = () => {
  /* ----------------------------------------------------------------
   * States
   * ----------------------------------------------------------------
   */
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [destinations, setDestinations] = useState<Destination[]>([]);
  const [alertList, setAlertList] = useState<PanicAlert[]>([]); // <‑‑ added
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(
    null
  );
  const [query, setQuery] = useState<string>("");
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [isSafe, setIsSafe] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<string>("dashboard");

  /* ----------------------------------------------------------------
   * Refs
   * ----------------------------------------------------------------
   */
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<any>(null);
  const markerRef = useRef<any>(null);           // user-marker
  const destinationMarkers = useRef<any[]>([]);   // destinations
  const alertMarkers = useRef<any[]>([]);         // real‑time alerts
  const isFirstLoad = useRef<boolean>(true);

  const geofenceStatus = useRef<Record<string, boolean>>({});
  const geofenceCircles = useRef<Record<string, any>>({});
  const beepRef = useRef<HTMLAudioElement | null>(null);

  const navigate = useNavigate();
  const { toast } = useToast();

  /* ----------------------------------------------------------------
   * Audio – unlock on first click
   * ----------------------------------------------------------------
   */
  useEffect(() => {
    const unlockAudio = () => {
      if (beepRef.current) {
        beepRef.current
          .play()
          .then(() => {
            beepRef.current?.pause();
            beepRef.current.currentTime = 0;
          })
          .catch(() => {
            // ignore
          });
      }
      window.removeEventListener("click", unlockAudio);
    };
    window.addEventListener("click", unlockAudio);
    return () => window.removeEventListener("click", unlockAudio);
  }, []);

  /* ----------------------------------------------------------------
   * Auth & Profile
   * ----------------------------------------------------------------
   */
  useEffect(() => {
    const getUser = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        setUser(user);

        /* -------------------------------------------------------------
         * Profile completion guard
         * ------------------------------------------------------------- */
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

    /* -------------------------------------------------------------
     * Sign‑out guard
     * ------------------------------------------------------------- */
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT" || !session) {
        navigate("/signin");
      }
    });

    return () => data.subscription.unsubscribe();
  }, [navigate]);

  /* ----------------------------------------------------------------
   * Map + Geolocation: user marker, destination markers,
   * geofences, and real‑time alert markers
   * ----------------------------------------------------------------
   */
  useEffect(() => {
    if (!("geolocation" in navigator)) {
      toast({
        title: "Geolocation not supported",
        description: "Your browser does not support geolocation.",
        variant: "destructive",
      });
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setLocation({ lat, lng });

        /* -------------------------------------------------------------
         * Init Google Maps once
         * ------------------------------------------------------------- */
        if (
          mapRef.current &&
          !mapInstance.current &&
          (window as any).google
        ) {
          mapInstance.current = new (window as any).google.maps.Map(
            mapRef.current,
            {
              center: { lat, lng },
              zoom: 15,
            }
          );
          markerRef.current = new (window as any).google.maps.Marker({
            position: { lat, lng },
            map: mapInstance.current,
            title: "You are here",
          });
        }

        /* -------------------------------------------------------------
         * Move user marker
         * ------------------------------------------------------------- */
        if (markerRef.current) {
          markerRef.current.setPosition({ lat, lng });
        }

        /* -------------------------------------------------------------
         * Auto‑pan on first load
         * ------------------------------------------------------------- */
        if (mapInstance.current && isFirstLoad.current) {
          mapInstance.current.panTo({ lat, lng });
          isFirstLoad.current = false;
        }

        /* -------------------------------------------------------------
         * Draw & update geofence circles
         * ------------------------------------------------------------- */
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
                  radius: 3000,
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

        /* -------------------------------------------------------------
         * Check geofence status
         * ------------------------------------------------------------- */
        let insideAny = false;
        destinations.forEach((dest) => {
          if (dest.latitude && dest.longitude) {
            const distance = getDistance(
              lat,
              lng,
              dest.latitude,
              dest.longitude
            );
            const isInside = distance <= 3000;
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

        // Update safe/unsafe status
        setIsSafe(insideAny);

        /* -------------------------------------------------------------
         * Post user location every 15s (updated below via interval)
         * ------------------------------------------------------------- */
        await updateUserLocation(user?.id, lat, lng);
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
  }, [toast, destinations, user]);

  /* ----------------------------------------------------------------
   * Update user location in Supabase on a 15 s interval
   * ----------------------------------------------------------------
   */
  useEffect(() => {
    if (!user || !location) return;

    const interval = setInterval(() => {
      if (location && user) {
        updateUserLocation(user.id, location.lat, location.lng);
      }
    }, 15000);

    return () => clearInterval(interval);
  }, [user, location]);

  /* ----------------------------------------------------------------
   * Realtime listener for panic alerts
   * ----------------------------------------------------------------
   */
  useEffect(() => {
    const fetchAlerts = async () => {
      const { data, error } = await supabase
        .from("panic_alerts")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Error fetching alerts:", error);
      } else {
        setAlertList(data || []);
      }
    };

    // Initial fetch
    fetchAlerts();

    // Realtime subscription
    const subscription = supabase
      .channel("any")
      .on("postgres_changes", { event: "*", schema: "public", table: "panic_alerts" }, (payload) => {
        // console.log("Realtime change:", payload);
        fetchAlerts(); // refresh on any change
      })
      .subscribe();

    return () => supabase.removeChannel(subscription);
  }, []);

  /* ----------------------------------------------------------------
   * Update map markers (destinations + alerts)
   * ----------------------------------------------------------------
   */
  useEffect(() => {
    if (!mapInstance.current || !(window as any).google) return;

    // 1️⃣ Clear previous markers
    destinationMarkers.current.forEach((marker) => marker.setMap(null));
    destinationMarkers.current = [];

    alertMarkers.current.forEach((marker) => marker.setMap(null));
    alertMarkers.current = [];

    // 2️⃣ Add destination markers
    destinations.forEach((dest) => {
      if (dest.latitude && dest.longitude) {
        const marker = new (window as any).google.maps.Marker({
          position: { lat: dest.latitude, lng: dest.longitude },
          map: mapInstance.current,
          title: dest.name,
          icon: "http://maps.google.com/mapfiles/ms/icons/green-dot.png",
        });
        destinationMarkers.current.push(marker);
      }
    });

    // 3️⃣ Add alert markers
    alertList.forEach((alert) => {
      const marker = new (window as any).google.maps.Marker({
        position: { lat: alert.latitude, lng: alert.longitude },
        map: mapInstance.current,
        title: `Alert #${alert.id}`,
        icon: "http://maps.google.com/mapfiles/ms/icons/red-dot.png",
      });

      const info = new (window as any).google.maps.InfoWindow({
        content: `<div>
          <strong>Alert ID ${alert.id}</strong><br/>
          Status: ${alert.status}<br/>
          Time: ${new Date(alert.created_at).toLocaleString()}
        </div>`,
      });

      marker.addListener("click", () => {
        info.open(mapInstance.current, marker);
      });

      alertMarkers.current.push(marker);
    });

    // 4️⃣ Optional: keep user marker always visible
    if (markerRef.current) markerRef.current.setMap(mapInstance.current);
  }, [destinations, alertList]);

  /* ----------------------------------------------------------------
   * Panic button handler – insert new alert
   * ----------------------------------------------------------------
   */
  const handlePanicButton = async () => {
    if (!user || !location) return;

    try {
      const { error } = await supabase.from("panic_alerts").insert({
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

  /* ----------------------------------------------------------------
   * Destination CRUD
   * ----------------------------------------------------------------
   */
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

  const addDestination = async (place: any) => {
    if (!user) return;
    try {
      const [lon, lat] = place.geometry.coordinates;
      const { error } = await supabase.from("destinations").insert({
        user_id: user.id,
        name:
          place.properties.name ||
          place.properties.city ||
          place.properties.country ||
          "Unnamed Place",
        latitude: parseFloat(lat),
        longitude: parseFloat(lon),
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

  const removeDestination = async (destinationId: string) => {
    try {
      const { error } = await supabase
        .from("destinations")
        .delete()
        .eq("id", destinationId);

      if (error) throw error;
      setDestinations((prev) => prev.filter((d) => d.id !== destinationId));
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

  /* ----------------------------------------------------------------
   * Sign‑out
   * ----------------------------------------------------------------
   */
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

  /* ----------------------------------------------------------------
   * Photon API – suggest locations
   * ----------------------------------------------------------------
   */
  const fetchSuggestions = async (value: string) => {
    setQuery(value);
    if (value.length < 3) {
      setSuggestions([]);
      return;
    }
    try {
      const res = await fetch(
        `https://photon.komoot.io/api/?q=${encodeURIComponent(
          value
        )}&limit=10`
      );
      const data = await res.json();
      if (data && data.features) {
        setSuggestions(data.features);
      }
    } catch (err) {
      console.error("Error fetching location suggestions:", err);
    }
  };

  const debouncedFetch = useRef(debounce(fetchSuggestions, 400)).current;

  /* ----------------------------------------------------------------
   * User location updates (db)
   * ----------------------------------------------------------------
   */
  const updateUserLocation = async (
    userId: string | undefined | null,
    latitude: number,
    longitude: number
  ) => {
    if (!userId) return;
    try {
      // delete any existing location
      await supabase
        .from("user_locations")
        .delete()
        .eq("user_id", userId);

      // insert new location
      const { error } = await supabase
        .from("user_locations")
        .insert({
          user_id: userId,
          latitude,
          longitude,
        });

      if (error) throw error;
    } catch (error: any) {
      console.error("Error updating location:", error);
    }
  };

  /* ----------------------------------------------------------------
   * Render
   * ----------------------------------------------------------------
   */
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
      style={{ backgroundImage: "url('/mountainbg.jpg')" }}
    >
      {/* Hidden audio */}
      <audio ref={beepRef} src="/beep.mp3" preload="auto" />

      {/* Fade + overlay */}
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

        {/* Main */}
        <main className="container mx-auto px-4 py-8 space-y-6">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
              <TabsTrigger value="helpdesk">Help & Support</TabsTrigger>
            </TabsList>

            {/* -------------------------------------------------------------
             * Dashboard - main tab
             * ------------------------------------------------------------- */}
            <TabsContent value="dashboard">
              {/* Header card */}
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

              {/* -------------------------------------------------------------
               * Live Map
               * ------------------------------------------------------------- */}
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
                    {/* Safe/Unsafe Indicator */}
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

              {/* -------------------------------------------------------------
               * Destinations Section
               * ------------------------------------------------------------- */}
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
                        debouncedFetch(e.target.value);
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

            {/* -------------------------------------------------------------
             * Help & Support tab
             * ------------------------------------------------------------- */}
            <TabsContent value="helpdesk">
              <Card>
                <CardHeader>
                  <CardTitle className="text-2xl font-bold flex items-center gap-2">
                    <HelpCircle className="h-6 w-6 text-primary" />
                    Help & Support
                  </CardTitle>
                  <CardDescription>
                    Get assistance from our support team. You can send messages and images.
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
