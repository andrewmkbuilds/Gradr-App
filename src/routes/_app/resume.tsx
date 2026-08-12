import { createFileRoute } from "@tanstack/react-router";
import { ResumeSkeleton } from "@/components/skeletons/RouteSkeletons";
import ResumeEngine from "@/pages/ResumeEngine";
import { AnimatedPage } from "@/components/AnimatedPage";

export const Route = createFileRoute("/_app/resume")({
  pendingComponent: () => <ResumeSkeleton />,
  pendingMs: 0,
  pendingMinMs: 300,
  component: () => (
    <AnimatedPage><ResumeEngine /></AnimatedPage>
  ),
});
