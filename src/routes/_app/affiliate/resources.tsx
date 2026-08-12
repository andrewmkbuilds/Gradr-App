import { createFileRoute } from "@tanstack/react-router";
import AffiliateResources from "@/pages/AffiliateResources";
import { AnimatedPage } from "@/components/AnimatedPage";

export const Route = createFileRoute("/_app/affiliate/resources")({
  component: () => (
    <AnimatedPage><AffiliateResources /></AnimatedPage>
  ),
});
