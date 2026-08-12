import { createFileRoute } from "@tanstack/react-router";
import AdminPaddle from "@/pages/AdminPaddle";
import { AnimatedPage } from "@/components/AnimatedPage";
import RequireAdmin from "@/components/RequireAdmin";

export const Route = createFileRoute("/_app/admin/paddle")({
  component: () => (
    <RequireAdmin><AnimatedPage><AdminPaddle /></AnimatedPage></RequireAdmin>
  ),
});
