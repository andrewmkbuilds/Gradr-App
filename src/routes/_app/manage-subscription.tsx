import { createFileRoute } from "@tanstack/react-router";
import Billing from "@/pages/Billing";
import { AnimatedPage } from "@/components/AnimatedPage";

export const Route = createFileRoute("/_app/manage-subscription")({
  component: () => (
    <AnimatedPage><Billing /></AnimatedPage>
  ),
});
