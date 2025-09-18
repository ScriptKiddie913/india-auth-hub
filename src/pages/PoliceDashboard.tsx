/* src/pages/PoliceDashboard.tsx */
import { useEffect, useState } from "react";
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

import PoliceMap from "@/components/PoliceMap";
import EFIRForm from "@/components/EFIRForm";
import PanicAlerts from "@/components/PanicAlerts";

const PoliceDashboard: React.FC = () => {
  const navigate = useNavigate();
  const { toast } = useToast();

  /* -------- Authentication -------- */
  const [authState, setAuthState] = useState<"loading" | "auth" | "no-auth">(
    "loading",
  );

  // 1️⃣  Initial session check
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

  // 2️⃣  Live auth state listener – redirects immediately on logout
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
      },
    );
    return () => listener?.unsubscribe();
  }, [navigate, toast]);

  /* -------- Logout -------- */
  const handleLogout = async () => {
    await supabase.auth.signOut();
    toast({ title: "Signed out", description: "You have been logged out." });
    navigate("/police-signin");
  };

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
          <div className="lg:col-span-1"><PoliceMap /></div>
          <div className="lg:col-span-1"><EFIRForm /></div>
          <div className="lg:col-span-1"><PanicAlerts /></div>
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
