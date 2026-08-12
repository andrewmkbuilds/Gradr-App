import { createFileRoute } from "@tanstack/react-router";
import ResetPassword from "@/pages/ResetPassword";
import { AnimatedPage } from "@/components/AnimatedPage";

export const Route = createFileRoute("/reset-password")({
  component: () => (
    <AnimatedPage><ResetPassword /></AnimatedPage>
  ),
});
