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
  const { toast } = useToast();
  const navigate = useNavigate();

  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<any>(null);
  const markersRef = useRef<any[]>([]);

  /* ✅ Fetch panic alerts from Supabase */
  useEffect(() => {
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

    fetchPanicAlerts();
  }, []);

  /* ✅ Initialize Google Map */
  useEffect(() => {
    const initMap = () => {
      if (!mapRef.current || !(window as any).google) return;

      console.log("✅ Initializing Google Map...");

      mapInstance.current = new (window as any).google.maps.Map(mapRef.current, {
        center: { lat: 22.5726, lng: 88.3639 }, // Kolkata
        zoom: 12,
      });

      if (panicAlerts.length > 0) {
        updateMarkers(panicAlerts);
      }
    };

    const scriptId = "google-maps-script";
    if (!(window as any).google || !(window as any).google.maps) {
      if (!document.getElementById(scriptId)) {
        const script = document.createElement("script");
        script.id = scriptId;
        script.src =
          "https://maps.googleapis.com/maps/api/js?key=AIzaSyBU7z2W7aE4T6TSV7SqEk0UJiyjAC97UW8&libraries=places";
        script.async = true;
        script.defer = true;

        script.onload = () => {
          console.log("✅ Google Maps script loaded");
          initMap();
        };

        script.onerror = () => {
          console.error("❌ Failed to load Google Maps script");
        };

        document.body.appendChild(script);
      } else {
        document.getElementById(scriptId)?.addEventListener("load", initMap);
      }
    } else {
      initMap();
    }
  }, [panicAlerts]);

  /* ✅ Update markers on the map */
  const updateMarkers = (alerts: PanicAlert[]) => {
    if (!mapInstance.current || !(window as any).google) return;

    // Clear old markers
    markersRef.current.forEach((marker) => marker.setMap(null));
    markersRef.current = [];

    alerts.forEach((alert) => {
      const marker = new (window as any).google.maps.Marker({
        position: { lat: alert.latitude, lng: alert.longitude },
        map: mapInstance.current,
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
      });

      markersRef.current.push(marker);
    });
  };

  /* ✅ Handle resolve alert */
  const handleResolve = async (id: string) => {
    const { error } = await supabase
      .from("panic_alerts")
      .update({ status: "resolved" })
      .eq("id", id);

    if (error) {
      toast({ title: "Error", description: "Failed to resolve alert", variant: "destructive" });
    } else {
      setPanicAlerts((prev) =>
        prev.map((alert) =>
          alert.id === id ? { ...alert, status: "resolved" } : alert
        )
      );
      toast({ title: "Success", description: "Alert marked as resolved" });
    }
  };

  /* ✅ Handle logout */
  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/police-signin");
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Police Dashboard</h1>
        <Button onClick={handleLogout} variant="destructive">
          Logout
        </Button>
      </div>

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

      <Card>
        <CardHeader>
          <CardTitle>Panic Alerts List</CardTitle>
        </CardHeader>
        <CardContent>
          {panicAlerts.length === 0 ? (
            <p>No active panic alerts</p>
          ) : (
            <ul className="space-y-3">
              {panicAlerts.map((alert) => (
                <li
                  key={alert.id}
                  className="p-3 border rounded-lg shadow flex justify-between items-center"
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
                    <Button onClick={() => handleResolve(alert.id)}>
                      Mark as Resolved
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default PoliceDashboard;
