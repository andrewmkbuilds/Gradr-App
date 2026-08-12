import { createFileRoute } from "@tanstack/react-router";
import Terms from "@/pages/legal/Terms";
import { AnimatedPage } from "@/components/AnimatedPage";

export const Route = createFileRoute("/terms")({
  component: () => (
    <AnimatedPage><Terms /></AnimatedPage>
  ),
});
