import { Outlet } from "@tanstack/react-router";
import { BrandLogo } from "@/components/BrandLogo";
import { DashboardLayout } from "@/components/DashboardLayout";
import { useAuth } from "@/hooks/useAuth";
import { Navigate, useLocation } from "@/lib/router-compat";
import { authPath, nextFromLocation } from "@/lib/nextRedirect";
import Landing from "@/pages/Landing";
import VerifyEmail from "@/pages/VerifyEmail";

/**
 * Auth shell for every in-app route (ported from the pre-migration
 * ProtectedRoutes in App.tsx). Guests see the landing page at "/", get
 * bounced to /auth elsewhere; unverified email accounts see the
 * verification gate; everyone else gets the dashboard chrome.
 */
export function ProtectedRoutes() {
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
      <Outlet />
    </DashboardLayout>
  );
}
