import { createFileRoute } from "@tanstack/react-router";
import InterviewEngine from "@/pages/InterviewEngine";
import { AnimatedPage } from "@/components/AnimatedPage";

export const Route = createFileRoute("/_app/interview/")({
  component: () => (
    <AnimatedPage><InterviewEngine /></AnimatedPage>
  ),
});
