import { useState } from "react";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MapPin, Users } from "lucide-react";

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

interface AdminMapProps {
  userLocations: UserLocation[];
}

// Fix default marker icons (Leaflet bug in React)
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
});

const AdminMap = ({ userLocations }: AdminMapProps) => {
  const [selectedUser, setSelectedUser] = useState<string | null>(null);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-2xl font-bold flex items-center gap-2">
          <MapPin className="h-6 w-6 text-primary" />
          Live User Locations Map
        </CardTitle>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Users className="h-4 w-4" />
          {userLocations.length} active users
        </div>
      </CardHeader>
      <CardContent>
        {userLocations.length === 0 ? (
          <div className="w-full h-96 flex items-center justify-center text-muted-foreground">
            No user locations available
          </div>
        ) : (
          <MapContainer
            center={[userLocations[0].latitude, userLocations[0].longitude]}
            zoom={5}
            style={{ height: "400px", width: "100%", borderRadius: "12px" }}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            {userLocations.map((loc) => (
              <Marker
                key={loc.id}
                position={[loc.latitude, loc.longitude]}
                eventHandlers={{
                  click: () => setSelectedUser(loc.id),
                }}
              >
                {selectedUser === loc.id && (
                  <Popup>
                    <div className="text-sm">
                      <h3 className="font-semibold">
                        {loc.profiles?.full_name || "Unknown User"}
                      </h3>
                      <p>
                        Lat: {loc.latitude.toFixed(6)}, Lng:{" "}
                        {loc.longitude.toFixed(6)}
                      </p>
                      <p className="text-muted-foreground">
                        {new Date(loc.created_at).toLocaleString()}
                      </p>
                    </div>
                  </Popup>
                )}
              </Marker>
            ))}
          </MapContainer>
        )}
      </CardContent>
    </Card>
  );
};

export default AdminMap;
