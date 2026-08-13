import { createFileRoute } from "@tanstack/react-router";
import AffiliateProgram from "@/pages/AffiliateProgram";
import { AnimatedPage } from "@/components/AnimatedPage";

export const Route = createFileRoute("/_app/affiliate/")({
  component: () => (
    <AnimatedPage><AffiliateProgram /></AnimatedPage>
  ),
});
