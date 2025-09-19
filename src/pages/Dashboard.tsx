/* ------------------------------------------------------------------
 *  Dashboard – With real‑time threat zones (geo‑fencing)
 * ------------------------------------------------------------------ */
"use client"; // <-- important for Next‑JS/React 18

import React from "react";
import { useEffect, useState, useRef, useCallback } from "react";
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

/* ---------- Types --------------------------------------------------- */
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
  radius: number; // meters
  color: string; // google‑maps circle color
  description?: string;
}

/* ---------- Distance (Haversine) ----------------------------------- */
const getDistance = (
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
) => {
  const R = 6371e3; // metres
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // metres
};

/* ---------- Hard‑coded threat zones (free, no key) ------------------- */
const THREAT_ZONES: ThreatZone[] = [
  {
    id: "kashmir",
    name: "Kashmir Conflict Zone",
    latitude: 34.085,
    longitude: 74.771,
    radius: 20000,
    color: "#ff001a",
    description: "High risk area with frequent clashes.",
  },
  {
    id: "chhattisgarh",
    name: "Chhattisgarh Forest Fire Hotspot",
    latitude: 21.593,
    longitude: 82.58,
    radius: 15000,
    color: "#ffa500",
    description: "Recent forest fires reported in this area.",
  },
  {
    id: "arunachal",
    name: "Arunachal Pradesh Border Area",
    latitude: 27.223,
    longitude: 94.86,
    radius: 25000,
    color: "#ff7f00",
    description: "Border area with limited services.",
  },
  {
    id: "andaman",
    name: "Andaman Restricted Zone",
    latitude: 13.743,
    longitude: 93.324,
    radius: 20000,
    color: "#ff0066",
    description: "Restricted military zone.",
  },
];

