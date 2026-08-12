import { test, expect } from "@playwright/test";

/**
 * Hard-refreshes every public route and asserts:
 *  - SEO metadata is in the initial HTML (title, description, canonical, OG, JSON-LD)
 *  - the legacy raw SEO fallback body text is never visible to a user
 */

const ROUTES = [
  "/",
  "/landing",
  "/pricing",
  "/auth",
  "/ats-resume-checker",
  "/terms",
  "/privacy",
  "/cookie-policy",
  "/refund-policy",
  "/dpa",
];

// Legacy pre-SSR fallback copy / containers that must never be user-visible.
const FALLBACK_SELECTORS = ["#seo-shell", "#app-splash", "[data-seo-fallback]"];
const FALLBACK_TEXT = [
  "Gradr is your AI career command center for resume analysis",
  "JavaScript is required",
  "Loading Gradr…",
];

for (const route of ROUTES) {
  test(`no visible SEO fallback on ${route}`, async ({ page }) => {
    const response = await page.goto(route, { waitUntil: "domcontentloaded" });
    const html = (await response?.text()) ?? "";

    // 1. Metadata present in the raw server HTML (before any JS runs).
    expect(html).toMatch(/<title>[^<]{10,}<\/title>/i);
    expect(html).toMatch(/name="description"[^>]+content="[^"]{40,}"/i);
    expect(html).toMatch(/rel="canonical"[^>]+href="https?:\/\//i);
    expect(html).toMatch(/property="og:title"/i);
    expect(html).toMatch(/application\/ld\+json/i);

    // 2. No fallback containers rendered at all.
    for (const selector of FALLBACK_SELECTORS) {
      await expect(page.locator(selector)).toHaveCount(0);
    }

    // 3. No fallback copy visible in the body, before or after hydration.
    for (const phase of ["pre-hydration", "post-hydration"] as const) {
      if (phase === "post-hydration") await page.waitForLoadState("networkidle");
      const visibleText = await page.evaluate(() => document.body.innerText);
      for (const phrase of FALLBACK_TEXT) {
        expect(visibleText, `${phrase} visible at ${phase}`).not.toContain(phrase);
      }
    }

    // 4. Splash must be gone once hydration + route loading finished.
    await expect(page.locator('[data-app-splash="visible"]')).toHaveCount(0);
  });
}
