import { useEffect } from "react";
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
import { captureReferralFromUrl } from "@/lib/affiliateTracking";
import { SentryErrorBoundary, addBreadcrumb } from "@/lib/telemetry/sentry";
import { phPageview } from "@/lib/telemetry/posthog";

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
import Billing from "./pages/Billing";
import Auth from "./pages/Auth";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import NotFound from "./pages/NotFound";
import AffiliateProgram from "./pages/AffiliateProgram";
import AffiliateApply from "./pages/AffiliateApply";
import AffiliateDashboard from "./pages/AffiliateDashboard";
import AffiliateResources from "./pages/AffiliateResources";
import AdminAffiliates from "./pages/AdminAffiliates";
import AdminBlogAnalytics from "./pages/AdminBlogAnalytics";
import AdminAuditLog from "./pages/AdminAuditLog";
import AdminSearchConsole from "./pages/AdminSearchConsole";

import AiResumeOptimization from "./pages/blog/AiResumeOptimization";
import OAuthConsent from "./pages/OAuthConsent";
import Landing from "./pages/Landing";
import InterviewHistory from "./pages/InterviewHistory";

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

  if (!user) {
    if (location.pathname === "/") return <Landing />;
    return <Navigate to={`/auth?next=${encodeURIComponent(location.pathname)}`} replace />;
  }

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
          <Route path="/interview/history" element={<AnimatedPage><InterviewHistory /></AnimatedPage>} />
          <Route path="/growth" element={<AnimatedPage><GrowthEngine /></AnimatedPage>} />
          <Route path="/settings" element={<AnimatedPage><Settings /></AnimatedPage>} />
          <Route path="/admin/digest-preview" element={<AnimatedPage><DigestPreview /></AnimatedPage>} />
          <Route path="/admin/affiliates" element={<AnimatedPage><AdminAffiliates /></AnimatedPage>} />
         <Route path="/admin/blog-analytics" element={<AnimatedPage><AdminBlogAnalytics /></AnimatedPage>} />
         <Route path="/admin/audit-log" element={<AnimatedPage><AdminAuditLog /></AnimatedPage>} />
         <Route path="/admin/search-console" element={<AnimatedPage><AdminSearchConsole /></AnimatedPage>} />

          <Route path="/pricing" element={<AnimatedPage><Pricing /></AnimatedPage>} />
          <Route path="/billing" element={<AnimatedPage><Billing /></AnimatedPage>} />
          <Route path="/affiliate" element={<AnimatedPage><AffiliateProgram /></AnimatedPage>} />
          <Route path="/affiliate/apply" element={<AnimatedPage><AffiliateApply /></AnimatedPage>} />
          <Route path="/affiliate/dashboard" element={<AnimatedPage><AffiliateDashboard /></AnimatedPage>} />
          <Route path="/affiliate/resources" element={<AnimatedPage><AffiliateResources /></AnimatedPage>} />
          <Route path="*" element={<AnimatedPage><NotFound /></AnimatedPage>} />
        </Routes>
      </AnimatePresence>
    </DashboardLayout>
  );
}

function AuthRoute() {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return null;
  if (user) {
    const params = new URLSearchParams(location.search);
    const next = params.get("next");
    const safe = next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
    return <Navigate to={safe} replace />;
  }
  return <Auth />;
}

function AppRoutes() {
  const location = useLocation();
  return (
    <AnimatePresence mode="wait">
      <Routes location={location} key={location.pathname}>
        <Route path="/landing" element={<AnimatedPage><Landing /></AnimatedPage>} />
        <Route path="/auth" element={<AnimatedPage><AuthRoute /></AnimatedPage>} />
        <Route path="/forgot-password" element={<AnimatedPage><ForgotPassword /></AnimatedPage>} />
        <Route path="/reset-password" element={<AnimatedPage><ResetPassword /></AnimatedPage>} />
        <Route path="/blog/ai-resume-optimization" element={<AnimatedPage><AiResumeOptimization /></AnimatedPage>} />
        <Route path="/.lovable/oauth/consent" element={<OAuthConsent />} />
        <Route path="/*" element={<ProtectedRoutes />} />
      </Routes>
    </AnimatePresence>
  );
}

function ReferralCapture() {
  useEffect(() => { void captureReferralFromUrl(); }, []);
  return null;
}

function TelemetryRouteTracker() {
  const location = useLocation();
  useEffect(() => {
    phPageview(location.pathname);
    addBreadcrumb("navigation", location.pathname);
  }, [location.pathname]);
  return null;
}

const App = () => (
  <SentryErrorBoundary
    fallback={
      <div className="min-h-screen bg-background flex items-center justify-center p-6 text-center">
        <div className="space-y-2">
          <p className="text-lg font-semibold text-foreground">Something broke on our side</p>
          <p className="text-sm text-muted-foreground">
            The issue has been reported. Refresh the page to continue.
          </p>
        </div>
      </div>
    }
  >
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <ReferralCapture />
          <TelemetryRouteTracker />
          <AuthProvider>
            <RouteSeo />
            <AppRoutes />
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </SentryErrorBoundary>
);


export default App;
