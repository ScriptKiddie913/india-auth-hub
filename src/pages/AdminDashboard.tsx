import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface UserLocation {
  id: string;
  user_id: string;
  latitude: number;
  longitude: number;
  created_at: string;
  profiles?: { full_name: string };
}

interface PanicAlert {
  id: string;
  user_id: string;
  latitude: number;
  longitude: number;
  created_at: string;
  status: string;
  profiles?: { full_name: string };
}

const AdminDashboard = () => {
  const [userLocations, setUserLocations] = useState<UserLocation[]>([]);
  const [panicAlerts, setPanicAlerts] = useState<PanicAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    // Redirect if not logged in as admin
    const adminAuth = localStorage.getItem("adminAuth");
    if (!adminAuth) {
      navigate("/admin");
      return;
    }

    fetchUserLocations();
    fetchPanicAlerts();

    // Subscribe to panic alerts
    const panicChannel = supabase
      .channel("panic-alerts")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "panic_alerts" },
        (payload) => {
          const newAlert = payload.new as PanicAlert | undefined;
          if (newAlert) {
            setPanicAlerts((prev) => [newAlert, ...prev]);
            toast({
              title: "🚨 New Panic Alert!",
              description: `Alert from User ${newAlert.user_id}`,
              variant: "destructive",
            });
          }
        }
      )
      .subscribe();

    // Subscribe to user locations
    const locationChannel = supabase
      .channel("user-locations")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "user_locations" },
        () => {
          fetchUserLocations();
        }
      )
      .subscribe();

    // Cleanup subscriptions
    return () => {
      supabase.removeChannel(panicChannel);
      supabase.removeChannel(locationChannel);
    };
  }, [navigate, toast]);

  const fetchUserLocations = async () => {
    try {
      const { data, error } = await supabase
        .from("user_locations")
        .select("*, profiles(full_name)")
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) throw error;
      setUserLocations(data || []);
    } catch (error: any) {
      toast({
        title: "Error fetching user locations",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchPanicAlerts = async () => {
    try {
      const { data, error } = await supabase
        .from("panic_alerts")
        .select("*, profiles(full_name)")
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) throw error;
      setPanicAlerts(data || []);
    } catch (error: any) {
      toast({
        title: "Error fetching panic alerts",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Count unique active users
  const uniqueUsers = new Set(userLocations.map((u) => u.user_id)).size;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p>Loading dashboard...</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold mb-6">Admin Dashboard</h1>

      {/* Dashboard Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Active Users</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{uniqueUsers}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Panic Alerts</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{panicAlerts.length}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Latest Location Updates</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{userLocations.length}</div>
          </CardContent>
        </Card>
      </div>

      {/* Panic Alerts Section */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Panic Alerts</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {panicAlerts.map((alert) => (
              <div key={alert.id} className="p-4 border rounded-lg">
                <p>
                  <strong>User:</strong>{" "}
                  {alert.profiles?.full_name || alert.user_id}
                </p>
                <p>
                  <strong>Location:</strong> {alert.latitude},{" "}
                  {alert.longitude}
                </p>
                <p>
                  <strong>Status:</strong> {alert.status}
                </p>
                <p>
                  <strong>Time:</strong>{" "}
                  {new Date(alert.created_at).toLocaleString()}
                </p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* User Locations Section */}
      <Card>
        <CardHeader>
          <CardTitle>Recent User Locations</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {userLocations.map((loc) => (
              <div key={loc.id} className="p-4 border rounded-lg">
                <p>
                  <strong>User:</strong>{" "}
                  {loc.profiles?.full_name || loc.user_id}
                </p>
                <p>
                  <strong>Location:</strong> {loc.latitude}, {loc.longitude}
                </p>
                <p>
                  <strong>Time:</strong>{" "}
                  {new Date(loc.created_at).toLocaleString()}
                </p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminDashboard;
