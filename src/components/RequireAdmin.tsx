import { ReactNode, useEffect, useRef } from "react";
import { Link, useLocation } from "@/lib/router-compat";
import { Loader2, ShieldAlert } from "lucide-react";
import { useIsAdmin } from "@/hooks/useAffiliate";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Route guard for internal tooling.
 *
 * Admin links are already filtered out of the sidebar for non-admins; this
 * guard covers direct URL access and shows a clear, non-dead-end explanation
 * instead of a bare 404 so a mis-routed teammate knows what happened.
 *
 * This is defence in depth only — every admin table, RPC and edge function
 * enforces `has_role(auth.uid(),'admin')` server-side, so hiding the UI is
 * never the security boundary. No admin data is fetched or revealed here.
 *
 * Every blocked attempt is recorded server-side via `log_admin_access_denied`,
 * which takes the user id from `auth.uid()` and the timestamp from the database
 * (the client only supplies the route), and de-duplicates per minute.
 */
export function RequireAdmin({ children }: { children: ReactNode }) {
  const { data: isAdmin, isLoading } = useIsAdmin();
  const { user } = useAuth();
  const { pathname } = useLocation();
  const reported = useRef<string | null>(null);

  const denied = !isLoading && !isAdmin;

  useEffect(() => {
    if (!denied || !user) return;
    const key = `${user.id}:${pathname}`;
    if (reported.current === key) return;
    reported.current = key;
    void supabase
      .rpc("log_admin_access_denied", { _route: pathname, _reason: "not_admin" })
      .then(({ error }) => {
        if (error) console.warn("[admin-guard] audit write failed", error.message);
      });
  }, [denied, pathname, user]);

  if (isLoading) {
    return (
      <div className="flex justify-center py-24" role="status" aria-label="Checking permissions">
        <Loader2 className="h-6 w-6 animate-spin text-primary" aria-hidden="true" />
        <span className="sr-only">Checking permissions…</span>
      </div>
    );
  }

  if (denied) {
    return (
      <div className="flex justify-center py-16">
        <Card className="w-full max-w-md text-center">
          <CardHeader className="items-center gap-2">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <ShieldAlert className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
            </div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Error 403</p>
            <CardTitle className="text-xl">Admin access required</CardTitle>
            <CardDescription>
              This is an internal Gradr tool. Your account doesn&apos;t have admin permissions, so there&apos;s nothing
              to show here. The attempt has been logged.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 sm:flex-row sm:justify-center">
            <Button asChild>
              <Link to="/">Back to dashboard</Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/settings">Account settings</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <>{children}</>;
}

export default RequireAdmin;
