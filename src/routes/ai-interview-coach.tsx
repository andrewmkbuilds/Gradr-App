import { createFileRoute } from "@tanstack/react-router";
import AiInterviewCoach from "@/pages/AiInterviewCoach";
import { AnimatedPage } from "@/components/AnimatedPage";

export const Route = createFileRoute("/ai-interview-coach")({
  component: () => (
    <AnimatedPage><AiInterviewCoach /></AnimatedPage>
  ),
});
