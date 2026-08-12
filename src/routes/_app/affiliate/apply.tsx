import { createFileRoute } from "@tanstack/react-router";
import { GenericSkeleton } from "@/components/skeletons/RouteSkeletons";
import AffiliateApply from "@/pages/AffiliateApply";
import { AnimatedPage } from "@/components/AnimatedPage";

export const Route = createFileRoute("/_app/affiliate/apply")({
  pendingComponent: () => <GenericSkeleton />,
  pendingMs: 0,
  pendingMinMs: 300,
  component: () => (
    <AnimatedPage><AffiliateApply /></AnimatedPage>
  ),
});
