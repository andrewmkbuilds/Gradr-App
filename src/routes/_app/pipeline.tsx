import { createFileRoute } from "@tanstack/react-router";
import Pipeline from "@/pages/Pipeline";
import { AnimatedPage } from "@/components/AnimatedPage";

export const Route = createFileRoute("/_app/pipeline")({
  component: () => (
    <AnimatedPage><Pipeline /></AnimatedPage>
  ),
});
