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
        <div className="w-full h-96 rounded-lg border bg-muted/10 flex items-center justify-center">
          <div className="text-center space-y-4">
            <MapPin className="h-16 w-16 text-muted-foreground mx-auto" />
            <div>
              <h3 className="text-lg font-semibold">Interactive Map Coming Soon</h3>
              <p className="text-muted-foreground">Google Maps integration will be available in the next update</p>
            </div>
            {userLocations.length > 0 && (
              <div className="text-sm text-muted-foreground">
                Currently tracking {userLocations.length} user locations
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default AdminMap;