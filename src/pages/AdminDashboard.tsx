import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Shield, LogOut, AlertTriangle } from "lucide-react";
import { supabase } from "@/lib/supabaseClient"; // ✅ correct import
import AdminMap from "@/components/AdminMap"; // iframe map component
import LoadingSpinner from "@/components/LoadingSpinner"; // optional spinner

type UserLocation = {
  id: string;
  user_id: string;
  latitude: number;
  longitude: number;
  updated_at: string;
};

const AdminDashboard = () => {
  const [userLocations, setUserLocations] = useState<UserLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  // ✅ Fetch initial user locations from Supabase
  const fetchUserLocations = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("user_locations")
      .select("id, user_id, latitude, longitude, updated_at")
      .order("updated_at", { ascending: false });

    if (error) {
      toast({
        title: "Error",
        description: "Failed to load user locations",
        variant: "destructive",
      });
    } else {
      setUserLocations(data || []);
    }
    setLoading(false);
  };

  // ✅ Subscribe to realtime changes in user_locations
  const subscribeToLocations = () => {
    const channel = supabase
      .channel("location-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "user_locations" },
        (payload) => {
          console.log("Realtime update:", payload);
          fetchUserLocations();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  };

  // ✅ Run fetch + subscribe on mount
  useEffect(() => {
    fetchUserLocations();
    const cleanup = subscribeToLocations();
    return () => {
      cleanup();
    };
  }, []);

  return (
    <div className="p-6 space-y-6">
      {/* ✅ Header */}
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Shield className="w-6 h-6 text-primary" />
          Admin Dashboard
        </h1>
        <Button variant="outline">
          <LogOut className="w-4 h-4 mr-2" />
          Logout
        </Button>
      </div>

      {/* ✅ Map Section */}
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle>Live Tourist Map</CardTitle>
          <CardDescription>Real-time tracking of tourist safety</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <LoadingSpinner />
          ) : (
            <AdminMap userLocations={userLocations} />
          )}
        </CardContent>
      </Card>

      {/* ✅ User Location Details */}
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle>Tourist Locations</CardTitle>
          <CardDescription>Latest safety updates from tourists</CardDescription>
        </CardHeader>
        <CardContent>
          {userLocations.length === 0 ? (
            <p className="text-gray-500">No active tourist locations found.</p>
          ) : (
            <ul className="space-y-4">
              {userLocations.map((loc) => (
                <li
                  key={loc.id}
                  className="p-4 border rounded-lg flex justify-between items-center"
                >
                  <div>
                    <p className="font-medium">User ID: {loc.user_id}</p>
                    <p className="text-sm text-gray-500">
                      Lat: {loc.latitude}, Lng: {loc.longitude}
                    </p>
                    <p className="text-xs text-gray-400">
                      Updated: {new Date(loc.updated_at).toLocaleString()}
                    </p>
                  </div>
                  <Badge variant="secondary" className="flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3 text-yellow-600" />
                    Active
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminDashboard;

