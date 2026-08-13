import { createFileRoute } from "@tanstack/react-router";
import Onboarding from "@/pages/Onboarding";
import { AnimatedPage } from "@/components/AnimatedPage";

export const Route = createFileRoute("/_app/onboarding")({
  component: () => (
    <AnimatedPage>
      <Onboarding />
    </AnimatedPage>
  ),
});
