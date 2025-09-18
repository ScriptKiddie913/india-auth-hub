import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Shield, Lock, Eye, EyeOff } from "lucide-react";

const HARDCODED_EMAIL = "officer@police.com";
const HARDCODED_PASSWORD = "secure123";

const PoliceSignIn = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  const handlePoliceSignIn = (e: React.FormEvent) => {
    e.preventDefault();

    if (email === HARDCODED_EMAIL && password === HARDCODED_PASSWORD) {
      toast({
        title: "Police Access Granted",
        description: "Welcome, Officer!",
      });
      navigate("/police-dashboard");
    } else {
      toast({
        title: "Access Denied",
        description: "Invalid police credentials",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-cover bg-center relative p-4"
      style={{ backgroundImage: "url('/image/police-signin.jpg')" }}
    >
      <div className="absolute inset-0 bg-black/50" />

      <Card className="w-full max-w-md mx-auto backdrop-blur-md bg-white/90 shadow-2xl relative z-10">
        <CardHeader className="text-center pb-6">
          <div className="mx-auto w-16 h-16 bg-gradient-to-br from-blue-600 to-blue-800 rounded-full flex items-center justify-center mb-4 shadow-lg">
            <Shield className="w-8 h-8 text-white" />
          </div>
          <CardTitle className="text-3xl font-bold text-blue-700">
            Police Sign In
          </CardTitle>
          <CardDescription>
            Restricted access for law enforcement officers
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          <form onSubmit={handlePoliceSignIn} className="space-y-4">
            <div className="space-y-2">
              <Label>Email</Label>
              <Input
                type="email"
                placeholder="officer@police.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label>Password</Label>
              <div className="relative">
                <Input
                  type={showPassword ? "text" : "password"}
                  placeholder="Enter police password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-3 h-4 w-4 text-muted-foreground"
                >
                  {showPassword ? <EyeOff /> : <Eye />}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              className="w-full h-12 bg-gradient-to-r from-blue-600 to-blue-800 text-white font-semibold"
            >
              Sign In
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default PoliceSignIn;
