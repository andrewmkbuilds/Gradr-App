import { createFileRoute } from "@tanstack/react-router";
import { DashboardSkeleton } from "@/components/skeletons/RouteSkeletons";
import Dashboard from "@/pages/Dashboard";
import { AnimatedPage } from "@/components/AnimatedPage";

export const Route = createFileRoute("/_app/")({
  pendingComponent: () => <DashboardSkeleton />,
  pendingMs: 0,
  pendingMinMs: 300,
  component: () => (
    <AnimatedPage><Dashboard /></AnimatedPage>
  ),
});
