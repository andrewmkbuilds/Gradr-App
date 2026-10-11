import { ReactNode, useEffect, useRef } from "react";
import { Link, useLocation } from "react-router-dom";
import { ShieldAlert } from "lucide-react";
import { useIsAdmin } from "@/hooks/useAffiliate";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ds/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageLoadingSkeleton } from "@/components/states/PageLoadingSkeleton";

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
    void supabase.rpc("log_admin_access_denied", { _route: pathname, _reason: "not_admin" }).then(({ error }) => {
      if (error) console.warn("[admin-guard] audit write failed", error.message);
    });
  }, [denied, pathname, user]);

  if (isLoading) return <PageLoadingSkeleton variant="admin" />;

  if (denied) {
    return (
      <div className="flex justify-center py-16">
        <Card className="w-full max-w-md text-center">
          <CardHeader className="items-center gap-2">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted"><ShieldAlert className="h-6 w-6 text-muted-foreground" aria-hidden="true" /></div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Error 403</p>
            <CardTitle className="text-xl">Admin access required</CardTitle>
            <CardDescription>This is an internal Gradr tool. Your account doesn&apos;t have admin permissions, so there&apos;s nothing to show here. The attempt has been logged.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 sm:flex-row sm:justify-center"><Button asChild><Link to="/">Back to dashboard</Link></Button><Button asChild variant="outline"><Link to="/settings">Account settings</Link></Button></CardContent>
        </Card>
      </div>
    );
  }

  return <>{children}</>;
}

export default RequireAdmin;
