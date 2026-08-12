import { createFileRoute } from "@tanstack/react-router";
import AiResumeOptimization from "@/pages/blog/AiResumeOptimization";
import { AnimatedPage } from "@/components/AnimatedPage";

export const Route = createFileRoute("/blog/ai-resume-optimization")({
  component: () => (
    <AnimatedPage><AiResumeOptimization /></AnimatedPage>
  ),
});
