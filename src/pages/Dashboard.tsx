/* --------------------------------------------------------------------
   src/pages/Dashboard.tsx
   --------------------------------------------------------------------
   * Replaces the original Google‑Maps implementation with **Leaflet**
     (OpenStreetMap tiles – fully free, no API key).
   * All business logic – authentication, geofencing, live‑location
     updates, panic button, destination CRUD, advisories, live threat
     zones, safety‑score, toasts – is preserved.
   * The map shows:
        •  User marker (green “you are here” pin)
        •  Geofence circles (green, 3 km radius)
        •  Threat circles (colour depends on severity)
        •  Threat pins (red pin inside each threat circle)
   * No code has been shortened or omitted – you will receive the
     *complete* Dashboard component.
-------------------------------------------------------------------- */

import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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

/* -------------------------- Leaflet imports ------------------- */
import { MapContainer, TileLayer, Marker, Circle, Popup, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

/* ----------------------------------------------------------------
   Type definitions
   ---------------------------------------------------------------- */
interface Advisory {
  id: string;
  message: string;
  latitude: number;
  longitude: number;
  created_at: string;
}

interface AlertZone {
  id: string;
  title: string;
  description: string;
  lat: number;
  lng: number;
  radiusMeters: number;
  severity: "low" | "medium" | "high";
}

interface Destination {
  id: string;
  name: string;
  latitude?: number;
  longitude?: number;
}

/* ----------------------------------------------------------------
   Utility: Haversine distance
   ---------------------------------------------------------------- */
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

/* ----------------------------------------------------------------
   Debounce helper
   ---------------------------------------------------------------- */
const debounce = (fn: Function, ms: number) => {
  let timeout: NodeJS.Timeout;
  return (...args: any[]) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn(...args), ms);
  };
};

/* ----------------------------------------------------------------
   Icon helpers for Leaflet
   ---------------------------------------------------------------- */
const userIcon = new L.Icon({
  iconUrl: "https://cdn-icons-png.flaticon.com/512/4872/4872379.png",
  iconSize: [35, 45],
  iconAnchor: [17, 45],
});

const threatIcon = new L.Icon({
  iconUrl: "https://cdn-icons-png.flaticon.com/512/1159/1159168.png",
  iconSize: [35, 45],
  iconAnchor: [17, 45],
});

/* ----------------------------------------------------------------
   Dashboard component
   ---------------------------------------------------------------- */
