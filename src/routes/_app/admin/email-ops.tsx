import { createFileRoute } from "@tanstack/react-router";
import { TableSkeleton } from "@/components/skeletons/RouteSkeletons";
import AdminEmailOps from "@/pages/AdminEmailOps";
import { AnimatedPage } from "@/components/AnimatedPage";
import RequireAdmin from "@/components/RequireAdmin";

export const Route = createFileRoute("/_app/admin/email-ops")({
  pendingComponent: () => <TableSkeleton />,
  pendingMs: 0,
  pendingMinMs: 300,
  component: () => (
    <RequireAdmin><AnimatedPage><AdminEmailOps /></AnimatedPage></RequireAdmin>
  ),
});
