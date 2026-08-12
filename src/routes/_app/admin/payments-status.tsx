import { createFileRoute } from "@tanstack/react-router";
import AdminPaymentsStatus from "@/pages/AdminPaymentsStatus";
import { AnimatedPage } from "@/components/AnimatedPage";
import RequireAdmin from "@/components/RequireAdmin";

export const Route = createFileRoute("/_app/admin/payments-status")({
  component: () => (
    <RequireAdmin><AnimatedPage><AdminPaymentsStatus /></AnimatedPage></RequireAdmin>
  ),
});
