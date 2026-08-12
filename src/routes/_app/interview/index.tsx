import { createFileRoute } from "@tanstack/react-router";
import { InterviewSkeleton } from "@/components/skeletons/RouteSkeletons";
import InterviewEngine from "@/pages/InterviewEngine";
import { AnimatedPage } from "@/components/AnimatedPage";

export const Route = createFileRoute("/_app/interview/")({
  pendingComponent: () => <InterviewSkeleton />,
  pendingMs: 0,
  pendingMinMs: 300,
  component: () => (
    <AnimatedPage><InterviewEngine /></AnimatedPage>
  ),
});
