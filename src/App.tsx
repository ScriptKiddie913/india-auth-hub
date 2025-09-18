/* src/App.tsx */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Toaster } from '@/components/ui/toaster';
import { Sonner } from '@/components/ui/sonner';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';

import Index from './pages/Index';
import SignIn from './pages/SignIn';
import SignUp from './pages/SignUp';
import Dashboard from './pages/Dashboard';
import AdminLogin from './pages/AdminLogin';
import AdminDashboard from './pages/AdminDashboard';
import Profile from './pages/Profile';
import ProfileCompletion from './components/ProfileCompletion';
import NotFound from './pages/NotFound';

/* ----------  Police pages  ---------- */
import PoliceDashboard from './pages/PoliceDashboard';
import PoliceSignIn from './pages/Sign';

/* ----------  Auth helper  ---------- */
import { useAuth } from './hooks/useAuth';

const queryClient = new QueryClient();

/* ----------  AuthGuard for police routes  ---------- */
const PoliceAuthGuard = ({ children }: { children: React.ReactNode }) => {
  const { auth } = useAuth();          // reads from localStorage
  if (!auth) return <Navigate to="/police/signin" replace />;
  return <>{children}</>;
};

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />   {/* Tailwind‑ui “toaster” */}
        <Sonner />    {/* optional “sonner” toast helper */}
        <BrowserRouter>
          <Routes>
            {/* Public – non‑police */}
            <Route path="/" element={<Index />} />
            <Route path="/signin" element={<SignIn />} />
            <Route path="/signup" element={<SignUp />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/admin" element={<AdminLogin />} />
            <Route path="/admin-dashboard" element={<AdminDashboard />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/profile-completion" element={<ProfileCompletion />} />

            {/* ---- Police portal ---- */}
            <Route path="/police/signin" element={<PoliceSignIn />} />
            <Route
              path="/police/*"
              element={
                <PoliceAuthGuard>
                  <PoliceDashboard />
                </PoliceAuthGuard>
              }
            />

            {/* Catch‑all 404 */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
