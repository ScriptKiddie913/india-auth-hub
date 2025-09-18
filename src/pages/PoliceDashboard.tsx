/* src/pages/PoliceDashboard.tsx */
import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Shield, LogOut, AlertTriangle } from "lucide-react";

import EFIRForm from "@/components/EFIRForm";
import PanicAlerts from "@/components/PanicAlerts";

const PoliceDashboard: React.FC = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const mapRef = useRef<HTMLDivElement | null>(null);

  /* -------- Authentication -------- */
  const [authState, setAuthState] = useState<"loading" | "auth" | "no-auth">(
    "loading"
  );

  useEffect(() => {
    const checkSession = async () => {
      const { data } = await supabase.auth.getSession();
      if (!data?.session?.user) {
        setAuthState("no-auth");
        navigate("/police-signin");
      } else {
        setAuthState("auth");
      }
    };
    checkSession();
  }, [navigate]);

  useEffect(() => {
    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (!session?.user) {
          toast({
            title: "Session expired",
            description: "You have been signed out.",
            variant: "destructive",
          });
          navigate("/police-signin");
        }
      }
    );
    return () => listener?.unsubscribe();
  }, [navigate, toast]);

  /* -------- Logout -------- */
  const handleLogout = async () => {
    await supabase.auth.signOut();
    toast({ title: "Signed out", description: "You have been logged out." });
    navigate("/police-signin");
  };

  /* -------- Google Map -------- */
  useEffect(() => {
    const initMap = () => {
      if (!mapRef.current || !(window as any).google) return;

      const map = new (window as any).google.maps.Map(mapRef.current, {
        center: { lat: 22.5726, lng: 88.3639 }, // Kolkata
        zoom: 12,
      });

      // Example marker
      new (window as any).google.maps.Marker({
        position: { lat: 22.5726, lng: 88.3639 },
        map,
        title: "Central Police Station",
      });
    };

    // Load Google Maps only once
    if (!(window as any).google || !(window as any).google.maps) {
      const scriptId = "google-maps-script";
      if (!document.getElementById(scriptId)) {
        const script = document.createElement("script");
        script.id = scriptId;
        script.src =
          "https://maps.googleapis.com/maps/api/js?key=AIzaSyBU7z2W7aE4T6TSV7SqEk0UJiyjAC97UW8&libraries=places";
        script.async = true;
        script.defer = true;
        script.onload = initMap;
        document.body.appendChild(script);
      } else {
        document.getElementById(scriptId)?.addEventListener("load", initMap);
      }
    } else {
      initMap();
    }
  }, []);

  /* -------- Loading state -------- */
  if (authState === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  /* -------- Main UI -------- */
  return (
    <div className="min-h-screen bg-gray-100 p-6 flex flex-col items-center justify-start">
      <Card className="w-full max-w-5xl">
        {/* Header */}
        <CardHeader className="space-y-1">
          <CardTitle className="text-3xl font-bold text-blue-700 flex items-center gap-2">
            <Shield className="h-8 w-8" />
            Officer Dashboard
          </CardTitle>
          <div className="flex items-center space-x-2">
            <AlertTriangle className="h-4 w-4 text-red-500" />
            <span className="text-md text-gray-600">
              Manage incidents & respond to alerts
            </span>
          </div>
        </CardHeader>

        {/* Main content – three column layout */}
        <CardContent className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Google Map */}
          <div className="lg:col-span-1">
            <div
              ref={mapRef}
              className="w-full h-[400px] rounded-lg shadow-md border"
            />
          </div>

          {/* e-FIR form */}
          <div className="lg:col-span-1">
            <EFIRForm />
          </div>

          {/* Panic alerts */}
          <div className="lg:col-span-1">
            <PanicAlerts />
          </div>
        </CardContent>

        {/* Footer – logout */}
        <CardHeader className="border-t py-3 text-right">
          <Button variant="outline" onClick={handleLogout}>
            <LogOut className="mr-2 h-4 w-4" /> Sign out
          </Button>
        </CardHeader>
      </Card>
    </div>
  );
};

export default PoliceDashboard;
