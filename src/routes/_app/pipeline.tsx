import { createFileRoute } from "@tanstack/react-router";
import { PipelineSkeleton } from "@/components/skeletons/RouteSkeletons";
import Pipeline from "@/pages/Pipeline";
import { AnimatedPage } from "@/components/AnimatedPage";

export const Route = createFileRoute("/_app/pipeline")({
  pendingComponent: () => <PipelineSkeleton />,
  pendingMs: 0,
  pendingMinMs: 300,
  component: () => (
    <AnimatedPage><Pipeline /></AnimatedPage>
  ),
});
