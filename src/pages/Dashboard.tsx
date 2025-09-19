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

// =============================
// TYPES
// =============================
interface Destination {
  id: string;
  name: string;
  latitude?: number;
  longitude?: number;
}

interface AlertZone {
  id: string;
  title: string;
  lat: number;
  lng: number;
  radiusMeters: number;
  severity: "low" | "medium" | "high";
}

interface PoliceAdvisory {
  id: string;
  message: string;
  lat: number;
  lng: number;
  radiusMeters: number;
  severity: "low" | "medium" | "high";
}

// =============================
// UTILS
// =============================
const getDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const R = 6371e3;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const φ1 = toRad(lat1);
  const φ2 = toRad(lat2);
  const Δφ = toRad(lat2 - lat1);
  const Δλ = toRad(lon2 - lon1);

  const a =
    Math.sin(Δφ / 2) ** 2 +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;

  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const severityToColour = (sev: "low" | "medium" | "high") =>
  sev === "high" ? "#FF0000" : sev === "medium" ? "#FFA500" : "#1E90FF";

// =============================
// MAIN COMPONENT
// =============================
const Dashboard = () => {
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [destinations, setDestinations] = useState<Destination[]>([]);
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(
    null
  );
  const [alertZones, setAlertZones] = useState<AlertZone[]>([]);
  const [policeAdvisories, setPoliceAdvisories] = useState<PoliceAdvisory[]>([]);
  const [isSafe, setIsSafe] = useState(true);
  const [safetyScore, setSafetyScore] = useState(100);
  const [activeTab, setActiveTab] = useState("dashboard");

  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const beepRef = useRef<HTMLAudioElement | null>(null);
  const isFirstLoad = useRef(true);
  const geofenceCircles = useRef<Record<string, any>>({});

  const navigate = useNavigate();
  const { toast } = useToast();

  // =============================
  // AUTH CHECK
  // =============================
  useEffect(() => {
    const getUser = async () => {
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
      if (event === "SIGNED_OUT" || !session) navigate("/signin");
    });

    return () => data.subscription.unsubscribe();
  }, [navigate]);

  // =============================
  // FETCH DESTINATIONS
  // =============================
  const fetchDestinations = async (userId: string) => {
    const { data, error } = await supabase
      .from("destinations")
      .select("*")
      .eq("user_id", userId);

    if (!error) setDestinations(data || []);
  };

  // =============================
  // FETCH ALERTS (NDMA) + ADVISORIES
  // =============================
  useEffect(() => {
    const fetchNDMAAlerts = async () => {
      // fake example, replace with your NDMA feed fetch
      setAlertZones([
        {
          id: "1",
          title: "Flood Warning",
          lat: 20.75,
          lng: 85.0,
          radiusMeters: 3000,
          severity: "high",
        },
      ]);
    };

    const fetchPoliceAdvisories = async () => {
      const { data, error } = await supabase
        .from("police_advisories")
        .select("*")
        .order("created_at", { ascending: false });

      if (!error && data) {
        setPoliceAdvisories(
          data.map((a: any) => ({
            id: a.id,
            message: a.message,
            lat: parseFloat(a.latitude),
            lng: parseFloat(a.longitude),
            radiusMeters: a.radius_meters || 2000,
            severity: (a.severity as "low" | "medium" | "high") || "low",
          }))
        );
      }
    };

    fetchNDMAAlerts();
    fetchPoliceAdvisories();
    const iv = setInterval(() => {
      fetchNDMAAlerts();
      fetchPoliceAdvisories();
    }, 2 * 60 * 1000);
    return () => clearInterval(iv);
  }, []);

  // =============================
  // REALTIME LOCATION + MAP
  // =============================
  useEffect(() => {
    if ("geolocation" in navigator) {
      const watchId = navigator.geolocation.watchPosition(
        (pos) => {
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          setLocation({ lat, lng });

          // init map
          if (mapRef.current && !mapInstance.current && (window as any).google) {
            mapInstance.current = new (window as any).google.maps.Map(
              mapRef.current,
              { center: { lat, lng }, zoom: 14 }
            );
            markerRef.current = new (window as any).google.maps.Marker({
              position: { lat, lng },
              map: mapInstance.current,
              title: "You are here",
            });
          }

          if (markerRef.current) markerRef.current.setPosition({ lat, lng });
          if (isFirstLoad.current && mapInstance.current) {
            mapInstance.current.panTo({ lat, lng });
            isFirstLoad.current = false;
          }

          // clear old circles
          Object.values(geofenceCircles.current).forEach((c) => c.setMap(null));
          geofenceCircles.current = {};

          // draw NDMA alerts
          alertZones.forEach((zone) => {
            const circle = new (window as any).google.maps.Circle({
              strokeColor: severityToColour(zone.severity),
              strokeOpacity: 0.9,
              strokeWeight: 2,
              fillColor: severityToColour(zone.severity),
              fillOpacity: 0.2,
              map: mapInstance.current,
              center: { lat: zone.lat, lng: zone.lng },
              radius: zone.radiusMeters,
            });
            geofenceCircles.current[`alert-${zone.id}`] = circle;
          });

          // draw police advisories
          policeAdvisories.forEach((adv) => {
            const circle = new (window as any).google.maps.Circle({
              strokeColor: severityToColour(adv.severity),
              strokeOpacity: 0.9,
              strokeWeight: 2,
              fillColor: severityToColour(adv.severity),
              fillOpacity: 0.25,
              map: mapInstance.current,
              center: { lat: adv.lat, lng: adv.lng },
              radius: adv.radiusMeters,
            });
            geofenceCircles.current[`advisory-${adv.id}`] = circle;
          });

          // safety calc
          let score = 100;
          let inside = false;

          alertZones.forEach((z) => {
            const d = getDistance(lat, lng, z.lat, z.lng);
            if (d <= z.radiusMeters) {
              inside = true;
              if (z.severity === "high") score -= 40;
              else if (z.severity === "medium") score -= 20;
              else score -= 10;
            }
          });

          policeAdvisories.forEach((a) => {
            const d = getDistance(lat, lng, a.lat, a.lng);
            if (d <= a.radiusMeters) {
              inside = true;
              if (a.severity === "high") score -= 30;
              else if (a.severity === "medium") score -= 15;
              else score -= 5;
            }
          });

          setIsSafe(inside);
          setSafetyScore(score < 0 ? 0 : score);

          if (!inside && beepRef.current) {
            beepRef.current.currentTime = 0;
            beepRef.current.play().catch(() => {});
          }
        },
        (err) => console.error("Location error:", err),
        { enableHighAccuracy: true }
      );
      return () => navigator.geolocation.clearWatch(watchId);
    }
  }, [alertZones, policeAdvisories]);

  // =============================
  // RENDER
  // =============================
  if (loading)
    return (
      <div className="min-h-screen flex items-center justify-center">
        Loading...
      </div>
    );
  if (!user) return null;

  return (
    <div className="min-h-screen bg-gray-50">
      <audio ref={beepRef} src="/beep.mp3" preload="auto" />
      <header className="p-4 bg-white border-b flex justify-between">
        <h1 className="font-bold text-xl flex items-center gap-2">
          <MapPin /> Incredible India
        </h1>
        <div className="flex gap-2">
          <Button onClick={() => navigate("/profile")}>
            <User className="w-4 h-4 mr-1" /> Profile
          </Button>
          <Button
            onClick={async () => {
              await supabase.auth.signOut();
              navigate("/signin");
            }}
          >
            <LogOut className="w-4 h-4 mr-1" /> Sign Out
          </Button>
        </div>
      </header>

      <main className="container mx-auto p-4">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
            <TabsTrigger value="helpdesk">Helpdesk</TabsTrigger>
          </TabsList>

          <TabsContent value="dashboard">
            <Card className="mb-6">
              <CardHeader>
                <CardTitle>
                  Welcome, {user.user_metadata?.full_name || user.email}
                </CardTitle>
                <CardDescription>
                  Safety Score: {safetyScore} |{" "}
                  {isSafe ? "✅ Safe" : "⚠️ Unsafe"}
                </CardDescription>
              </CardHeader>
            </Card>

            {location && (
              <Card>
                <CardHeader>
                  <CardTitle>
                    <Navigation className="inline mr-2" /> Live Location
                  </CardTitle>
                  <CardDescription>
                    Lat: {location.lat.toFixed(4)}, Lng:{" "}
                    {location.lng.toFixed(4)}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div ref={mapRef} className="w-full h-96 border rounded" />
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="helpdesk">
            <Card>
              <CardHeader>
                <CardTitle>
                  <HelpCircle className="inline mr-2" /> Help & Support
                </CardTitle>
              </CardHeader>
              <CardContent>
                <HelpDesk />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default Dashboard;
