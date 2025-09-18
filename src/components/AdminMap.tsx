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

const AdminMap = ({ userLocations }: AdminMapProps) => {
  // Fallback center: India
  const defaultCenter = { lat: 20.5937, lng: 78.9629 };

  // If users exist, use first one as center
  const center = userLocations.length
    ? { lat: userLocations[0].latitude, lng: userLocations[0].longitude }
    : defaultCenter;

  // Build OSM URL (only centers on one location)
  const mapUrl = `https://www.openstreetmap.org/export/embed.html?bbox=${
    center.lng - 0.5
  }%2C${center.lat - 0.5}%2C${center.lng + 0.5}%2C${center.lat + 0.5}&layer=mapnik&marker=${
    center.lat
  }%2C${center.lng}`;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-2xl font-bold flex items-center gap-2">
          <MapPin className="h-6 w-6 text-primary" />
          Live User Locations
        </CardTitle>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Users className="h-4 w-4" />
          {userLocations.length} active users
        </div>
      </CardHeader>
      <CardContent>
        <div className="w-full h-96 rounded-lg overflow-hidden">
          <iframe
            title="User Locations"
            width="100%"
            height="100%"
            frameBorder="0"
            scrolling="no"
            src={mapUrl}
          ></iframe>
        </div>
      </CardContent>
    </Card>
  );
};

export default AdminMap;
