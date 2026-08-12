import { ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { useIsAdmin } from "@/hooks/useAffiliate";
import NotFound from "@/pages/NotFound";

/**
 * Route guard for internal tooling.
 *
 * Non-admins get the same 404 an unknown route returns, so admin surfaces are
 * not even discoverable by URL guessing. This is defence in depth only — every
 * admin table, RPC and edge function enforces `has_role(auth.uid(),'admin')`
 * server-side, so hiding the UI is never the security boundary.
 */
export function RequireAdmin({ children }: { children: ReactNode }) {
  const { data: isAdmin, isLoading } = useIsAdmin();

  if (isLoading) {
    return (
      <div className="flex justify-center py-24" role="status" aria-label="Checking permissions">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAdmin) return <NotFound />;

  return <>{children}</>;
}
