import { describe, expect, it } from "vitest";
import { GUIDES } from "@/content/guides";
import { BLOG_POSTS } from "@/content/blogPosts";
import { JOB_LANDINGS } from "@/content/jobLandings";
import {
  blogPostJsonLd,
  enginePageJsonLd,
  guideJsonLd,
  homeJsonLd,
  jobLandingJsonLd,
  legalJsonLd,
  pricingJsonLd,
  validateJsonLd,
} from "@/lib/structuredData";
import { TIERS } from "@/config/tiers";

const expectValid = (nodes: Record<string, unknown>[], label: string) => {
  const errors = nodes.flatMap((n, i) => validateJsonLd(n, `${label}[${i}]`));
  expect(errors, errors.join("\n")).toEqual([]);
};

describe("key page structured data", () => {
  it("home page emits a valid WebPage + breadcrumb", () => {
    const nodes = homeJsonLd({
      name: "Gradr | AI Career Copilot",
      description: "AI career copilot for resumes, jobs and interviews.",
    });
    expectValid(nodes, "home");
    expect(nodes.map((n) => n["@type"])).toEqual(["WebPage", "BreadcrumbList"]);
  });

  it("pricing page emits a Product with an offer per tier", () => {
    const nodes = pricingJsonLd({
      name: "Pricing",
      description: "Simple plans for every stage of your job search.",
      tiers: TIERS.map((t) => ({ name: t.name, description: t.description })),
    });
    expectValid(nodes, "pricing");
    const product = nodes.find((n) => n["@type"] === "Product") as Record<string, any>;
    expect(product.offers.offerCount).toBe(TIERS.length);
    expect(product.offers.offers).toHaveLength(TIERS.length);
  });

  it("engine pages emit a valid WebApplication", () => {
    const nodes = enginePageJsonLd({
      path: "/resume",
      name: "Resume Intelligence",
      description: "ATS scoring and AI rewrite suggestions for your resume.",
      features: ["ATS scoring"],
    });
    expectValid(nodes, "engine");
    expect(nodes[0]["@type"]).toBe("WebApplication");
  });
});

describe("content structured data", () => {
  it("every guide emits valid JSON-LD", () => {
    for (const guide of GUIDES) expectValid(guideJsonLd(guide), guide.slug);
  });

  it("every blog post emits valid JSON-LD", () => {
    for (const post of BLOG_POSTS) expectValid(blogPostJsonLd(post), post.slug);
  });

  it("every job landing emits valid JSON-LD", () => {
    for (const landing of JOB_LANDINGS) expectValid(jobLandingJsonLd(landing), landing.slug);
  });

  it("legal pages emit valid JSON-LD", () => {
    expectValid(
      legalJsonLd({
        path: "/privacy",
        name: "Privacy Policy",
        description: "How Gradr collects, uses, and protects your personal data.",
        lastUpdated: "2026-01-01",
      }),
      "privacy",
    );
  });
});

describe("validator", () => {
  it("rejects a relative URL and a missing context", () => {
    const errors = validateJsonLd({ "@type": "WebPage", name: "x", description: "y", url: "/x" }, "bad");
    expect(errors.length).toBeGreaterThan(0);
  });
});