/* ---------- Component ----------------------------------------------- */
const Dashboard = () => {
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [destinations, setDestinations] = useState<Destination[]>([]);
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [isSafe, setIsSafe] = useState(true); // Safe/Unsafe relative to threat zones
  const [activeTab, setActiveTab] = useState("dashboard");

  /* ---------- Map refs ----------------------------------------------- */
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const isFirstLoad = useRef(true);

  /* ---------- Geofence state ---------------------------------------- */
  const GEOFENCE_RADIUS = 3000; // metres
  const geofenceStatus = useRef<Record<string, boolean>>({});
  const geofenceCircles = useRef<Record<string, any>>({});

  /* ---------- Threat state ------------------------------------------ */
  const threatStatus = useRef<Record<string, boolean>>({});
  const threatCircles = useRef<Record<string, any>>({});

  /* ---------- Audio --------------------------------------------------- */
  const beepRef = useRef<HTMLAudioElement | null>(null);

  const navigate = useNavigate();
  const { toast } = useToast();

  /* ---------- Audio unlock (click once) ------------------------------ */
  useEffect(() => {
    const unlock = () => {
      if (beepRef.current) {
        beepRef.current.play().then(() => {
          beepRef.current?.pause();
          beepRef.current.currentTime = 0;
        });
      }
      window.removeEventListener("click", unlock);
    };
    window.addEventListener("click", unlock);
  }, []);

  /* ---------- Auth & profile check ---------------------------------- */
  useEffect(() => {
    const loginCheck = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate("/signin");
        return;
      }

      setUser(user);

      const { data: profile } = await supabase
        .from("profiles")
        .select("nationality, phone")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!profile?.nationality || !profile?.phone) {
        navigate("/profile-completion");
        return;
      }

      await fetchDestinations(user.id);
      setLoading(false);
    };

    loginCheck();

    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT" || !session) navigate("/signin");
    });

    return () => data.subscription.unsubscribe();
  }, [navigate]);

  /* ---------- Geolocation + Map ------------------------------------- */
  useEffect(() => {
    if (!("geolocation" in navigator)) return;

    const watchId = navigator.geolocation.watchPosition(
      async (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        setLocation({ lat, lng });

        /* 1️⃣   Initialise map once */
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

          /* 1.1 Geofence circles for destinations */
          destinations
            .filter((d) => d.latitude && d.longitude)
            .forEach((dest) => {
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
            });

          /* 1.2 Threat zone circles (colour = danger level) */
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

        /* 2️⃣   Move user marker to current position */
        if (markerRef.current) markerRef.current.setPosition({ lat, lng });

        /* 3️⃣   Pan only on the first load */
        if (mapInstance.current && isFirstLoad.current) {
          mapInstance.current.panTo({ lat, lng });
          isFirstLoad.current = false;
        }

        /* 4️⃣   Check destination geofences */
        let insideAnyGeofence = false;
        destinations.forEach((dest) => {
          if (!dest.latitude || !dest.longitude) return;

          const dist = getDistance(lat, lng, dest.latitude, dest.longitude);
          const inside = dist <= GEOFENCE_RADIUS;
          const wasInside = geofenceStatus.current[dest.id] ?? false;

          if (inside) insideAnyGeofence = true;

          if (inside && !wasInside) {
            toast({
              title: "📍 Geofence Entered",
              description: `You entered the area of ${dest.name}`,
            });
            geofenceStatus.current[dest.id] = true;
          }

          if (!inside && wasInside) {
            toast({
              title: "🚪 Geofence Exited",
              description: `You left the area of ${dest.name}`,
              variant: "destructive",
            });
            if (beepRef.current) {
              beepRef.current.currentTime = 0;
              beepRef.current.play().catch(() => {
                console.warn("Autoplay prevented");
              });
            }
            geofenceStatus.current[dest.id] = false;
          }
        });

        /* 5️⃣   Check threat zones (high‑risk areas) */
        let insideAnyThreat = false;
        THREAT_ZONES.forEach((zone) => {
          const dist = getDistance(lat, lng, zone.latitude, zone.longitude);
          const inside = dist <= zone.radius;
          const wasInside = threatStatus.current[zone.id] ?? false;

          if (inside) insideAnyThreat = true;

          if (inside && !wasInside) {
            toast({
              title: "⚠️ High‑Risk Area",
              description: `${zone.name} – ${zone.description ?? "High risk!"}`,
            });
            threatStatus.current[zone.id] = true;
          }

          if (!inside && wasInside) {
            toast({
              title: "✅ Safe Zone",
              description: `You left ${zone.name}`,
              variant: "success",
            });
            threatStatus.current[zone.id] = false;
          }
        });

        /* 6️⃣   Update the UI flag – unsafe if any threat active */
        setIsSafe(!insideAnyThreat);

        /* 7️⃣   Persist user location */
        if (user) await updateUserLocation(user.id, lat, lng);
      },
      (err) => {
        console.error("Location error:", err);
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

  /* ---------- Upload location every 15s (fallback) ------------------- */
  useEffect(() => {
    if (!user || !location) return;
    const interval = setInterval(() => {
      if (user && location) updateUserLocation(user.id, location.lat, location.lng);
    }, 15000);
    return () => clearInterval(interval);
  }, [user, location]);

  /* ---------- Helpers ------------------------------------------------ */
  const updateUserLocation = async (
    uid: string,
    lat: number,
    lng: number,
  ) => {
    try {
      await supabase.from("user_locations").delete().eq("user_id", uid);
      const { error } = await supabase
        .from("user_locations")
        .insert({ user_id: uid, latitude: lat, longitude: lng });
      if (error) throw error;
    } catch (err: any) {
      console.error("Failed to update location:", err);
    }
  };

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

  const fetchDestinations = async (uid: string) => {
    const { data, error } = await supabase
      .from("destinations")
      .select("*")
      .eq("user_id", uid)
      .order("created_at", { ascending: false });
    if (error) {
      toast({ title: "Error fetching destinations", description: error.message, variant: "destructive" });
      return;
    }
    setDestinations(data || []);
  };

  const handleSignOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      toast({ title: "Error signing out", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Signed out", description: "Come back soon!" });
    navigate("/signin");
  };

  /* ---------- Debounce & search ------------------------------------- */
  const debounce = useCallback((fn: Function, delay: number) => {
    let timer: NodeJS.Timeout;
    return (...args: any[]) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), delay);
    };
  }, []);

  const fetchSuggestions = async (term: string) => {
    setQuery(term);
    if (term.length < 3) {
      setSuggestions([]);
      return;
    }
    try {
      const res = await fetch(
        `https://photon.komoot.io/api/?q=${encodeURIComponent(term)}&limit=10`,
      );
      const data = await res.json();
      setSuggestions(data.features || []);
    } catch (err) {
      console.error("suggestions error", err);
    }
  };
  const debouncedFetch = useRef(debounce(fetchSuggestions, 400)).current;

  /* ---------- Actions – add / remove destinations ------------------- */
  const addDestination = async (place: any) => {
    if (!user) return;
    const coords = place.geometry.coordinates;
    const name = place.properties.name || place.properties.city || place.properties.country || "Unnamed Place";
    try {
      const { error } = await supabase
        .from("destinations")
        .insert({
          user_id: user.id,
          name,
          latitude: parseFloat(coords[1]),
          longitude: parseFloat(coords[0]),
        });
      if (error) throw error;
      await fetchDestinations(user.id);
      setQuery("");
      setSuggestions([]);
      toast({ title: "Destination added", description: "Added to your travel list." });
    } catch (err: any) {
      toast({ title: "Error adding destination", description: err.message, variant: "destructive" });
    }
  };

  const removeDestination = async (id: string) => {
    try {
      const { error } = await supabase.from("destinations").delete().eq("id", id);
      if (error) throw error;
      setDestinations((prev) => prev.filter((d) => d.id !== id));
      toast({ title: "Destination removed", description: "Removed from list." });
    } catch (err: any) {
      toast({ title: "Error removing", description: err.message, variant: "destructive" });
    }
  };

  /* ---------- Loading ----------------------------------------------- */
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-secondary/20 to-accent/10">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary" />
      </div>
    );
  }
  if (!user) return null;

  /* ---------- Render -------------------------------------------------- */
  return (
    <div
      className="min-h-screen bg-cover bg-center bg-no-repeat"
      style={{ backgroundImage: "url('/mountainbg.jpg')" }}
    >
      <audio ref={beepRef} src="/beep.mp3" preload="auto" />

      <div className="min-h-screen bg-gradient-to-br from-white/40 via-white/30 to-white/20">
        {/* Header */}
        <header className="sticky top-0 z-50 border-b bg-card/95 backdrop-blur-sm">
          <div className="container mx-auto px-4 py-4 flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <MapPin className="w-10 h-10 text-primary" />
              <div>
                <h1 className="text-2xl font-bold text-primary">
                  Incredible India
                </h1>
                <p className="text-sm text-muted-foreground">Tourism Dashboard</p>
              </div>
            </div>
            <div className="space-x-2">
              <Button variant="outline" onClick={() => navigate("/profile")}>
                <User className="w-4 h-4" />
                <span>Profile</span>
              </Button>
              <Button
                variant="outline"
                onClick={handleSignOut}
                className="hover:bg-destructive hover:text-destructive-foreground"
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

            {/* • Dashboard • */}
            <TabsContent value="dashboard">
              {/* Welcome card */}
              <Card className="bg-gradient-to-r from-primary to-accent text-white shadow-xl">
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
                        <CardDescription className="text-white/80">
                          Ready to explore the wonders of India?
                        </CardDescription>
                      </div>
                    </div>

                    <Button
                      onClick={handlePanicButton}
                      variant="destructive"
                      className="bg-red-600 hover:bg-red-700 text-white font-bold animate-pulse"
                    >
                      <AlertTriangle className="w-5 h-5 mr-2" /> PANIC
                    </Button>
                  </div>
                </CardHeader>
              </Card>

              {/* Live location */}
              {location && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-2xl">
                      <Navigation className="w-5 h-5 text-primary" />
                      Your Live Location
                    </CardTitle>
                    <CardDescription>
                      Lat: {location.lat.toFixed(6)}, Lng:{" "}
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

              {/* Destination planner */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-2xl">Plan Your Destinations</CardTitle>
                  <CardDescription>
                    Search for locations using Photon API and add them to your
                    list.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="relative mb-4">
                    <input
                      type="text"
                      value={query}
                      onChange={(e) => { setQuery(e.target.value); debouncedFetch(e.target.value); }}
                      placeholder="Search for a location..."
                      className="w-full rounded-md border px-4 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                    {suggestions.length > 0 && (
                      <ul className="absolute z-10 mt-1 w-full overflow-auto rounded-md bg-white border shadow-md">
                        {suggestions.map((p, i) => (
                          <li
                            key={i}
                            className="px-4 py-2 hover:bg-secondary cursor-pointer flex items-center space-x-2"
                            onClick={() => addDestination(p)}
                          >
                            <MapPin className="w-4 h-4 text-primary" />
                            <span>{p.properties.name || p.properties.city || p.properties.country}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  {destinations.length > 0 && (
                    <ul className="space-y-2">
                      {destinations.map((d) => (
                        <li key={d.id} className="flex justify-between items-center bg-secondary/20 px-4 py-2 rounded-md">
                          <span>{d.name}</span>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => removeDestination(d.id)}
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

            {/* • Help & Support • */}
            <TabsContent value="helpdesk">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-2xl">
                    <HelpCircle className="w-6 h-6 text-primary" />
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
