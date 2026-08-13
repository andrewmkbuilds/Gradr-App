import { createFileRoute } from "@tanstack/react-router";
import AffiliateApply from "@/pages/AffiliateApply";
import { AnimatedPage } from "@/components/AnimatedPage";

export const Route = createFileRoute("/_app/affiliate/apply")({
  component: () => (
    <AnimatedPage><AffiliateApply /></AnimatedPage>
  ),
});
