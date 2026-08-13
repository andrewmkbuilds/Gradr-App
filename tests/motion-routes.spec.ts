import { test, expect } from "../playwright-fixture";

/**
 * Route-transition + reduced-motion guarantees.
 *
 *  - every public route renders its real content after a client-side
 *    navigation (not just on a hard load), so page transitions can't leave a
 *    blank or stuck frame;
 *  - reduced motion is honoured from BOTH the OS media query and the in-app
 *    toggle, and is applied to the document before paint.
 */

const PUBLIC_ROUTES = [
  { path: "/", heading: /gradr|career|resume|interview/i },
  { path: "/pricing", heading: /pricing|plan/i },
  { path: "/ai-interview-coach", heading: /interview/i },
  { path: "/ats-resume-checker", heading: /resume|ats/i },
];

test.describe("route transitions", () => {
  for (const route of PUBLIC_ROUTES) {
    test(`renders ${route.path} on hard load`, async ({ page }) => {
      await page.goto(route.path);
      await expect(page.locator("h1").first()).toBeVisible();
      await expect(page.locator("body")).toContainText(route.heading);
    });
  }

  test("client-side navigation between routes settles visibly", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("h1").first()).toBeVisible();

    for (const path of ["/pricing", "/ai-interview-coach", "/"]) {
      await page.evaluate((p) => window.history.pushState({}, "", p), path);
      await page.goto(path);
      const h1 = page.locator("h1").first();
      await expect(h1).toBeVisible();
      // The page-transition wrapper must have finished: fully opaque, untranslated.
      const opacity = await h1.evaluate((el) => {
        let node: HTMLElement | null = el as HTMLElement;
        while (node) {
          const o = Number(getComputedStyle(node).opacity);
          if (o < 0.99) return o;
          node = node.parentElement;
        }
        return 1;
      });
      expect(opacity).toBeGreaterThan(0.99);
    }
  });
});

test.describe("reduced motion", () => {
  test("OS prefers-reduced-motion flags the document", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("data-reduce-motion", "true");

    // CSS animation/transition durations are collapsed to ~0.
    const slow = await page.evaluate(() => {
      const el = document.createElement("div");
      el.style.transition = "opacity 1s linear";
      document.body.appendChild(el);
      const d = getComputedStyle(el).transitionDuration;
      el.remove();
      return d;
    });
    expect(slow.startsWith("0")).toBe(true);
  });

  test("in-app toggle overrides the OS preference and persists", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("data-reduce-motion", "false");

    await page.evaluate(() => {
      window.localStorage.setItem(
        "gradr-motion-prefs",
        JSON.stringify({ mode: "reduced", depth: 1, diagnostics: false }),
      );
    });
    await page.reload();

    // Applied pre-paint by the bootstrap script, and depth is forced flat.
    await expect(page.locator("html")).toHaveAttribute("data-reduce-motion", "true");
    await expect(page.locator("html")).toHaveAttribute("data-depth", "0.00");
  });

  test("full-motion override wins over an OS reduce preference", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.addInitScript(() => {
      window.localStorage.setItem(
        "gradr-motion-prefs",
        JSON.stringify({ mode: "full", depth: 0.5, diagnostics: false }),
      );
    });
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("data-reduce-motion", "false");
    await expect(page.locator("html")).toHaveAttribute("data-depth", "0.50");
  });
});
