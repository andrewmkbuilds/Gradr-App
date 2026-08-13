import { createFileRoute } from "@tanstack/react-router";
import { TableSkeleton } from "@/components/skeletons/RouteSkeletons";
import AdminSeoPerformance from "@/pages/AdminSeoPerformance";
import { AnimatedPage } from "@/components/AnimatedPage";
import RequireAdmin from "@/components/RequireAdmin";

export const Route = createFileRoute("/_app/admin/seo-performance")({
  pendingComponent: () => <TableSkeleton />,
  pendingMs: 0,
  pendingMinMs: 300,
  component: () => (
    <RequireAdmin><AnimatedPage><AdminSeoPerformance /></AnimatedPage></RequireAdmin>
  ),
});
