/* src/pages/Dashboard.tsx */
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

/* ------------------------------------------------------------------
   Types
   ------------------------------------------------------------------ */
type AlertZone = {
  id: string;
  title: string;
  description: string;
  lat: number;
  lng: number;
  radiusMeters: number;
  severity: "low" | "medium" | "high";
};

type Destination = {
  id: string;
  name: string;
  latitude?: number;
  longitude?: number;
};

/* ------------------------------------------------------------------
   Haversine – unchanged
   ------------------------------------------------------------------ */
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
    Math.sin(Δφ / 2) ** 2 +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // metres
};

const getDistanceMeters = (lat1: number, lon1: number, lat2: number, lon2: number) =>
  getDistance(lat1, lon1, lat2, lon2);

/* ------------------------------------------------------------------
   Dashboard component
   ------------------------------------------------------------------ */
const Dashboard = () => {
  /* ========== ORIGINAL STATE ========== */
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [destinations, setDestinations] = useState<Destination[]>([]);
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [isSafe, setIsSafe] = useState(true);
  const [activeTab, setActiveTab] = useState("dashboard");

  /* ========== NEW STATE ================= */
  const [alertZones, setAlertZones] = useState<AlertZone[]>([]);
  const [safetyScore, setSafetyScore] = useState(100);

  /* ========== REFERENCES ================= */
  const mapRef = useRef<HTMLDivElement>(null);
  const beepRef = useRef<HTMLAudioElement | null>(null);

  /* ========== NAV & TOAST ================= */
  const navigate = useNavigate();
  const { toast } = useToast();

  /* ------------------------------------------------------------------
     Unlock audio on first click – original
     ------------------------------------------------------------------ */
  useEffect(() => {
    const unlockAudio = () => {
      if (beepRef.current) {
        beepRef.current
          .play()
          .then(() => {
            beepRef.current?.pause();
            beepRef.current?.currentTime && beepRef.current?.setAttribute("currentTime", "0");
          })
          .catch(() => {});
      }
      window.removeEventListener("click", unlockAudio);
    };
    window.addEventListener("click", unlockAudio);
  }, []);

  /* ------------------------------------------------------------------
     Authentication + profile check – original
     ------------------------------------------------------------------ */
  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();

      if (user) {
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
      } else {
        navigate("/signin");
      }
      setLoading(false);
    };

    getUser();

    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT" || !session) navigate("/signin");
    });

    return () => data.subscription.unsubscribe();
  }, [navigate]);

  /* ------------------------------------------------------------------
     Geolocation – update location state
     ------------------------------------------------------------------ */
  useEffect(() => {
    if (!("geolocation" in navigator)) return;

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setLocation({ lat, lng });

        /* Update safety status whenever position changes */
        if (alertZones.length) {
          const danger = alertZones.some((z) => {
            const d = getDistance(lat, lng, z.lat, z.lng);
            return d <= z.radiusMeters;
          });
          setIsSafe(!danger);
          const score = calculateSafetyScore(alertZones, lat, lng);
          setSafetyScore(score);
        }

        /* DB‑store every 15 s */
        if (!locationIntervalRef.current) {
          locationIntervalRef.current = setInterval(() => {
            if (location) {
              updateUserLocation(user?.id ?? "", location.lat, location.lng);
            }
          }, 15000);
        }

        /* Immediate store */
        if (user) {
          updateUserLocation(user.id, lat, lng);
        }
      },
      (err) => {
        console.error("Geolocation error:", err);
        toast({
          title: "Location Error",
          description: err.message,
          variant: "destructive",
        });
      },
      { enableHighAccuracy: true, maximumAge: 0 }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [user, toast, alertZones]);

  /* ------------------------------------------------------------------
     Threat zones – fetch from NDMA SACHET via proxy
     ------------------------------------------------------------------ */
  useEffect(() => {
    const loadThreatZones = async () => {
      if (!location) return;

      const feedUrl = "https://sachet.ndma.gov.in/CapFeed";
      const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(feedUrl)}`;

      try {
        const resp = await fetch(proxyUrl);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const text = await resp.text();

        const parser = new DOMParser();
        const xml = parser.parseFromString(text, "application/xml");
        const alerts = Array.from(xml.getElementsByTagName("alert"));

        const zones: AlertZone[] = alerts
          .map((alert) => {
            try {
              const identifier =
                alert.getElementsByTagName("identifier")[0]?.textContent?.trim() ||
                "";
              const info = alert.getElementsByTagName("info")[0];
              if (!info) return null;

              const event = info.getElementsByTagName("event")[0]?.textContent?.trim() ||
                "Alert";
              const description =
                info.getElementsByTagName("description")[0]?.textContent?.trim() ||
                "";

              const area = info.getElementsByTagName("area")[0];
              if (!area) return null;

              /* Country filter – keep only India */
              const geocodes = Array.from(area.getElementsByTagName("geocode"));
              const countryCode = geocodes
                .map((g) => g.getElementsByTagName("value")[0]?.textContent?.trim())
                .find((v) => !!v);
              if (countryCode && countryCode !== "IN") return null;

              const circle = area.getElementsByTagName("circle")[0];
              if (!circle) return null;
              const circleText = circle.textContent?.trim() ?? "";
              const [posPart, rad] = circleText.split(" ");
              const [latStr, lngStr] = posPart.split(",");
              const lat = parseFloat(latStr);
              const lng = parseFloat(lngStr);
              const radiusKm = parseFloat(rad) || 1;

              const severityTag = info
                .getElementsByTagName("severity")[0]?.textContent?.trim()
                ?.toLowerCase();
              let severity: AlertZone["severity"] = "low";
              if (severityTag === "moderate") severity = "medium";
              else if (severityTag === "severe") severity = "high";

              return {
                id: identifier,
                title: event,
                description,
                lat,
                lng,
                radiusMeters: radiusKm * 1000,
                severity,
              };
            } catch (e) {
              console.warn("Failed to parse alert:", e);
              return null;
            }
          })
          .filter((z): z is AlertZone => !!z);

        setAlertZones(zones);
      } catch (err: any) {
        console.error("Error loading threat zones:", err);
        /* keep empty list – no alert if feed fails */
      }
    };

    loadThreatZones();

    /* refresh every 5 min */
    const iv = setInterval(loadThreatZones, 5 * 60 * 1000);
    return () => clearInterval(iv);
  }, [location]);

  /* ------------------------------------------------------------------
     Debounce helper – original
     ------------------------------------------------------------------ */
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
     Photon search – original
     ------------------------------------------------------------------ */
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
    } catch (err) {
      console.error("Error fetching location suggestions:", err);
    }
  };

  const debouncedFetchSuggestions = useRef(debounce(fetchSuggestions, 400))
    .current;

  /* ------------------------------------------------------------------
     Add destination – original
     ------------------------------------------------------------------ */
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
     Remove destination – original
     ------------------------------------------------------------------ */
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

  /* ------------------------------------------------------------------
     Destination fetch – original
     ------------------------------------------------------------------ */
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
     Sign‑out – original
     ------------------------------------------------------------------ */
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
     Panic button – original
     ------------------------------------------------------------------ */
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
     Update user location in DB – original
     ------------------------------------------------------------------ */
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
        .insert({ user_id: userId, latitude, longitude });

      if (error) throw error;
    } catch (error: any) {
      console.error("Error updating location:", error);
    }
  };

  /* ------------------------------------------------------------------
     -----  Map rendering helpers ========================= **/
  const pixelsPerKm = 222; // Yandex static map 500×500 covers ~111 km

  const severityToColour = (sev: AlertZone["severity"]) => {
    switch (sev) {
      case "high":
        return "rgba(229,46,46,0.3)";
      case "medium":
        return "rgba(229,165,46,0.3)";
      default:
        return "rgba(42,122,229,0.3)";
    }
  };

  const calculateSafetyScore = (
    zones: AlertZone[],
    lat: number,
    lng: number
  ): number => {
    let score = 100;
    zones.forEach((zone) => {
      const d = getDistance(lat, lng, zone.lat, zone.lng);
      if (d <= zone.radiusMeters) {
        if (zone.severity === "high") score -= 40;
        else if (zone.severity === "medium") score -= 20;
        else score -= 10;
      }
    });
    return score < 0 ? 0 : score;
  };

  /* ------------------------------------------------------------------
     Render
     ------------------------------------------------------------------ */
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-secondary/20 to-accent/10">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!user) return null;

  /* Yandex static‑map URL – 500×500, 15 zoom, centre on user */
  const staticMapUrl =
    location &&
    `https://static-maps.yandex.ru/1.x/?ll=${location.lng},${location.lat}&z=15&size=500,500&l=map&pt=${location.lng},${location.lat},pm1m1`;

  /* Compute visual positions for zones that are reasonably close (<5 km) */
  const zoneRenders = location
    ? alertZones
        .filter((z) => {
          const d = getDistance(location.lat, location.lng, z.lat, z.lng);
          return d <= 5000; // keep close ones to avoid huge offsets
        })
        .map((zone) => {
          const { lat: latC, lng: lngC } = zone;
          const { lat, lng } = location;

          /* Degree offsets */
          const dLat = latC - lat;
          const dLng = lngC - lng;

          /* Converting to meters */
          const radLat = (lat * Math.PI) / 180;
          const meterPerDegLat = 111000; // ≈
          const meterPerDegLng = 111000 * Math.cos(radLat);

          const offsetY = (dLat * meterPerDegLat) / pixelsPerKm; // px
          const offsetX = (dLng * meterPerDegLng) / pixelsPerKm; // px

          /* Circle size */
          const radiusPx = Math.round(zone.radiusMeters / pixelsPerKm);

          /* Position – 250 is half of 500 */
          return {
            ...zone,
            left: 250 + offsetX - radiusPx,
            top: 250 + offsetY - radiusPx,
            size: radiusPx * 2,
          };
        })
    : [];

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
                  <p className="text-sm text-muted-foreground">Tourism Dashboard</p>
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
                variant="outline"
                className="flex items-center space-x-2 hover:bg-destructive hover:text-destructive-foreground"
                onClick={handleSignOut}
              >
                <LogOut className="w-4 h-4" />
                <span>Sign Out</span>
              </Button>
            </div>
          </div>
        </header>

        {/* Main */}
        <main className="container mx-auto px-4 py-8">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
              <TabsTrigger value="helpdesk">Help & Support</TabsTrigger>
              <TabsTrigger value="alerts">Live Threats</TabsTrigger>
            </TabsList>

            {/* ---------- Dashboard ---------- */}
            <TabsContent value="dashboard" className="space-y-6">
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
                      variant="destructive"
                      size="lg"
                      className="bg-red-600 hover:bg-red-700 text-white font-bold animate-pulse"
                      onClick={handlePanicButton}
                    >
                      <AlertTriangle className="w-5 h-5 mr-2" />
                      PANIC
                    </Button>
                  </div>
                </CardHeader>
              </Card>

              {/* ---------- Your live location & map ---------- */}
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

                    {/* Safe/Unsafe indicator */}
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

                    {/* Safety score */}
                    <div className="mt-2">
                      <span className="px-3 py-1 rounded-full bg-indigo-500 text-white font-semibold">
                        Safety Score: {safetyScore}
                      </span>
                    </div>
                  </CardHeader>

                  <CardContent>
                    <div ref={mapRef} className="relative w-500 h-500">
                      <img
                        src={staticMapUrl}
                        alt="Current position map"
                        width={500}
                        height={500}
                        className="rounded-lg border"
                      />
                      {/* threat circles */}
                      {zoneRenders.map((c) => (
                        <div
                          key={c.id}
                          style={{
                            position: "absolute",
                            left: `${c.left}px`,
                            top: `${c.top}px`,
                            width: `${c.size}px`,
                            height: `${c.size}px`,
                            backgroundColor: severityToColour(
                              c.severity as AlertZone["severity"]
                            ),
                            borderRadius: "50%",
                          }}
                        />
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* ---------- Plan destinations ---------- */}
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

            {/* ---------- Help Desk ---------- */}
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

            {/* ---------- Live Threats ---------- */}
            <TabsContent value="alerts">
              <Card>
                <CardHeader>
                  <CardTitle className="text-2xl font-bold flex items-center gap-2">
                    <AlertTriangle className="h-6 w-6 text-primary" />
                    Live Threat Zones
                  </CardTitle>
                  <CardDescription>
                    The map above shows real‑time threat zones fetched from the
                    NDMA SACHET feed via AllOrigins proxy.  Circles are coloured
                    by severity, and you get a safety score.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-sm text-muted-foreground">
                    The zones above are refreshed every 5 minutes.  If a
                    location is outside all active zones, the status shows
                    “Safe” and the safety score is 100.
                  </div>
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
