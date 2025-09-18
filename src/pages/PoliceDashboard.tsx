// src/pages/PoliceDashboard.tsx
import React, { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";

// Entities (replace with your actual API clients)
import { User, PanicAlert, eFIR, Geofence } from "@/entities/all";

// UI components
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// Icons
import {
  Shield,
  Users,
  Phone,
  Map,
  Search,
} from "lucide-react";

// Map
import { MapContainer, TileLayer, Marker, Popup, Circle } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

// ✅ Fix leaflet default marker icons
delete (L.Icon.Default as any).prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png",
  iconUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png",
  shadowUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
});

// ✅ Helper: calculate distance (km) between coordinates
function getDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const PoliceDashboard: React.FC = () => {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [policeUser, setPoliceUser] = useState<any>(null);
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [panicAlerts, setPanicAlerts] = useState<any[]>([]);
  const [eFIRs, setEFIRs] = useState<any[]>([]);
  const [geofences, setGeofences] = useState<any[]>([]);
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [mapCenter, setMapCenter] = useState<[number, number]>([
    28.6139,
    77.209,
  ]);
  const mapRef = useRef<any>(null);

  // ✅ Sign out
  const handleLogout = () => {
    toast({
      title: "Signed out",
      description: "You have been logged out.",
    });
    navigate("/police-signin");
  };

  // ✅ Load live user + alert + eFIR data
  const loadLiveData = useCallback(async () => {
    try {
      const [users, alerts, firs] = await Promise.all([
        User.list(),
        PanicAlert.filter({ status: "active" }),
        eFIR.list("-created_date"),
      ]);
      const tourists = users.filter(
        (u: any) =>
          u.email !== "sagnik.saha.raptor@gmail.com" && !u.is_admin
      );
      setAllUsers(tourists);
      setPanicAlerts(alerts);
      setEFIRs(firs);
    } catch (err) {
      console.error("Error loading live data:", err);
    }
  }, []);

  // ✅ Initialize geofences
  const initializeGeofences = useCallback(async () => {
    try {
      const existing = await Geofence.list();
      if (existing.length === 0) {
        const defaults = [
          {
            name: "Delhi Tourist Zone",
            center_location: {
              lat: 28.6139,
              lng: 77.209,
              address: "New Delhi, India",
            },
            radius: 25,
            type: "tourist_zone",
            risk_level: "medium",
          },
          {
            name: "Agra Heritage Area",
            center_location: {
              lat: 27.1751,
              lng: 78.0421,
              address: "Agra, Uttar Pradesh",
            },
            radius: 15,
            type: "tourist_zone",
            risk_level: "low",
          },
        ];
        for (const gf of defaults) await Geofence.create(gf);
        setGeofences(await Geofence.list());
      } else {
        setGeofences(existing);
      }
    } catch (err) {
      console.error("Error initializing geofences:", err);
    }
  }, []);

  // ✅ Init Police Dashboard
  const initializeDashboard = useCallback(async () => {
    try {
      const current = await User.me();
      if (
        current.email !== "sagnik.saha.raptor@gmail.com" &&
        !current.is_admin
      ) {
        alert("Access denied: Police only");
        window.location.href = "/";
        return;
      }
      setPoliceUser(current);
      loadLiveData();
      initializeGeofences();
    } catch (err) {
      console.error("Error initializing dashboard:", err);
      await User.loginWithRedirect(window.location.href);
    }
  }, [loadLiveData, initializeGeofences]);

  useEffect(() => {
    initializeDashboard();
    const interval = setInterval(() => {
      loadLiveData();
    }, 30000);
    return () => clearInterval(interval);
  }, [initializeDashboard, loadLiveData]);

  // ✅ Handle selecting a user
  const handleUserSelect = (user: any) => {
    setSelectedUser(user);
    if (user.current_location?.lat && user.current_location?.lng) {
      const newCenter: [number, number] = [
        user.current_location.lat,
        user.current_location.lng,
      ];
      setMapCenter(newCenter);
      if (mapRef.current) mapRef.current.flyTo(newCenter, 15);
    }
  };

  // ✅ Marker color logic
  const getUserIcon = (user: any) => {
    let color = "#10b981";
    if (user.status === "panic") color = "#ef4444";
    else if (user.status === "danger") color = "#f59e0b";
    else if (user.status === "warning") color = "#eab308";

    const hasActiveFIR = eFIRs.some(
      (f) =>
        f.user_email === user.email &&
        f.status !== "found" &&
        f.status !== "closed"
    );
    if (hasActiveFIR) color = "#8b5cf6";

    return L.divIcon({
      className: "custom-user-marker",
      html: `<div class="flex items-center justify-center w-4 h-4 rounded-full border-2 border-white shadow-lg" style="background-color: ${color}">
               <div class="w-2 h-2 rounded-full bg-white"></div>
             </div>`,
      iconSize: [16, 16],
      iconAnchor: [8, 8],
    });
  };

  // ✅ Filter users
  const filteredUsers = allUsers.filter((u) => {
    const matchSearch =
      !searchQuery ||
      u.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.email?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchStatus = statusFilter === "all" || u.status === statusFilter;
    return matchSearch && matchStatus;
  });

  // ✅ Require auth
  if (!policeUser) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
        <Card className="p-8 text-center">
          <Shield className="w-16 h-16 text-blue-600 mx-auto mb-4" />
          <h2 className="text-2xl font-bold mb-4">Police Command Center</h2>
          <p className="text-gray-600">
            Authentication required for law enforcement access
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 bg-blue-600 rounded-lg flex items-center justify-center">
            <Shield className="w-8 h-8 text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-bold">Police Command Center</h1>
            <p className="text-gray-600">
              Live monitoring • Tourist safety • Emergency response
            </p>
          </div>
        </div>

        {/* Alerts */}
        {panicAlerts.length > 0 && (
          <Alert className="mb-6 border-red-200 bg-red-50">
            <Phone className="h-4 w-4 text-red-600 animate-bounce" />
            <AlertDescription className="text-red-800">
              <strong>EMERGENCY:</strong> {panicAlerts.length} active panic
              alert(s)
            </AlertDescription>
          </Alert>
        )}

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Users */}
          <Card className="lg:col-span-1">
            <CardHeader className="bg-blue-600 text-white">
              <CardTitle className="flex items-center gap-2">
                <Users className="w-5 h-5" /> Live User Tracking (
                {filteredUsers.length})
              </CardTitle>
              <div className="flex gap-2 mt-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                  <Input
                    placeholder="Search users..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9 bg-white"
                  />
                </div>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-32 bg-white">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="safe">Safe</SelectItem>
                    <SelectItem value="warning">Warning</SelectItem>
                    <SelectItem value="danger">Danger</SelectItem>
                    <SelectItem value="panic">Panic</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent className="p-0 max-h-[600px] overflow-y-auto">
              {filteredUsers.map((u) => (
                <div
                  key={u.id}
                  onClick={() => handleUserSelect(u)}
                  className={`p-4 border-b cursor-pointer hover:bg-blue-50 ${
                    selectedUser?.id === u.id ? "bg-blue-100" : ""
                  }`}
                >
                  <p className="font-medium">{u.full_name || "Unknown"}</p>
                  <p className="text-xs text-gray-500">{u.email}</p>
                </div>
              ))}
            </CardContent>
            <CardContent>
              <Button onClick={handleLogout} className="mt-4 w-full">
                <Shield className="mr-2 h-4 w-4" /> Sign out
              </Button>
            </CardContent>
          </Card>

          {/* Map */}
          <Card className="lg:col-span-2">
            <CardHeader className="bg-blue-600 text-white">
              <CardTitle className="flex items-center gap-2">
                <Map className="w-5 h-5" /> Real-Time Map
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="h-[600px]">
                <MapContainer
                  ref={mapRef}
                  center={mapCenter}
                  zoom={6}
                  className="h-full w-full"
                >
                  <TileLayer
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    attribution="&copy; OpenStreetMap contributors"
                  />
                  {geofences.map((gf) => (
                    <Circle
                      key={gf.id}
                      center={[gf.center_location.lat, gf.center_location.lng]}
                      radius={gf.radius * 1000}
                      pathOptions={{
                        color:
                          gf.risk_level === "high"
                            ? "#ef4444"
                            : gf.risk_level === "medium"
                            ? "#f59e0b"
                            : "#10b981",
                        fillOpacity: 0.1,
                      }}
                    />
                  ))}
                  {allUsers.map(
                    (u) =>
                      u.current_location?.lat && (
                        <Marker
                          key={u.id}
                          position={[
                            u.current_location.lat,
                            u.current_location.lng,
                          ]}
                          icon={getUserIcon(u)}
                        >
                          <Popup>{u.email}</Popup>
                        </Marker>
                      )
                  )}
                </MapContainer>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default PoliceDashboard;
