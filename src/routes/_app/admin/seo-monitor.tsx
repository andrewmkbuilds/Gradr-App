import { createFileRoute } from "@tanstack/react-router";
import AdminSeoMonitor from "@/pages/AdminSeoMonitor";
import { AnimatedPage } from "@/components/AnimatedPage";
import RequireAdmin from "@/components/RequireAdmin";

export const Route = createFileRoute("/_app/admin/seo-monitor")({
  component: () => (
    <RequireAdmin><AnimatedPage><AdminSeoMonitor /></AnimatedPage></RequireAdmin>
  ),
});
