import { createFileRoute } from "@tanstack/react-router";
import MotionPlayground from "@/pages/MotionPlayground";
import { AnimatedPage } from "@/components/AnimatedPage";

export const Route = createFileRoute("/_app/motion-playground")({
  component: () => (
    <AnimatedPage>
      <MotionPlayground />
    </AnimatedPage>
  ),
});
