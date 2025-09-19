/* src/pages/PoliceDashboard.tsx */
import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

/* UI components */
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardDescription,
} from "@/components/ui/card";

/* Icons */
import { Shield, LogOut, AlertTriangle, MapPin, CheckCircle } from "lucide-react";

/* Custom components */
import EFIRForm from "@/components/EFIRForm";

/* Types */
interface PanicAlert {
  id: string;
  user_id: string;
  message: string;
  latitude: number;
  longitude: number;
  status: string;
  created_at: string;
}

const PoliceDashboard: React.FC = () => {
  const navigate = useNavigate();
  const { toast } = useToast();

  const mapRef = useRef<HTMLDivElement | null>(null);
  const mapInstance = useRef<any>(null);
  const markersRef = useRef<{ [id: string]: any }>({}); // ✅ store markers by alert id

  const [authState, setAuthState] = useState<"loading" | "auth" | "no-auth">("loading");
  const [panicAlerts, setPanicAlerts] = useState<PanicAlert[]>([]);

  /* -------- Authentication -------- */
  useEffect(() => {
    const checkSession = async () => {
      const { data } = await supabase.auth.getSession();
      if (!data?.session?.user) {
        setAuthState("no-auth");
        navigate("/police-signin");
      } else {
        setAuthState("auth");
      }
    };
    checkSession();
  }, [navigate]);

  useEffect(() => {
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session?.user) {
        toast({
          title: "Session expired",
          description: "You have been signed out.",
          variant: "destructive",
        });
        navigate("/police-signin");
      }
    });
    return () => listener?.unsubscribe();
  }, [navigate, toast]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    toast({ title: "Signed out", description: "You have been logged out." });
    navigate("/police-signin");
  };

  /* -------- Google Map Init -------- */
  useEffect(() => {
    const initMap = () => {
      if (!mapRef.current || !(window as any).google) return;

      mapInstance.current = new (window as any).google.maps.Map(mapRef.current, {
        center: { lat: 22.5726, lng: 88.3639 },
        zoom: 12,
      });
    };

    const scriptId = "google-maps-script";
    if (!(window as any).google || !(window as any).google.maps) {
      if (!document.getElementById(scriptId)) {
        const script = document.createElement("script");
        script.id = scriptId;
        script.src =
          "https://maps.googleapis.com/maps/api/js?key=YOUR_API_KEY&libraries=places";
        script.async = true;
        script.defer = true;
        script.onload = initMap;
        document.body.appendChild(script);
      } else {
        document.getElementById(scriptId)?.addEventListener("load", initMap);
      }
    } else {
      initMap();
    }
  }, []);

  /* -------- Fetch & Realtime Alerts -------- */
  useEffect(() => {
    const fetchAlerts = async () => {
      const { data, error } = await supabase
        .from("panic_alerts")
        .select("*")
        .order("created_at", { ascending: false });

      if (!error && data) {
        setPanicAlerts(data as PanicAlert[]);
        updateMarkers(data as PanicAlert[]);
      }
    };

    fetchAlerts();

    const channel = supabase
      .channel("panic-alerts")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "panic_alerts" }, (payload) => {
        const newAlert = payload.new as PanicAlert;
        setPanicAlerts((prev) => [newAlert, ...prev]);

        toast({
          title: "🚨 New Panic Alert!",
          description: newAlert.message || "No details",
          variant: "destructive",
        });

        updateMarkers([newAlert]);
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "panic_alerts" }, (payload) => {
        const updated = payload.new as PanicAlert;
        setPanicAlerts((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));

        updateMarkers([updated]); // ✅ update marker color
      })
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [toast]);

  /* -------- Update Markers -------- */
  const updateMarkers = (alerts: PanicAlert[]) => {
    if (!mapInstance.current || !(window as any).google) return;

    alerts.forEach((alert) => {
      // Remove old marker if exists
      if (markersRef.current[alert.id]) {
        markersRef.current[alert.id].setMap(null);
      }

      // Add new marker
      const marker = new (window as any).google.maps.Marker({
        position: { lat: alert.latitude, lng: alert.longitude },
        map: mapInstance.current,
        title: alert.message || "Panic Alert",
        icon: {
          url:
            alert.status === "resolved"
              ? "http://maps.google.com/mapfiles/ms/icons/green-dot.png"
              : "http://maps.google.com/mapfiles/ms/icons/red-dot.png",
        },
      });

      markersRef.current[alert.id] = marker;
    });
  };

  /* -------- Resolve Panic Alert -------- */
  const handleResolveAlert = async (alertId: string) => {
    const { error } = await supabase
      .from("panic_alerts")
      .update({ status: "resolved" })
      .eq("id", alertId);

    if (error) {
      toast({ title: "Error", description: "Failed to resolve alert", variant: "destructive" });
    } else {
      toast({ title: "✅ Alert Resolved", description: "Marked as resolved successfully." });
    }
  };

  if (authState === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-destructive" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-secondary/20 to-accent/10">
      {/* Header */}
      <header className="border-b bg-card/95 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center space-x-4">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-blue-400 rounded-full flex items-center justify-center">
              <Shield className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-blue-700">Officer Dashboard</h1>
              <p className="text-sm text-muted-foreground flex items-center gap-1">
                <AlertTriangle className="h-4 w-4 text-red-500" />
                Manage incidents & respond to alerts
              </p>
            </div>
          </div>
          <Button onClick={handleLogout} variant="outline" className="hover:bg-destructive hover:text-destructive-foreground">
            <LogOut className="w-4 h-4 mr-2" /> Logout
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8 grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Google Map */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5 text-blue-600" /> Live Map
            </CardTitle>
            <CardDescription>Police stations & realtime panic alerts</CardDescription>
          </CardHeader>
          <CardContent>
            <div ref={mapRef} className="w-full h-[400px] rounded-lg shadow-md border" />
          </CardContent>
        </Card>

        {/* EFIR Form */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>File e-FIR</CardTitle>
            <CardDescription>Submit & manage electronic FIRs</CardDescription>
          </CardHeader>
          <CardContent>
            <EFIRForm />
          </CardContent>
        </Card>

        {/* Panic Alerts */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Panic Alerts</CardTitle>
            <CardDescription>Monitor & resolve live panic alerts</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3">
              {panicAlerts.map((alert) => (
                <li
                  key={alert.id}
                  className={`p-3 rounded-md border shadow-sm flex justify-between items-center ${
                    alert.status === "resolved" ? "bg-green-50" : "bg-red-50"
                  }`}
                >
                  <div>
                    <p className="font-medium">{alert.message || "No message"}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(alert.created_at).toLocaleString()}
                    </p>
                    <p className="text-xs">
                      Status:{" "}
                      <span
                        className={
                          alert.status === "resolved"
                            ? "text-green-600 font-semibold"
                            : "text-red-600 font-semibold"
                        }
                      >
                        {alert.status}
                      </span>
                    </p>
                  </div>
                  {alert.status !== "resolved" && (
                    <Button
                      size="sm"
                      onClick={() => handleResolveAlert(alert.id)}
                      className="flex items-center gap-1 bg-green-600 text-white hover:bg-green-700"
                    >
                      <CheckCircle className="w-4 h-4" />
                      Resolve
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default PoliceDashboard;
