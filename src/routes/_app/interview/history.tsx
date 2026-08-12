import { createFileRoute } from "@tanstack/react-router";
import InterviewHistory from "@/pages/InterviewHistory";
import { AnimatedPage } from "@/components/AnimatedPage";

export const Route = createFileRoute("/_app/interview/history")({
  component: () => (
    <AnimatedPage><InterviewHistory /></AnimatedPage>
  ),
});
