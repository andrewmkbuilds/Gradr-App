import { createFileRoute } from "@tanstack/react-router";
import { BillingSkeleton } from "@/components/skeletons/RouteSkeletons";
import Billing from "@/pages/Billing";
import { AnimatedPage } from "@/components/AnimatedPage";

export const Route = createFileRoute("/_app/billing")({
  pendingComponent: () => <BillingSkeleton />,
  pendingMs: 0,
  pendingMinMs: 300,
  component: () => (
    <AnimatedPage><Billing /></AnimatedPage>
  ),
});
