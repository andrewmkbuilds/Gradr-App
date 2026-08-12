import { createFileRoute } from "@tanstack/react-router";
import Auth from "@/pages/Auth";
import { AnimatedPage } from "@/components/AnimatedPage";
import { useAuth } from "@/hooks/useAuth";
import { Navigate, useLocation } from "@/lib/router-compat";
import { resolveNext } from "@/lib/nextRedirect";

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

export const Route = createFileRoute("/auth")({
  component: () => (
    <AnimatedPage><AuthRoute /></AnimatedPage>
  ),
});
