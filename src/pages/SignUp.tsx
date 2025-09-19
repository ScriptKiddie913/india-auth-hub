/* =======================================================
   Sign-up page – Blockchain + Supabase + MetaMask
   -------------------------------------------------------
   Flow:
   1. User enters form data
   2. Create Supabase auth user
   3. Get MetaMask address
   4. Generate uniqueId (64-char)
   5. Call Registry.register(uniqueId)
   6. Persist wallet, uniqueId, txHash in Supabase
   7. UI feedback + Etherscan link
   ======================================================= */

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
import { Palmtree, Mail, Lock, Eye, EyeOff, User } from "lucide-react";
import { ethers } from "ethers";

// 🔑 Contract ABI + address (replace with deployed Registry)
const REGISTRY_ADDRESS = "0xYourDeployedContract"; 
const REGISTRY_ABI = [
  "function register(string uniqueId) external",
  "event Registered(address indexed wallet, string indexed uniqueId)"
];

// Utility: generate 64-char hex uniqueId
const generateUniqueId = (address: string) => {
  const rand = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(rand, (b) => b.toString(16).padStart(2, "0")).join("");
};

// Connect to MetaMask
async function getEthereumAccount(): Promise<string> {
  if (!(window as any).ethereum) throw new Error("MetaMask not found");
  const accounts = await (window as any).ethereum.request({
    method: "eth_requestAccounts",
  });
  return accounts[0];
}

// Call smart contract
async function registerOnChain(uniqueId: string): Promise<string> {
  if (!(window as any).ethereum) throw new Error("MetaMask not found");
  const provider = new ethers.BrowserProvider((window as any).ethereum);
  const signer = await provider.getSigner();
  const contract = new ethers.Contract(REGISTRY_ADDRESS, REGISTRY_ABI, signer);
  const tx = await contract.register(uniqueId);
  await tx.wait();
  return tx.hash;
}

const SignUp = () => {
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
  const [txHash, setTxHash] = useState<string | null>(null);

  const navigate = useNavigate();
  const { toast } = useToast();

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate password
    const strongPasswordRegex =
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{12,}$/;
    if (!strongPasswordRegex.test(formData.password)) {
      toast({
        title: "Weak password",
        description:
          "Password must be 12+ chars incl. uppercase, lowercase, number & symbol",
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
        description: "Please accept terms and privacy policy",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      // 1. Supabase sign-up
      const { error: supaError } = await supabase.auth.signUp({
        email: formData.email,
        password: formData.password,
        options: { data: { full_name: formData.fullName } },
      });
      if (supaError) throw new Error(supaError.message);

      // 2. Get wallet + uniqueId
      const address = await getEthereumAccount();
      const uniqueId = generateUniqueId(address);

      // 3. Call contract
      const txHash = await registerOnChain(uniqueId);
      setTxHash(txHash);

      // 4. Persist in Supabase
      const { data: { user } } = await supabase.auth.getUser();
      await supabase.auth.updateUser({
        data: { wallet_address: address, unique_id: uniqueId, tx_hash: txHash },
      });
      await supabase.from("profiles").upsert(
        {
          user_id: user?.id ?? null,
          wallet_address: address,
          unique_id: uniqueId,
          tx_hash: txHash,
        },
        { onConflict: "user_id" }
      );

      // 5. Feedback
      toast({
        title: "Sign-up complete",
        description: "Check your email for verification. Tx stored on chain.",
      });
      navigate("/signin");
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message ?? "Unexpected error",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4 bg-cover bg-center relative"
      style={{ backgroundImage: "url('/image/signup.jpg')" }}
    >
      <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-black/20 to-black/40" />
      <Card className="w-full max-w-md mx-auto backdrop-blur-md bg-white/90 shadow-2xl border border-white/20 relative z-10">
        <CardHeader className="text-center pb-6">
          <div className="mx-auto w-16 h-16 bg-gradient-to-br from-primary to-accent rounded-full flex items-center justify-center mb-4">
            <Palmtree className="w-8 h-8 text-white" />
          </div>
          <CardTitle className="text-3xl font-bold">Join the Journey</CardTitle>
          <CardDescription>Create your account to discover India</CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          <form onSubmit={handleSignUp} className="space-y-4">
            {/* Full name */}
            <div>
              <Label htmlFor="fullName">Full Name</Label>
              <div className="relative">
                <User className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="fullName"
                  name="fullName"
                  type="text"
                  placeholder="Enter your full name"
                  value={formData.fullName}
                  onChange={handleInputChange}
                  className="pl-10 h-12"
                  required
                />
              </div>
            </div>

            {/* Email */}
            <div>
              <Label htmlFor="email">Email Address</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="you@domain.com"
                  value={formData.email}
                  onChange={handleInputChange}
                  className="pl-10 h-12"
                  required
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Create a strong password"
                  value={formData.password}
                  onChange={handleInputChange}
                  className="pl-10 pr-10 h-12"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-3"
                >
                  {showPassword ? <EyeOff /> : <Eye />}
                </button>
              </div>
            </div>

            {/* Confirm Password */}
            <div>
              <Label htmlFor="confirmPassword">Confirm Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="confirmPassword"
                  name="confirmPassword"
                  type={showConfirmPassword ? "text" : "password"}
                  placeholder="Confirm your password"
                  value={formData.confirmPassword}
                  onChange={handleInputChange}
                  className="pl-10 pr-10 h-12"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-3"
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
                onCheckedChange={(c) => setAcceptTerms(c as boolean)}
              />
              <Label htmlFor="terms" className="text-sm text-muted-foreground">
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

            {/* Submit */}
            <Button type="submit" className="w-full h-12" disabled={loading}>
              {loading ? "Creating account…" : "Create Account"}
            </Button>
          </form>

          {txHash && (
            <p className="text-sm text-center mt-4">
              Tx Hash:{" "}
              <a
                href={`https://sepolia.etherscan.io/tx/${txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline"
              >
                View on Etherscan
              </a>
            </p>
          )}

          <div className="relative">
            <Separator />
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="bg-white/90 px-4 text-sm">Already have an account?</span>
            </div>
          </div>

          <div className="text-center">
            <Link to="/signin" className="text-primary hover:underline">
              Sign in to your account
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default SignUp;
