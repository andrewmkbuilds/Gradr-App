import { createFileRoute } from "@tanstack/react-router";
import ResumeEngine from "@/pages/ResumeEngine";
import { AnimatedPage } from "@/components/AnimatedPage";

export const Route = createFileRoute("/_app/resume")({
  component: () => (
    <AnimatedPage><ResumeEngine /></AnimatedPage>
  ),
});
