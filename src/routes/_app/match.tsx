import { createFileRoute } from "@tanstack/react-router";
import JobMatchingEngine from "@/pages/JobMatchingEngine";
import { AnimatedPage } from "@/components/AnimatedPage";

export const Route = createFileRoute("/_app/match")({
  component: () => (
    <AnimatedPage><JobMatchingEngine /></AnimatedPage>
  ),
});
