import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { navGroups, dashboardItem } from "@/config/nav";
import { navPath, resolveNavLocation } from "@/lib/navAnalytics";

/**
 * Guarantees every sidebar / mobile-tab destination maps to a real route and
 * that active-state resolution stays correct for desktop and mobile.
 */
const APP = readFileSync(join(process.cwd(), "src/App.tsx"), "utf8");
const ROUTES = Array.from(APP.matchAll(/<Route\s+path="([^"]+)"/g)).map((m) => m[1]);

/** Does a declared route pattern match this concrete path? */
function routeExists(path: string) {
  return ROUTES.some((pattern) => {
    if (pattern === path) return true;
    if (!pattern.includes(":")) return false;
    const re = new RegExp("^" + pattern.replace(/:[^/]+/g, "[^/]+") + "$");
    return re.test(path);
  });
}

// Cross-surface items (docs, news, marketing, affiliates) are resolved through
// `urlFor(surface, url)`, so their `url` is relative to *that* surface's route
// tree and never appears as a <Route> in the app surface.
const inSurface = <T extends { surface?: string }>(items: T[]) => items.filter((i) => !i.surface);

const allLinks = [
  { title: dashboardItem.title, url: dashboardItem.url, group: "root" },
  ...navGroups.flatMap((g) => [
    { title: `${g.title} (group header)`, url: g.url, group: g.id },
    ...inSurface(g.items).map((i) => ({ title: i.title, url: i.url, group: g.id })),
  ]),
];

describe("navigation routes", () => {
  it.each(allLinks.map((l) => [`${l.group} → ${l.title}`, l.url]))("%s resolves to a route", (_label, url) => {
    expect(routeExists(navPath(url as string)), `${url} has no matching <Route>`).toBe(true);
  });

  it("has no duplicate destinations within a group", () => {
    for (const group of navGroups) {
      const urls = group.items.map((i) => `${i.surface ?? "app"}${i.url}`);
      expect(new Set(urls).size, `${group.id} has duplicate links`).toBe(urls.length);
    }
  });


  it("marks admin links adminOnly so they are filtered for regular users", () => {
    for (const group of navGroups) {
      const hasAdminPath = group.items.some((i) => i.url.startsWith("/admin"));
      if (hasAdminPath) expect(group.adminOnly, `${group.id} exposes /admin links`).toBe(true);
    }
  });

  it("guards every /admin route with RequireAdmin", () => {
    const adminRoutes = APP.split("\n").filter((l) => /path="\/admin\//.test(l));
    expect(adminRoutes.length).toBeGreaterThan(0);
    for (const line of adminRoutes) expect(line).toMatch(/RequireAdmin/);
  });
});

describe("active state resolution", () => {
  it.each(
    navGroups.flatMap((g) => g.items.map((i) => [`${g.id}/${i.title}`, navPath(i.url), g.id] as const)),
  )("%s resolves back to its owning group", (_label, path, groupId) => {
    expect(resolveNavLocation(path).group?.id).toBe(groupId);
  });

  it("keeps nested routes active under their parent item", () => {
    // /interview/history is matchPrefix, so a deeper child still belongs to it.
    const nested = resolveNavLocation("/interview/history/abc123");
    expect(nested.group?.id).toBe("interview");
    expect(nested.item?.url).toBe("/interview/history");
  });

  it("hash-only subtabs share the parent route", () => {
    const growth = navGroups.find((g) => g.id === "growth")!;
    const hashed = growth.items.filter((i) => i.url.includes("#"));
    expect(hashed.length).toBeGreaterThan(0);
    for (const i of hashed) expect(routeExists(navPath(i.url))).toBe(true);
  });

  it("mobile tab bar destinations are a subset of sidebar groups", () => {
    const primaryIds = ["career", "interview", "growth", "account"];
    for (const id of primaryIds) {
      const group = navGroups.find((g) => g.id === id);
      expect(group, `mobile tab "${id}" has no matching nav group`).toBeTruthy();
      expect(routeExists(navPath(group!.url))).toBe(true);
    }
  });

  it("returns no group for public marketing paths", () => {
    expect(resolveNavLocation("/privacy").group).toBeUndefined();
  });
});
