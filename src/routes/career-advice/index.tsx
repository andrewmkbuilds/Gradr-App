import { createFileRoute } from "@tanstack/react-router";
import CareerAdvice from "@/pages/CareerAdvice";
import { AnimatedPage } from "@/components/AnimatedPage";

export const Route = createFileRoute("/career-advice/")({
  component: () => (
    <AnimatedPage><CareerAdvice /></AnimatedPage>
  ),
});
