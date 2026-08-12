import { createFileRoute } from "@tanstack/react-router";
import { GenericSkeleton } from "@/components/skeletons/RouteSkeletons";
import Welcome from "@/pages/Welcome";
import { AnimatedPage } from "@/components/AnimatedPage";

export const Route = createFileRoute("/_app/welcome")({
  pendingComponent: () => <GenericSkeleton />,
  pendingMs: 0,
  pendingMinMs: 300,
  component: () => (
    <AnimatedPage><Welcome /></AnimatedPage>
  ),
});
