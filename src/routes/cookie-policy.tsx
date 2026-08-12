import { createFileRoute } from "@tanstack/react-router";
import CookiePolicy from "@/pages/legal/CookiePolicy";
import { AnimatedPage } from "@/components/AnimatedPage";

export const Route = createFileRoute("/cookie-policy")({
  component: () => (
    <AnimatedPage><CookiePolicy /></AnimatedPage>
  ),
});
