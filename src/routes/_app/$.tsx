import { createFileRoute } from "@tanstack/react-router";
import NotFound from "@/pages/NotFound";
import { AnimatedPage } from "@/components/AnimatedPage";

export const Route = createFileRoute("/_app/$")({
  component: () => (
    <AnimatedPage><NotFound /></AnimatedPage>
  ),
});
