import { createFileRoute } from "@tanstack/react-router";
import { TableSkeleton } from "@/components/skeletons/RouteSkeletons";
import AdminRateLimits from "@/pages/AdminRateLimits";
import { AnimatedPage } from "@/components/AnimatedPage";
import RequireAdmin from "@/components/RequireAdmin";

export const Route = createFileRoute("/_app/admin/rate-limits")({
  pendingComponent: () => <TableSkeleton />,
  pendingMs: 0,
  pendingMinMs: 300,
  component: () => (
    <RequireAdmin><AnimatedPage><AdminRateLimits /></AnimatedPage></RequireAdmin>
  ),
});
