import { test, expect } from "../playwright-fixture";

/**
 * Lightweight visual regression for the top nav.
 *
 * Only the nav chrome is captured (not the whole page) so the snapshots stay
 * small and stable: they catch active-pill / highlight / colour mismatches
 * without being invalidated by unrelated landing-page changes.
 */

const desktopNav = "nav[aria-label='Main'] ul a[data-nav-item]";

const shot = {
  animations: "disabled" as const,
  maxDiffPixelRatio: 0.02,
};

async function settle(page: import("@playwright/test").Page) {
  await expect(page.locator("h1").first()).toBeVisible();
  // Freeze motion so the pill layout animation cannot smear a snapshot.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.waitForTimeout(150);
}

test.describe("nav visual regression — desktop", () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test("active pill renders consistently for each section", async ({ page }) => {
    await page.goto("/");
    await settle(page);

    const hrefs = await page.$$eval(desktopNav, (els) =>
      els.map((e) => e.getAttribute("data-nav-item")!),
    );
    const nav = page.locator("nav[aria-label='Main']");

    for (const href of hrefs.slice(0, 4)) {
      await page.locator(`${desktopNav}[data-nav-item="${href}"]`).click();
      await expect(page.locator(`${desktopNav}[data-active="true"]`)).toHaveCount(1);
      await page.waitForTimeout(120);
      await expect(nav).toHaveScreenshot(`nav-desktop-${href.replace("#", "")}.png`, shot);
    }
  });
});

test.describe("nav visual regression — mobile", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("mobile menu highlight renders consistently", async ({ page }) => {
    await page.goto("/");
    await settle(page);

    await page.getByRole("button", { name: /open menu/i }).click();
    const menu = page.locator("[data-mobile-menu]");
    await expect(menu).toBeVisible();
    await page.waitForTimeout(120);
    await expect(menu).toHaveScreenshot("nav-mobile-menu-open.png", shot);

    const href = await menu.locator("a[data-nav-item]").nth(1).getAttribute("data-nav-item");
    await menu.locator(`a[data-nav-item="${href}"]`).click();
    await page.getByRole("button", { name: /open menu/i }).click();
    await expect(page.locator("[data-mobile-menu] a[data-active='true']")).toHaveCount(1);
    await page.waitForTimeout(120);
    await expect(page.locator("[data-mobile-menu]")).toHaveScreenshot(
      "nav-mobile-menu-active.png",
      shot,
    );
  });
});
