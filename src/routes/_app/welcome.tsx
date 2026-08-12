import { createFileRoute } from "@tanstack/react-router";
import Welcome from "@/pages/Welcome";
import { AnimatedPage } from "@/components/AnimatedPage";

export const Route = createFileRoute("/_app/welcome")({
  component: () => (
    <AnimatedPage><Welcome /></AnimatedPage>
  ),
});
