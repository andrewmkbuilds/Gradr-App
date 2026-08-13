import { createFileRoute } from "@tanstack/react-router";
import JobsFeed from "@/pages/JobsFeed";
import { AnimatedPage } from "@/components/AnimatedPage";

export const Route = createFileRoute("/_app/jobs")({
  component: () => (
    <AnimatedPage><JobsFeed /></AnimatedPage>
  ),
});