const Dashboard = () => {
  /* -------------------------- authentication ------------------- */
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [loading, setLoading] = useState(true);

  /* -------------------------- data layers --------------------- */
  const [destinations, setDestinations] = useState<Destination[]>([]);
  const [alertZones, setAlertZones] = useState<AlertZone[]>([]);
  const [advisories, setAdvisories] = useState<Advisory[]>([]);

  /* -------------------------- location & map ----------------- */
  const [userPos, setUserPos] = useState<{ lat: number; lng: number } | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const isFirstLoad = useRef(true);

  /* -------------------------- status & UI ------------------- */
  const [isSafe, setIsSafe] = useState(true);
  const [inThreatZone, setInThreatZone] = useRef<Record<string, boolean>>({});
  const [geofenceStatus, setGeofenceStatus] = useState<Record<string, boolean>>({});
  const [safetyScore, setSafetyScore] = useState(100);
  const [activeTab, setActiveTab] = useState("dashboard");
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<any[]>([]);

  /* -------------------------- helpers ----------------------- */
  const GEOFENCE_RADIUS = 3000; // metres
  const navigate = useNavigate();
  const { toast } = useToast();
  const beepRef = useRef<HTMLAudioElement | null>(null);

  /* ----------------------------------------------------------------
     Unlock audio after first user interaction
     ---------------------------------------------------------------- */
  useEffect(() => {
    const unlockAudio = () => {
      if (beepRef.current) {
        beepRef.current
          .play()
          .then(() => {
            beepRef.current?.pause();
            beepRef.current?.setAttribute("currentTime", "0");
          })
          .catch(() => {
            /* ignore */;
          });
      }
      window.removeEventListener("click", unlockAudio);
    };
    window.addEventListener("click", unlockAudio);
  }, []);

  /* ----------------------------------------------------------------
     Authentication & profile completeness
     ---------------------------------------------------------------- */
  useEffect(() => {
    const init = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
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
    init();

    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT" || !session) navigate("/signin");
    });

    return () => data.subscription.unsubscribe();
  }, [navigate]);

  /* ----------------------------------------------------------------
     Geolocation watcher
     ---------------------------------------------------------------- */
  useEffect(() => {
    if (!navigator.geolocation) return;

    const watchId = navigator.geolocation.watchPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        setUserPos({ lat: latitude, lng: longitude });

        /* Update server */
        if (user) await updateUserLocation(user.id, latitude, longitude);

        /* Pan map once on first load */
        if (isFirstLoad.current && mapRef.current) {
          mapRef.current.setView([latitude, longitude], 15, { animate: true });
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
  }, [toast, user]);

  /* ----------------------------------------------------------------
     Geofence drawing
     ---------------------------------------------------------------- */
  const geofenceCircles = destinations.map((dest) => {
    if (!dest.latitude || !dest.longitude) return null;
    return (
      <Circle
        key={`geofence-${dest.id}`}
        center={[dest.latitude, dest.longitude]}
        radius={GEOFENCE_RADIUS}
        pathOptions={{
          color: "#00FF00",
          opacity: 0.8,
          weight: 2,
          fillColor: "#00FF00",
          fillOpacity: 0.2,
        }}
      />
    );
  });

  /* ----------------------------------------------------------------
     Threat circles & pins
     ---------------------------------------------------------------- */
  const threatCircles = alertZones.map((zone) => (
    <Circle
      key={`threat-${zone.id}`}
      center={[zone.lat, zone.lng]}
      radius={zone.radiusMeters}
      pathOptions={{
        color: severityToColour(zone.severity),
        opacity: 0.8,
        weight: 2,
        fillColor: severityToColour(zone.severity),
        fillOpacity: 0.2,
      }}
      eventHandlers={{
        click: () => {
          // Info window is handled by Popup component below
        },
      }}
    >
      <Popup>
        <strong>{zone.title}</strong>
        <br />
        {zone.description}
      </Popup>
    </Circle>
  ));

  const threatPins = alertZones.map((zone) => (
    <Marker
      key={`pin-${zone.id}`}
      position={[zone.lat, zone.lng]}
      icon={threatIcon}
    />
  ));

  /* ----------------------------------------------------------------
     User marker
     ---------------------------------------------------------------- */
  const userMarker =
    userPos && (
      <Marker position={[userPos.lat, userPos.lng]} icon={userIcon}>
        <Popup>Your Location</Popup>
      </Marker>
    );

  /* ----------------------------------------------------------------
     Advisories markers
     ---------------------------------------------------------------- */
  const advisoryMarkers = advisories.map((adv) => (
    <Marker
      key={`adv-${adv.id}`}
      position={[adv.latitude, adv.longitude]}
      icon={threatIcon}
    >
      <Popup>
        <strong>Police Advisory</strong>
        <br />
        {adv.message}
        <br />
        {new Date(adv.created_at).toLocaleString()}
      </Popup>
    </Marker>
  ));

  /* ----------------------------------------------------------------
     Threat & geofence logic – will run whenever user position,
     destinations or alert zones change
     ---------------------------------------------------------------- */
  useEffect(() => {
    if (!user || !userPos || destinations.length === 0) return;

    /* ----- Check geofences ----- */
    let insideAnyGeofence = false;
    const newGeofenceStatus: Record<string, boolean> = {};

    destinations.forEach((dest) => {
      if (!dest.latitude || !dest.longitude) {
        newGeofenceStatus[dest.id] = false;
        return;
      }
      const d = getDistance(
        userPos.lat,
        userPos.lng,
        dest.latitude,
        dest.longitude
      );
      const inside = d <= GEOFENCE_RADIUS;
      if (inside) insideAnyGeofence = true;
      if (inside && !geofenceStatus[dest.id]) {
        toast({
          title: "📍 Geofence Entered",
          description: `You entered the area of ${dest.name}`,
        });
      }
      if (!inside && geofenceStatus[dest.id]) {
        toast({
          title: "🚪 Geofence Exited",
          description: `You left the area of ${dest.name}`,
          variant: "destructive",
        });
      }
      newGeofenceStatus[dest.id] = inside;
    });
    setGeofenceStatus(newGeofenceStatus);

    /* ----- Check threat zones ----- */
    let insideAnyThreat = false;
    const newThreatStatus: Record<string, boolean> = {};

    alertZones.forEach((zone) => {
      const d = getDistance(userPos.lat, userPos.lng, zone.lat, zone.lng);
      const inside = d <= zone.radiusMeters;
      if (inside) insideAnyThreat = true;
      if (inside && !inThreatZone.current[zone.id]) {
        toast({
          title: `⚠️ Threat – ${zone.title}`,
          description: zone.description,
          variant: "destructive",
        });
      }
      if (!inside && inThreatZone.current[zone.id]) {
        toast({
          title: `🚪 Left Threat – ${zone.title}`,
          description: zone.description,
          variant: "destructive",
        });
      }
      newThreatStatus[zone.id] = inside;
    });
    setInThreatZone((prev) => ({ ...prev, ...newThreatStatus }));

    /* ----- Update safe / unsafe & safety score ----- */
    setIsSafe(insideAnyGeofence && !insideAnyThreat);
    setSafetyScore(calculateSafetyScore(alertZones, userPos.lat, userPos.lng));

    /* ----- Play beep on exiting a threat zone ----- */
    if (
      !insideAnyThreat &&
      Object.values(inThreatZone.current).some((v) => v)
    ) {
      if (beepRef.current) {
        beepRef.current.currentTime = 0;
        beepRef.current
          .play()
          .catch(() => console.warn("Autoplay prevented"));
      }
    }
  }, [user, userPos, destinations, alertZones]);

  /* ----------------------------------------------------------------
     Periodic location upload (every 15 sec)
     ---------------------------------------------------------------- */
  useEffect(() => {
    if (!user || !userPos) return;
    const interval = setInterval(() => {
      updateUserLocation(user.id, userPos.lat, userPos.lng);
    }, 15000);
    return () => clearInterval(interval);
  }, [user, userPos]);

  /* ----------------------------------------------------------------
     Fetch advisories (every 30 sec)
     ---------------------------------------------------------------- */
  useEffect(() => {
    fetchAdvisories();
    const iv = setInterval(fetchAdvisories, 30000);
    return () => clearInterval(iv);
  }, []);

  /* ----------------------------------------------------------------
     Fetch live threat zones from NDMA CAP feed (every 5 min)
     ---------------------------------------------------------------- */
  useEffect(() => {
    const loadThreatZones = async () => {
      try {
        const feedUrl = "https://sachet.ndma.gov.in/CapFeed";
        const resp = await fetch(feedUrl);
        const xml = await resp.text();
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xml, "application/xml");
        const alerts = Array.from(xmlDoc.getElementsByTagName("alert"));

        const zones: AlertZone[] = alerts
          .map((a) => {
            try {
              const id = a
                .getElementsByTagName("identifier")[0]
                ?.textContent?.trim() || "";
              const info = a.getElementsByTagName("info")[0];
              if (!info) return null;
              const area = info.getElementsByTagName("area")[0];
              if (!area) return null;
              const geo = area.getElementsByTagName("geocode");
              const country = geo[0]
                ?.getElementsByTagName("value")[0]
                ?.textContent?.trim() ?? "";
              if (country !== "IN") return null; // only India

              const circleText = area
                .getElementsByTagName("circle")[0]
                ?.textContent?.trim() ?? "";
              if (!circleText) return null;

              const [coordPart, radiusPart] = circleText.split(" ");
              const [latStr, lngStr] = coordPart.split(",").map((s) => s.trim());
              const lat = parseFloat(latStr);
              const lng = parseFloat(lngStr);
              const radiusKm = parseFloat(radiusPart) ?? 1;

              const severityTag = info
                .getElementsByTagName("severity")[0]
                ?.textContent?.trim()
                ?.toLowerCase();

              let severity: "low" | "medium" | "high" = "low";
              if (severityTag === "moderate") severity = "medium";
              else if (severityTag === "severe") severity = "high";

              return {
                id,
                title:
                  info.getElementsByTagName("event")[0]?.textContent?.trim() ||
                  "Alert",
                description:
                  info.getElementsByTagName("description")[0]?.textContent?.trim() ||
                  "",
                lat,
                lng,
                radiusMeters: radiusKm * 1000,
                severity,
              };
            } catch {
              return null;
            }
          })
          .filter((z): z is AlertZone => !!z);

        setAlertZones(zones);
      } catch (err) {
        console.error("Error loading threat zones:", err);
      }
    };

    loadThreatZones();
    const iv = setInterval(loadThreatZones, 5 * 60 * 1000); // 5 minutes
    return () => clearInterval(iv);
  }, []);

  /* ----------------------------------------------------------------
     Fetch destinations
     ---------------------------------------------------------------- */
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

  /* ----------------------------------------------------------------
     Fetch advisories from Supabase
     ---------------------------------------------------------------- */
  const fetchAdvisories = async () => {
    try {
      const { data, error } = await supabase
        .from("live_threads")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      setAdvisories(data || []);
    } catch (err) {
      console.error("Error fetching advisories:", err);
    }
  };

  /* ----------------------------------------------------------------
     Update user location in DB
     ---------------------------------------------------------------- */
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

  /* ----------------------------------------------------------------
     Sign‑out
     ---------------------------------------------------------------- */
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
     Panic button
     ---------------------------------------------------------------- */
  const handlePanicButton = async () => {
    if (!user || !userPos) return;
    try {
      const { error } = await supabase
        .from("panic_alerts")
        .insert({
          user_id: user.id,
          message: "Emergency! User needs immediate assistance.",
          latitude: userPos.lat,
          longitude: userPos.lng,
          status: "active",
        });
      if (error) throw error;
      toast({
        title: "🚨 Panic Alert Sent!",
        description:
          "Emergency services have been notified of your location.",
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
     Debounce for Photon suggestions
     ---------------------------------------------------------------- */
  const debouncedFetchSuggestions = useRef(
    debounce(fetchSuggestions, 400)
  ).current;

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
      if (data && data.features) {
        setSuggestions(data.features);
      }
    } catch (err) {
      console.error("Error fetching location suggestions:", err);
    }
  };

  /* ----------------------------------------------------------------
     Add destination
     ---------------------------------------------------------------- */
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

  /* ----------------------------------------------------------------
     Remove destination
     ---------------------------------------------------------------- */
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
     Severity colour helper
     ---------------------------------------------------------------- */
  const severityToColour = (sev: AlertZone["severity"]) => {
    switch (sev) {
      case "high":
        return "#e52e2e";
      case "medium":
        return "#e5a52e";
      default:
        return "#2e7ae5";
    }
  };

  /* ----------------------------------------------------------------
     Safety score calculation
     ---------------------------------------------------------------- */
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

  /* ----------------------------------------------------------------
     Loading screen
     ---------------------------------------------------------------- */
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-secondary/20 to-accent/10">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!user) return null;

  /* ----------------------------------------------------------------
     Final JSX (the very same UI you had, just the map part changed)
     ---------------------------------------------------------------- */
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

        {/* Main content */}
        <main className="container mx-auto px-4 py-8">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
              <TabsTrigger value="helpdesk">Help & Support</TabsTrigger>
              <TabsTrigger value="alerts">Live Threats</TabsTrigger>
            </TabsList>

            {/* ---- Dashboard Tab ---- */}
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

              {/* ---- Live Location Map ---- */}
              {userPos && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-2xl font-bold flex items-center gap-2">
                      <Navigation className="h-5 w-5 text-primary" /> Your Live
                      Location
                    </CardTitle>
                    <CardDescription>
                      Latitude: {userPos.lat.toFixed(6)}, Longitude:{" "}
                      {userPos.lng.toFixed(6)}
                    </CardDescription>

                    {/* Safe / Unsafe indicator */}
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
                    <MapContainer
                      ref={mapRef}
                      center={[userPos.lat, userPos.lng]}
                      zoom={15}
                      style={{ height: "400px", width: "100%" }}
                    >
                      <TileLayer
                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                        attribution="© OpenStreetMap contributors"
                      />

                      {geofenceCircles}
                      {threatCircles}
                      {threatPins}
                      {userMarker}
                      {advisoryMarkers}
                    </MapContainer>
                  </CardContent>
                </Card>
              )}

              {/* ---- Destinations Section ---- */}
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

            {/* ---- Help Desk Tab ---- */}
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

            {/* ---- Live Threats Tab ---- */}
            <TabsContent value="alerts">
              <Card>
                <CardHeader>
                  <CardTitle className="text-2xl font-bold flex items-center gap-2">
                    <AlertTriangle className="h-6 w-6 text-danger-500" />
                    Live Threat Zones
                  </CardTitle>
                  <CardDescription>
                    Live threat alerts for India. Circles are coloured by
                    severity.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    These alerts are refreshed every 5 minutes from the
                    NDMA SACHET CAP feed. Hover over a circle to see the
                    event details.
                  </p>
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


