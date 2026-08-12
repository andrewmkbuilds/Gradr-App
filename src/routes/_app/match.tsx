import { createFileRoute } from "@tanstack/react-router";
import { JobsSkeleton } from "@/components/skeletons/RouteSkeletons";
import JobMatchingEngine from "@/pages/JobMatchingEngine";
import { AnimatedPage } from "@/components/AnimatedPage";

export const Route = createFileRoute("/_app/match")({
  pendingComponent: () => <JobsSkeleton />,
  pendingMs: 0,
  pendingMinMs: 300,
  component: () => (
    <AnimatedPage><JobMatchingEngine /></AnimatedPage>
  ),
});
