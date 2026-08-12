import { createFileRoute } from "@tanstack/react-router";
import { JobsSkeleton } from "@/components/skeletons/RouteSkeletons";
import JobsFeed from "@/pages/JobsFeed";
import { AnimatedPage } from "@/components/AnimatedPage";

export const Route = createFileRoute("/_app/jobs")({
  pendingComponent: () => <JobsSkeleton />,
  pendingMs: 0,
  pendingMinMs: 300,
  component: () => (
    <AnimatedPage><JobsFeed /></AnimatedPage>
  ),
});
