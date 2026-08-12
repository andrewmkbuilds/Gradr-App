import { createFileRoute } from "@tanstack/react-router";
import AdminSearchConsole from "@/pages/AdminSearchConsole";
import { AnimatedPage } from "@/components/AnimatedPage";
import RequireAdmin from "@/components/RequireAdmin";

export const Route = createFileRoute("/_app/admin/search-console")({
  component: () => (
    <RequireAdmin><AnimatedPage><AdminSearchConsole /></AnimatedPage></RequireAdmin>
  ),
});
