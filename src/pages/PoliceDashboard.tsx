// src/pages/PoliceDashboard.tsx
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Shield } from "lucide-react";

const PoliceDashboard: React.FC = () => {
  const navigate = useNavigate();
  const { toast } = useToast();

  // Stub for “sign‑out” – replace with real logic later
  const handleLogout = () => {
    // TODO: call supabase.auth.signOut() or whatever you use
    toast({
      title: "Signed out",
      description: "You have been logged out.",
    });
    navigate("/police-signin");
  };

  return (
    <div className="min-h-screen bg-gray-100 p-6 flex flex-col items-center justify-center">
      <Card className="w-full max-w-4xl">
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

          <Button onClick={handleLogout} className="mt-4">
            <Shield className="mr-2 h-4 w-4" /> Sign out
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default PoliceDashboard;
