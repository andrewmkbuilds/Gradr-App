import { createFileRoute } from "@tanstack/react-router";
import GrowthEngine from "@/pages/GrowthEngine";
import { AnimatedPage } from "@/components/AnimatedPage";

export const Route = createFileRoute("/_app/growth")({
  component: () => (
    <AnimatedPage><GrowthEngine /></AnimatedPage>
  ),
});
