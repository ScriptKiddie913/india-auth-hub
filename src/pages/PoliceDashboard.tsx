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
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";

/* -------------------------------------------------- Interfaces -------------------------------------------------- */
interface PanicAlert {
  id: string;
  user_id: string;
  latitude: number;
  longitude: number;
  status: string;
  created_at: string;
}

interface LiveThread {
  id: string;
  message: string;
  latitude: number;
  longitude: number;
  created_at: string;
}

/* -------------------------------------------------- Helper: Realtime subscription -------------------------------------------------- */
const useSubscription = (
  channelName: string,
  events: string[],
  callback: (payload: any) => void
) => {
  useEffect(() => {
    const channel = supabase
      .channel(channelName)
      .on<{
        new: PanicAlert | LiveThread;
        update: PanicAlert | LiveThread;
        delete: { id: string };
      }>(events[0], (payload) => callback(payload))
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [channelName, events, callback]);
};

/* -------------------------------------------------- Component -------------------------------------------------- */
const PoliceDashboard: React.FC = () => {
  /* ---- State ---- */
  const [panicAlerts, setPanicAlerts] = useState<PanicAlert[]>([]);
  const [liveThreads, setLiveThreads] = useState<LiveThread[]>([]);
  const [filter, setFilter] = useState<"all" | "active" | "resolved">("all");
  const [selectedAlert, setSelectedAlert] = useState<PanicAlert | null>(null);

  /* ---- Advisory form ---- */
  const [advisoryMessage, setAdvisoryMessage] = useState("");
  const [advisoryLat, setAdvisoryLat] = useState("");
  const [advisoryLng, setAdvisoryLng] = useState("");

  /* ---- Hooks ---- */
  const { toast } = useToast();
  const navigate = useNavigate();
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<any>(null);
  const markersRef = useRef<any[]>([]);

  /* ---- Utility: Load Google Maps script once ---- */
  const loadGoogleMaps = (): Promise<void> => {
    return new Promise((resolve, reject) => {
      if ((window as any).google && (window as any).google.maps) {
        resolve();
        return;
      }

      const scriptId = "google-maps-script";
      if (document.getElementById(scriptId)) {
        // If script is already in the document, listen for load event
        const existing = document.getElementById(scriptId)!;
        existing.addEventListener("load", () => resolve());
        return;
      }

      const script = document.createElement("script");
      script.id = scriptId;
      script.src =
        "https://maps.googleapis.com/maps/api/js?key=YOUR_API_KEY&libraries=places";
      script.async = true;
      script.defer = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("Google Maps failed to load"));
      document.body.appendChild(script);
    });
  };

  /* ---- Map initialization ---- */
  useEffect(() => {
    loadGoogleMaps()
      .then(() => {
        if (!mapRef.current || mapInstance.current) return;
        mapInstance.current = new (window as any).google.maps.Map(mapRef.current, {
          center: { lat: 22.5726, lng: 88.3639 }, // Kolkata
          zoom: 12,
        });
        // Initial marker sync if data already available
        if (panicAlerts.length || liveThreads.length) {
          updateMarkers(panicAlerts, liveThreads);
        }
      })
      .catch((e) => console.error(e));
  }, []); // only run once

  /* ---- Real‑time listeners for both tables ---- */
  useSubscription(
    "panic_alerts",
    ["INSERT", "UPDATE", "DELETE"],
    (payload) => {
      const { new: newAlert, update: updatedAlert, delete: deleted } = payload;
      if (newAlert) {
        setPanicAlerts((prev) => [newAlert as PanicAlert, ...prev]);
      } else if (updatedAlert) {
        const u = updatedAlert as PanicAlert;
        setPanicAlerts((prev) =>
          prev.map((a) => (a.id === u.id ? u : a))
        );
      } else if (deleted) {
        setPanicAlerts((prev) =>
          prev.filter((a) => a.id !== deleted.id)
        );
      }
    }
  );

  useSubscription(
    "live_threads",
    ["INSERT", "UPDATE", "DELETE"],
    (payload) => {
      const { new: newThread, update: updatedThread, delete: deleted } = payload;
      if (newThread) {
        setLiveThreads((prev) => [newThread as LiveThread, ...prev]);
      } else if (updatedThread) {
        const u = updatedThread as LiveThread;
        setLiveThreads((prev) =>
          prev.map((t) => (t.id === u.id ? u : t))
        );
      } else if (deleted) {
        setLiveThreads((prev) =>
          prev.filter((t) => t.id !== deleted.id)
        );
      }
    }
  );

  /* ---- Marker sync when data changes ---- */
  useEffect(() => {
    if (!mapInstance.current) return;
    updateMarkers(panicAlerts, liveThreads);
  }, [panicAlerts, liveThreads]);

  /* ---- Markers creation / cleanup ---- */
  const updateMarkers = (alerts: PanicAlert[], threads: LiveThread[]) => {
    if (!mapInstance.current || !(window as any).google) return;

    // Clean up old markers
    markersRef.current.forEach((m) => m.setMap(null));
    markersRef.current = [];

    // Panic alerts – red
    alerts.forEach((alert) => {
      const marker = new (window as any).google.maps.Marker({
        position: { lat: alert.latitude, lng: alert.longitude },
        map: mapInstance.current,
        title: `Alert ID: ${alert.id}`,
        icon: "http://maps.google.com/mapfiles/ms/icons/red-dot.png",
      });

      const infowindow = new (window as any).google.maps.InfoWindow({
        content: `<div>
          <strong>Panic Alert</strong><br/>
          ID: ${alert.id}<br/>
          Status: ${alert.status}<br/>
          Time: ${new Date(alert.created_at).toLocaleString()}
        </div>`,
      });

      marker.addListener("click", () => {
        infowindow.open(mapInstance.current, marker);
        setSelectedAlert(alert);
      });

      markersRef.current.push(marker);
    });

    // Live threads – blue
    threads.forEach((thread) => {
      const marker = new (window as any).google.maps.Marker({
        position: { lat: thread.latitude, lng: thread.longitude },
        map: mapInstance.current,
        title: `Advisory: ${thread.message}`,
        icon: "http://maps.google.com/mapfiles/ms/icons/blue-dot.png",
      });

      const infowindow = new (window as any).google.maps.InfoWindow({
        content: `<div>
          <strong>Police Advisory</strong><br/>
          Message: ${thread.message}<br/>
          Time: ${new Date(thread.created_at).toLocaleString()}
        </div>`,
      });

      marker.addListener("click", () => infowindow.open(mapInstance.current, marker));

      markersRef.current.push(marker);
    });
  };

  /* ---- Resolve alert (updates status in DB) ---- */
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
      toast({ title: "Success", description: "Alert marked as resolved" });
      // No need to update state – real‑time listener will handle it
    }
  };

  /* ---- Advisory CRUD operations ---- */
  const handlePostAdvisory = async () => {
    const { error } = await supabase.from("live_threads").insert([
      {
        message: advisoryMessage,
        latitude: parseFloat(advisoryLat),
        longitude: parseFloat(advisoryLng),
      },
    ]);

    if (error) {
      toast({
        title: "Error",
        description: "Failed to post advisory: " + error.message,
        variant: "destructive",
      });
    } else {
      toast({ title: "Success", description: "Advisory posted" });
      setAdvisoryMessage("");
      setAdvisoryLat("");
      setAdvisoryLng("");
      // The real‑time listener will add the new record automatically
    }
  };

  const handleDeleteAdvisory = async (id: string) => {
    const { error } = await supabase.from("live_threads").delete().eq("id", id);

    if (error) {
      toast({
        title: "Error",
        description: "Failed to delete advisory",
        variant: "destructive",
      });
    } else {
      toast({ title: "Success", description: "Advisory deleted" });
      // Real‑time listener will remove it from state
    }
  };

  /* ---- Sign‑out ---- */
  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/police-signin");
  };

  /* ---- Filter + Stats ---- */
  const filteredAlerts =
    filter === "all"
      ? panicAlerts
      : panicAlerts.filter((a) =>
          filter === "resolved" ? a.status === "resolved" : a.status !== "resolved"
        );

  const activeCount = panicAlerts.filter((a) => a.status !== "resolved").length;
  const resolvedCount = panicAlerts.filter((a) => a.status === "resolved").length;

  /* ---- Render ---- */
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
            <Button
              onClick={() => {
                // Re‑fetch just in case
                // Real‑time will keep sync
              }}
            >
              Refresh
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Map & Alerts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Map */}
        <Card>
          <CardHeader>
            <CardTitle>Live Map</CardTitle>
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
      </div>

      {/* Advisory Post */}
      <Card>
        <CardHeader>
          <CardTitle>Post Police Advisory</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <input
            type="text"
            placeholder="Message"
            value={advisoryMessage}
            onChange={(e) => setAdvisoryMessage(e.target.value)}
            className="w-full border p-2 rounded"
          />
          <input
            type="text"
            placeholder="Latitude"
            value={advisoryLat}
            onChange={(e) => setAdvisoryLat(e.target.value)}
            className="w-full border p-2 rounded"
          />
          <input
            type="text"
            placeholder="Longitude"
            value={advisoryLng}
            onChange={(e) => setAdvisoryLng(e.target.value)}
            className="w-full border p-2 rounded"
          />
          <Button onClick={handlePostAdvisory}>Post Advisory</Button>
        </CardContent>
      </Card>

      {/* Advisory List */}
      <Card>
        <CardHeader>
          <CardTitle>All Police Advisories</CardTitle>
        </CardHeader>
        <CardContent>
          {liveThreads.length === 0 ? (
            <p>No advisories</p>
          ) : (
            <ul className="space-y-3">
              {liveThreads.map((adv) => (
                <li
                  key={adv.id}
                  className="p-3 border rounded-lg shadow flex justify-between items-center"
                >
                  <div>
                    <p>
                      <strong>Message:</strong> {adv.message}
                    </p>
                    <p>
                      <strong>Location:</strong> {adv.latitude},{" "}
                      {adv.longitude}
                    </p>
                    <p>
                      <strong>Posted:</strong>{" "}
                      {new Date(adv.created_at).toLocaleString()}
                    </p>
                  </div>
                  <Button
                    variant="destructive"
                    onClick={() => handleDeleteAdvisory(adv.id)}
                  >
                    Delete
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Alert Drawer */}
      {selectedAlert && (
        <Drawer
          open={!!selectedAlert}
          onOpenChange={() => setSelectedAlert(null)}
        >
          <DrawerContent>
            <DrawerHeader>
              <DrawerTitle>Alert Details</DrawerTitle>
            </DrawerHeader>
            <div className="p-4 space-y-2">
              <p>
                <strong>ID:</strong> {selectedAlert.id}
              </p>
              <p>
                <strong>User:</strong> {selectedAlert.user_id}
              </p>
              <p>
                <strong>Status:</strong> {selectedAlert.status}
              </p>
              <p>
                <strong>Location:</strong>{" "}
                {selectedAlert.latitude}, {selectedAlert.longitude}
              </p>
              <p>
                <strong>Created At:</strong>{" "}
                {new Date(selectedAlert.created_at).toLocaleString()}
              </p>
              {selectedAlert.status !== "resolved" && (
                <Button
                  onClick={() => handleResolve(selectedAlert.id)}
                >
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
