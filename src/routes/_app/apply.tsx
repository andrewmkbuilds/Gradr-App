import { createFileRoute } from "@tanstack/react-router";
import ApplicationEngine from "@/pages/ApplicationEngine";
import { AnimatedPage } from "@/components/AnimatedPage";

export const Route = createFileRoute("/_app/apply")({
  component: () => (
    <AnimatedPage><ApplicationEngine /></AnimatedPage>
  ),
});
