import { createFileRoute } from "@tanstack/react-router";
import AdminAuditLog from "@/pages/AdminAuditLog";
import { AnimatedPage } from "@/components/AnimatedPage";
import RequireAdmin from "@/components/RequireAdmin";

export const Route = createFileRoute("/_app/admin/audit-log")({
  component: () => (
    <RequireAdmin><AnimatedPage><AdminAuditLog /></AnimatedPage></RequireAdmin>
  ),
});
