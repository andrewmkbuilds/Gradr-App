import { createFileRoute } from "@tanstack/react-router";
import { TableSkeleton } from "@/components/skeletons/RouteSkeletons";
import InterviewHistory from "@/pages/InterviewHistory";
import { AnimatedPage } from "@/components/AnimatedPage";

export const Route = createFileRoute("/_app/interview/history")({
  pendingComponent: () => <TableSkeleton />,
  pendingMs: 0,
  pendingMinMs: 300,
  component: () => (
    <AnimatedPage><InterviewHistory /></AnimatedPage>
  ),
});
