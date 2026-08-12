import { createFileRoute } from "@tanstack/react-router";
import { GenericSkeleton } from "@/components/skeletons/RouteSkeletons";
import AffiliateResources from "@/pages/AffiliateResources";
import { AnimatedPage } from "@/components/AnimatedPage";

export const Route = createFileRoute("/_app/affiliate/resources")({
  pendingComponent: () => <GenericSkeleton />,
  pendingMs: 0,
  pendingMinMs: 300,
  component: () => (
    <AnimatedPage><AffiliateResources /></AnimatedPage>
  ),
});
