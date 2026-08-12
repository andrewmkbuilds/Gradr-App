import { createFileRoute } from "@tanstack/react-router";
import AdminSecurityLog from "@/pages/AdminSecurityLog";
import { AnimatedPage } from "@/components/AnimatedPage";
import RequireAdmin from "@/components/RequireAdmin";

export const Route = createFileRoute("/_app/admin/security-log")({
  component: () => (
    <RequireAdmin><AnimatedPage><AdminSecurityLog /></AnimatedPage></RequireAdmin>
  ),
});
