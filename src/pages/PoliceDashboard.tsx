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

/* ------------------------------------------------------------------ 1️⃣ Types ------------------------------------------------------------------ */
interface PanicAlert {
  id: string;
  user_id: string;
  latitude: number;
  longitude: number;
  status: string;
  created_at: string;
}

interface PoliceAlert {
  id: string;
  user_id: string;          // set by trigger
  message: string;
  latitude: number;
  longitude: number;
  status: string;
  created_at: string;
}

interface UserLocation {
  id: string;
  user_id: string;
  latitude: number;
  longitude: number;
  created_at: string;
}

/* ------------------------------------------------------------------ 2️⃣ Supabase DDL for police_alerts (create once in console) ------------------------------------------------------------------ */
/*
DROP TABLE IF EXISTS police_alerts;

CREATE TABLE police_alerts (
  id           bigint      PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  user_id      uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message      text        NOT NULL,
  latitude     numeric(9,6) NOT NULL,
  longitude    numeric(9,6) NOT NULL,
  status       text        NOT NULL DEFAULT 'active',
  created_at   timestamptz DEFAULT now()
);

ALTER TABLE police_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY police_alerts_all   ON police_alerts USING (true);
CREATE POLICY police_alerts_user  ON police_alerts USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION set_current_user_police_alerts()
RETURNS trigger AS $$
BEGIN
  NEW.user_id := auth.uid();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_police_user_id
BEFORE INSERT ON police_alerts
FOR EACH ROW
EXECUTE PROCEDURE set_current_user_police_alerts();
*/

