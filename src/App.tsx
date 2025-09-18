import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

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

/**
 * Create a single instance of QueryClient that will be shared
 * across the entire application via the `QueryClientProvider`.
 */
const queryClient = new QueryClient();

/**
 * App component is the root of the React application.
 * It brings together:
 *   • React‑Query global provider
 *   • Tooltip provider (context for the UI library)
 *   • Global toast components
 *   • Browser routing for all pages
 *
 * This version is intentionally verbose so that every section
 * is immediately clear to a reader new to the codebase.
 */
const App: React.FC = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        {/* Toast notifications from the UI library */}
        <Toaster />

        {/* Toast notifications from the Sonner package */}
        <Sonner />

        {/* The main routing context */}
        <BrowserRouter>
          <Routes>
            {/* Public routes that can be accessed without authentication */}
            <Route path="/" element={<Index />} />
            <Route path="/signin" element={<SignIn />} />
            <Route path="/signup" element={<SignUp />} />

            {/* Authenticated user routes – these would normally be
                guarded by a private route component, but the routing
                table simply lists them for clarity */}
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/profile-completion" element={<ProfileCompletion />} />

            {/* Admin‑only routes – similar structure as above */}
            <Route path="/admin" element={<AdminLogin />} />
            <Route path="/admin-dashboard" element={<AdminDashboard />} />

            {/* Catch‑all route for any path that does not match the above */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
