import { createFileRoute } from "@tanstack/react-router";
import Landing from "@/pages/Landing";
import { AnimatedPage } from "@/components/AnimatedPage";

export const Route = createFileRoute("/landing")({
  component: () => (
    <AnimatedPage><Landing /></AnimatedPage>
  ),
});
