import { createFileRoute } from "@tanstack/react-router";
import AdminBlogAnalytics from "@/pages/AdminBlogAnalytics";
import { AnimatedPage } from "@/components/AnimatedPage";
import RequireAdmin from "@/components/RequireAdmin";

export const Route = createFileRoute("/_app/admin/blog-analytics")({
  component: () => (
    <RequireAdmin><AnimatedPage><AdminBlogAnalytics /></AnimatedPage></RequireAdmin>
  ),
});
