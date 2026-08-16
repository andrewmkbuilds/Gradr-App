import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { addBreadcrumb, setSentryUser } from "@/lib/telemetry/sentry";

/**
 * Keeps Sentry's scope in sync with the session: an opaque user id (never an
 * email) plus route breadcrumbs, so a captured error carries the navigation
 * path that led to it.
 */
export function SentryUserSync() {
  const { user } = useAuth();
  const location = useLocation();

  useEffect(() => {
    setSentryUser(user ? { id: user.id } : null);
  }, [user]);

  useEffect(() => {
    addBreadcrumb("navigation", location.pathname);
  }, [location.pathname]);

  return null;
}

export default SentryUserSync;
