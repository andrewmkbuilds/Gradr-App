import { createFileRoute } from "@tanstack/react-router";
import AdminVerifications from "@/pages/AdminVerifications";
import { AnimatedPage } from "@/components/AnimatedPage";
import RequireAdmin from "@/components/RequireAdmin";

export const Route = createFileRoute("/_app/admin/verifications")({
  component: () => (
    <RequireAdmin><AnimatedPage><AdminVerifications /></AnimatedPage></RequireAdmin>
  ),
});
