import { describe, it, expect } from "vitest";
import { GUIDES } from "@/content/guides";
import { JOB_LANDINGS } from "@/content/jobLandings";
import { BLOG_POSTS } from "@/content/blogPosts";
import {
  SITE_ORIGIN,
  validateJsonLd,
  guideJsonLd,
  jobLandingJsonLd,
  blogPostJsonLd,
} from "@/lib/structuredData";

/**
 * CI guardrail: every content page's JSON-LD must stay structurally valid and
 * consistent. Failures here mean rich results would break in production.
 */

const collectUrls = (node: unknown, out: string[] = []): string[] => {
  if (Array.isArray(node)) node.forEach((n) => collectUrls(n, out));
  else if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      if (typeof v === "string" && /^https?:\/\//.test(v) && (k === "url" || k === "item" || k === "@id")) {
        out.push(v);
      } else collectUrls(v, out);
    }
  }
  return out;
};

describe("structured data: site origin", () => {
  it("uses the production domain", () => {
    expect(SITE_ORIGIN).toBe("https://gradr.me");
  });
});

describe.each([
  ["guide", GUIDES.map((g) => [g.slug, guideJsonLd(g)] as const)],
  ["job landing", JOB_LANDINGS.map((l) => [l.slug, jobLandingJsonLd(l)] as const)],
  ["blog post", BLOG_POSTS.map((p) => [p.slug, blogPostJsonLd(p)] as const)],
] as const)("%s JSON-LD", (kind, entries) => {
  it("has content to validate", () => {
    expect(entries.length).toBeGreaterThan(0);
  });

  it.each(entries.map(([slug]) => slug))(`${kind} %s emits valid schema`, (slug) => {
    const nodes = entries.find(([s]) => s === slug)![1];
    const errors = nodes.flatMap((node, i) => validateJsonLd(node, `${kind}/${slug}[${i}]`));
    expect(errors).toEqual([]);
  });

  it.each(entries.map(([slug]) => slug))(`${kind} %s has consistent types and URLs`, (slug) => {
    const nodes = entries.find(([s]) => s === slug)![1];

    // Every payload carries a breadcrumb and a FAQ block.
    const types = nodes.map((n) => n["@type"]);
    expect(types).toContain("BreadcrumbList");
    expect(types).toContain("FAQPage");

    // No duplicate top-level @type in a single page payload.
    expect(new Set(types).size).toBe(types.length);

    // All absolute URLs point at the canonical origin.
    for (const url of collectUrls(nodes)) {
      if (url.includes("schema.org")) continue;
      expect(url.startsWith(SITE_ORIGIN)).toBe(true);
    }

    // Serialises cleanly for <script type="application/ld+json">.
    expect(() => JSON.stringify(nodes)).not.toThrow();
    expect(JSON.stringify(nodes)).not.toContain("undefined");
  });
});
