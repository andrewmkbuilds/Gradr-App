import { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Loader2, ShieldAlert } from "lucide-react";
import { useIsAdmin } from "@/hooks/useAffiliate";
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
 */
export function RequireAdmin({ children }: { children: ReactNode }) {
  const { data: isAdmin, isLoading } = useIsAdmin();

  if (isLoading) {
    return (
      <div className="flex justify-center py-24" role="status" aria-label="Checking permissions">
        <Loader2 className="h-6 w-6 animate-spin text-primary" aria-hidden="true" />
        <span className="sr-only">Checking permissions…</span>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex justify-center py-16">
        <Card className="w-full max-w-md text-center">
          <CardHeader className="items-center gap-2">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <ShieldAlert className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
            </div>
            <CardTitle className="text-xl">Admin access required</CardTitle>
            <CardDescription>
              This is an internal Gradr tool. Your account doesn&apos;t have admin permissions, so there&apos;s nothing
              to show here.
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
