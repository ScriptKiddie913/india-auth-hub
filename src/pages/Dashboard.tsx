import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { LogOut, AlertTriangle } from "lucide-react";
import type { User as SupabaseUser } from "@supabase/supabase-js";

interface PoliceThread {
  id: string;
  message: string;
  latitude: number;
  longitude: number;
  created_at: string;
}

const UserDashboard = () => {
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(
    null
  );
  const [policeThreads, setPoliceThreads] = useState<PoliceThread[]>([]);

  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<any>(null);
  const markersRef = useRef<any[]>([]);

  const navigate = useNavigate();
  const { toast } = useToast();

  /* ---------- Init Google Map ---------- */
  useEffect(() => {
    if (mapRef.current && !mapInstance.current && (window as any).google) {
      mapInstance.current = new (window as any).google.maps.Map(mapRef.current, {
        center: { lat: 22.5726, lng: 88.3639 },
        zoom: 13,
      });
    }
  }, []);

  /* ---------- Fetch Police Threads ---------- */
  const fetchPoliceThreads = async () => {
    const { data, error } = await supabase
      .from("police_threads")
      .select("*")
      .order("created_at", { ascending: false });
    if (!error && data) setPoliceThreads(data);
  };

  /* ---------- Update Map Markers ---------- */
  useEffect(() => {
    if (!mapInstance.current || !(window as any).google) return;

    markersRef.current.forEach((m) => m.setMap(null));
    markersRef.current = [];

    policeThreads.forEach((thread) => {
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
  }, [policeThreads]);

  /* ---------- Auto refresh ---------- */
  useEffect(() => {
    fetchPoliceThreads();
    const interval = setInterval(fetchPoliceThreads, 15000);
    return () => clearInterval(interval);
  }, []);

  /* ---------- Panic Button ---------- */
  const handlePanicButton = async () => {
    if (!user || !location) return;
    const { error } = await supabase.from("panic_alerts").insert({
      user_id: user.id,
      latitude: location.lat,
      longitude: location.lng,
      status: "active",
    });
    if (error) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } else {
      toast({
        title: "🚨 Panic Alert Sent",
        description: "Police have been notified of your location.",
        variant: "destructive",
      });
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate("/signin");
  };

  if (loading) return <p>Loading...</p>;

  return (
    <div className="p-6 space-y-6">
      <header className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Tourist Dashboard</h1>
        <div className="flex gap-3">
          <Button variant="destructive" onClick={handlePanicButton}>
            <AlertTriangle className="mr-2 h-5 w-5" />
            Panic
          </Button>
          <Button variant="outline" onClick={handleSignOut}>
            <LogOut className="mr-2 h-5 w-5" />
            Logout
          </Button>
        </div>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Live Map</CardTitle>
        </CardHeader>
        <CardContent>
          <div ref={mapRef} className="w-full h-[400px] border rounded-lg" />
        </CardContent>
      </Card>
    </div>
  );
};

export default UserDashboard;
