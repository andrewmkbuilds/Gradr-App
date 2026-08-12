import { createFileRoute } from "@tanstack/react-router";
import BlogIndex from "@/pages/BlogIndex";
import { AnimatedPage } from "@/components/AnimatedPage";

export const Route = createFileRoute("/blog/")({
  head: () => ({
    meta: [
      { title: "Career Guides & Job Search Blog | Gradr" },
      {
        name: "description",
        content:
          "Practical guides on resumes, ATS scoring, applications, and interview prep from the Gradr career team.",
      },
      { property: "og:title", content: "Career Guides & Job Search Blog | Gradr" },
      {
        property: "og:description",
        content: "Practical guides on resumes, ATS scoring, applications, and interview prep.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <AnimatedPage>
      <BlogIndex />
    </AnimatedPage>
  ),
});
