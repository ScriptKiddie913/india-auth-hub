// src/pages/PoliceDashboard.tsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Shield } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";

const PoliceDashboard: React.FC = () => {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [locations, setLocations] = useState<any[]>([]);
  const [alerts, setAlerts] = useState<any[]>([]);

  // Stub for sign-out
  const handleLogout = () => {
    toast({
      title: "Signed out",
      description: "You have been logged out.",
    });
    navigate("/police-signin");
  };

  // Fetch user locations initially
  useEffect(() => {
    const fetchLocations = async () => {
      const { data, error } = await supabase.from("locations").select("*");
      if (!error && data) setLocations(data);
    };
    fetchLocations();
  }, []);

  // Subscribe to realtime location updates
  useEffect(() => {
    const channel = supabase
      .channel("locations-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "locations" }, (payload) => {
        setLocations((prev) => {
          const updated = prev.filter((u) => u.user_id !== payload.new.user_id);
          return [...updated, payload.new];
        });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Subscribe to panic alerts
  useEffect(() => {
    const channel = supabase
      .channel("panic-alerts")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "panic_alerts" }, (payload) => {
        toast({
          title: "🚨 Panic Alert",
          description: `User ${payload.new.user_id}: ${payload.new.message}`,
        });
        setAlerts((prev) => [...prev, payload.new]);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return (
    <div className="min-h-screen bg-gray-100 p-6 flex flex-col items-center">
      <Card className="w-full max-w-6xl">
        <CardHeader className="text-center">
          <CardTitle className="text-3xl font-bold text-blue-700">
            Officer Dashboard
          </CardTitle>
        </CardHeader>

        <CardContent>
          <p className="mb-6 text-lg">
            Welcome to the police command center. Monitor live locations, respond to panic alerts, and track eFIRs.
          </p>

          {/* Map with user markers */}
          <div className="h-[500px] w-full mb-6">
            <MapContainer center={[20.5937, 78.9629]} zoom={5} className="h-full w-full rounded-lg shadow">
              <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
              {locations.map((loc) => (
                <Marker key={loc.user_id} position={[loc.latitude, loc.longitude]}>
                  <Popup>User: {loc.user_id}</Popup>
                </Marker>
              ))}
            </MapContainer>
          </div>

          {/* Logout button */}
          <Button onClick={handleLogout} className="mt-4">
            <Shield className="mr-2 h-4 w-4" /> Sign out
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default PoliceDashboard;
