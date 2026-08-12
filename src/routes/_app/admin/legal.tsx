import { createFileRoute } from "@tanstack/react-router";
import AdminLegal from "@/pages/AdminLegal";
import { AnimatedPage } from "@/components/AnimatedPage";
import RequireAdmin from "@/components/RequireAdmin";

export const Route = createFileRoute("/_app/admin/legal")({
  component: () => (
    <RequireAdmin><AnimatedPage><AdminLegal /></AnimatedPage></RequireAdmin>
  ),
});
