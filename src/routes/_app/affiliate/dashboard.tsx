import { createFileRoute } from "@tanstack/react-router";
import { DashboardSkeleton } from "@/components/skeletons/RouteSkeletons";
import AffiliateDashboard from "@/pages/AffiliateDashboard";
import { AnimatedPage } from "@/components/AnimatedPage";

export const Route = createFileRoute("/_app/affiliate/dashboard")({
  pendingComponent: () => <DashboardSkeleton />,
  pendingMs: 0,
  pendingMinMs: 300,
  component: () => (
    <AnimatedPage><AffiliateDashboard /></AnimatedPage>
  ),
});
