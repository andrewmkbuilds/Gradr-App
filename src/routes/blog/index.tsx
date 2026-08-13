import { createFileRoute } from "@tanstack/react-router";
import BlogIndex from "@/pages/BlogIndex";
import { AnimatedPage } from "@/components/AnimatedPage";

export const Route = createFileRoute("/blog/")({
  // Title, description and social tags come from <RouteSeo /> (see the "/blog"
  // entry in its META map) so the page renders exactly one of each.
  component: () => (
    <AnimatedPage>
      <BlogIndex />
    </AnimatedPage>
  ),
});
