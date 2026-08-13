import { createFileRoute } from "@tanstack/react-router";
import { TableSkeleton } from "@/components/skeletons/RouteSkeletons";
import AdminBrandMetadata from "@/pages/AdminBrandMetadata";
import { AnimatedPage } from "@/components/AnimatedPage";
import RequireAdmin from "@/components/RequireAdmin";

export const Route = createFileRoute("/_app/admin/brand-metadata")({
  pendingComponent: () => <TableSkeleton />,
  pendingMs: 0,
  pendingMinMs: 300,
  component: () => (
    <RequireAdmin>
      <AnimatedPage>
        <AdminBrandMetadata />
      </AnimatedPage>
    </RequireAdmin>
  ),
});
