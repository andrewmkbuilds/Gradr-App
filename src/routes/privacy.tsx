import { createFileRoute } from "@tanstack/react-router";
import Privacy from "@/pages/legal/Privacy";
import { AnimatedPage } from "@/components/AnimatedPage";

export const Route = createFileRoute("/privacy")({
  component: () => (
    <AnimatedPage><Privacy /></AnimatedPage>
  ),
});
