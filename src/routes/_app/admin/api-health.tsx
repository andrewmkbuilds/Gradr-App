import { createFileRoute } from "@tanstack/react-router";
import { TableSkeleton } from "@/components/skeletons/RouteSkeletons";
import AdminApiHealth from "@/pages/AdminApiHealth";
import { AnimatedPage } from "@/components/AnimatedPage";
import RequireAdmin from "@/components/RequireAdmin";

export const Route = createFileRoute("/_app/admin/api-health")({
  pendingComponent: () => <TableSkeleton />,
  pendingMs: 0,
  pendingMinMs: 300,
  component: () => (
    <RequireAdmin><AnimatedPage><AdminApiHealth /></AnimatedPage></RequireAdmin>
  ),
});
