// src/pages/PoliceDashboard.tsx

import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
} from "react";

import {
  User,
  PanicAlert,
  eFIR,
  Geofence,
} from "@/entities/all";

import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Circle,
} from "react-leaflet";

import {
  Card,
  CardHeader,
  CardContent,
  CardTitle,
} from "@/components/ui/card";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import { Alert, AlertDescription } from "@/components/ui/alert";

import {
  Shield,
  Users,
  Phone,
  Map,
  Activity,
  Clock,
  FileText,
  CheckCircle,
  UserX,
  Navigation,
  Search,
} from "lucide-react";

import { format } from "date-fns";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import "leaflet/dist/leaflet.css";
import L from "leaflet";

/* ------------------------------------------------------------------ */
/* • Leaflet – fix marker icon URLs that are broken inside Webpack   */
/* ------------------------------------------------------------------ */
(L.Icon.Default as any).prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png",
  iconUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png",
  shadowUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
});

/* ------------------------------------------------------------------ */
/* • Utility – Haversine distance (km) between two lat/lng points     */
/* ------------------------------------------------------------------ */
const getDistanceKm = (
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
) => {
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

/* ------------------------------------------------------------------ */
/* • PoliceDashboard Component                                         */
/* ------------------------------------------------------------------ */
export default function PoliceDashboard() {
  const navigate = useNavigate();
  const { toast } = useToast();

  /* ------------ State ------- */
  const [policeUser, setPoliceUser] = useState<any>(null);
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [panicAlerts, setPanicAlerts] = useState<any[]>([]);
  const [efirs, setEfirs] = useState<any[]>([]);
  const [geofences, setGeofences] = useState<any[]>([]);
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  /* ------------ Map refs ------- */
  const mapRef = useRef<any>(null);
  const [mapCenter, setMapCenter] = useState<[number, number]>([
    28.6139,
    77.209,
  ]);

  /* ------------ Helper – Marker icon --------- */
  const getUserIcon = (user: any) => {
    // Default colour – green (safe)
    let color = "#10b981";

    // Override based on status
    if (user.status === "panic") color = "#ef4444";
    else if (user.status === "danger") color = "#f59e0b";
    else if (user.status === "warning") color = "#eab308";

    // Override if the user has an active e‑FIR
    const hasActiveFIR = efirs.some(
      (f: any) =>
        f.user_email === user.email &&
        !["found", "closed"].includes(f.status)
    );
    if (hasActiveFIR) color = "#8b5cf6";

    // Return a custom DIV icon.  The `html` property expects a string.
    const html = `<div style="
          background-color:${color};
          width:16px;
          height:16px;
          border-radius:50%;
          border:2px solid white;
          display:flex;
          align-items:center;
          justify-content:center;
          ">
          <div style="background:white;width:8px;height:8px;border-radius:50%;"></div>
        </div>`;

    return L.divIcon({
      className: "custom-user-marker",
      html,
      iconSize: [16, 16],
      iconAnchor: [8, 8],
      popupAnchor: [0, -8],
    });
  };

  /* ------------ API helpers --------- */
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
      setEfirs(firs);
    } catch (err) {
      console.error("Error loading live data:", err);
    }
  }, []);

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

  const initializeDashboard = useCallback(async () => {
    try {
      const current = await User.me();
      // Very basic auth check – you should replace this with real logic
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
      // Ask the auth provider to log the user back in
      await User.loginWithRedirect(window.location.href);
    }
  }, [loadLiveData, initializeGeofences]);

  /* ------------ Effects --------- */
  useEffect(() => {
    initializeDashboard();

    // Refresh live data every 30 seconds
    const interval = setInterval(() => {
      loadLiveData();
    }, 30000);

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initializeDashboard, loadLiveData]);

  /* ------------ User selection handler  --------- */
  const handleUserSelect = (user: any) => {
    setSelectedUser(user);
    if (user.current_location?.lat && user.current_location?.lng) {
      const newCenter: [number, number] = [
        user.current_location.lat,
        user.current_location.lng,
      ];
      setMapCenter(newCenter);
      mapRef.current?.flyTo(newCenter, 15);
    }
  };

  /* ------------ Sign‑out handler --------- */
  const handleLogout = () => {
    // Replace with your real logout logic, e.g. supabase.auth.signOut()
    toast({
      title: "Signed out",
      description: "You have been logged out.",
    });
    navigate("/police-signin");
  };

  /* ------------ Filtered user list --------- */
  const filteredUsers = allUsers.filter((u) => {
    const matchesSearch =
      !searchQuery ||
      u.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.email?.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus =
      statusFilter === "all" || u.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  /* ------------------------------------------------------------------ */
  /* ----------------------------- Render -------------------------------- */
  /* ------------------------------------------------------------------ */
  // If we haven't fetched the police user yet, show a loading screen
  if (!policeUser) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-6">
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

  // Main dashboard UI
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-6">
      <Card className="w-full max-w-4xl">
        {/* Header */}
        <CardHeader className="text-center">
          <CardTitle className="text-3xl font-bold text-blue-700">
            Officer Dashboard
          </CardTitle>
        </CardHeader>

        <CardContent>
          <p className="mb-6 text-lg">
            Welcome to the police command center. Here you can view cases,
            monitor patrol schedules, and access official resources.
          </p>

          {/* Panic alert banner */}
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
            {/* User list */}
            <Card className="lg:col-span-1">
              <CardHeader className="bg-blue-600 text-white">
                <CardTitle className="flex items-center gap-2">
                  <Users className="w-5 h-5" />
                  Live User Tracking ({filteredUsers.length})
                </CardTitle>

                <div className="flex gap-2 mt-3">
                  {/* Search */}
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                    <Input
                      placeholder="Search users..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-9 bg-white"
                    />
                  </div>

                  {/* Status filter */}
                  <Select
                    value={statusFilter}
                    onValueChange={setStatusFilter}
                  >
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
            </Card>

            {/* Sign‑out button */}
            <Button onClick={handleLogout} className="mt-4">
              <Shield className="mr-2 h-4 w-4" />
              Sign out
            </Button>
          </div>

          {/* Map */}
          <Card className="lg:col-span-2 mt-6">
            <CardHeader className="bg-blue-600 text-white">
              <CardTitle className="flex items-center gap-2">
                <Map className="w-5 h-5" />
                Real‑Time Map
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

                  {/* Geofences */}
                  {geofences.map((gf) => (
                    <Circle
                      key={gf.id}
                      center={[
                        gf.center_location.lat,
                        gf.center_location.lng,
                      ]}
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

                  {/* User markers */}
                  {allUsers.map((u) =>
                    u.current_location?.lat &&
                    typeof u.current_location.lat === "number" &&
                    typeof u.current_location.lng === "number" ? (
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
                    ) : null
                  )}
                </MapContainer>
              </div>
            </CardContent>
          </Card>
        </CardContent>
      </Card>
    </div>
  );
}
