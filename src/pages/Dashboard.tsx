import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Shield, LogOut, AlertTriangle, MapPin, Users, Clock } from "lucide-react";

interface UserLocation {
  id: string;
  user_id: string;
  latitude: number;
  longitude: number;
  created_at: string;
  profiles?: {
    full_name: string;
  };
}

interface PanicAlert {
  id: string;
  user_id: string;
  message: string;
  latitude: number;
  longitude: number;
  status: string;
  created_at: string;
  profiles?: {
    full_name: string;
  };
}

const AdminDashboard = () => {
  const [userLocations, setUserLocations] = useState<UserLocation[]>([]);
  const [panicAlerts, setPanicAlerts] = useState<PanicAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    // Check admin authentication
    const adminAuth = localStorage.getItem("adminAuth");
    if (!adminAuth) {
      navigate("/admin-login");
      return;
    }

    fetchUserLocations();
    fetchPanicAlerts();
    
    // Set up real-time subscriptions
    const panicChannel = supabase
      .channel("panic-alerts")
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "panic_alerts",
      }, (payload) => {
        setPanicAlerts(prev => [payload.new as PanicAlert, ...prev]);
        toast({
          title: "🚨 New Panic Alert!",
          description: `Alert received from ${payload.new.profiles?.full_name || "User"}`,
          variant: "destructive",
        });
      })
      .subscribe();

    const locationChannel = supabase
      .channel("user-locations")
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "user_locations",
      }, () => {
        fetchUserLocations();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(panicChannel);
      supabase.removeChannel(locationChannel);
    };
  }, [navigate, toast]);

  const fetchUserLocations = async () => {
    try {
      const { data, error } = await supabase
        .from("user_locations")
        .select(`
          *,
          profiles (
            full_name
          )
        `)
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
    }
  };

  const fetchPanicAlerts = async () => {
    try {
      const { data, error } = await supabase
        .from("panic_alerts")
        .select(`
          *,
          profiles (
            full_name
          )
        `)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setPanicAlerts(data || []);
      setLoading(false);
    } catch (error: any) {
      toast({
        title: "Error fetching panic alerts",
        description: error.message,
        variant: "destructive",
      });
      setLoading(false);
    }
  };

  const handleResolveAlert = async (alertId: string) => {
    try {
      const { error } = await supabase
        .from("panic_alerts")
        .update({ status: "resolved" })
        .eq("id", alertId);

      if (error) throw error;
      
      setPanicAlerts(prev => 
        prev.map(alert => 
          alert.id === alertId ? { ...alert, status: "resolved" } : alert
        )
      );
      
      toast({
        title: "Alert Resolved",
        description: "Panic alert has been marked as resolved.",
      });
    } catch (error: any) {
      toast({
        title: "Error resolving alert",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("adminAuth");
    navigate("/admin-login");
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-cover bg-center"
        style={{ backgroundImage: "url('/image/mountain bg.png')" }}>
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-destructive"></div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen bg-cover bg-center"
      style={{ backgroundImage: "url('/image/mountain bg.png')" }}
    >
      {/* Overlay for better readability */}
      <div className="min-h-screen bg-gradient-to-br from-background/80 via-secondary/40 to-accent/30">
        {/* Header */}
        <header className="border-b bg-card/95 backdrop-blur-sm sticky top-0 z-50">
          <div className="container mx-auto px-4 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <div className="w-10 h-10 bg-gradient-to-br from-destructive to-destructive/80 rounded-full flex items-center justify-center">
                  <Shield className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold bg-gradient-to-r from-destructive to-destructive/80 bg-clip-text text-transparent">
                    Admin Dashboard
                  </h1>
                  <p className="text-sm text-muted-foreground">
                    Emergency Response & User Monitoring
                  </p>
                </div>
              </div>
              <Button
                onClick={handleLogout}
                variant="outline"
                className="flex items-center space-x-2 hover:bg-destructive hover:text-destructive-foreground"
              >
                <LogOut className="w-4 h-4" />
                <span>Logout</span>
              </Button>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="container mx-auto px-4 py-8">
          <div className="grid gap-6">
            {/* Stats Cards */}
            {/* (The rest of your code remains unchanged) */}
          </div>
        </main>
      </div>
    </div>
  );
};

export default AdminDashboard;
