import { createFileRoute } from "@tanstack/react-router";
import AdminDiscounts from "@/pages/AdminDiscounts";
import { AnimatedPage } from "@/components/AnimatedPage";
import RequireAdmin from "@/components/RequireAdmin";

export const Route = createFileRoute("/_app/admin/discounts")({
  component: () => (
    <RequireAdmin><AnimatedPage><AdminDiscounts /></AnimatedPage></RequireAdmin>
  ),
});
