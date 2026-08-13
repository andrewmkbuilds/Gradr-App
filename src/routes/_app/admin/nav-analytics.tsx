import { createFileRoute } from "@tanstack/react-router";
import AdminNavAnalytics from "@/pages/AdminNavAnalytics";
import { AnimatedPage } from "@/components/AnimatedPage";
import RequireAdmin from "@/components/RequireAdmin";

export const Route = createFileRoute("/_app/admin/nav-analytics")({
  component: () => (
    <RequireAdmin><AnimatedPage><AdminNavAnalytics /></AnimatedPage></RequireAdmin>
  ),
});
