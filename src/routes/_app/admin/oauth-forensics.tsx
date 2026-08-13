import { createFileRoute } from "@tanstack/react-router";
import { TableSkeleton } from "@/components/skeletons/RouteSkeletons";
import AdminOAuthForensics from "@/pages/AdminOAuthForensics";
import { AnimatedPage } from "@/components/AnimatedPage";
import RequireAdmin from "@/components/RequireAdmin";

export const Route = createFileRoute("/_app/admin/oauth-forensics")({
  pendingComponent: () => <TableSkeleton />,
  pendingMs: 0,
  pendingMinMs: 300,
  component: () => (
    <RequireAdmin>
      <AnimatedPage>
        <AdminOAuthForensics />
      </AnimatedPage>
    </RequireAdmin>
  ),
});
