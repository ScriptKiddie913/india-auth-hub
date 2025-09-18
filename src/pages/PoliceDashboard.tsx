// src/pages/PoliceDashboard.tsx
import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/useAuth";
import {
  User,
  LogOut,
  MapPin,
  Trash2,
  Navigation,
  AlertTriangle,
  Phone,
  Police as PoliceIcon,
  Flag,
} from "lucide-react";

type Incident = {
  id: string;
  description: string;
  status: "open" | "in_progress" | "closed";
  latitude: number;
  longitude: number;
  reported_at: string;
};

type Zone = {
  id: string;
  name: string;
  center_lat: number;
  center_lng: number;
  radius_meters?: number;
};

type Profile = {
  rank: string;
  unit: string;
  badge_number: string;
};

const GEOFENCE_RADIUS = 3_000; // metres

/** --------------  Haversine utility -------------- */
const getDistance = (
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number => {
  const R = 6_371_000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;

  const φ1 = toRad(lat1);
  const φ2 = toRad(lat2);
  const Δφ = toRad(lat2 - lat1);
  const Δλ = toRad(lon2 - lon1);

  const a =
    Math.sin(Δφ / 2) ** 2 +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

export default function PoliceDashboard() {
  const navigate = useNavigate();
  const { logout, auth } = useAuth();
  const { toast } = useToast();

  /** ---- local state ---- */
  const [profile, setProfile] = useState<Profile | null>(null);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [criticalZones, setCriticalZones] = useState<Zone[]>([]);
  const [unitLocation, setUnitLocation] = useState<{
    lat: number;
    lng: number;
  } | null>(null);
  const [activeTab, setActiveTab] = useState<string>("dashboard");
  const [isSafe, setIsSafe] = useState<boolean>(true);

  /** ---- refs for map objects ---- */
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInst = useRef<any>(null);
  const unitMarker = useRef<any>(null);
  const incidentMarkers = useRef<Record<string, any>>({});
  const zoneOverlays = useRef<Record<string, any>>({});
  const geofenceStatus = useRef<Record<string, boolean>>({});
  const isFirstLoad = useRef<boolean>(true);

  /** ---- audio (unlock on click) ---- */
  const beepRef = useRef<HTMLAudioElement | null>(null);
  useEffect(() => {
    const unlock = () => {
      beepRef.current?.play().finally(() => {
        beepRef.current?.pause();
        beepRef.current!.currentTime = 0;
      });
      window.removeEventListener("click", unlock);
    };
    window.addEventListener("click", unlock);
    return () => window.removeEventListener("click", unlock);
  }, []);

  /** ---- Fetch user & profile on mount ---- */
  useEffect(() => {
    const fetchUser = async () => {
      if (!auth) {
        // not authenticated – fallback to sign‑in
        navigate("/signin");
        return;
      }
      // profile is already stored in auth context, but we keep a local copy
      setProfile({ ...auth } as unknown as Profile);

      // 1️⃣ incidents
      const { data: inc, error: incErr } = await supabase
        .from("incidents")
        .select("*")
        .order("reported_at", { ascending: false });

      if (incErr) console.error("incidents:", incErr);
      setIncidents(inc || []);

      // 2️⃣ critical zones
      const { data: zones, error: zoneErr } = await supabase
        .from("critical_zones")
        .select("*");

      if (zoneErr) console.error("zones:", zoneErr);
      setCriticalZones(zones || []);
    };

    fetchUser();
  }, [auth, navigate]);

  /** ---- Geolocation & map ---- */
  useEffect(() => {
    if (!auth || !profile) return;

    if (!("geolocation" in navigator)) {
      toast({
        title: "Geolocation unsupported",
        description: "Your browser does not support geolocation.",
        variant: "destructive",
      });
      return;
    }

    const watch = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        setUnitLocation({ lat, lng });

        // 1️⃣ Initialise map once
        if (mapRef.current && !mapInst.current && (window as any).google) {
          mapInst.current = new (window as any).google.maps.Map(mapRef.current, {
            center: { lat, lng },
            zoom: 15,
          });

          // Officer marker
          unitMarker.current = new (window as any).google.maps.Marker({
            position: { lat, lng },
            map: mapInst.current,
            title: `Unit ${profile.badge_number}`,
            icon: {
              url: "https://maps.google.com/mapfiles/ms/icons/blue-dot.png",
            },
          });
        }

        // 2️⃣ Update marker position
        unitMarker.current?.setPosition({ lat, lng });

        // 3️⃣ Pan map the first time
        if (isFirstLoad.current) {
          mapInst.current!.panTo({ lat, lng });
          isFirstLoad.current = false;
        }

        // 4️⃣ Render critical zone overlays
        zoneOverlays.current = Object.assign(
          {},
          zoneOverlays.current // keep existing
        );
        criticalZones.forEach((zone) => {
          if (!zoneOverlays.current[zone.id]) {
            const overlay = new (window as any).google.maps.Circle({
              strokeColor: "#FF0000",
              strokeOpacity: 0.8,
              strokeWeight: 2,
              fillColor: "#FF0000",
              fillOpacity: 0.2,
              map: mapInst.current,
              center: { lat: zone.center_lat, lng: zone.center_lng },
              radius: zone.radius_meters ?? GEOFENCE_RADIUS,
            });
            zoneOverlays.current[zone.id] = overlay;
          }
        });
        Object.keys(zoneOverlays.current).forEach((id) => {
          if (!criticalZones.find((z) => z.id === id)) {
            zoneOverlays.current[id].setMap(null);
            delete zoneOverlays.current[id];
          }
        });

        // 5️⃣ Geofence logic + toast
        let insideAny = false;
        criticalZones.forEach((zone) => {
          const dist = getDistance(lat, lng, zone.center_lat, zone.center_lng);
          const inside = dist <= (zone.radius_meters ?? GEOFENCE_RADIUS);
          const prevInside = geofenceStatus.current[zone.id] ?? false;
          if (inside) insideAny = true;

          if (inside && !prevInside) {
            toast({
              title: "⚠️ Critical Zone Entered",
              description: `You have entered ${zone.name}`,
            });
          } else if (!inside && prevInside) {
            toast({
              title: "✅ Exited Critical Zone",
              description: `You have left ${zone.name}`,
              variant: "destructive",
            });
          }
          geofenceStatus.current[zone.id] = inside;
        });

        setIsSafe(insideAny);

        // 6️⃣ Persist location to DB
        updateUnitLocation(auth.email, lat, lng, profile.badge_number, profile.unit);
      },
      (error) => {
        toast({
          title: "Location Error",
          description: error.message,
          variant: "destructive",
        });
      },
      { enableHighAccuracy: true, maximumAge: 0 }
    );

    return () => navigator.geolocation.clearWatch(watch);
  }, [auth, profile, criticalZones, toast, navigate]);

  const updateUnitLocation = async (
    officerId: string,
    lat: number,
    lng: number,
    badge: string,
    unit: string
  ) => {
    try {
      // Delete old row
      await supabase.from("police_units").delete().eq("officer_id", officerId);
      // Insert new row
      const { error } = await supabase
        .from("police_units")
        .insert({
          officer_id: officerId,
          unit_name: unit,
          badge_number: badge,
          latitude: lat,
          longitude: lng,
          last_seen_at: new Date().toISOString(),
        });

      if (error) throw error;
    } catch (e: any) {
      console.error("unit location update:", e);
    }
  };

  /** ---- Incident markers on map ---- */
  useEffect(() => {
    if (!mapInst.current) return;

    // create / update / delete markers
    incidents.forEach((inc) => {
      if (!incidentMarkers.current[inc.id]) {
        const marker = new (window as any).google.maps.Marker({
          position: { lat: inc.latitude, lng: inc.longitude },
          map: mapInst.current,
          title: inc.description,
          icon: {
            url: "https://maps.google.com/mapfiles/ms/icons/red-dot.png",
          },
        });
        marker.addListener("click", () => {
          toast({
            title: `🚨 Incident #${inc.id.slice(0, 4)}`,
            description: inc.description,
            variant: "destructive",
          });
        });
        incidentMarkers.current[inc.id] = marker;
      } else {
        incidentMarkers.current[inc.id].setPosition({
          lat: inc.latitude,
          lng: inc.longitude,
        });
      }
    });

    // delete stale markers
    Object.keys(incidentMarkers.current).forEach((id) => {
      if (!incidents.find((i) => i.id === id)) {
        incidentMarkers.current[id].setMap(null);
        delete incidentMarkers.current[id];
      }
    });
  }, [incidents]);

  /** ---- dispatch alert (panic button) ---- */
  const sendDispatchAlert = async () => {
    const msg = `Unit ${profile?.badge_number} reporting an incident at ${new Date().toLocaleString()}`;
    const { error } = await supabase
      .from("dispatch_alerts")
      .insert({ message: msg, severity: "high" });

    if (error) {
      toast({
        title: "Dispatch Error",
        description: error.message,
        variant: "destructive",
      });
    } else {
      toast({
        title: "📣 Dispatch Alert Sent",
        description: msg,
      });
    }
  };

  /** ---- incident case handling ---- */
  const startCase = async (incId: string) => {
    // Update status to "in_progress"
    const { error } = await supabase
      .from("incidents")
      .update({ status: "in_progress" })
      .eq("id", incId);

    if (error) {
      toast({
        title: "Error",
        description: "Could not start case.",
        variant: "destructive",
      });
      return;
    }
    setIncidents((prev) =>
      prev.map((i) => (i.id === incId ? { ...i, status: "in_progress" } : i))
    );
  };

  const closeCase = async (incId: string) => {
    // Update status to "closed"
    const { error } = await supabase
      .from("incidents")
      .update({ status: "closed" })
      .eq("id", incId);

    if (error) {
      toast({
        title: "Error",
        description: "Could not close case.",
        variant: "destructive",
      });
      return;
    }
    setIncidents((prev) =>
      prev.map((i) => (i.id === incId ? { ...i, status: "closed" } : i))
    );
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* ① hidden alarm audio */}
      <audio ref={beepRef} src="/assets/alert-sound.mp3" preload="auto" />

      <div className="bg-gray-900 text-white min-h-screen">
        {/* ② Header */}
        <header className="p-4 flex justify-between items-center">
          <h1 className="text-3xl font-bold text-primary flex items-center gap-2">
            <PoliceIcon className="h-6 w-6 text-primary" /> Police Command Center
          </h1>

          <div className="flex items-center gap-3">
            <span className="text-sm font-medium">
              {profile?.rank} • {profile?.unit}
            </span>

            {/* dispatch / settings / logout */}
            <Button variant="ghost" onClick={sendDispatchAlert}>
              <Flag className="h-5 w-5 text-yellow-500" /> Dispatch
            </Button>
            <Button variant="ghost" onClick={() => navigate("/settings")}>
              <User className="h-5 w-5 text-primary" />
            </Button>
            <Button variant="ghost" onClick={logout}>
              <LogOut className="h-5 w-5 text-destructive" />
            </Button>
          </div>
        </header>

        {/* ③ Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="p-6 space-y-6">
          {/* ===== DASHBOARD ===== */}
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
            <TabsTrigger value="incidents">Incidents</TabsTrigger>
            <TabsTrigger value="help">Help & Support</TabsTrigger>
          </TabsList>

          <TabsContent value="dashboard">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Navigation className="h-5 w-5 text-primary" /> Unit Position
                </CardTitle>
                <CardDescription>
                  {unitLocation
                    ? `Lat: ${unitLocation.lat.toFixed(
                        6
                      )} | Lng: ${unitLocation.lng.toFixed(6)}`
                    : "Awaiting GPS …"}
                </CardDescription>
                <div className="mt-2 flex items-center gap-2">
                  {isSafe ? (
                    <span className="px-3 py-1 rounded-full bg-green-500 text-white font-semibold">
                      ✅ Safe (in zone)
                    </span>
                  ) : (
                    <span className="px-3 py-1 rounded-full bg-red-500 text-white font-semibold">
                      ⚠️ Unsafe (outside zones)
                    </span>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <div ref={mapRef} className="w-full h-80 rounded-lg border" />
              </CardContent>
            </Card>
          </TabsContent>

          {/* ===== INCIDENTS ===== */}
          <TabsContent value="incidents">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <PoliceIcon className="h-5 w-5 text-primary" /> Current Incidents
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
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => startCase(inc.id)}
                          >
                            <Navigation className="h-5 w-5 text-green-500" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => closeCase(inc.id)}
                        >
                          <Flag className="h-5 w-5 text-destructive" />
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ===== HELP & SUPPORT ===== */}
          <TabsContent value="help">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <HelpCircle className="h-6 w-6 text-primary" /> Help & Support
                </CardTitle>
                <CardDescription>
                  Contact the command desk or upload evidence for the incident.
                </CardDescription>
              </CardHeader>
              {/*  you can put any help component here */}
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Feature not implemented yet. Use chat or phone to reach
                  command.
                </p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
