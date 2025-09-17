import { useEffect, useRef, useState } from "react";
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
  const mapRef = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<google.maps.Map | null>(null);
  const [markers, setMarkers] = useState<google.maps.Marker[]>([]);

  useEffect(() => {
    if (typeof google === 'undefined' || !mapRef.current) return;

    const mapInstance = new google.maps.Map(mapRef.current, {
      center: { lat: 20.5937, lng: 78.9629 }, // Center of India
      zoom: 5,
      styles: [
        {
          featureType: 'all',
          stylers: [{ saturation: -20 }]
        }
      ]
    });

    setMap(mapInstance);
  }, []);

  useEffect(() => {
    if (!map || !userLocations.length) return;

    // Clear existing markers
    markers.forEach(marker => marker.setMap(null));
    
    // Create new markers for user locations
    const newMarkers = userLocations.map(location => {
      const marker = new google.maps.Marker({
        position: { lat: Number(location.latitude), lng: Number(location.longitude) },
        map: map,
        title: location.profiles?.full_name || 'Unknown User',
        icon: {
          url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(`
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" fill="#dc2626"/>
              <circle cx="12" cy="9" r="2.5" fill="white"/>
            </svg>
          `),
          scaledSize: new google.maps.Size(24, 24)
        }
      });

      // Add info window
      const infoWindow = new google.maps.InfoWindow({
        content: `
          <div style="padding: 8px;">
            <h3 style="margin: 0 0 4px 0; font-weight: bold;">${location.profiles?.full_name || 'Unknown User'}</h3>
            <p style="margin: 0; font-size: 12px; color: #666;">
              Last seen: ${new Date(location.created_at).toLocaleString()}
            </p>
            <p style="margin: 4px 0 0 0; font-size: 12px; color: #666;">
              ${location.latitude.toFixed(6)}, ${location.longitude.toFixed(6)}
            </p>
          </div>
        `
      });

      marker.addListener('click', () => {
        infoWindow.open(map, marker);
      });

      return marker;
    });

    setMarkers(newMarkers);

    // Adjust map bounds to fit all markers
    if (newMarkers.length > 0) {
      const bounds = new google.maps.LatLngBounds();
      newMarkers.forEach(marker => {
        const position = marker.getPosition();
        if (position) bounds.extend(position);
      });
      map.fitBounds(bounds);
    }
  }, [map, userLocations]);

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
        <div 
          ref={mapRef} 
          className="w-full h-96 rounded-lg border"
          style={{ minHeight: '400px' }}
        />
        {userLocations.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center bg-muted/10 rounded-lg">
            <p className="text-muted-foreground">No user locations available</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default AdminMap;