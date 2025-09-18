import "leaflet/dist/leaflet.css";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MapPin, Users } from "lucide-react";
import { MapContainer, Marker, Popup, TileLayer } from "react-leaflet";
import L from "leaflet";

/* ------------------------------------------------------------------ */
/*  Default Marker icon workaround (necessary for Webpack/CRA)       */
/* ------------------------------------------------------------------ */
delete (L.Icon.Default.prototype as any)._getIconUrl;

L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl:
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl:
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

/* ------------------------------------------------------------------ */
/*  Types                                                          */
/* ------------------------------------------------------------------ */
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

/* ------------------------------------------------------------------ */
/*  Map Component                                                  */
/* ------------------------------------------------------------------ */
const AdminMap = ({ userLocations }: AdminMapProps) => {
  /* Pick an arbitrary map centre when no data is available. */
  const center = userLocations.length
    ? {
        lat: userLocations[0].latitude,
        lng: userLocations[0].longitude,
      }
    : { lat: 0, lng: 0 };

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
          <div className="flex flex-col items-center justify-center h-80 text-center text-muted-foreground">
            <MapPin className="h-16 w-16 mx-auto" />
            <h3 className="text-lg font-semibold mt-4">
              Interactive Map Coming Soon
            </h3>
            <p className="mt-2">Google Maps integration will be available in the next update</p>
            <p className="mt-2 text-sm">
              Currently tracking 0 user locations
            </p>
          </div>
        ) : (
          <MapContainer
            center={[center.lat, center.lng]}
            zoom={13}
            scrollWheelZoom={true}
            className="w-full h-96 rounded-lg border bg-muted/10"
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />

            {userLocations.map((loc) => (
              <Marker key={loc.id} position={[loc.latitude, loc.longitude]}>
                <Popup>
                  <div className="space-y-1">
                    <div className="font-semibold">
                      {loc.profiles?.full_name || "Unknown User"}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {new Date(loc.created_at).toLocaleString()}
                    </div>
                  </div>
                </Popup>
              </Marker>
            ))}
          </MapContainer>
        )}
      </CardContent>
    </Card>
  );
};

export default AdminMap;
