import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";

import Index from "./pages/Index";
import SignIn from "./pages/SignIn";
import SignUp from "./pages/SignUp";
import Dashboard from "./pages/Dashboard";
import AdminLogin from "./pages/AdminLogin";
import AdminDashboard from "./pages/AdminDashboard";
import Profile from "./pages/Profile";
import ProfileCompletion from "./components/ProfileCompletion";
import NotFound from "./pages/NotFound";

// Import the Police sign‑in page here
import PoliceSignIn from "./pages/PoliceSignIn";

const queryClient = new QueryClient();

/**
 * App – Top‑level application component.
 *
 * 1. Sets up React‑Query’s QueryClientProvider.
 * 2. Wraps everything in a TooltipProvider (global UI context).
 * 3. Renders global toast components (`Toaster` and `Sonner`).
 * 4. Declares a BrowserRouter with every URL fragment that the app knows.
 */
const App: React.FC = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        {/* Global toast notifications */}
        <Toaster />
        <Sonner />

        <BrowserRouter>
          <Routes>
            {/* Public routes */}
            <Route path="/" element={<Index />} />
            <Route path="/signin" element={<SignIn />} />
            <Route path="/signup" element={<SignUp />} />

            {/* User account routes */}
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/profile-completion" element={<ProfileCompletion />} />

            {/* Administration routes */}
            <Route path="/admin" element={<AdminLogin />} />
            <Route path="/admin-dashboard" element={<AdminDashboard />} />

            {/* Police‑specific route – this is what the button in SignIn.tsx navigates to */}
            <Route path="/police-signin" element={<PoliceSignIn />} />

            {/* Catch‑all – renders the 404 page when no other route matches */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;

