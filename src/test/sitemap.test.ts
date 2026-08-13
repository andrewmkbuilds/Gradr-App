import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  SITEMAP_BASE_URL,
  SITEMAP_ENTRIES,
  generateSitemap,
  parseSitemapPaths,
  validateSitemap,
} from "@/lib/sitemap";
import { GUIDES, guidePath } from "@/content/guides";
import { JOB_LANDINGS, jobLandingPath } from "@/content/jobLandings";

const committed = readFileSync(resolve("public/sitemap.xml"), "utf8");
const routeTree = readFileSync(resolve("src/routeTree.gen.ts"), "utf8");
const robots = readFileSync(resolve("public/robots.txt"), "utf8");

/** Route paths declared by the generated TanStack route tree. */
const routePaths = new Set(
  [...routeTree.matchAll(/fullPath: '([^']+)'/g)].map((m) =>
    m[1].length > 1 ? m[1].replace(/\/+$/, "") : m[1],
  ),
);

describe("sitemap", () => {
  it("committed public/sitemap.xml matches the generator output", () => {
    expect(committed.trim()).toBe(generateSitemap(SITEMAP_ENTRIES).trim());
  });

  it("is structurally valid", () => {
    const errors = validateSitemap(committed);
    expect(errors, errors.join("\n")).toEqual([]);
  });

  it("every entry resolves to a real route", () => {
    const missing = parseSitemapPaths(committed).filter((path) => {
      if (routePaths.has(path)) return true ? false : false;
      // Dynamic content pages resolve through their $slug route.
      if (path.startsWith("/career-advice/")) return !routePaths.has("/career-advice/$slug");
      if (path.startsWith("/job-search/")) return !routePaths.has("/job-search/$slug");
      return true;
    });
    expect(missing, `sitemap paths without a route: ${missing.join(", ")}`).toEqual([]);
  });

  it("lists every guide and job landing page", () => {
    const paths = new Set(parseSitemapPaths(committed));
    for (const guide of GUIDES) expect(paths.has(guidePath(guide.slug))).toBe(true);
    for (const landing of JOB_LANDINGS) expect(paths.has(jobLandingPath(landing.slug))).toBe(true);
  });

  it("never advertises an authenticated or credential surface", () => {
    const forbidden = [
      "/auth",
      "/settings",
      "/billing",
      "/resume",
      "/jobs",
      "/match",
      "/pipeline",
      "/apply",
      "/interview",
      "/growth",
      "/welcome",
      "/forgot-password",
      "/reset-password",
      "/verify-email",
    ];
    const paths = parseSitemapPaths(committed);
    const leaked = paths.filter((p) => forbidden.includes(p) || p.startsWith("/admin"));
    expect(leaked, `noindex routes in sitemap: ${leaked.join(", ")}`).toEqual([]);
  });

  it("is not blocked by robots.txt and is advertised there", () => {
    expect(robots).toContain(`${SITEMAP_BASE_URL}/sitemap.xml`);
    expect(robots).not.toMatch(/^Disallow: \/$/m);
  });
});
