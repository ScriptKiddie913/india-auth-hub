import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";

interface PanicAlert {
  id: string;
  user_id: string;
  latitude: number;
  longitude: number;
  status: string;
  created_at: string;
}

const PoliceDashboard: React.FC = () => {
  const [panicAlerts, setPanicAlerts] = useState<PanicAlert[]>([]);
  const [filter, setFilter] = useState<"all" | "active" | "resolved">("all");
  const [selectedAlert, setSelectedAlert] = useState<PanicAlert | null>(null);

  const { toast } = useToast();
  const navigate = useNavigate();

  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<any>(null);
  const markersRef = useRef<any[]>([]);

  /* ✅ Fetch panic alerts from Supabase */
  const fetchPanicAlerts = async () => {
    const { data, error } = await supabase
      .from("panic_alerts")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching alerts:", error);
    } else {
      setPanicAlerts(data || []);
    }
  };

  useEffect(() => {
    fetchPanicAlerts();
    const interval = setInterval(fetchPanicAlerts, 10000);
    return () => clearInterval(interval);
  }, []);

  /* ✅ Load Google Maps script */
  useEffect(() => {
    const initMap = () => {
      if (!mapRef.current || mapInstance.current) return;

      mapInstance.current = new (window as any).google.maps.Map(mapRef.current, {
        center: { lat: 22.5726, lng: 88.3639 }, // Kolkata
        zoom: 12,
      });

      updateMarkers(panicAlerts);
    };

    const scriptId = "google-maps-script";
    if (!(window as any).google || !(window as any).google.maps) {
      if (!document.getElementById(scriptId)) {
        const script = document.createElement("script");
        script.id = scriptId;
        script.src = `https://maps.googleapis.com/maps/api/js?key=${
          import.meta.env.VITE_GOOGLE_MAPS_API_KEY
        }&libraries=places`;
        script.async = true;
        script.defer = true;

        script.onload = initMap;
        document.body.appendChild(script);
      }
    } else {
      initMap();
    }
  }, [panicAlerts]);

  /* ✅ Update markers */
  const updateMarkers = (alerts: PanicAlert[]) => {
    if (!mapInstance.current || !(window as any).google) return;

    // Clear old markers
    markersRef.current.forEach((m) => m.setMap(null));
    markersRef.current = [];

    alerts.forEach((alert) => {
      const marker = new (window as any).google.maps.Marker({
        position: { lat: alert.latitude, lng: alert.longitude },
        map: mapInstance.current,
        title: `Alert ID: ${alert.id}`,
        icon:
          alert.status === "resolved"
            ? "http://maps.google.com/mapfiles/ms/icons/green-dot.png"
            : "http://maps.google.com/mapfiles/ms/icons/red-dot.png",
      });

      marker.addListener("click", () => setSelectedAlert(alert));
      markersRef.current.push(marker);
    });
  };

  /* ✅ Resolve alert */
  const handleResolve = async (id: string) => {
    const { error } = await supabase
      .from("panic_alerts")
      .update({ status: "resolved" })
      .eq("id", id);

    if (error) {
      toast({ title: "Error", description: "Failed to resolve alert", variant: "destructive" });
    } else {
      setPanicAlerts((prev) =>
        prev.map((a) => (a.id === id ? { ...a, status: "resolved" } : a))
      );
      toast({ title: "✅ Success", description: "Alert marked as resolved" });
    }
  };

  /* ✅ Logout */
  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/police-signin");
  };

  /* ✅ Filters & Stats */
  const filteredAlerts =
    filter === "all" ? panicAlerts : panicAlerts.filter((a) => a.status === filter);

  const activeCount = panicAlerts.filter((a) => a.status !== "resolved").length;
  const resolvedCount = panicAlerts.filter((a) => a.status === "resolved").length;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Police Dashboard</h1>
        <Button onClick={handleLogout} variant="destructive">
          Logout
        </Button>
      </div>

      {/* Stats Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-lg font-bold">{panicAlerts.length}</p>
            <p>Total Alerts</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-lg font-bold">{activeCount}</p>
            <p>Active</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-lg font-bold">{resolvedCount}</p>
            <p>Resolved</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Button onClick={fetchPanicAlerts}>Refresh</Button>
          </CardContent>
        </Card>
      </div>

      {/* Map + Alerts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Map */}
        <Card>
          <CardHeader>
            <CardTitle>Live Panic Alerts Map</CardTitle>
          </CardHeader>
          <CardContent>
            <div
              ref={mapRef}
              style={{ width: "100%", height: "400px" }}
              className="rounded-lg shadow-md border"
            />
          </CardContent>
        </Card>

        {/* Alerts List */}
        <Card>
          <CardHeader>
            <CardTitle>Panic Alerts</CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="all" onValueChange={(v: any) => setFilter(v)}>
              <TabsList className="mb-4">
                <TabsTrigger value="all">All</TabsTrigger>
                <TabsTrigger value="active">Active</TabsTrigger>
                <TabsTrigger value="resolved">Resolved</TabsTrigger>
              </TabsList>

              <TabsContent value={filter}>
                {filteredAlerts.length === 0 ? (
                  <p>No alerts</p>
                ) : (
                  <ul className="space-y-3">
                    {filteredAlerts.map((alert) => (
                      <li
                        key={alert.id}
                        className="p-3 border rounded-lg shadow cursor-pointer flex justify-between items-center hover:bg-gray-50"
                        onClick={() => setSelectedAlert(alert)}
                      >
                        <div>
                          <p><strong>ID:</strong> {alert.id}</p>
                          <p><strong>Status:</strong> {alert.status}</p>
                          <p><strong>Time:</strong> {new Date(alert.created_at).toLocaleString()}</p>
                        </div>
                        {alert.status !== "resolved" && (
                          <Button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleResolve(alert.id);
                            }}
                          >
                            Resolve
                          </Button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>

      {/* Drawer for Alert Details */}
      {selectedAlert && (
        <Drawer open={!!selectedAlert} onOpenChange={() => setSelectedAlert(null)}>
          <DrawerContent>
            <DrawerHeader>
              <DrawerTitle>Alert Details</DrawerTitle>
            </DrawerHeader>
            <div className="p-4 space-y-2">
              <p><strong>ID:</strong> {selectedAlert.id}</p>
              <p><strong>User:</strong> {selectedAlert.user_id}</p>
              <p><strong>Status:</strong> {selectedAlert.status}</p>
              <p><strong>Location:</strong> {selectedAlert.latitude}, {selectedAlert.longitude}</p>
              <p><strong>Created At:</strong> {new Date(selectedAlert.created_at).toLocaleString()}</p>
              {selectedAlert.status !== "resolved" && (
                <Button onClick={() => handleResolve(selectedAlert.id)}>
                  Mark as Resolved
                </Button>
              )}
            </div>
          </DrawerContent>
        </Drawer>
      )}
    </div>
  );
};

export default PoliceDashboard;
