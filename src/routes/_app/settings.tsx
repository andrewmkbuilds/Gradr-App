import { createFileRoute } from "@tanstack/react-router";
import Settings from "@/pages/Settings";
import { AnimatedPage } from "@/components/AnimatedPage";

export const Route = createFileRoute("/_app/settings")({
  component: () => (
    <AnimatedPage><Settings /></AnimatedPage>
  ),
});
