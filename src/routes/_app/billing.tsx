import { createFileRoute } from "@tanstack/react-router";
import Billing from "@/pages/Billing";
import { AnimatedPage } from "@/components/AnimatedPage";

export const Route = createFileRoute("/_app/billing")({
  component: () => (
    <AnimatedPage><Billing /></AnimatedPage>
  ),
});
