import { createFileRoute } from "@tanstack/react-router";
import AiResumeBuilder from "@/pages/AiResumeBuilder";
import { AnimatedPage } from "@/components/AnimatedPage";

export const Route = createFileRoute("/ai-resume-builder")({
  component: () => (
    <AnimatedPage><AiResumeBuilder /></AnimatedPage>
  ),
});
