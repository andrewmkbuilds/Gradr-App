import { createFileRoute } from "@tanstack/react-router";
import AtsResumeChecker from "@/pages/AtsResumeChecker";
import { AnimatedPage } from "@/components/AnimatedPage";

export const Route = createFileRoute("/ats-resume-checker")({
  component: () => (
    <AnimatedPage><AtsResumeChecker /></AnimatedPage>
  ),
});
