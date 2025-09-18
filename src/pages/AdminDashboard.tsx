import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  Shield, LogOut, AlertTriangle, MapPin, Users,
  Clock, HelpCircle, Phone, User, FileText
} from "lucide-react";
import AdminMap from "@/components/AdminMap";
import AdminHelpDesk from "@/components/AdminHelpDesk";

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
    const adminAuth = localStorage.getItem("adminAuth");
    if (!adminAuth) {
      navigate("/admin");
      return;
    }

    fetchUserLocations();
    fetchPanicAlerts();
    fetchAllUsers();

    const panicChannel = supabase
      .channel("panic-alerts")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "panic_alerts" }, (payload) => {
        setPanicAlerts((prev) => [payload.new as PanicAlert, ...prev]);
        toast({
          title: "🚨 New Panic Alert!",
          description: `Alert received from User ${payload.new.user_id}`,
          variant: "destructive",
        });
      })
      .subscribe();

    const locationChannel = supabase
      .channel("user-locations")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "user_locations" }, () => {
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
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;

      if (data && data.length > 0) {
        const userIds = [...new Set(data.map((loc) => loc.user_id))];
        const { data: profiles } = await supabase
          .from("profiles")
          .select("user_id, full_name")
          .in("user_id", userIds);

        const locationsWithProfiles = data.map((location) => ({
          ...location,
          profiles: profiles?.find((p) => p.user_id === location.user_id),
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
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;

      if (data && data.length > 0) {
        const userIds = [...new Set(data.map((alert) => alert.user_id))];
        const { data: profiles } = await supabase
          .from("profiles")
          .select("user_id, full_name")
          .in("user_id", userIds);

        const alertsWithProfiles = data.map((alert) => ({
          ...alert,
          profiles: profiles?.find((p) => p.user_id === alert.user_id),
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
        .select("*")
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

      setPanicAlerts((prev) =>
        prev.map((alert) =>
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
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
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
      </header>

      {/* Main */}
      <main className="container mx-auto px-4 py-8">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
            <TabsTrigger value="users">User Management</TabsTrigger>
            <TabsTrigger value="helpdesk">Help Desk</TabsTrigger>
          </TabsList>

          {/* Dashboard Tab */}
          <TabsContent value="dashboard" className="space-y-6">
            {/* Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card>
                <CardHeader className="flex justify-between items-center pb-2">
                  <CardTitle className="text-sm font-medium">Active Users</CardTitle>
                  <Users className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{userLocations.length}</div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex justify-between items-center pb-2">
                  <CardTitle className="text-sm font-medium">Panic Alerts</CardTitle>
                  <AlertTriangle className="h-4 w-4 text-destructive" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-destructive">
                    {panicAlerts.filter((a) => a.status === "active").length}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex justify-between items-center pb-2">
                  <CardTitle className="text-sm font-medium">Total Alerts</CardTitle>
                  <Clock className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{panicAlerts.length}</div>
                </CardContent>
              </Card>
            </div>

            {/* Panic Alerts */}
            <Card>
              <CardHeader>
                <CardTitle className="text-2xl font-bold flex items-center gap-2">
                  <AlertTriangle className="h-6 w-6 text-destructive" />
                  Panic Alerts
                </CardTitle>
                <CardDescription>Monitor and resolve emergency alerts</CardDescription>
              </CardHeader>
              <CardContent>
                {panicAlerts.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">No panic alerts</p>
                ) : (
                  <div className="space-y-4">
                    {panicAlerts.map((alert) => (
                      <div
                        key={alert.id}
                        className={`p-4 rounded-lg border ${
                          alert.status === "active"
                            ? "border-destructive bg-destructive/5"
                            : "border-muted"
                        }`}
                      >
                        <div className="flex justify-between items-start">
                          <div>
                            <div className="flex items-center gap-2 mb-2">
                              <Badge variant={alert.status === "active" ? "destructive" : "secondary"}>
                                {alert.status}
                              </Badge>
                              <span className="font-semibold">
                                {alert.profiles?.full_name || "Unknown User"}
                              </span>
                              <span className="text-sm text-muted-foreground">
                                {new Date(alert.created_at).toLocaleString()}
                              </span>
                            </div>
                            <p className="text-sm mb-2">{alert.message}</p>
                            <div className="flex gap-4 text-sm text-muted-foreground">
                              <div className="flex items-center gap-1">
                                <MapPin className="h-3 w-3" />
                                {alert.latitude.toFixed(6)}, {alert.longitude.toFixed(6)}
                              </div>
                            </div>
                          </div>
                          {alert.status === "active" && (
                            <Button size="sm" variant="outline" onClick={() => handleResolveAlert(alert.id)}>
                              Resolve
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* User Map */}
            <AdminMap userLocations={userLocations} />

            {/* User Locations List */}
            <Card>
              <CardHeader>
                <CardTitle className="text-2xl font-bold flex items-center gap-2">
                  <MapPin className="h-6 w-6 text-primary" />
                  User Locations List
                </CardTitle>
                <CardDescription>Recent location updates</CardDescription>
              </CardHeader>
              <CardContent>
                {userLocations.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">No user locations</p>
                ) : (
                  <div className="space-y-4 max-h-96 overflow-y-auto">
                    {userLocations.map((loc) => (
                      <div key={loc.id} className="p-4 rounded-lg border bg-card">
                        <div className="flex justify-between">
                          <div>
                            <div className="font-semibold">
                              {loc.profiles?.full_name || "Unknown User"}
                            </div>
                            <div className="text-sm text-muted-foreground">
                              {new Date(loc.created_at).toLocaleString()}
                            </div>
                          </div>
                          <div className="text-right text-sm">
                            <div>Lat: {loc.latitude.toFixed(6)}</div>
                            <div>Lng: {loc.longitude.toFixed(6)}</div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Users Tab */}
          <TabsContent value="users">
            <Card>
              <CardHeader>
                <CardTitle className="text-2xl font-bold flex items-center gap-2">
                  <Users className="h-6 w-6 text-primary" />
                  User Management
                </CardTitle>
                <CardDescription>View all registered users</CardDescription>
              </CardHeader>
              <CardContent>
                {allUsers.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">No users found</p>
                ) : (
                  <div className="grid gap-4">
                    {allUsers.map((user) => (
                      <Card key={user.id} className="hover:shadow-md transition-shadow">
                        <CardContent className="p-4">
                          <div className="flex items-center gap-4">
                            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                              <User className="w-5 h-5 text-primary" />
                            </div>
                            <div className="flex-1">
                              <div className="font-semibold">{user.full_name || "Unnamed User"}</div>
                              <div className="text-sm text-muted-foreground">{user.email}</div>
                            </div>
                            <Badge variant="secondary">ID: {user.user_id}</Badge>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Helpdesk Tab */}
          <TabsContent value="helpdesk">
            <AdminHelpDesk />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default AdminDashboard;