const PoliceDashboard: React.FC = () => {
  /* ---- State ---- */
  const [panicAlerts, setPanicAlerts] = useState<PanicAlert[]>([]);
  const [policeAlerts, setPoliceAlerts] = useState<PoliceAlert[]>([]);
  const [userLocations, setUserLocations] = useState<UserLocation[]>([]);
  const [filter, setFilter] = useState<"all" | "active" | "resolved">("all");
  const [selectedAlert, setSelectedAlert] = useState<PanicAlert | null>(null);

  /* --- Police‑alert form --- */
  const [policeMessage, setPoliceMessage] = useState("");
  const [policeLat, setPoliceLat] = useState("");
  const [policeLng, setPoliceLng] = useState("");

  /* --- User name lookup ---- */
  const [userMap, setUserMap] = useState<Record<string, string>>({});

  /* ---- Hooks ---- */
  const { toast } = useToast();
  const navigate = useNavigate();
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<any>(null);
  const markersRef = useRef<any[]>([]);

  /* ------------------------------------------------------------------ 3️⃣ Initial fetch of data (panic alerts + police alerts) ------------------------------------------- */
  useEffect(() => {
    const fetchInitialData = async () => {
      /* --- Panic alerts --- */
      const { data: panicData, error: panicErr } = await supabase
        .from("panic_alerts")
        .select("*")
        .order("created_at", { ascending: false });

      if (!panicErr && panicData) {
        setPanicAlerts(panicData as PanicAlert[]);
      }

      /* --- Police alerts --- */
      const { data: policeData, error: policeErr } = await supabase
        .from("police_alerts")
        .select("*")
        .order("created_at", { ascending: false });

      if (!policeErr && policeData) {
        setPoliceAlerts(policeData as PoliceAlert[]);
      }

      /* --- Profiles for all user IDs --- */
      const allIds = [
        ...(panicData ?? []).map((a: any) => a.user_id),
        ...(policeData ?? []).map((p: any) => p.user_id),
      ];
      const uniqueIds = Array.from(new Set(allIds));

      if (uniqueIds.length) {
        const { data: profiles, error: profErr } = await supabase
          .from("profiles")
          .select("user_id, full_name")
          .in("user_id", uniqueIds);

        if (!profErr && profiles) {
          const map: Record<string, string> = {};
          profiles.forEach((p: any) => {
            map[p.user_id] = p.full_name || p.user_id;
          });
          setUserMap(map);
        }
      }
    };

    fetchInitialData();
  }, []);

  /* ------------------------------------------------------------------ 4️⃣ Real‑time subscriptions --------------------------------------------------- */
  useEffect(() => {
    /** Helper that fetches a user profile when a new ID appears */
    const addUserToMap = async (userId: string) => {
      if (userMap[userId]) return;
      const { data, error } = await supabase
        .from("profiles")
        .select("user_id, full_name")
        .eq("user_id", userId)
        .single();
      if (!error && data) {
        setUserMap((prev) => ({
          ...prev,
          [userId]: data.full_name || data.user_id,
        }));
      }
    };

    /* Police alerts channel */
    const subPolice = supabase
      .channel("police_alerts-channel")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "police_alerts" },
        (payload) => {
          const change = payload.new as PoliceAlert | null;
          const old = payload.old as PoliceAlert | null;
          if (payload.eventType === "INSERT" && change) {
            setPoliceAlerts((prev) => [change, ...prev]);
          } else if (payload.eventType === "UPDATE" && change) {
            setPoliceAlerts((prev) =>
              prev.map((a) => (a.id === change.id ? change : a))
            );
          } else if (payload.eventType === "DELETE" && old) {
            setPoliceAlerts((prev) => prev.filter((a) => a.id !== old.id));
          }
        }
      )
      .subscribe();

    /* Panic alerts channel */
    const subPanic = supabase
      .channel("panic_alerts-channel")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "panic_alerts" },
        (payload) => {
          const change = payload.new as PanicAlert | null;
          const old = payload.old as PanicAlert | null;
          if (payload.eventType === "INSERT" && change) {
            setPanicAlerts((prev) => [change, ...prev]);
            addUserToMap(change.user_id);
          } else if (payload.eventType === "UPDATE" && change) {
            setPanicAlerts((prev) =>
              prev.map((a) => (a.id === change.id ? change : a))
            );
            addUserToMap(change.user_id);
          } else if (payload.eventType === "DELETE" && old) {
            setPanicAlerts((prev) => prev.filter((a) => a.id !== old.id));
          }
        }
      )
      .subscribe();

    /* User locations channel */
    const subLocation = supabase
      .channel("user_locations-channel")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "user_locations" },
        (payload) => {
          const change = payload.new as UserLocation | null;
          const old = payload.old as UserLocation | null;
          if (payload.eventType === "INSERT" && change) {
            setUserLocations((prev) => {
              const exists = prev.find((l) => l.id === change.id);
              if (exists) {
                return prev.map((l) => (l.id === change.id ? change : l));
              }
              return [change, ...prev];
            });
            addUserToMap(change.user_id);
          } else if (payload.eventType === "UPDATE" && change) {
            setUserLocations((prev) =>
              prev.map((l) => (l.id === change.id ? change : l))
            );
            addUserToMap(change.user_id);
          } else if (payload.eventType === "DELETE" && old) {
            setUserLocations((prev) =>
              prev.filter((l) => l.id !== old.id)
            );
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(subPolice);
      supabase.removeChannel(subPanic);
      supabase.removeChannel(subLocation);
    };
  }, [userMap]);

  /* ------------------------------------------------------------------ 5️⃣ Map initialization & marker handling -------------------------------------------------- */
  useEffect(() => {
    loadGoogleMaps()
      .then(() => {
        if (!mapRef.current || mapInstance.current) return;
        mapInstance.current = new (window as any).google.maps.Map(
          mapRef.current,
          {
            center: { lat: 22.5726, lng: 88.3639 },
            zoom: 12,
          }
        );
        updateMarkers(panicAlerts, policeAlerts);
      })
      .catch(console.error);
  }, []);

  // Update markers whenever data changes
  useEffect(() => {
    if (!mapInstance.current) return;
    updateMarkers(panicAlerts, policeAlerts);
  }, [panicAlerts, policeAlerts]);

  /** Renders all markers (red for panic, yellow for police). */
  const updateMarkers = (
    alerts: PanicAlert[],
    police: PoliceAlert[]
  ) => {
    if (!mapInstance.current) return;

    markersRef.current.forEach((m) => m.setMap(null));
    markersRef.current = [];

    // Panic alerts – red
    alerts.forEach((alert) => {
      const marker = new (window as any).google.maps.Marker({
        position: { lat: alert.latitude, lng: alert.longitude },
        map: mapInstance.current,
        icon: "http://maps.google.com/mapfiles/ms/icons/red-dot.png",
        title: `Alert ID: ${alert.id}`,
      });

      const info = new (window as any).google.maps.InfoWindow({
        content: `<div>
          <strong>Panic Alert</strong><br/>
          ID: ${alert.id}<br/>
          Status: ${alert.status}<br/>
          Time: ${new Date(alert.created_at).toLocaleString()}
        </div>`,
      });

      marker.addListener("click", () => {
        info.open(mapInstance.current, marker);
        setSelectedAlert(alert);
      });

      markersRef.current.push(marker);
    });

    // Police alerts – yellow
    police.forEach((pol) => {
      const marker = new (window as any).google.maps.Marker({
        position: { lat: pol.latitude, lng: pol.longitude },
        map: mapInstance.current,
        icon: "http://maps.google.com/mapfiles/ms/icons/yellow-dot.png",
        title: `Police Alert: ${pol.message}`,
      });

      const info = new (window as any).google.maps.InfoWindow({
        content: `<div>
          <strong>Police Alert</strong><br/>
          Message: ${pol.message}<br/>
          Status: ${pol.status}<br/>
          Time: ${new Date(pol.created_at).toLocaleString()}
        </div>`,
      });

      marker.addListener("click", () => info.open(mapInstance.current, marker));

      markersRef.current.push(marker);
    });
  };

  /* ------------------------------------------------------------------ 6️⃣ Police‑alert CRUD --------------------------------------------------------------- */
  /** Create a new police alert */
  const handleCreatePoliceAlert = async () => {
    /* Note: the payload deliberately omits user_id – the trigger
       automatically sets it to the signed‑in user */
    const { error } = await supabase
      .from("police_alerts")
      .insert([
        {
          message: policeMessage,
          latitude: parseFloat(policeLat),
          longitude: parseFloat(policeLng),
          status: "active",
        },
      ]);

    if (error) {
      toast({
        title: "Error",
        description: "Failed to create police alert: " + error.message,
        variant: "destructive",
      });
    } else {
      toast({ title: "Success", description: "Police alert created" });
      setPoliceMessage("");
      setPoliceLat("");
      setPoliceLng("");
    }
  };

  /** Resolve a police alert (changes status to 'resolved') */
  const handleResolvePoliceAlert = async (id: string) => {
    const { error } = await supabase
      .from("police_alerts")
      .update({ status: "resolved" })
      .eq("id", id);

    if (error) {
      toast({
        title: "Error",
        description: "Failed to resolve police alert",
        variant: "destructive",
      });
    } else {
      toast({ title: "Success", description: "Police alert resolved" });
    }
  };

  /* ------------------------------------------------------------------ 7️⃣ Existing actions ------------------------------------------------------------- */
  /** Resolve a panic alert */
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
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/police-signin");
  };

  /* ------------------------------------------------------------------ 8️⃣ UI metrics ---------------------------------------------- */
  const filteredAlerts =
    filter === "all"
      ? panicAlerts
      : panicAlerts.filter((a) =>
          filter === "resolved" ? a.status === "resolved" : a.status !== "resolved"
        );

  const activeCount = panicAlerts.filter((a) => a.status !== "resolved").length;
  const resolvedCount = panicAlerts.filter((a) => a.status === "resolved").length;

  /* ------------------------------------------------------------------ 9️⃣ Render -------------------------------------------------------- */
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
                /* Real‑time keeps the UI in sync – this button forces a manual refresh */
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

        {/* Alerts List with Tabs */}
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
                            <strong>User:</strong>{" "}
                            {userMap[alert.user_id] ?? alert.user_id}
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

      {/* Police Alert Creation */}
      <Card>
        <CardHeader>
          <CardTitle>Create Police Alert</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <input
            type="text"
            placeholder="Message"
            value={policeMessage}
            onChange={(e) => setPoliceMessage(e.target.value)}
            className="w-full border p-2 rounded"
          />
          <input
            type="text"
            placeholder="Latitude"
            value={policeLat}
            onChange={(e) => setPoliceLat(e.target.value)}
            className="w-full border p-2 rounded"
          />
          <input
            type="text"
            placeholder="Longitude"
            value={policeLng}
            onChange={(e) => setPoliceLng(e.target.value)}
            className="w-full border p-2 rounded"
          />
          <Button onClick={handleCreatePoliceAlert}>Create Alert</Button>
        </CardContent>
      </Card>

      {/* Police Alerts List */}
      <Card>
        <CardHeader>
          <CardTitle>Police Alerts</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {policeAlerts.length === 0 ? (
            <p>No police alerts</p>
          ) : (
            <ul className="space-y-3">
              {policeAlerts.map((pol) => (
                <li
                  key={pol.id}
                  className="p-3 border rounded-lg shadow flex justify-between items-center"
                >
                  <div>
                    <p>
                      <strong>Message:</strong> {pol.message}
                    </p>
                    <p>
                      <strong>Location:</strong> {pol.latitude},{" "}
                      {pol.longitude}
                    </p>
                    <p>
                      <strong>Created:</strong>{" "}
                      {new Date(pol.created_at).toLocaleString()}
                    </p>
                    <p>
                      <strong>Status:</strong> {pol.status}
                    </p>
                  </div>
                  {pol.status !== "resolved" && (
                    <Button onClick={() => handleResolvePoliceAlert(pol.id)}>
                      Resolve
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Live User Locations List */}
      <Card>
        <CardHeader>
          <CardTitle>Live User Locations</CardTitle>
        </CardHeader>
        <CardContent>
          {userLocations.length === 0 ? (
            <p>No live locations</p>
          ) : (
            <ul className="space-y-3">
              {userLocations.map((loc) => (
                <li
                  key={loc.id}
                  className="p-3 border rounded-lg shadow flex flex-col sm:flex-row justify-between items-start sm:items-center space-y-2 sm:space-y-0"
                >
                  <div>
                    <p>
                      <strong>Name:</strong>{" "}
                      {userMap[loc.user_id] ?? loc.user_id}
                    </p>
                    <p>
                      <strong>Latitude:</strong> {loc.latitude}
                    </p>
                    <p>
                      <strong>Longitude:</strong> {loc.longitude}
                    </p>
                    <p>
                      <strong>Updated:</strong>{" "}
                      {new Date(loc.created_at).toLocaleString()}
                    </p>
                  </div>
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
                <strong>User:</strong>{" "}
                {userMap[selectedAlert.user_id] ?? selectedAlert.user_id}
              </p>
              <p>
                <strong>Status:</strong> {selectedAlert.status}
              </p>
              <p>
                <strong>Location:</strong> {selectedAlert.latitude},{" "}
                {selectedAlert.longitude}
              </p>
              <p>
                <strong>Created At:</strong>{" "}
                {new Date(selectedAlert.created_at).toLocaleString()}
              </p>
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

