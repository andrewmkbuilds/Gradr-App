import { createFileRoute } from "@tanstack/react-router";
import { GenericSkeleton } from "@/components/skeletons/RouteSkeletons";
import GrowthEngine from "@/pages/GrowthEngine";
import { AnimatedPage } from "@/components/AnimatedPage";

export const Route = createFileRoute("/_app/growth")({
  pendingComponent: () => <GenericSkeleton />,
  pendingMs: 0,
  pendingMinMs: 300,
  component: () => (
    <AnimatedPage><GrowthEngine /></AnimatedPage>
  ),
});
