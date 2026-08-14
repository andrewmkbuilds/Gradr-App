import { BrandLogo } from "@/components/BrandLogo";
import { Suspense, lazy, useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate, useLocation } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { DashboardLayout } from "@/components/DashboardLayout";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { ThemeProvider } from "@/hooks/useTheme";
import { MotionPreferenceProvider } from "@/hooks/useMotionPreference";
import { AnimatedPage } from "@/components/AnimatedPage";
import { RouteSeo } from "@/components/RouteSeo";
import { CANONICAL_ALIASES } from "@/lib/seo/canonical";
import { CookieConsent } from "@/components/CookieConsent";
import { OfflineBanner } from "@/components/OfflineBanner";
import { PublicShell } from "@/components/PublicShell";
import { ScrollToTop } from "@/components/ScrollToTop";
import { AnimatePresence } from "motion/react";
import { captureReferralFromUrl } from "@/lib/affiliateTracking";
import { SentryErrorBoundary, addBreadcrumb } from "@/lib/telemetry/sentry";
import { phPageview } from "@/lib/telemetry/posthog";

import Dashboard from "./pages/Dashboard";
import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";

import Landing from "./pages/Landing";
import { authPath, nextFromLocation, resolveNext } from "./lib/nextRedirect";
import RequireAdmin from "@/components/RequireAdmin";

