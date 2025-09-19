// src/pages/PoliceDashboard.tsx
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

interface PoliceThread {
  id: string;
  message: string;
  latitude: number;
  longitude: number;
  created_at: string;
}

const PoliceDashboard: React.FC = () => {
  const [panicAlerts, setPanicAlerts] = useState<PanicAlert[]>([]);
  const [filter, setFilter] = useState<"all" | "active" | "resolved">("all");
  const [selectedAlert, setSelectedAlert] = useState<PanicAlert | null>(null);

  const [threads, setThreads] = useState<PoliceThread[]>([]);
  const [message, setMessage] = useState("");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");

  const { toast } = useToast();
  const navigate = useNavigate();

  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<any>(null);
  const markersRef = useRef<any[]>([]);

  /* ---------- Fetch panic alerts ---------- */
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

  /* ---------- Fetch police advisories ---------- */
  const fetchThreads = async () => {
    const { data, error } = await supabase
      .from("police_threads")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching threads:", error);
    } else {
      setThreads(data || []);
    }
  };

  useEffect(() => {
    fetchPanicAlerts();
    fetchThreads();
    const interval = setInterval(() => {
      fetchPanicAlerts();
      fetchThreads();
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  /* ---------- Initialize Google Map ---------- */
  useEffect(() => {
    const initMap = () => {
      if (!mapRef.current || mapInstance.current) return;

      mapInstance.current = new (window as any).google.maps.Map(mapRef.current, {
        center: { lat: 22.5726, lng: 88.3639 },
        zoom: 12,
      });

      if (panicAlerts.length > 0 || threads.length > 0) {
        updateMarkers(panicAlerts, threads);
      }
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

        script.onload = () => {
          initMap();
        };

        document.body.appendChild(script);
      } else {
        document.getElementById(scriptId)?.addEventListener("load", initMap);
      }
    } else {
      initMap();
    }
  }, []);

  /* ---------- Update markers whenever alerts/threads change ---------- */
  useEffect(() => {
    if (mapInstance.current) {
      updateMarkers(panicAlerts, threads);
    }
  }, [panicAlerts, threads]);

  /* ---------- Update markers on the map ---------- */
  const updateMarkers = (alerts: PanicAlert[], threads: PoliceThread[]) => {
    if (!mapInstance.current || !(window as any).google) return;

    markersRef.current.forEach((marker) => marker.setMap(null));
    markersRef.current = [];

    // 🚨 Panic Alerts (Red markers)
    alerts.forEach((alert) => {
      const marker = new (window as any).google.maps.Marker({
        position: { lat: alert.latitude, lng: alert.longitude },
        map: mapInstance.current,
        icon: "http://maps.google.com/mapfiles/ms/icons/red-dot.png",
        title: `Alert ID: ${alert.id}`,
      });

      const infowindow = new (window as any).google.maps.InfoWindow({
        content: `<div>
          <strong>Alert ID:</strong> ${alert.id}<br/>
          <strong>Status:</strong> ${alert.status}<br/>
          <strong>Time:</strong> ${new Date(alert.created_at).toLocaleString()}
        </div>`,
      });

      marker.addListener("click", () => {
        infowindow.open(mapInstance.current, marker);
        setSelectedAlert(alert);
      });

      markersRef.current.push(marker);
    });

    // 📢 Police Threads (Blue markers)
    threads.forEach((thread) => {
      const marker = new (window as any).google.maps.Marker({
        position: { lat: thread.latitude, lng: thread.longitude },
        map: mapInstance.current,
        icon: "http://maps.google.com/mapfiles/ms/icons/blue-dot.png",
        title: "Police Advisory",
      });

      const infowindow = new (window as any).google.maps.InfoWindow({
        content: `<div>
          <strong>Police Advisory</strong><br/>
          ${thread.message}<br/>
          <small>${new Date(thread.created_at).toLocaleString()}</small>
        </div>`,
      });

      marker.addListener("click", () => {
        infowindow.open(mapInstance.current, marker);
      });

      markersRef.current.push(marker);
    });
  };

  /* ---------- Resolve alert ---------- */
  const handleResolve = async (id: string) => {
    const { error } = await supabase
      .from("panic_alerts")
      .update({ status: "resolved" })
      .eq("id", id);

    if (error) {
      toast({
        title: "Error",
        description: "Failed to resolve alert",
        variant: "destructive",
      });
    } else {
      setPanicAlerts((prev) =>
        prev.map((alert) =>
          alert.id === id ? { ...alert, status: "resolved" } : alert
        )
      );
      toast({ title: "Success", description: "Alert marked as resolved" });
    }
  };

  /* ---------- Logout ---------- */
  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/police-signin");
  };

  /* ---------- Filters + Stats ---------- */
  const filteredAlerts =
    filter === "all"
      ? panicAlerts
      : panicAlerts.filter((a) =>
          filter === "resolved" ? a.status === "resolved" : a.status !== "resolved"
        );

  const activeCount = panicAlerts.filter((a) => a.status !== "resolved").length;
  const resolvedCount = panicAlerts.filter((a) => a.status === "resolved").length;

  /* ---------- Add Advisory ---------- */
  const handleAddThread = async () => {
    if (!message || !lat || !lng) {
      toast({
        title: "Error",
        description: "Please enter all fields",
        variant: "destructive",
      });
      return;
    }

    const { error } = await supabase.from("police_threads").insert([
      {
        message,
        latitude: parseFloat(lat),
        longitude: parseFloat(lng),
      },
    ]);

    if (error) {
      toast({
        title: "Error",
        description: "Failed to post advisory",
        variant: "destructive",
      });
    } else {
      setMessage("");
      setLat("");
      setLng("");
      fetchThreads();
      toast({ title: "Success", description: "Advisory posted" });
    }
  };

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

      {/* Map + Alerts + Advisory Form */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Map */}
        <Card>
          <CardHeader>
            <CardTitle>Live Map (Alerts + Advisories)</CardTitle>
          </CardHeader>
          <CardContent>
            <div
              ref={mapRef}
              style={{ width: "100%", height: "400px" }}
              className="rounded-lg shadow-md border"
            />
          </CardContent>
        </Card>

        {/* Alerts + Advisory */}
        <div className="space-y-6">
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
                            <p>
                              <strong>ID:</strong> {alert.id}
                            </p>
                            <p>
                              <strong>Status:</strong> {alert.status}
                            </p>
                            <p>
                              <strong>Time:</strong>{" "}
                              {new Date(alert.created_at).toLocaleString()}
                            </p>
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

          {/* Advisory Form */}
          <Card>
            <CardHeader>
              <CardTitle>Post Police Advisory</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <input
                type="text"
                placeholder="Message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="border p-2 w-full rounded"
              />
              <input
                type="text"
                placeholder="Latitude"
                value={lat}
                onChange={(e) => setLat(e.target.value)}
                className="border p-2 w-full rounded"
              />
              <input
                type="text"
                placeholder="Longitude"
                value={lng}
                onChange={(e) => setLng(e.target.value)}
                className="border p-2 w-full rounded"
              />
              <Button onClick={handleAddThread}>Post Advisory</Button>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Alert Drawer */}
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
