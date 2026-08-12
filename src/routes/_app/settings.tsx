import { createFileRoute } from "@tanstack/react-router";
import { SettingsSkeleton } from "@/components/skeletons/RouteSkeletons";
import Settings from "@/pages/Settings";
import { AnimatedPage } from "@/components/AnimatedPage";

export const Route = createFileRoute("/_app/settings")({
  pendingComponent: () => <SettingsSkeleton />,
  pendingMs: 0,
  pendingMinMs: 300,
  component: () => (
    <AnimatedPage><Settings /></AnimatedPage>
  ),
});
