import { createFileRoute } from "@tanstack/react-router";
import ForgotPassword from "@/pages/ForgotPassword";
import { AnimatedPage } from "@/components/AnimatedPage";

export const Route = createFileRoute("/forgot-password")({
  component: () => (
    <AnimatedPage><ForgotPassword /></AnimatedPage>
  ),
});
