import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate, useLocation } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { DashboardLayout } from "@/components/DashboardLayout";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { AnimatedPage } from "@/components/AnimatedPage";
import { RouteSeo } from "@/components/RouteSeo";
import { AnimatePresence } from "framer-motion";
import Dashboard from "./pages/Dashboard";
import ResumeEngine from "./pages/ResumeEngine";
import JobMatchingEngine from "./pages/JobMatchingEngine";
import JobsFeed from "./pages/JobsFeed";
import Pipeline from "./pages/Pipeline";
import ApplicationEngine from "./pages/ApplicationEngine";
import InterviewEngine from "./pages/InterviewEngine";
import GrowthEngine from "./pages/GrowthEngine";
import Settings from "./pages/Settings";
import DigestPreview from "./pages/DigestPreview";
import Pricing from "./pages/Pricing";
import Auth from "./pages/Auth";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

function ProtectedRoutes() {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) return <Navigate to="/auth" replace />;

  return (
    <DashboardLayout>
      <AnimatePresence mode="wait">
        <Routes location={location} key={location.pathname}>
          <Route path="/" element={<AnimatedPage><Dashboard /></AnimatedPage>} />
          <Route path="/resume" element={<AnimatedPage><ResumeEngine /></AnimatedPage>} />
          <Route path="/jobs" element={<AnimatedPage><JobsFeed /></AnimatedPage>} />
          <Route path="/match" element={<AnimatedPage><JobMatchingEngine /></AnimatedPage>} />
          <Route path="/pipeline" element={<AnimatedPage><Pipeline /></AnimatedPage>} />
          <Route path="/apply" element={<AnimatedPage><ApplicationEngine /></AnimatedPage>} />
          <Route path="/interview" element={<AnimatedPage><InterviewEngine /></AnimatedPage>} />
          <Route path="/growth" element={<AnimatedPage><GrowthEngine /></AnimatedPage>} />
          <Route path="/settings" element={<AnimatedPage><Settings /></AnimatedPage>} />
          <Route path="/admin/digest-preview" element={<AnimatedPage><DigestPreview /></AnimatedPage>} />
          <Route path="/pricing" element={<AnimatedPage><Pricing /></AnimatedPage>} />
          <Route path="*" element={<AnimatedPage><NotFound /></AnimatedPage>} />
        </Routes>
      </AnimatePresence>
    </DashboardLayout>
  );
}

function AuthRoute() {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (user) return <Navigate to="/" replace />;
  return <Auth />;
}

function AppRoutes() {
  const location = useLocation();
  return (
    <AnimatePresence mode="wait">
      <Routes location={location} key={location.pathname}>
        <Route path="/auth" element={<AnimatedPage><AuthRoute /></AnimatedPage>} />
        <Route path="/forgot-password" element={<AnimatedPage><ForgotPassword /></AnimatedPage>} />
        <Route path="/reset-password" element={<AnimatedPage><ResetPassword /></AnimatedPage>} />
        <Route path="/*" element={<ProtectedRoutes />} />
      </Routes>
    </AnimatePresence>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <RouteSeo />
          <AppRoutes />
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
