/* src/pages/PoliceDashboard.tsx */
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Shield, LogOut, AlertTriangle } from "lucide-react";

import PoliceMap from "@/components/PoliceMap";
import EFIRForm from "@/components/EFIRForm";
import PanicAlerts from "@/components/PanicAlerts";

const PoliceDashboard: React.FC = () => {
  const navigate = useNavigate();
  const { toast } = useToast();

  /* ---------- Logout ---------- */
  const handleLogout = async () => {
    await supabase.auth.signOut();          // real sign‑out
    toast({ title: "Signed out", description: "You have been logged out." });
    navigate("/police-signin");
  };

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

        {/* Main content – three‑column layout */}
        <CardContent className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Column 1 – Map */}
          <div className="lg:col-span-1">
            <PoliceMap />
          </div>

          {/* Column 2 – e‑FIR form */}
          <div className="lg:col-span-1">
            <EFIRForm />
          </div>

          {/* Column 3 – panic alerts */}
          <div className="lg:col-span-1">
            <PanicAlerts />
          </div>
        </CardContent>

        {/* Bottom actions */}
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
