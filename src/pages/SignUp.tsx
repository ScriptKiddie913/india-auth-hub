/* =======================================================
   Sign‑up page – 100 % vanilla TS + React
   ------------------------------------------------------
   New behaviour:
   * Gets the user’s MetaMask address
   * Creates a unique ID
   * Persists wallet_address, unique_id and later sends a transaction
   * Stores the tx hash, shows a clickable link to Etherscan
   =======================================================
*/

import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
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
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  Palmtree,
  Mail,
  Lock,
  Eye,
  EyeOff,
  User,
} from "lucide-react";
import {
  getEthereumAccount,
  generateUniqueId,
  registerOnChainAndPersist,
} from "@/lib/ethereum";

const SignUp = () => {
  /* ------------ state ------------------------------------------------ */
  const [formData, setFormData] = useState({
    fullName: "",
    email: "",
    password: "",
    confirmPassword: "",
  });

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [loading, setLoading] = useState(false);

  /* ------------ helpers -------------------------------------------- */
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    setFormData((prev) => ({
      ...prev,
      [e.target.name]: e.target.value,
    }));
  };

  /* ------------ sign‑up flow --------------------------------------- */
  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();

    /* ----- basic form validation ----- */
    const strongPasswordRegex =
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{12,}$/;

    if (!strongPasswordRegex.test(formData.password)) {
      toast({
        title: "Weak password",
        description:
          "Password must be at least 12 characters long and include uppercase, lowercase, numbers, and special symbols.",
        variant: "destructive",
      });
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      toast({
        title: "Password mismatch",
        description: "Passwords do not match",
        variant: "destructive",
      });
      return;
    }

    if (!acceptTerms) {
      toast({
        title: "Accept terms",
        description: "Please accept the terms and conditions",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      /* 1) Sign‑up with Supabase (creates the row in auth.users) */
      const { error: supaError } = await supabase.auth.signUp({
        email: formData.email,
        password: formData.password,
        options: {
          data: { full_name: formData.fullName },
        },
      });

      if (supaError) throw new Error(supaError.message);

      /* 2) Get the user's MetaMask address & unique ID */
      const address = await getEthereumAccount();
      const uniqueId = await generateUniqueId(address);

      /* 3) Store wallet & unique ID in the user metadata */
      await supabase.auth.updateUser({
        data: { wallet_address: address, unique_id: uniqueId },
      });

      /* 4) Persist the wallet / id in the profiles table so the
          user can finish their profile later (see ProfileCompletion) */
      await supabase
        .from("profiles")
        .upsert(
          {
            user_id: (await supabase.auth.getUser()).data?.user?.id ?? null,
            wallet_address: address,
            unique_id: uniqueId,
          },
          { onConflict: "user_id" }
        );

      /* 5) Send the contract transaction and store the tx hash */
      const { data: { user } } = await supabase.auth.getUser();
      await registerOnChainAndPersist(uniqueId, user?.id ?? "", toast);

      /* 6) Final UI feedback */
      toast({
        title: "Check your email!",
        description:
          "We've sent you a verification link to complete your registration.",
      });
      navigate("/signin");
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message ?? "An unexpected error occurred",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  /* ------------ JSX -------------------------------------------------- */
  return (
    <div
      className="min-h-screen flex items-center justify-center p-4 bg-cover bg-center relative"
      style={{ backgroundImage: "url('/image/signup.jpg')" }}
    >
      <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-black/20 to-black/40" />
      <Card className="w-full max-w-md mx-auto backdrop-blur-md bg-white/90 shadow-2xl border border-white/20 animate-fade-in relative z-10">
        <CardHeader className="text-center pb-6">
          <div className="mx-auto w-16 h-16 bg-gradient-to-br from-primary to-accent rounded-full flex items-center justify-center mb-4 shadow-lg">
            <Palmtree className="w-8 h-8 text-white" />
          </div>
          <CardTitle className="text-3xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
            Join the Journey
          </CardTitle>
          <CardDescription className="text-muted-foreground text-lg">
            Create your account to discover India
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          <form onSubmit={handleSignUp} className="space-y-4">
            {/* Full name */}
            <div className="space-y-2">
              <Label htmlFor="fullName" className="text-sm font-medium">
                Full Name
              </Label>
              <div className="relative">
                <User className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="fullName"
                  name="fullName"
                  type="text"
                  placeholder="Enter your full name"
                  value={formData.fullName}
                  onChange={handleInputChange}
                  className="pl-10 h-12 border-muted focus:border-primary transition-colors"
                  required
                />
              </div>
            </div>

            {/* Email */}
            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-medium">
                Email Address
              </Label>
              <div className="relative">
                <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="you@domain.com"
                  value={formData.email}
                  onChange={handleInputChange}
                  className="pl-10 h-12 border-muted focus:border-primary transition-colors"
                  required
                />
              </div>
            </div>

            {/* Password */}
            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm font-medium">
                Password
              </Label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Create a strong password"
                  value={formData.password}
                  onChange={handleInputChange}
                  className="pl-10 pr-10 h-12 border-muted focus:border-primary transition-colors"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-3 h-4 w-4 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showPassword ? <EyeOff /> : <Eye />}
                </button>
              </div>
            </div>

            {/* Confirm password */}
            <div className="space-y-2">
              <Label htmlFor="confirmPassword" className="text-sm font-medium">
                Confirm Password
              </Label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="confirmPassword"
                  name="confirmPassword"
                  type={showConfirmPassword ? "text" : "password"}
                  placeholder="Confirm your password"
                  value={formData.confirmPassword}
                  onChange={handleInputChange}
                  className="pl-10 pr-10 h-12 border-muted focus:border-primary transition-colors"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-3 h-4 w-4 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showConfirmPassword ? <EyeOff /> : <Eye />}
                </button>
              </div>
            </div>

            {/* Terms */}
            <div className="flex items-center space-x-2">
              <Checkbox
                id="terms"
                checked={acceptTerms}
                onCheckedChange={(checked) =>
                  setAcceptTerms(checked as boolean)
                }
              />
              <Label
                htmlFor="terms"
                className="text-sm text-muted-foreground"
              >
                I accept the{" "}
                <Link to="/terms" className="text-primary hover:underline">
                  Terms of Service
                </Link>{" "}
                and{" "}
                <Link to="/privacy" className="text-primary hover:underline">
                  Privacy Policy
                </Link>
              </Label>
            </div>

            {/* Submit button */}
            <Button
              type="submit"
              className="w-full h-12 bg-gradient-to-r from-primary to-accent hover:from-primary/90 hover:to-accent/90 text-white font-semibold shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-[1.02]"
              disabled={loading}
            >
              {loading ? "Creating account…" : "Create Account"}
            </Button>
          </form>

          {/* Separator */}
          <div className="relative">
            <Separator />
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="bg-white/90 px-4 text-sm text-muted-foreground rounded">
                Already have an account?
              </span>
            </div>
          </div>

          {/* Sign‑in link */}
          <div className="text-center">
            <Link
              to="/signin"
              className="text-primary hover:text-accent font-medium transition-colors duration-200 underline-offset-4 hover:underline"
            >
              Sign in to your account
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default SignUp;
