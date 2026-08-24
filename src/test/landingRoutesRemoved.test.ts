import { describe, it, expect } from "vitest";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Regression guard for the deleted Landing/Home pages.
 *
 * The marketing landing page used to live at `/`, `/landing` and `/home` on the
 * app surface. It is gone: `/` is the authenticated dashboard, and the other two
 * hard-redirect. Crawler-facing artifacts must not advertise those routes, and
 * RouteSeo must keep them noindexed so nothing that already got crawled lingers.
 */

const LANDING_PATHS = ["/landing", "/home"];

function read(path: string) {
  return readFileSync(resolve(path), "utf8");
}

const SITEMAP_FILES = readdirSync(resolve("public")).filter(
  (f) => f.startsWith("sitemap") && f.endsWith(".xml"),
);

describe("landing/home routes are fully removed", () => {
  it("no Landing or Home page component remains", () => {
    for (const file of ["src/pages/Landing.tsx", "src/pages/Home.tsx"]) {
      expect(existsSync(resolve(file)), `${file} should not exist`).toBe(false);
    }
  });

  it("the app sitemap lists no landing/home URL", () => {
    const xml = read("public/sitemap.xml");
    for (const path of LANDING_PATHS) {
      expect(xml).not.toContain(`https://app.gradr.me${path}<`);
      expect(xml).not.toContain(`https://app.gradr.me${path}/`);
    }
    // The app surface root is the authenticated dashboard — never indexable.
    expect(xml).not.toContain("<loc>https://app.gradr.me/</loc>");
  });

  it("the sitemap generator emits no landing/home entries", () => {
    const source = read("scripts/generate-sitemap.ts");
    for (const path of LANDING_PATHS) {
      expect(source).not.toMatch(new RegExp(`path:\\s*["']${path}["']`));
    }
  });

  it("no sitemap on any surface points at an app.gradr.me landing/home URL", () => {
    for (const file of SITEMAP_FILES) {
      const xml = read(`public/${file}`);
      for (const path of LANDING_PATHS) {
        expect(xml, file).not.toContain(`https://app.gradr.me${path}`);
      }
    }
  });

  it("robots.txt advertises no landing/home path", () => {
    const robots = read("public/robots.txt");
    for (const path of LANDING_PATHS) {
      expect(robots).not.toMatch(new RegExp(`^(Allow|Disallow):\\s*${path}\\s*$`, "m"));
      expect(robots).not.toContain(`gradr.me${path}`);
    }
  });

  it("RouteSeo keeps /, /landing and /home noindexed", () => {
    const source = read("src/components/RouteSeo.tsx");
    const block = source.slice(
      source.indexOf("const NOINDEX_EXACT"),
      source.indexOf("const NOINDEX_PREFIXES"),
    );
    for (const path of ["/", ...LANDING_PATHS]) {
      expect(block, `${path} must be noindexed`).toContain(`"${path}"`);
    }
  });

  it("the router hard-redirects /landing and /home", () => {
    const app = read("src/App.tsx");
    for (const path of LANDING_PATHS) {
      expect(app).toMatch(
        new RegExp(`path="${path}"[^>]*element=\\{<Navigate to="/" replace`),
      );
    }
  });
});
