/* src/pages/admin-dashboard.tsx */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

/* UI components ------------------------------------------------ */
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";

/* Icons ------------------------------------------------------- */
import {
  Shield,
  LogOut,
  AlertTriangle,
  MapPin,
  Users,
  Clock,
  HelpCircle,
  Phone,
  FileText,
  User,                     /* <‑‑ added missing import */
} from "lucide-react";

/* Custom component imports ------------------------------------ */
import AdminMap from "@/components/AdminMap";
import AdminHelpDesk from "@/components/AdminHelpDesk";

/* Types -------------------------------------------------------- */
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

const AdminDashboard = () => {
  /* ---------- State ---------- */
  const navigate = useNavigate();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"dashboard" | "users" | "helpdesk">(
    "dashboard",
  );

  const [panicAlerts, setPanicAlerts] = useState<PanicAlert[]>([]);
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [activeUsersCount, setActiveUsersCount] = useState(0);

  /* ---------- Auth & data fetch ---------- */
  useEffect(() => {
    /* Auth check */
    if (!localStorage.getItem("adminAuth")) {
      navigate("/admin");
      return;
    }

    /* Local data fetch */
    const fetchPanicAlerts = async () => {
      const { data, error } = await supabase
        .from("panic_alerts")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;

      const userIds = [
        ...new Set((data ?? []).map((a: any) => a.user_id)),
      ];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, full_name")
        .in("user_id", userIds);

      const merged = (data ?? []).map((a: any) => ({
        ...a,
        profiles: profiles?.find((p: any) => p.user_id === a.user_id),
      }));
      setPanicAlerts(merged as PanicAlert[]);
      setLoading(false);
    };

    const fetchAllUsers = async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setAllUsers(data ?? []);
    };

    /* Realtime – new panic alerts */
    const alertChannel = supabase
      .channel("panic-alerts")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "panic_alerts" },
        (payload) => {
          setPanicAlerts((prev) => [
            payload.new as PanicAlert,
            ...prev,
          ]);
          toast({
            title: "🚨 New Panic Alert!",
            description: `Alert from User ${payload.new.user_id}`,
            variant: "destructive",
          });
        },
      )
      .subscribe();

    /* Realtime – active users count */
    const userChannel = supabase
      .channel("profile-changes")
      .on(
        "postgres_changes",
        { table: "profiles", schema: "public" },
        async () => {
          const { count } = await supabase
            .from("profiles")
            .select("*", { count: "exact" })
            .eq("is_active", true);
          setActiveUsersCount(count ?? 0);
        },
      )
      .subscribe();

    /* Initial data & count */
    const init = async () => {
      const { count } = await supabase
        .from("profiles")
        .select("*", { count: "exact" })
        .eq("is_active", true);
      setActiveUsersCount(count ?? 0);
      await fetchPanicAlerts();
      await fetchAllUsers();
    };
    init();

    /* Cleanup */
    return () => {
      alertChannel.unsubscribe();
      userChannel.unsubscribe();
    };
  }, [navigate, toast]);

  /* ---------- Alert resolution ---------- */
  const handleResolveAlert = async (alertId: string) => {
    const { error } = await supabase
      .from("panic_alerts")
      .update({ status: "resolved" })
      .eq("id", alertId);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }

    setPanicAlerts((prev) =>
      prev.map((a) => (a.id === alertId ? { ...a, status: "resolved" } : a)),
    );
    toast({ title: "Alert Resolved" });
  };

  /* ---------- Logout ---------- */
  const handleLogout = () => {
    localStorage.removeItem("adminAuth");
    navigate("/admin");
  };

  /* ---------- Loading skeleton ---------- */
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-secondary/20 to-accent/10">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-destructive" />
      </div>
    );
  }

  /* ---------- Main UI ---------- */
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

      {/* Main content */}
      <main className="container mx-auto px-4 py-8">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          {/* Tabs list */}
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
            <TabsTrigger value="users">User Management</TabsTrigger>
            <TabsTrigger value="helpdesk">Help Desk</TabsTrigger>
          </TabsList>

          {/* Dashboard tab */}
          <TabsContent value="dashboard" className="space-y-6">
            {/* Stats cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card>
                <CardHeader className="flex items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium">Active Users</CardTitle>
                  <Users className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent className="text-2xl font-bold">{activeUsersCount}</CardContent>
              </Card>

              <Card>
                <CardHeader className="flex items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium">Panic Alerts</CardTitle>
                  <AlertTriangle className="h-4 w-4 text-destructive" />
                </CardHeader>
                <CardContent className="text-2xl font-bold text-destructive">
                  {panicAlerts.filter((a) => a.status === "active").length}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium">Total Alerts</CardTitle>
                  <Clock className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent className="text-2xl font-bold">{panicAlerts.length}</CardContent>
              </Card>
            </div>

            {/* Alerts list */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-2xl font-bold">
                  <AlertTriangle className="h-6 w-6 text-destructive" />
                  Panic Alerts
                </CardTitle>
                <CardDescription>
                  Monitor & respond to emergency alerts.
                </CardDescription>
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
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <Badge variant={alert.status === "active" ? "destructive" : "secondary"}>
                                {alert.status}
                              </Badge>
                              <strong>{alert.profiles?.full_name ?? "Unknown User"}</strong>
                              <span className="text-sm text-muted-foreground">
                                {new Date(alert.created_at).toLocaleString()}
                              </span>
                            </div>
                            <p className="text-sm mb-2">{alert.message}</p>
                            <div className="flex items-center gap-1 text-sm text-muted-foreground">
                              <MapPin className="h-3 w-3" />
                              {alert.latitude.toFixed(6)},{alert.longitude.toFixed(6)}
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

            {/* Map */}
            <AdminMap />

            {/* Info card */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-2xl font-bold">
                  <MapPin className="h-6 w-6 text-primary" />
                  User Locations List
                </CardTitle>
                <CardDescription>
                  The map component pulls all user locations directly.
                </CardDescription>
              </CardHeader>
              <CardContent className="text-muted-foreground text-center py-8">
                Pulls live data from the database.
              </CardContent>
            </Card>
          </TabsContent>

          {/* User Management tab */}
          <TabsContent value="users" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-2xl font-bold">
                  <Users className="h-6 w-6 text-primary" />
                  User Management
                </CardTitle>
                <CardDescription>
                  View & manage all registered profiles.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {allUsers.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">No users found</p>
                ) : (
                  <div className="grid gap-4">
                    {allUsers.map((user) => (
                      <Card
                        key={user.id}
                        className="transition-shadow hover:shadow-md"
                      >
                        <CardContent className="p-6">
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-4 mb-4">
                                <div className="w-12 h-12 bg-gradient-to-br from-primary to-accent rounded-full flex items-center justify-center">
                                  <User className="text-white w-6 h-6" />
                                </div>
                                <div>
                                  <h3 className="text-lg font-semibold">
                                    {user.full_name || "No name provided"}
                                  </h3>
                                  <p className="text-sm text-muted-foreground">
                                    Member since{" "}
                                    {format(
                                      new Date(user.created_at),
                                      "MMM d, yyyy",
                                    )}
                                  </p>
                                </div>
                              </div>

                              <div className="grid md:grid-cols-2 gap-4 text-sm text-muted-foreground">
                                <div className="flex items-center gap-2">
                                  <Phone className="w-4 h-4" />
                                  <span>{user.phone || "No phone"}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <MapPin className="w-4 h-4" />
                                  <span>{user.nationality || "No nationality"}</span>
                                </div>
                                {user.passport_number && (
                                  <div className="flex items-center gap-2">
                                    <FileText className="w-4 h-4" />
                                    <span>{user.passport_number}</span>
                                  </div>
                                )}
                                {user.aadhaar_number && (
                                  <div className="flex items-center gap-2">
                                    <FileText className="w-4 h-4" />
                                    <span>{user.aadhaar_number}</span>
                                  </div>
                                )}
                              </div>
                            </div>

                            <div className="flex flex-col gap-2 ml-4">
                              {user.document_url && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() =>
                                    window.open(user.document_url, "_blank")
                                  }
                                >
                                  <FileText className="w-4 h-4 mr-2" />
                                  View Document
                                </Button>
                              )}
                              <Badge
                                variant={user.nationality ? "default" : "secondary"}
                              >
                                {user.nationality ? "Verified" : "Incomplete"}
                              </Badge>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Help Desk tab */}
          <TabsContent value="helpdesk">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-2xl font-bold">
                  <HelpCircle className="h-6 w-6 text-primary" />
                  Help Desk Management
                </CardTitle>
                <CardDescription>
                  Manage support tickets and provide assistance.
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
