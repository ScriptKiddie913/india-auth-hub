import React, { useEffect, useState, useRef } from "react";
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
  Phone,
  Police,
  Flag,
  HelpCircle,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import HelpDesk from "@/components/HelpDesk";
import type { User as SupabaseUser } from "@supabase/supabase-js";

/* ------------------------------------------------------------------ */
/* Helper: Haversine (distance in metres)                              */
/* ------------------------------------------------------------------ */
const getDistance = (
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
) => {
  const R = 6371e3; // metres
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const φ1 = toRad(lat1);
  const φ2 = toRad(lat2);
  const Δφ = toRad(lat2 - lat1);
  const Δλ = toRad(lon2 - lon1);
  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

/* ------------------------------------------------------------------ */
/* PoliceDashboard component                                           */
/* ------------------------------------------------------------------ */
const PoliceDashboard: React.FC = () => {
  /* ---------- Auth & Profile ---------- */
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<any>(null);
  const navigate = useNavigate();
  const { toast } = useToast();

  /* ---------- UI State ---------- */
  const [activeTab, setActiveTab] = useState("dashboard");
  const [incidents, setIncidents] = useState<any[]>([]);
  const [criticalZones, setCriticalZones] = useState<any[]>([]);
  const [unitLocation, setUnitLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [isSafe, setIsSafe] = useState(true); // true => inside any critical zone

  /* ---------- Map & Geofencing ---------- */
  const mapRef = useRef<HTMLDivElement | null>(null);
  const mapInstance = useRef<any>(null);
  const unitMarker = useRef<any>(null);
  const incidentMarkers = useRef<Record<string, any>>({});
  const zoneOverlays = useRef<Record<string, any>>({});
  const GEOFENCE_RADIUS = 3000; // fallback radius in metres
  const isFirstLoad = useRef(true);
  const geofenceStatus = useRef<Record<string, boolean>>({});

  /* ---------- Audio for alerts ---------- */
  const beepRef = useRef<HTMLAudioElement | null>(null);

  /* ---------- Unlock audio on first interaction (Chrome) ---------- */
  useEffect(() => {
    const unlockAudio = () => {
      if (beepRef.current) {
        beepRef.current
          .play()
          .then(() => {
            beepRef.current?.pause();
            if (beepRef.current) beepRef.current.currentTime = 0;
          })
          .catch(() => {
            /* ignore playback errors */
          });
      }
      window.removeEventListener("click", unlockAudio);
    };
    window.addEventListener("click", unlockAudio);
    return () => window.removeEventListener("click", unlockAudio);
  }, []);

  /* ---------- Fetch user & profile ---------- */
  useEffect(() => {
    let mounted = true;

    const fetchUser = async () => {
      try {
        const { data } = await supabase.auth.getUser();
        const currentUser = (data as any)?.user || null;
        if (!currentUser) {
          navigate("/signin");
          return;
        }
        if (!mounted) return;
        setUser(currentUser as SupabaseUser);

        // fetch police profile
        const { data: prof, error } = await supabase
          .from("profiles")
          .select("user_id, rank, unit, badge_number")
          .eq("user_id", currentUser.id)
          .single();

        if (error || !prof || !prof.rank || !prof.badge_number) {
          // redirect to profile completion if missing required fields
          navigate("/profile-completion");
          return;
        }
        if (!mounted) return;
        setProfile(prof);

        // initial data
        await fetchIncidents();
        await fetchCriticalZones();
      } catch (err) {
        console.error("fetchUser error:", err);
        navigate("/signin");
      } finally {
        if (mounted) setLoading(false);
      }
    };

    fetchUser();

    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT" || !session) {
        navigate("/signin");
      }
    });

    return () => {
      mounted = false;
      try {
        // unsubscribe auth listener if present
        (authListener as any)?.subscription?.unsubscribe?.();
      } catch (e) {
        // ignore
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate]);

  /* ---------- Real‑time location tracking + geofencing ---------- */
  useEffect(() => {
    if (!user || !profile) return;

    if (!("geolocation" in navigator)) {
      toast({ title: "Geolocation not available", description: "Your browser doesn't support geolocation.", variant: "destructive" });
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setUnitLocation({ lat, lng });

        // Initialise map on first load
        if (mapRef.current && !mapInstance.current && (window as any).google) {
          mapInstance.current = new (window as any).google.maps.Map(mapRef.current, {
            center: { lat, lng },
            zoom: 15,
          });

          unitMarker.current = new (window as any).google.maps.Marker({
            position: { lat, lng },
            map: mapInstance.current,
            title: `Unit ${profile?.badge_number}`,
            icon: {
              url: "https://maps.google.com/mapfiles/ms/icons/blue-dot.png",
            },
          });
        }

        // Update unit marker position
        if (unitMarker.current) {
          unitMarker.current.setPosition({ lat, lng });
        }

        // Pan on first load
        if (mapInstance.current && isFirstLoad.current) {
          mapInstance.current.panTo({ lat, lng });
          isFirstLoad.current = false;
        }

        // Render critical zones
        if (mapInstance.current) {
          criticalZones.forEach((zone) => {
            if (!zoneOverlays.current[zone.id]) {
              const overlay = new (window as any).google.maps.Circle({
                strokeColor: "#FF0000",
                strokeOpacity: 0.8,
                strokeWeight: 2,
                fillColor: "#FF0000",
                fillOpacity: 0.2,
                map: mapInstance.current,
                center: { lat: zone.center_lat, lng: zone.center_lng },
                radius: zone.radius_meters || GEOFENCE_RADIUS,
              });
              zoneOverlays.current[zone.id] = overlay;
            }
          });

          // Remove stale overlays
          Object.keys(zoneOverlays.current).forEach((id) => {
            if (!criticalZones.find((z) => z.id === id)) {
              try {
                zoneOverlays.current[id].setMap(null);
              } catch (e) {
                // ignore
              }
              delete zoneOverlays.current[id];
            }
          });
        }

        /* Check if officer is inside any critical zone */
        let insideAny = false;
        criticalZones.forEach((zone) => {
          const dist = getDistance(lat, lng, zone.center_lat, zone.center_lng);
          const inside = dist <= (zone.radius_meters || GEOFENCE_RADIUS);
          const prevInside = geofenceStatus.current[zone.id] || false;
          if (inside) insideAny = true;

          if (inside && !prevInside) {
            toast({ title: "⚠ Critical Zone Entered", description: `You entered ${zone.name}` });
            geofenceStatus.current[zone.id] = true;
            // play an alert briefly if available
            try {
              beepRef.current?.play()?.catch(() => {});
            } catch (e) {}
          }

          if (!inside && prevInside) {
            toast({ title: "✅ Exited Critical Zone", description: `You left ${zone.name}`, variant: "destructive" });
            geofenceStatus.current[zone.id] = false;
          }
        });

        setIsSafe(insideAny);

        // Persist officer location (non-blocking)
        updateUnitLocation(user.id, lat, lng);
      },
      (err) => {
        console.error("Location error:", err);
        toast({ title: "Location Error", description: err.message || "Unable to get location", variant: "destructive" });
      },
      { enableHighAccuracy: true, maximumAge: 0 },
    );

    return () => navigator.geolocation.clearWatch(watchId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, profile, criticalZones]);

  /* ---------- Persist unit location (replace old) ---------- */
  const updateUnitLocation = async (unitId: string, lat: number, lng: number) => {
    if (!unitId) return;
    try {
      // delete previous record for this officer and insert new one
      await supabase.from("police_units").delete().eq("officer_id", unitId);
      const { error } = await supabase.from("police_units").insert({
        officer_id: unitId,
        unit_name: profile?.unit,
        badge_number: profile?.badge_number,
        latitude: lat,
        longitude: lng,
        last_seen_at: new Date().toISOString(),
      });
      if (error) throw error;
    } catch (error: any) {
      console.error("Unit location update error:", error?.message || error);
    }
  };

  /* ---------- Fetch incidents ---------- */
  const fetchIncidents = async () => {
    try {
      const { data, error } = await supabase
        .from("incidents")
        .select("*")
        .order("reported_at", { ascending: false });
      if (error) throw error;
      setIncidents(data || []);
    } catch (err: any) {
      console.error("fetchIncidents error:", err?.message || err);
      toast({ title: "Error", description: "Failed to load incidents", variant: "destructive" });
    }
  };

  /* ---------- Fetch critical zones ---------- */
  const fetchCriticalZones = async () => {
    try {
      const { data, error } = await supabase.from("critical_zones").select("*");
      if (error) throw error;
      setCriticalZones(data || []);
    } catch (err: any) {
      console.error("fetchCriticalZones error:", err?.message || err);
      toast({ title: "Error", description: "Failed to load critical zones", variant: "destructive" });
    }
  };

  /* ---------- Map markers for incidents ---------- */
  useEffect(() => {
    if (!mapInstance.current) return;

    // Remove stale markers
    Object.keys(incidentMarkers.current).forEach((id) => {
      if (!incidents.find((i) => i.id === id)) {
        try {
          incidentMarkers.current[id].setMap(null);
        } catch (e) {}
        delete incidentMarkers.current[id];
      }
    });

    // Add / update markers
    incidents.forEach((inc) => {
      if (!incidentMarkers.current[inc.id]) {
        const marker = new (window as any).google.maps.Marker({
          position: { lat: inc.latitude, lng: inc.longitude },
          map: mapInstance.current,
          title: inc.description,
          icon: {
            url: "https://maps.google.com/mapfiles/ms/icons/red-dot.png",
          },
        });

        marker.addListener("click", () => {
          toast({ title: `🚨 Incident #${inc.id?.slice?.(0, 4)}`, description: inc.description, variant: "destructive" });
        });

        incidentMarkers.current[inc.id] = marker;
      } else {
        try {
          incidentMarkers.current[inc.id].setPosition({ lat: inc.latitude, lng: inc.longitude });
        } catch (e) {}
      }
    });
  }, [incidents, toast]);

  /* ---------- Dispatch alert (panic → dispatch) ---------- */
  const sendDispatchAlert = async () => {
    const msg = `Unit ${profile?.badge_number} reporting an incident at ${new Date().toLocaleString()}`;
    try {
      const { error } = await supabase.from("dispatch_alerts").insert({ message: msg, severity: "high" });
      if (error) throw error;
      toast({ title: "📣 Dispatch Alert Sent", description: msg });
    } catch (err: any) {
      console.error("sendDispatchAlert error:", err?.message || err);
      toast({ title: "Dispatch Error", description: err?.message || "Failed to send dispatch", variant: "destructive" });
    }
  };

  /* ---------- Start navigation / mark incident in_progress ---------- */
  const startCase = async (incidentId: string) => {
    try {
      const inc = incidents.find((i) => i.id === incidentId);
      if (inc && mapInstance.current) {
        mapInstance.current.panTo({ lat: inc.latitude, lng: inc.longitude });
        try { mapInstance.current.setZoom(17); } catch (e) {}
      }

      const { error } = await supabase.from("incidents").update({ status: "in_progress" }).eq("id", incidentId);
      if (error) throw error;
      setIncidents((prev) => prev.map((i) => (i.id === incidentId ? { ...i, status: "in_progress" } : i)));
      toast({ title: "Navigation started", description: `Heading to incident ${incidentId?.slice?.(0, 6)}` });
    } catch (err: any) {
      console.error("startCase error:", err?.message || err);
      toast({ title: "Error", description: "Failed to start case", variant: "destructive" });
    }
  };

  /* ---------- Close case ---------- */
  const closeCase = async (incidentId: string) => {
    try {
      const { error } = await supabase.from("incidents").update({ status: "closed" }).eq("id", incidentId);
      if (error) throw error;
      setIncidents((prev) => prev.map((i) => (i.id === incidentId ? { ...i, status: "closed" } : i)));
      toast({ title: "Case closed", description: `Incident ${incidentId?.slice?.(0, 6)} closed` });
    } catch (err: any) {
      console.error("closeCase error:", err?.message || err);
      toast({ title: "Error", description: "Failed to close case", variant: "destructive" });
    }
  };

  /* ---------- Loading guard ---------- */
  if (loading) return <div className="h-screen flex items-center justify-center">Loading…</div>;

  /* ------------------------------------------------------------------ */
  /* Render                                                             */
  /* ------------------------------------------------------------------ */
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Hidden audio – only for Chrome/Edge unlock */}
      <audio ref={beepRef} src="/assets/alert-sound.mp3" preload="auto" />

      <div className="bg-gray-900 text-white min-h-screen">
        {/* ===== Header ===== */}
        <header className="p-4 flex justify-between items-center">
          <h1 className="text-3xl font-bold text-primary flex items-center gap-2">
            <Police className="h-6 w-6 text-primary" />
            Police Command Center
          </h1>

          <div className="flex items-center gap-3">
            <span className="text-sm font-medium">
              {profile?.rank} • {profile?.unit}
            </span>

            <Button variant="ghost" onClick={sendDispatchAlert}>
              <Flag className="h-5 w-5 text-yellow-500" />
              Dispatch
            </Button>

            <Button variant="ghost" onClick={() => navigate("/profile") }>
              <User className="h-5 w-5 text-primary" />
            </Button>

            <Button variant="ghost" onClick={async () => { await supabase.auth.signOut(); navigate("/signin"); }}>
              <LogOut className="h-5 w-5 text-destructive" />
            </Button>
          </div>
        </header>

        {/* ===== Tabs ===== */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="p-6 space-y-6">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
            <TabsTrigger value="incidents">Incidents</TabsTrigger>
            <TabsTrigger value="help">Help & Support</TabsTrigger>
          </TabsList>

          {/* ----------- DASHBOARD TAB ----------- */}
          <TabsContent value="dashboard">
            <Card>
              <CardHeader>
                <CardTitle className="text-2xl font-bold flex items-center gap-2">
                  <Navigation className="h-5 w-5 text-primary" />
                  Unit Position
                </CardTitle>
                <CardDescription>
                  {unitLocation
                    ? `Lat: ${unitLocation.lat.toFixed(6)} | Lng: ${unitLocation.lng.toFixed(6)}`
                    : "Awaiting GPS…"}
                </CardDescription>
                <div className="mt-2">
                  {isSafe ? (
                    <span className="px-3 py-1 rounded-full bg-green-500 text-white font-semibold">
                      ✅ Safe (inside critical zone)
                    </span>
                  ) : (
                    <span className="px-3 py-1 rounded-full bg-red-500 text-white font-semibold">
                      ⚠ Unsafe (outside all critical zones)
                    </span>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <div ref={mapRef} className="w-full h-80 rounded-lg border" />
              </CardContent>
            </Card>
          </TabsContent>

          {/* ----------- INCIDENTS TAB ----------- */}
          <TabsContent value="incidents">
            <Card>
              <CardHeader>
                <CardTitle className="text-2xl font-bold flex items-center gap-2">
                  <Police className="h-5 w-5 text-primary" />
                  Current Incidents
                </CardTitle>
                <CardDescription>
                  Open & in‑progress cases reported by the community or your squad.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {incidents.map((inc) => (
                    <li
                      key={inc.id}
                      className="flex justify-between items-center bg-secondary/20 px-4 py-2 rounded-md"
                    >
                      <div className="flex items-center gap-2">
                        <MapPin className="h-4 w-4 text-yellow-400" />
                        <span>{inc.description}</span>
                      </div>

                      <div className="flex gap-2">
                        {inc.status === "open" && (
                          <Button variant="ghost" size="icon" onClick={() => startCase(inc.id)}>
                            <Navigation className="h-5 w-5 text-green-500" />
                          </Button>
                        )}

                        <Button variant="ghost" size="icon" onClick={() => closeCase(inc.id)}>
                          <Flag className="h-5 w-5 text-destructive" />
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ----------- HELP TAB ----------- */}
          <TabsContent value="help">
            <Card>
              <CardHeader>
                <CardTitle className="text-2xl font-bold flex items-center gap-2">
                  <HelpCircle className="h-6 w-6 text-primary" />
                  Help & Support
                </CardTitle>
                <CardDescription>
                  Contact the command desk or upload evidence for the incident
                </CardDescription>
              </CardHeader>
              <CardContent>
                <HelpDesk />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default PoliceDashboard;
