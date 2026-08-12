import { createFileRoute } from "@tanstack/react-router";
import { GenericSkeleton } from "@/components/skeletons/RouteSkeletons";
import AffiliateProgram from "@/pages/AffiliateProgram";
import { AnimatedPage } from "@/components/AnimatedPage";

export const Route = createFileRoute("/_app/affiliate/")({
  pendingComponent: () => <GenericSkeleton />,
  pendingMs: 0,
  pendingMinMs: 300,
  component: () => (
    <AnimatedPage><AffiliateProgram /></AnimatedPage>
  ),
});
