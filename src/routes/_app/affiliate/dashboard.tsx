import { createFileRoute } from "@tanstack/react-router";
import AffiliateDashboard from "@/pages/AffiliateDashboard";
import { AnimatedPage } from "@/components/AnimatedPage";

export const Route = createFileRoute("/_app/affiliate/dashboard")({
  component: () => (
    <AnimatedPage><AffiliateDashboard /></AnimatedPage>
  ),
});
