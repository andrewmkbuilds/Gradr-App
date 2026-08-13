import { createFileRoute } from "@tanstack/react-router";
import Dashboard from "@/pages/Dashboard";
import { AnimatedPage } from "@/components/AnimatedPage";

export const Route = createFileRoute("/_app/")({
  component: () => (
    <AnimatedPage><Dashboard /></AnimatedPage>
  ),
});
