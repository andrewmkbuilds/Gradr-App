import { createFileRoute } from "@tanstack/react-router";
import AdminAffiliates from "@/pages/AdminAffiliates";
import { AnimatedPage } from "@/components/AnimatedPage";
import RequireAdmin from "@/components/RequireAdmin";

export const Route = createFileRoute("/_app/admin/affiliates")({
  component: () => (
    <RequireAdmin><AnimatedPage><AdminAffiliates /></AnimatedPage></RequireAdmin>
  ),
});
