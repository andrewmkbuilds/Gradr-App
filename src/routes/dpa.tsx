import { createFileRoute } from "@tanstack/react-router";
import Dpa from "@/pages/legal/Dpa";
import { AnimatedPage } from "@/components/AnimatedPage";

export const Route = createFileRoute("/dpa")({
  component: () => (
    <AnimatedPage><Dpa /></AnimatedPage>
  ),
});
