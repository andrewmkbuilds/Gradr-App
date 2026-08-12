import { BrandLogo } from "@/components/BrandLogo";
import { useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate, useLocation } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { DashboardLayout } from "@/components/DashboardLayout";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { ThemeProvider } from "@/hooks/useTheme";
import { AnimatedPage } from "@/components/AnimatedPage";
import { RouteSeo } from "@/components/RouteSeo";
import { CookieConsent } from "@/components/CookieConsent";
import { PublicShell } from "@/components/PublicShell";
import { ScrollToTop } from "@/components/ScrollToTop";
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
import Welcome from "./pages/Welcome";
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
import AdminSecurityLog from "@/pages/AdminSecurityLog";
import AdminNavAnalytics from "@/pages/AdminNavAnalytics";
import AdminPaddle from "@/pages/AdminPaddle";
import AdminLegal from "@/pages/AdminLegal";
import AdminDiscounts from "@/pages/AdminDiscounts";
import AdminSearchConsole from "./pages/AdminSearchConsole";
import AdminPaymentsStatus from "@/pages/AdminPaymentsStatus";
import Privacy from "./pages/legal/Privacy";
import Terms from "./pages/legal/Terms";
import RefundPolicy from "./pages/legal/RefundPolicy";
import CookiePolicy from "./pages/legal/CookiePolicy";
import Dpa from "./pages/legal/Dpa";

import AiResumeOptimization from "./pages/blog/AiResumeOptimization";
import CareerAdvice from "./pages/CareerAdvice";
import GuideArticle from "./pages/GuideArticle";
import JobSearchIndex from "./pages/JobSearchIndex";
import JobLanding from "./pages/JobLanding";
import OAuthConsent from "./pages/OAuthConsent";
import Landing from "./pages/Landing";
import { authPath, nextFromLocation, resolveNext } from "./lib/nextRedirect";
import InterviewHistory from "./pages/InterviewHistory";
import RequireAdmin from "@/components/RequireAdmin";
import VerifyEmail from "./pages/VerifyEmail";

const queryClient = new QueryClient();

function ProtectedRoutes() {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-5">
        <BrandLogo size={64} className="animate-pulse" />
        <div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        <span className="sr-only">Loading Gradr</span>
      </div>
    );
  }

  if (!user) {
    if (location.pathname === "/") return <Landing />;
    // Preserve query + hash so deep links (e.g. /match?job=123) survive the bounce.
    return <Navigate to={authPath(nextFromLocation(location))} replace />;
  }

  // Email/password accounts must confirm their address before using the app.
  // Anonymous guests and OAuth identities have no unverified state.
  const needsVerification =
    user.is_anonymous !== true && !!user.email && !user.email_confirmed_at && !user.confirmed_at;
  if (needsVerification) return <VerifyEmail />;




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
          <Route path="/admin/digest-preview" element={<RequireAdmin><AnimatedPage><DigestPreview /></AnimatedPage></RequireAdmin>} />
          <Route path="/admin/affiliates" element={<RequireAdmin><AnimatedPage><AdminAffiliates /></AnimatedPage></RequireAdmin>} />
         <Route path="/admin/blog-analytics" element={<RequireAdmin><AnimatedPage><AdminBlogAnalytics /></AnimatedPage></RequireAdmin>} />
         <Route path="/admin/security-log" element={<RequireAdmin><AnimatedPage><AdminSecurityLog /></AnimatedPage></RequireAdmin>} />
         <Route path="/admin/nav-analytics" element={<RequireAdmin><AnimatedPage><AdminNavAnalytics /></AnimatedPage></RequireAdmin>} />
         <Route path="/admin/audit-log" element={<RequireAdmin><AnimatedPage><AdminAuditLog /></AnimatedPage></RequireAdmin>} />
         <Route path="/admin/legal" element={<RequireAdmin><AnimatedPage><AdminLegal /></AnimatedPage></RequireAdmin>} />
         <Route path="/admin/discounts" element={<RequireAdmin><AnimatedPage><AdminDiscounts /></AnimatedPage></RequireAdmin>} />
         <Route path="/admin/paddle" element={<RequireAdmin><AnimatedPage><AdminPaddle /></AnimatedPage></RequireAdmin>} />
         <Route path="/admin/payments-status" element={<RequireAdmin><AnimatedPage><AdminPaymentsStatus /></AnimatedPage></RequireAdmin>} />

         <Route path="/admin/search-console" element={<RequireAdmin><AnimatedPage><AdminSearchConsole /></AnimatedPage></RequireAdmin>} />

          <Route path="/billing" element={<AnimatedPage><Billing /></AnimatedPage>} />
          <Route path="/manage-subscription" element={<AnimatedPage><Billing /></AnimatedPage>} />
          <Route path="/welcome" element={<AnimatedPage><Welcome /></AnimatedPage>} />
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

/** Pricing is publicly indexable: guests get the public shell, members the app chrome. */
function PricingRoute() {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (user) {
    return (
      <DashboardLayout>
        <AnimatedPage>
          <Pricing />
        </AnimatedPage>
      </DashboardLayout>
    );
  }
  return (
    <PublicShell source="pricing">
      <Pricing />
    </PublicShell>
  );
}

function AuthRoute() {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return null;
  // Guests (anonymous Supabase users) are "signed in" but must still be able to
  // reach this page to upgrade to a real account.
  if (user && user.is_anonymous !== true) {
    return <Navigate to={resolveNext(location.search)} replace />;
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
        <Route path="/career-advice" element={<AnimatedPage><CareerAdvice /></AnimatedPage>} />
        <Route path="/career-advice/:slug" element={<AnimatedPage><GuideArticle /></AnimatedPage>} />
        <Route path="/pricing" element={<PricingRoute />} />
        <Route path="/privacy" element={<AnimatedPage><Privacy /></AnimatedPage>} />
        <Route path="/terms" element={<AnimatedPage><Terms /></AnimatedPage>} />
        <Route path="/refund-policy" element={<AnimatedPage><RefundPolicy /></AnimatedPage>} />
        <Route path="/cookie-policy" element={<AnimatedPage><CookiePolicy /></AnimatedPage>} />
        <Route path="/dpa" element={<AnimatedPage><Dpa /></AnimatedPage>} />
        <Route path="/job-search" element={<AnimatedPage><JobSearchIndex /></AnimatedPage>} />
        <Route path="/job-search/:slug" element={<AnimatedPage><JobLanding /></AnimatedPage>} />
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
      <ThemeProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <ScrollToTop />
          <ReferralCapture />
          <TelemetryRouteTracker />
          <AuthProvider>
            <RouteSeo />
            <AppRoutes />
            <CookieConsent />
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  </SentryErrorBoundary>
);


export default App;
