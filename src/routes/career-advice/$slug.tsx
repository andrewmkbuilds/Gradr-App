import { createFileRoute } from "@tanstack/react-router";
import GuideArticle from "@/pages/GuideArticle";
import { AnimatedPage } from "@/components/AnimatedPage";

export const Route = createFileRoute("/career-advice/$slug")({
  component: () => (
    <AnimatedPage><GuideArticle /></AnimatedPage>
  ),
});