// Route-level code splitting: only the shell, dashboard, auth and landing
// pages ship in the initial bundle. Everything else loads on navigation.
const ResumeEngine = lazy(() => import("./pages/ResumeEngine"));
const JobMatchingEngine = lazy(() => import("./pages/JobMatchingEngine"));
const JobsFeed = lazy(() => import("./pages/JobsFeed"));
const Pipeline = lazy(() => import("./pages/Pipeline"));
const ApplicationEngine = lazy(() => import("./pages/ApplicationEngine"));
const InterviewEngine = lazy(() => import("./pages/InterviewEngine"));
const GrowthEngine = lazy(() => import("./pages/GrowthEngine"));
const Settings = lazy(() => import("./pages/Settings"));
const DigestPreview = lazy(() => import("./pages/DigestPreview"));
const Pricing = lazy(() => import("./pages/Pricing"));
const Billing = lazy(() => import("./pages/Billing"));
const Welcome = lazy(() => import("./pages/Welcome"));
const ForgotPassword = lazy(() => import("./pages/ForgotPassword"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const AffiliateProgram = lazy(() => import("./pages/AffiliateProgram"));
const AffiliateApply = lazy(() => import("./pages/AffiliateApply"));
const AffiliateDashboard = lazy(() => import("./pages/AffiliateDashboard"));
const AffiliateResources = lazy(() => import("./pages/AffiliateResources"));
const AdminAffiliates = lazy(() => import("./pages/AdminAffiliates"));
const AdminBlogAnalytics = lazy(() => import("./pages/AdminBlogAnalytics"));
const AdminAuditLog = lazy(() => import("./pages/AdminAuditLog"));
const AdminSecurityLog = lazy(() => import("@/pages/AdminSecurityLog"));
const MotionPlayground = lazy(() => import("@/pages/MotionPlayground"));
const DesignSystem = lazy(() => import("@/pages/DesignSystem"));
const AdminQaChecklist = lazy(() => import("@/pages/AdminQaChecklist"));
const BrandAssets = lazy(() => import("@/pages/BrandAssets"));
const AdminSecurityFindings = lazy(() => import("@/pages/AdminSecurityFindings"));
const AdminOAuthForensics = lazy(() => import("@/pages/AdminOAuthForensics"));
const AdminApiHealth = lazy(() => import("@/pages/AdminApiHealth"));
const AdminWebhookLogs = lazy(() => import("@/pages/AdminWebhookLogs"));
const AdminCspReports = lazy(() => import("@/pages/AdminCspReports"));

const AdminNavAnalytics = lazy(() => import("@/pages/AdminNavAnalytics"));
const AdminSeoMonitor = lazy(() => import("@/pages/AdminSeoMonitor"));
const AdminPaddle = lazy(() => import("@/pages/AdminPaddle"));
const AdminHome = lazy(() => import("@/pages/AdminHome"));
const AdminRevenue = lazy(() => import("@/pages/AdminRevenue"));
const AdminUsage = lazy(() => import("@/pages/AdminUsage"));
const AdminLegal = lazy(() => import("@/pages/AdminLegal"));
const AdminDiscounts = lazy(() => import("@/pages/AdminDiscounts"));
const AdminVerifications = lazy(() => import("@/pages/AdminVerifications"));
const AdminSearchConsole = lazy(() => import("./pages/AdminSearchConsole"));
const AdminPaymentsStatus = lazy(() => import("@/pages/AdminPaymentsStatus"));
const Privacy = lazy(() => import("./pages/legal/Privacy"));
const Terms = lazy(() => import("./pages/legal/Terms"));
const RefundPolicy = lazy(() => import("./pages/legal/RefundPolicy"));
const CookiePolicy = lazy(() => import("./pages/legal/CookiePolicy"));
const Dpa = lazy(() => import("./pages/legal/Dpa"));
const AiResumeOptimization = lazy(() => import("./pages/blog/AiResumeOptimization"));
const AtsResumeChecker = lazy(() => import("./pages/AtsResumeChecker"));
const AiInterviewCoach = lazy(() => import("./pages/AiInterviewCoach"));
const JobApplicationTracker = lazy(() => import("./pages/JobApplicationTracker"));
const CareerAdvice = lazy(() => import("./pages/CareerAdvice"));
const GuideArticle = lazy(() => import("./pages/GuideArticle"));
const JobSearchIndex = lazy(() => import("./pages/JobSearchIndex"));
const JobLanding = lazy(() => import("./pages/JobLanding"));
const Unsubscribe = lazy(() => import("./pages/Unsubscribe"));
const OAuthConsent = lazy(() => import("./pages/OAuthConsent"));
const InterviewHistory = lazy(() => import("./pages/InterviewHistory"));
const VerifyEmail = lazy(() => import("./pages/VerifyEmail"));

const queryClient = new QueryClient();

/**
 * Route-shaped placeholder shown while a route chunk streams in.
 *
 * Instead of a spinner, we paint the skeleton of the page being navigated to,
 * so the transition reads as instant: the layout is already correct and only
 * the content fills in.
 */
function RouteFallback() {
  const location = useLocation();
  return <RouteSkeleton pathname={location.pathname} />;
}


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
         <Route path="/admin/security-findings" element={<RequireAdmin><AnimatedPage><AdminSecurityFindings /></AnimatedPage></RequireAdmin>} />
         <Route path="/admin/brand-assets" element={<RequireAdmin><AnimatedPage><BrandAssets /></AnimatedPage></RequireAdmin>} />
         <Route path="/admin/design-system" element={<RequireAdmin><AnimatedPage><DesignSystem /></AnimatedPage></RequireAdmin>} />
         <Route path="/admin/qa-checklist" element={<RequireAdmin><AnimatedPage><AdminQaChecklist /></AnimatedPage></RequireAdmin>} />
         <Route path="/admin/motion-playground" element={<RequireAdmin><AnimatedPage><MotionPlayground /></AnimatedPage></RequireAdmin>} />
         <Route path="/admin/oauth-forensics" element={<RequireAdmin><AnimatedPage><AdminOAuthForensics /></AnimatedPage></RequireAdmin>} />
         <Route path="/admin/api-health" element={<RequireAdmin><AnimatedPage><AdminApiHealth /></AnimatedPage></RequireAdmin>} />
         <Route path="/admin/webhook-logs" element={<RequireAdmin><AnimatedPage><AdminWebhookLogs /></AnimatedPage></RequireAdmin>} />
         <Route path="/admin/csp-reports" element={<RequireAdmin><AnimatedPage><AdminCspReports /></AnimatedPage></RequireAdmin>} />

         <Route path="/admin/security-log" element={<RequireAdmin><AnimatedPage><AdminSecurityLog /></AnimatedPage></RequireAdmin>} />
         <Route path="/admin/seo-monitor" element={<RequireAdmin><AnimatedPage><AdminSeoMonitor /></AnimatedPage></RequireAdmin>} />
         <Route path="/admin/nav-analytics" element={<RequireAdmin><AnimatedPage><AdminNavAnalytics /></AnimatedPage></RequireAdmin>} />
         <Route path="/admin/audit-log" element={<RequireAdmin><AnimatedPage><AdminAuditLog /></AnimatedPage></RequireAdmin>} />
         <Route path="/admin/legal" element={<RequireAdmin><AnimatedPage><AdminLegal /></AnimatedPage></RequireAdmin>} />
         <Route path="/admin/verifications" element={<RequireAdmin><AnimatedPage><AdminVerifications /></AnimatedPage></RequireAdmin>} />
         <Route path="/admin/discounts" element={<RequireAdmin><AnimatedPage><AdminDiscounts /></AnimatedPage></RequireAdmin>} />
         <Route path="/admin" element={<RequireAdmin><AnimatedPage><AdminHome /></AnimatedPage></RequireAdmin>} />
        <Route path="/admin/revenue" element={<RequireAdmin><AnimatedPage><AdminRevenue /></AnimatedPage></RequireAdmin>} />
        <Route path="/admin/usage" element={<RequireAdmin><AnimatedPage><AdminUsage /></AnimatedPage></RequireAdmin>} />
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
        <Route path="/unsubscribe" element={<AnimatedPage><Unsubscribe /></AnimatedPage>} />
        <Route path="/landing" element={<AnimatedPage><Landing /></AnimatedPage>} />
        <Route path="/auth" element={<AnimatedPage><AuthRoute /></AnimatedPage>} />
        <Route path="/forgot-password" element={<AnimatedPage><ForgotPassword /></AnimatedPage>} />
        <Route path="/reset-password" element={<AnimatedPage><ResetPassword /></AnimatedPage>} />
        <Route path="/blog/ai-resume-optimization" element={<AnimatedPage><AiResumeOptimization /></AnimatedPage>} />
        <Route path="/ats-resume-checker" element={<AnimatedPage><AtsResumeChecker /></AnimatedPage>} />
        <Route path="/ai-interview-coach" element={<AnimatedPage><AiInterviewCoach /></AnimatedPage>} />
        <Route path="/job-application-tracker" element={<AnimatedPage><JobApplicationTracker /></AnimatedPage>} />
        {/* Duplicate URL variants collapse into the canonical path so only one
            version of each landing page can ever be indexed. */}
        {Object.keys(CANONICAL_ALIASES).map((alias) => (
          <Route key={alias} path={alias} element={<Navigate to={CANONICAL_ALIASES[alias]} replace />} />
        ))}
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
      <MotionPreferenceProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <ScrollToTop />
          <ReferralCapture />
          <TelemetryRouteTracker />
          <AuthProvider>
            <RouteSeo />
            <Suspense fallback={<RouteFallback />}>
              <AppRoutes />
            </Suspense>
            <CookieConsent />
            <OfflineBanner />
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
      </MotionPreferenceProvider>
      </ThemeProvider>
    </QueryClientProvider>
  </SentryErrorBoundary>
);


export default App;
