/*  src/pages/admin-dashboard.tsx  */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Shield, LogOut, AlertTriangle, MapPin, Users, Clock, HelpCircle, Phone, CheckCircle, User, FileText } from "lucide-react";
import AdminMap from "@/components/AdminMap";
import AdminHelpDesk from "@/components/AdminHelpDesk";
import { format } from "date-fns";

/* ------- Types --------------------------------------------------- */
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
  message: string;
  latitude: number;
  longitude: number;
  status: string;
  created_at: string;
  profiles?: { full_name: string };
}

/* ------- Page Component ------------------------------------------ */
const AdminDashboard = () => {
  const [panicAlerts, setPanicAlerts] = useState<PanicAlert[]>([]);
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("dashboard");
  const navigate = useNavigate();
  const { toast } = useToast();

  /* ----- Effect: Auth + Data Loading + Real‑time subscriptions */
  useEffect(() => {
    const adminAuth = localStorage.getItem("adminAuth");
    if (!adminAuth) {
      navigate("/admin");
      return;
    }

    fetchPanicAlerts();
    fetchAllUsers();

    /* ── Real‑time – Panic alerts ───────────────────────────── */
    const panicChannel = supabase
      .channel("panic-alerts")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "panic_alerts",
        },
        (payload) => {
          setPanicAlerts((prev) => [payload.new as PanicAlert, ...prev]);
          toast({
            title: "🚨 New Panic Alert!",
            description: `Alert received from User ${payload.new.user_id}`,
            variant: "destructive",
          });
        }
      )
      .subscribe();

    return () => supabase.removeChannel(panicChannel);
  }, [navigate, toast]);

  /* ----- Fetch panic alerts --------------------------------------- */
  const fetchPanicAlerts = async () => {
    try {
      const { data, error } = await supabase
        .from("panic_alerts")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;

      if (data && data.length) {
        const userIds = [...new Set(data.map((a) => a.user_id))];
        const { data: profiles } = await supabase
          .from("profiles")
          .select("user_id, full_name")
          .in("user_id", userIds);

        const merged = data.map((alert) => ({
          ...alert,
          profiles: profiles?.find((p) => p.user_id === alert.user_id),
        }));
        setPanicAlerts(merged as PanicAlert[]);
      } else {
        setPanicAlerts([]);
      }
      setLoading(false);
    } catch (err: any) {
      toast({
        title: "Error fetching panic alerts",
        description: err.message,
        variant: "destructive",
      });
      setLoading(false);
    }
  };

  /* ----- Fetch user profiles ------------------------------------ */
  const fetchAllUsers = async () => {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setAllUsers(data || []);
    } catch (err: any) {
      toast({
        title: "Error fetching users",
        description: err.message,
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
    } catch (err: any) {
      toast({
        title: "Error resolving alert",
        description: err.message,
        variant: "destructive",
      });
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("adminAuth");
    navigate("/admin");
  };

  /* ----- Loading state ------------------------------------------- */
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-secondary/20 to-accent/10">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-destructive"></div>
      </div>
    );
  }

  /* ----- Main Layout -------------------------------------------- */
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

          {/* ── Dashboard Tab */}
          <TabsContent value="dashboard" className="space-y-6">
            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Active Users</CardTitle>
                  <Users className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  {/* We do not have a real active‑user count from supabase; use the map instead */}
                  <div className="text-2xl font-bold">-</div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
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
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Alerts</CardTitle>
                  <Clock className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{panicAlerts.length}</div>
                </CardContent>
              </Card>
            </div>

            {/* Panic Alerts List */}
            <Card>
              <CardHeader>
                <CardTitle className="text-2xl font-bold flex items-center gap-2">
                  <AlertTriangle className="h-6 w-6 text-destructive" />
                  Panic Alerts
                </CardTitle>
                <CardDescription>
                  Monitor and respond to emergency alerts from users
                </CardDescription>
              </CardHeader>
              <CardContent>
                {panicAlerts.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">
                    No panic alerts
                  </p>
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
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <Badge
                                variant={
                                  alert.status === "active" ? "destructive" : "secondary"
                                }
                              >
                                {alert.status}
                              </Badge>
                              <span className="font-semibold">
                                {alert.profiles?.full_name ?? "Unknown User"}
                              </span>
                              <span className="text-sm text-muted-foreground">
                                {new Date(alert.created_at).toLocaleString()}
                              </span>
                            </div>
                            <p className="text-sm mb-2">{alert.message}</p>
                            <div className="flex items-center gap-4 text-sm text-muted-foreground">
                              <div className="flex items-center gap-1">
                                <MapPin className="h-3 w-3" />
                                {alert.latitude.toFixed(6)},
                                {alert.longitude.toFixed(6)}
                              </div>
                            </div>
                          </div>
                          {alert.status === "active" && (
                            <Button
                              onClick={() => handleResolveAlert(alert.id)}
                              variant="outline"
                              size="sm"
                            >
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

            {/* Live User Locations Map */}
            <AdminMap />

            {/* User Locations List (raw JSON) – optional */}
            <Card>
              <CardHeader>
                <CardTitle className="text-2xl font-bold flex items-center gap-2">
                  <MapPin className="h-6 w-6 text-primary" />
                  User Locations List
                </CardTitle>
                <CardDescription>
                  Recent location updates from all users
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">Map component pulls the data itself.</p>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── User Management Tab */}
          <TabsContent value="users" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-2xl font-bold flex items-center gap-2">
                  <Users className="h-6 w-6 text-primary" />
                  User Management
                </CardTitle>
                <CardDescription>
                  View and manage all registered users and their profiles
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {allUsers.length === 0 ? (
                    <p className="text-muted-foreground text-center py-8">No users found</p>
                  ) : (
                    <div className="grid gap-4">
                      {allUsers.map((user) => (
                        <Card key={user.id} className="hover:shadow-md transition-shadow">
                          <CardContent className="p-6">
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <div className="flex items-center gap-4 mb-4">
                                  <div className="w-12 h-12 bg-gradient-to-br from-primary to-accent rounded-full flex items-center justify-center">
                                    <User className="w-6 h-6 text-white" />
                                  </div>
                                  <div>
                                    <h3 className="text-lg font-semibold">
                                      {user.full_name || "No name provided"}
                                    </h3>
                                    <p className="text-sm text-muted-foreground">
                                      Member since {new Date(user.created_at).toLocaleDateString()}
                                    </p>
                                  </div>
                                </div>

                                <div className="grid md:grid-cols-2 gap-4">
                                  <div className="space-y-2">
                                    <div className="flex items-center gap-2">
                                      <Phone className="w-4 h-4 text-muted-foreground" />
                                      <span className="text-sm">{user.phone || "No phone provided"}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <MapPin className="w-4 h-4 text-muted-foreground" />
                                      <span className="text-sm">
                                        {user.nationality || "No nationality provided"}
                                      </span>
                                    </div>
                                  </div>

                                  <div className="space-y-2">
                                    {user.passport_number && (
                                      <div className="flex items-center gap-2">
                                        <FileText className="w-4 h-4 text-muted-foreground" />
                                        <span className="text-sm">
                                          Passport: {user.passport_number}
                                        </span>
                                      </div>
                                    )}
                                    {user.aadhaar_number && (
                                      <div className="flex items-center gap-2">
                                        <FileText className="w-4 h-4 text-muted-foreground" />
                                        <span className="text-sm">
                                          Aadhaar: {user.aadhaar_number}
                                        </span>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>

                              <div className="flex flex-col gap-2 ml-4">
                                {user.document_url && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => window.open(user.document_url, "_blank")}
                                  >
                                    <FileText className="w-4 h-4 mr-2" />
                                    View Document
                                  </Button>
                                )}
                                <Badge variant={user.nationality ? "default" : "secondary"}>
                                  {user.nationality ? "Verified" : "Incomplete"}
                                </Badge>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Help Desk Tab */}
          <TabsContent value="helpdesk">
            <Card>
              <CardHeader>
                <CardTitle className="text-2xl font-bold flex items-center gap-2">
                  <HelpCircle className="h-6 w-6 text-primary" />
                  Help Desk Management
                </CardTitle>
                <CardDescription>
                  Manage user support tickets and provide assistance.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <AdminHelpDesk />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default AdminDashboard;
