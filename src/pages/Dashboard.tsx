import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { AlertTriangle, LogOut, MapPin, Shield, User, Clock, Plus, Trash2 } from "lucide-react";

interface AppUser {
  id: string;
  email?: string;
}

interface UserLocation {
  id: string;
  user_id: string;
  latitude: number;
  longitude: number;
  created_at: string;
}

interface PanicAlert {
  id: string;
  user_id: string;
  message: string;
  latitude: number;
  longitude: number;
  status: string;
  created_at: string;
}

interface Destination {
  id: string;
  user_id: string;
  name: string;
  latitude: number | null;
  longitude: number | null;
  created_at: string;
}

const Dashboard = () => {
  const [user, setUser] = useState<AppUser | null>(null);
  const [userLocations, setUserLocations] = useState<UserLocation[]>([]);
  const [panicAlerts, setPanicAlerts] = useState<PanicAlert[]>([]);
  const [destinations, setDestinations] = useState<Destination[]>([]);
  const [currentLocation, setCurrentLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [panicMessage, setPanicMessage] = useState("");
  const [newDestination, setNewDestination] = useState("");
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    // Check authentication
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate("/signin");
        return;
      }
      setUser(session.user);
      setLoading(false);
    };

    checkAuth();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT' || !session) {
        navigate("/signin");
      } else {
        setUser(session.user);
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  useEffect(() => {
    if (!user) return;
    
    fetchDestinations();
    fetchUserLocations();
    fetchPanicAlerts();
    startLocationTracking();
  }, [user]);

  const fetchDestinations = async () => {
    try {
      const { data, error } = await supabase
        .from("destinations")
        .select("*")
        .eq("user_id", user?.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setDestinations(data || []);
    } catch (error: any) {
      toast({
        title: "Error fetching destinations",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const fetchUserLocations = async () => {
    try {
      const { data, error } = await supabase
        .from("user_locations")
        .select("*")
        .eq("user_id", user?.id)
        .order("created_at", { ascending: false })
        .limit(10);

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
        .select("*")
        .eq("user_id", user?.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setPanicAlerts(data || []);
    } catch (error: any) {
      toast({
        title: "Error fetching panic alerts",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const startLocationTracking = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          setCurrentLocation({ latitude, longitude });
          saveUserLocation(latitude, longitude);
        },
        (error) => {
          console.error("Error getting location:", error);
          toast({
            title: "Location Error",
            description: "Unable to get your current location",
            variant: "destructive",
          });
        }
      );

      // Update location every 30 seconds
      const locationInterval = setInterval(() => {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            const { latitude, longitude } = position.coords;
            setCurrentLocation({ latitude, longitude });
            saveUserLocation(latitude, longitude);
          },
          (error) => console.error("Error updating location:", error)
        );
      }, 30000);

      return () => clearInterval(locationInterval);
    }
  };

  const saveUserLocation = async (latitude: number, longitude: number) => {
    try {
      const { error } = await supabase
        .from("user_locations")
        .insert([{ user_id: user?.id, latitude, longitude }]);

      if (error) throw error;
    } catch (error: any) {
      console.error("Error saving location:", error);
    }
  };

  const handlePanicAlert = async () => {
    if (!currentLocation) {
      toast({
        title: "Location Required",
        description: "Please enable location services to send panic alert",
        variant: "destructive",
      });
      return;
    }

    try {
      const { error } = await supabase
        .from("panic_alerts")
        .insert([{
          user_id: user?.id,
          message: panicMessage || "Emergency assistance needed",
          latitude: currentLocation.latitude,
          longitude: currentLocation.longitude,
          status: "active"
        }]);

      if (error) throw error;

      toast({
        title: "🚨 Panic Alert Sent!",
        description: "Emergency services have been notified of your location",
        variant: "destructive",
      });

      setPanicMessage("");
      fetchPanicAlerts();
    } catch (error: any) {
      toast({
        title: "Error sending panic alert",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const addDestination = async () => {
    if (!newDestination.trim()) return;

    try {
      const { error } = await supabase
        .from("destinations")
        .insert([{
          user_id: user?.id,
          name: newDestination.trim(),
          latitude: currentLocation?.latitude || null,
          longitude: currentLocation?.longitude || null
        }]);

      if (error) throw error;

      toast({
        title: "Destination Added",
        description: `${newDestination} has been added to your destinations`,
      });

      setNewDestination("");
      fetchDestinations();
    } catch (error: any) {
      toast({
        title: "Error adding destination",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const deleteDestination = async (id: string) => {
    try {
      const { error } = await supabase
        .from("destinations")
        .delete()
        .eq("id", id);

      if (error) throw error;

      toast({
        title: "Destination Removed",
        description: "Destination has been deleted",
      });

      fetchDestinations();
    } catch (error: any) {
      toast({
        title: "Error deleting destination",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/");
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-secondary/20 to-accent/10">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary"></div>
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
              <div className="w-10 h-10 bg-gradient-to-br from-primary to-accent rounded-full flex items-center justify-center">
                <User className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                  Tourist Dashboard
                </h1>
                <p className="text-sm text-muted-foreground">
                  Welcome, {user?.email}
                </p>
              </div>
            </div>
            <Button
              onClick={handleLogout}
              variant="outline"
              className="flex items-center space-x-2"
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
          {/* Emergency Panic Button */}
          <Card className="border-destructive">
            <CardHeader>
              <CardTitle className="text-2xl font-bold flex items-center gap-2 text-destructive">
                <AlertTriangle className="h-6 w-6" />
                Emergency Alert
              </CardTitle>
              <CardDescription>
                Send an immediate panic alert to emergency services with your current location
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="panic-message">Emergency Message (Optional)</Label>
                <Input
                  id="panic-message"
                  placeholder="Describe your emergency..."
                  value={panicMessage}
                  onChange={(e) => setPanicMessage(e.target.value)}
                />
              </div>
              <Button
                onClick={handlePanicAlert}
                className="w-full bg-destructive hover:bg-destructive/90 text-white font-bold py-6 text-lg"
                size="lg"
              >
                <AlertTriangle className="w-5 h-5 mr-2" />
                SEND PANIC ALERT
              </Button>
            </CardContent>
          </Card>

          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Destinations</CardTitle>
                <MapPin className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{destinations.length}</div>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Active Alerts</CardTitle>
                <AlertTriangle className="h-4 w-4 text-destructive" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-destructive">
                  {panicAlerts.filter(a => a.status === 'active').length}
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Location Updates</CardTitle>
                <Clock className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{userLocations.length}</div>
              </CardContent>
            </Card>
          </div>

          {/* Destinations Management */}
          <Card>
            <CardHeader>
              <CardTitle className="text-2xl font-bold flex items-center gap-2">
                <MapPin className="h-6 w-6 text-primary" />
                My Destinations
              </CardTitle>
              <CardDescription>
                Manage your travel destinations
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Input
                  placeholder="Add a new destination..."
                  value={newDestination}
                  onChange={(e) => setNewDestination(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && addDestination()}
                />
                <Button onClick={addDestination}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              
              {destinations.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">No destinations added yet</p>
              ) : (
                <div className="space-y-2">
                  {destinations.map((destination) => (
                    <div
                      key={destination.id}
                      className="flex items-center justify-between p-3 rounded-lg border bg-card"
                    >
                      <div>
                        <div className="font-semibold">{destination.name}</div>
                        <div className="text-sm text-muted-foreground">
                          Added: {new Date(destination.created_at).toLocaleDateString()}
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => deleteDestination(destination.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Current Location */}
          <Card>
            <CardHeader>
              <CardTitle className="text-2xl font-bold flex items-center gap-2">
                <Shield className="h-6 w-6 text-primary" />
                Current Location
              </CardTitle>
              <CardDescription>
                Your real-time location for safety monitoring
              </CardDescription>
            </CardHeader>
            <CardContent>
              {currentLocation ? (
                <div className="space-y-2">
                  <p><strong>Latitude:</strong> {currentLocation.latitude.toFixed(6)}</p>
                  <p><strong>Longitude:</strong> {currentLocation.longitude.toFixed(6)}</p>
                  <p className="text-sm text-muted-foreground">
                    Location is being tracked for your safety and updated every 30 seconds
                  </p>
                </div>
              ) : (
                <p className="text-muted-foreground">Location not available</p>
              )}
            </CardContent>
          </Card>

          {/* Recent Panic Alerts */}
          {panicAlerts.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-2xl font-bold flex items-center gap-2">
                  <AlertTriangle className="h-6 w-6 text-destructive" />
                  Your Recent Alerts
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {panicAlerts.slice(0, 5).map((alert) => (
                    <div
                      key={alert.id}
                      className={`p-4 rounded-lg border ${
                        alert.status === 'active' ? 'border-destructive bg-destructive/5' : 'border-muted'
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <Badge variant={alert.status === 'active' ? 'destructive' : 'secondary'}>
                              {alert.status}
                            </Badge>
                            <span className="text-sm text-muted-foreground">
                              {new Date(alert.created_at).toLocaleString()}
                            </span>
                          </div>
                          <p className="text-sm mb-2">{alert.message}</p>
                          <div className="text-sm text-muted-foreground">
                            Location: {alert.latitude.toFixed(6)}, {alert.longitude.toFixed(6)}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </main>
    </div>
  );
};

export default Dashboard;