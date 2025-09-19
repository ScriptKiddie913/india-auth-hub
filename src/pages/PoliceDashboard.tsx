import { useEffect, useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";

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

const PoliceDashboard = () => {
  const [alerts, setAlerts] = useState<PanicAlert[]>([]);
  const [threads, setThreads] = useState<PoliceThread[]>([]);
  const [message, setMessage] = useState("");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");

  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<any>(null);
  const markersRef = useRef<any[]>([]);

  /* ---------- Init Google Map ---------- */
  useEffect(() => {
    if (mapRef.current && !mapInstance.current && (window as any).google) {
      mapInstance.current = new (window as any).google.maps.Map(mapRef.current, {
        center: { lat: 22.5726, lng: 88.3639 },
        zoom: 13,
      });
    }
  }, []);

  /* ---------- Fetch Alerts + Threads ---------- */
  const fetchAlerts = async () => {
    const { data, error } = await supabase
      .from("panic_alerts")
      .select("*")
      .eq("status", "active")
      .order("created_at", { ascending: false });
    if (!error && data) setAlerts(data);
  };

  const fetchThreads = async () => {
    const { data, error } = await supabase
      .from("police_threads")
      .select("*")
      .order("created_at", { ascending: false });
    if (!error && data) setThreads(data);
  };

  /* ---------- Update Map Markers ---------- */
  useEffect(() => {
    if (!mapInstance.current || !(window as any).google) return;

    markersRef.current.forEach((m) => m.setMap(null));
    markersRef.current = [];

    // 🚨 Panic Alerts (Red)
    alerts.forEach((alert) => {
      const marker = new (window as any).google.maps.Marker({
        position: { lat: alert.latitude, lng: alert.longitude },
        map: mapInstance.current,
        icon: "http://maps.google.com/mapfiles/ms/icons/red-dot.png",
        title: "Panic Alert",
      });
      markersRef.current.push(marker);
    });

    // 📢 Police Threads (Blue)
    threads.forEach((thread) => {
      const marker = new (window as any).google.maps.Marker({
        position: { lat: thread.latitude, lng: thread.longitude },
        map: mapInstance.current,
        icon: "http://maps.google.com/mapfiles/ms/icons/blue-dot.png",
        title: "Police Advisory",
      });

      const infoWindow = new (window as any).google.maps.InfoWindow({
        content: `<div>
          <strong>Police Advisory</strong><br/>
          ${thread.message}<br/>
          <small>${new Date(thread.created_at).toLocaleString()}</small>
        </div>`,
      });

      marker.addListener("click", () => {
        infoWindow.open(mapInstance.current, marker);
      });

      markersRef.current.push(marker);
    });
  }, [alerts, threads]);

  /* ---------- Auto refresh ---------- */
  useEffect(() => {
    fetchAlerts();
    fetchThreads();
    const interval = setInterval(() => {
      fetchAlerts();
      fetchThreads();
    }, 15000);
    return () => clearInterval(interval);
  }, []);

  /* ---------- Add Police Thread ---------- */
  const handleAddThread = async () => {
    if (!message || !lat || !lng) return;
    const { error } = await supabase.from("police_threads").insert([
      {
        message,
        latitude: parseFloat(lat),
        longitude: parseFloat(lng),
      },
    ]);
    if (!error) {
      setMessage("");
      setLat("");
      setLng("");
      fetchThreads();
    }
  };

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">Police Dashboard</h1>

      <Card>
        <CardHeader>
          <CardTitle>Live Map</CardTitle>
        </CardHeader>
        <CardContent>
          <div ref={mapRef} className="w-full h-[400px] border rounded-lg" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Create Advisory</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <input
            type="text"
            className="border p-2 w-full"
            placeholder="Message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />
          <input
            type="text"
            className="border p-2 w-full"
            placeholder="Latitude"
            value={lat}
            onChange={(e) => setLat(e.target.value)}
          />
          <input
            type="text"
            className="border p-2 w-full"
            placeholder="Longitude"
            value={lng}
            onChange={(e) => setLng(e.target.value)}
          />
          <Button onClick={handleAddThread}>Post Advisory</Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default PoliceDashboard;
