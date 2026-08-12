import { createFileRoute } from "@tanstack/react-router";
import JobSearchIndex from "@/pages/JobSearchIndex";
import { AnimatedPage } from "@/components/AnimatedPage";

export const Route = createFileRoute("/job-search/")({
  component: () => (
    <AnimatedPage><JobSearchIndex /></AnimatedPage>
  ),
});
