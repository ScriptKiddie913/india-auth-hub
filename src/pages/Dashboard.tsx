/* ------------------------------------------------------------------
   src/pages/Dashboard.tsx
   ------------------------------------------------------------------
   The Dashboard now contains **all** the map logic that was split
   out into the separate *IndiaAlertMap* component.  
   •  Live threat alerts (India only) are fetched, parsed from
      the NDMA SACHET CAP feed and rendered on the same Google‑Maps
      instance that shows the user marker and normal geofence circles.  
   •  Threat circles are coloured by severity and show an
      info‑window on click (title + description).  
   •  A safety‑score is calculated from the active threat zones and
      displayed next to the location card.  
   •  All existing behaviour – authentication, destination CRUD,
      panic button, toast notifications, etc. – remains exactly as before.
   ------------------------------------------------------------------ */

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
  const R = 6371e3; // metres
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

/* ------------------------------------------------------------------
   Dashboard component
   ------------------------------------------------------------------ */
const Dashboard = () => {
  /* ========== ORIGINAL STATE ========== */
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [destinations, setDestinations] = useState<Destination[]>([]);
  const [location, setLocation] = useState<{
    lat: number;
    lng: number;
  } | null>(null);
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [isSafe, setIsSafe] = useState(true);
  const [activeTab, setActiveTab] = useState("dashboard");

  /* ========== NEW STATE ========== */
  const [alertZones, setAlertZones] = useState<AlertZone[]>([]);
  const [safetyScore, setSafetyScore] = useState(100);
  const inThreatZone = useRef<Record<string, boolean>>({});

  /* ========== MAP REFS ========== */
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const isFirstLoad = useRef(true);

  /* ========== GEOFENCE STATE ========== */
  const geofenceStatus = useRef<Record<string, boolean>>({});
  const geofenceCircles = useRef<Record<string, any>>({});
  const GEOFENCE_RADIUS = 3000; // m

  /* ========== A AUDIO REFERENCE ========== */
  const beepRef = useRef<HTMLAudioElement | null>(null);

  /* ========== NAV & TOAST ========== */
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
            if (beepRef.current) {
              beepRef.current.currentTime = 0;
            }
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
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        setUser(user);

        // profile completeness
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
     Real‑time location, map and geofencing.
     All logic from the original component plus the new **threat
     zones** drawn in the same map.
     ------------------------------------------------------------------ */
  useEffect(() => {
    if (!("geolocation" in navigator)) return;

    const watchId = navigator.geolocation.watchPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setLocation({ lat, lng });

        /* -- MAP INIT -- */
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

        /* -- UPDATE USER MARKER -- */
        if (markerRef.current) {
          markerRef.current.setPosition({ lat, lng });
        }

        /* -- PAN ON FIRST LOAD -- */
        if (mapInstance.current && isFirstLoad.current) {
          mapInstance.current.panTo({ lat, lng });
          isFirstLoad.current = false;
        }

        /* === NORMAL GEOFECKS (green circles) === */
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

          /* Remove stale destination circles */
          Object.keys(geofenceCircles.current).forEach((id) => {
            if (!destinations.find((d) => d.id === id)) {
              geofenceCircles.current[id].setMap(null);
              delete geofenceCircles.current[id];
            }
          });

          /* === THREAT ZONES: circles + pin (info‑window on click) === */
          alertZones.forEach((zone) => {
            /* circle */
            const circle = new (window as any).google.maps.Circle({
              strokeColor: severityToColour(zone.severity),
              strokeOpacity: 0.8,
              strokeWeight: 2,
              fillColor: severityToColour(zone.severity),
              fillOpacity: 0.2,
              map: mapInstance.current,
              center: { lat: zone.lat, lng: zone.lng },
              radius: zone.radiusMeters,
            });

            /* info‑window */
            const infoWindow = new (window as any).google.maps.InfoWindow({
              content: `<strong>${zone.title}</strong><br />${zone.description}`,
            });

            circle.addListener("click", () => {
              /* create a dummy marker as the anchor – keeps the window anchored to the circle centre */
              const anchor = new (window as any).google.maps.Marker({
                position: { lat: zone.lat, lng: zone.lng },
                map: mapInstance.current,
              });
              infoWindow.open(mapInstance.current, anchor);
            });

            geofenceCircles.current[`threat-circle-${zone.id}`] = circle;
          });
        }

        /* === CHECK GEOFECKS AND THRÊATS === */
        if (user && destinations.length > 0) {
          let insideAnyGeofence = false;

          destinations.forEach((dest) => {
            if (!dest.latitude || !dest.longitude) return;
            const distance = getDistance(
              lat,
              lng,
              dest.latitude,
              dest.longitude
            );
            const isInside = distance <= GEOFENCE_RADIUS;
            const wasInside = geofenceStatus.current[dest.id] || false;

            if (isInside) insideAnyGeofence = true;

            if (isInside && !wasInside) {
              toast({
                title: "📍 Geofence Entered",
                description: `You entered the area of ${dest.name}`,
              });
            }
            if (!isInside && wasInside) {
              toast({
                title: "🚪 Geofence Exited",
                description: `You left the area of ${dest.name}`,
                variant: "destructive",
              });
            }
            geofenceStatus.current[dest.id] = isInside;
          });

          /* --- THREAT ZONE CHECKS --- */
          let insideAnyThreat = false;
          alertZones.forEach((zone) => {
            const d = getDistance(lat, lng, zone.lat, zone.lng);
            const inside = d <= zone.radiusMeters;
            const wasInside = inThreatZone.current[zone.id] || false;

            if (inside) insideAnyThreat = true;

            if (inside && !wasInside) {
              toast({
                title: `⚠️ Threat – ${zone.title}`,
                description: zone.description,
                variant: "destructive",
              });
            }
            if (!inside && wasInside) {
              toast({
                title: `🚪 Left Threat – ${zone.title}`,
                description: zone.description,
                variant: "destructive",
              });
            }
            inThreatZone.current[zone.id] = inside;
          });

          /* --- UPDATE SAFE / UNSAFE STATUS --- */
          setIsSafe(insideAnyGeofence && !insideAnyThreat);

          /* --- UPDATE SAFETY SCORE --- */
          const score = calculateSafetyScore(alertZones, lat, lng);
          setSafetyScore(score);

          /* --- PLAY BEEP WHEN EXITING THREAT ZONE --- */
          if (!insideAnyThreat && Object.values(inThreatZone.current).some(Boolean)) {
            if (beepRef.current) {
              beepRef.current.currentTime = 0;
              beepRef.current.play().catch(() => {
                console.warn(
                  "Autoplay prevented. User interaction required."
                );
              });
            }
          }
        }

        /* --- UPDATE SERVER WITH LOCATION --- */
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
      { enableHighAccuracy: true, maximumAge: 0 }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [toast, destinations, alertZones, user]);

  /* ------------------------------------------------------------------
     Periodic location upload – original
     ------------------------------------------------------------------ */
  useEffect(() => {
    if (!user || !location) return;

    const interval = setInterval(() => {
      if (location && user) {
        updateUserLocation(user.id, location.lat, location.lng);
      }
    }, 15000);

    return () => clearInterval(interval);
  }, [user, location]);

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
     Destination CRUD – original
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
     Sign out – original
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
     Debounce – original
     ------------------------------------------------------------------ */
  const debounce = (func: Function, delay: number) => {
    let timer: ReturnType<typeof setTimeout>;
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
     Live threat‑zone fetch (NDMA SACHET) – new
     ------------------------------------------------------------------ */
  useEffect(() => {
    const loadThreatZones = async () => {
      try {
        const feedUrl =
          "https://sachet.ndma.gov.in/CapFeed";
        const resp = await fetch(feedUrl);
        const xmlText = await resp.text();
        const parser = new DOMParser();
        const xml = parser.parseFromString(xmlText, "application/xml");

        const alerts = Array.from(xml.getElementsByTagName("alert"));
        const zones: AlertZone[] = alerts
          .map((alertEl) => {
            try {
              const identifier =
                alertEl
                  .getElementsByTagName("identifier")[0]
                  ?.textContent?.trim() || "";
              const info = alertEl.getElementsByTagName("info")[0];
              if (!info) return null;

              const area = info.getElementsByTagName("area")[0];
              if (!area) return null;

              const geocodes = area.getElementsByTagName("geocode");
              const countryCode = geocodes[0]
                ?.getElementsByTagName("value")[0]
                ?.textContent?.trim() ?? "";

              if (countryCode !== "IN") return null; // only India

              const circle = area.getElementsByTagName("circle")[0];
              if (!circle) return null;
              const circleText = circle.textContent?.trim() ?? "";
              const [posPart, radiusPart] = circleText.split(" ");
              const [latStr, lngStr] = posPart.split(",").map((s) => s.trim());
              const lat = parseFloat(latStr);
              const lng = parseFloat(lngStr);
              const radiusKm = parseFloat(radiusPart) || 1;

              const severityTag = info
                .getElementsByTagName("severity")[0]
                ?.textContent?.trim()
                ?.toLowerCase();

              let severity: "low" | "medium" | "high" = "low";
              if (severityTag === "moderate") severity = "medium";
              else if (severityTag === "severe") severity = "high";

              return {
                id: identifier,
                title: info.getElementsByTagName("event")[0]?.textContent?.trim() || "Alert",
                description:
                  info.getElementsByTagName("description")[0]
                    ?.textContent?.trim() ?? "",
                lat,
                lng,
                radiusMeters: radiusKm * 1000,
                severity,
              };
            } catch (e) {
              console.error("Error parsing CAP alert:", e);
              return null;
            }
          })
          .filter((z): z is AlertZone => z !== null);

        setAlertZones(zones);
      } catch (err) {
        console.error("Error fetching threat alerts:", err);
      }
    };

    loadThreatZones();
    const iv = setInterval(loadThreatZones, 5 * 60 * 1000); // every 5 min
    return () => clearInterval(iv);
  }, []);

  /* ------------------------------------------------------------------
     Severity color helper – used when drawing circles.
     ------------------------------------------------------------------ */
  const severityToColour = (sev: AlertZone["severity"]) => {
    switch (sev) {
      case "high":
        return "#e52e2e"; // red
      case "medium":
        return "#e5a52e"; // orange
      default:
        return "#2e7ae5"; // blue
    }
  };

  /* ------------------------------------------------------------------
     Safety‑score calculation – based on current threat zones.
     ------------------------------------------------------------------ */
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
     Render – unchanged UI + safety‑score display
     ------------------------------------------------------------------ */
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

            {/* ====================== Dashboard ====================== */}
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

              {/* ---------- Your live location + circle ---------- */}
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

                    {/* Display computed safety score */}
                    <div className="mt-2">
                      <span className="px-3 py-1 rounded-full bg-indigo-500 text-white font-semibold">
                        Safety Score: {safetyScore}
                      </span>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div ref={mapRef} className="w-full h-64 rounded-lg border" />
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
                    Search for locations using Photon API and add them to yourtravel list.
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

            {/* ====================== Help Desk ====================== */}
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

            {/* ====================== Live Threats ====================== */}
            <TabsContent value="alerts">
              <Card>
                <CardHeader>
                  <CardTitle className="text-2xl font-bold flex items-center gap-2">
                    <AlertTriangle className="h-6 w-6 text-primary" />
                    Live Threat Zones
                  </CardTitle>
                  <CardDescription>
                    Live threat alerts for India. Circles are coloured by severity.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {/* The threat zones are already drawn on the same map shown
                      in the Live Location card.  Nothing more is required
                      here – the map above displays them.  This tab simply
                      documents the feature. */}
                  <div className="text-sm text-muted-foreground">
                    The threat zones above are updated every 5 minutes
                    from the NDMA SACHET CAP feed.
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

