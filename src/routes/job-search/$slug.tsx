import { createFileRoute } from "@tanstack/react-router";
import JobLanding from "@/pages/JobLanding";
import { AnimatedPage } from "@/components/AnimatedPage";

export const Route = createFileRoute("/job-search/$slug")({
  component: () => (
    <AnimatedPage><JobLanding /></AnimatedPage>
  ),
});
