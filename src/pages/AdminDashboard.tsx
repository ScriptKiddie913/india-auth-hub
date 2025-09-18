import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { createClient } from "@supabase/supabase-js";  // ✅ modified
import { useToast } from "@/hooks/use-toast";
import { Shield, LogOut, AlertTriangle, MapPin, Users, Clock, HelpCircle, Phone, CheckCircle, User, FileText } from "lucide-react";
import AdminMap from "@/components/AdminMap";
import AdminHelpDesk from "@/components/AdminHelpDesk";
import { format } from "date-fns";

// ✅ Supabase direct connection (replace with your actual URL and Key)
const supabaseUrl = "YOUR_SUPABASE_URL";
const supabaseAnonKey = "YOUR_SUPABASE_ANON_KEY";
const supabase = createClient(supabaseUrl, supabaseAnonKey);

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
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("dashboard");
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    // Check admin authentication
    const adminAuth = localStorage.getItem("adminAuth");
    if (!adminAuth) {
      navigate("/admin");
      return;
    }

    fetchUserLocations();
    fetchPanicAlerts();
    fetchAllUsers();
    
    // Set up real-time subscriptions
    const panicChannel = supabase
      .channel('panic-alerts')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'panic_alerts'
      }, (payload) => {
        setPanicAlerts(prev => [payload.new as PanicAlert, ...prev]);
        toast({
          title: "🚨 New Panic Alert!",
          description: `Alert received from User ${payload.new.user_id}`,
          variant: "destructive",
        });
      })
      .subscribe();

    const locationChannel = supabase
      .channel('user-locations')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'user_locations'
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
        .select('*')
        .order("created_at", { ascending: false });

      if (error) throw error;

      // Get profiles for user names
      if (data && data.length > 0) {
        const userIds = [...new Set(data.map(loc => loc.user_id))];
        const { data: profiles } = await supabase
          .from("profiles")
          .select('user_id, full_name')
          .in('user_id', userIds);

        // Merge profiles with locations
        const locationsWithProfiles = data.map(location => ({
          ...location,
          profiles: profiles?.find(p => p.user_id === location.user_id)
        }));

        setUserLocations(locationsWithProfiles as UserLocation[]);
      } else {
        setUserLocations([]);
      }
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
        .select('*')
        .order("created_at", { ascending: false });

      if (error) throw error;

      // Get profiles for user names
      if (data && data.length > 0) {
        const userIds = [...new Set(data.map(alert => alert.user_id))];
        const { data: profiles } = await supabase
          .from("profiles")
          .select('user_id, full_name')
          .in('user_id', userIds);

        // Merge profiles with alerts
        const alertsWithProfiles = data.map(alert => ({
          ...alert,
          profiles: profiles?.find(p => p.user_id === alert.user_id)
        }));

        setPanicAlerts(alertsWithProfiles as PanicAlert[]);
      } else {
        setPanicAlerts([]);
      }
      
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

  const fetchAllUsers = async () => {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select('*')
        .order("created_at", { ascending: false });

      if (error) throw error;
      setAllUsers(data || []);
    } catch (error: any) {
      toast({
        title: "Error fetching users",
        description: error.message,
        variant: "destructive",
      });
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
    navigate("/admin");
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-secondary/20 to-accent/10">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-destructive"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-secondary/20 to-accent/10">
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
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
            <TabsTrigger value="users">User Management</TabsTrigger>
            <TabsTrigger value="helpdesk">Help Desk</TabsTrigger>
          </TabsList>
          
          {/* Rest of your existing code stays unchanged */}
        </Tabs>
      </main>
    </div>
  );
};

export default AdminDashboard;
