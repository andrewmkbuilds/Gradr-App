import { createFileRoute } from "@tanstack/react-router";
import RefundPolicy from "@/pages/legal/RefundPolicy";
import { AnimatedPage } from "@/components/AnimatedPage";

export const Route = createFileRoute("/refund-policy")({
  component: () => (
    <AnimatedPage><RefundPolicy /></AnimatedPage>
  ),
});
