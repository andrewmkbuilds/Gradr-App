import { createFileRoute } from "@tanstack/react-router";
import DigestPreview from "@/pages/DigestPreview";
import { AnimatedPage } from "@/components/AnimatedPage";
import RequireAdmin from "@/components/RequireAdmin";

export const Route = createFileRoute("/_app/admin/digest-preview")({
  component: () => (
    <RequireAdmin><AnimatedPage><DigestPreview /></AnimatedPage></RequireAdmin>
  ),
});
