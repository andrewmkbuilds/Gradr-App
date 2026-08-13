import { test, expect } from "../playwright-fixture";

/**
 * Top-nav active-state synchronisation guarantees.
 *
 *  - clicking a nav item paints the active state immediately (no waiting for
 *    the smooth scroll to land);
 *  - rapid consecutive clicks always settle on the LAST clicked section;
 *  - the mobile menu closes and syncs active state in the same interaction;
 *  - scroll-spy keeps up while the user scrolls freely;
 *  - `prefers-reduced-motion` makes scrolling and spy updates instant;
 *  - Tab + Enter drives the nav exactly like a click does.
 */

const desktopNav = "nav[aria-label='Main'] ul a[data-nav-item]";

async function navHrefs(page: import("@playwright/test").Page) {
  return page.$$eval(desktopNav, (els) => els.map((e) => e.getAttribute("data-nav-item")!));
}

test.describe("desktop nav active state", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("h1").first()).toBeVisible();
  });

  test("click syncs the active item instantly", async ({ page }) => {
    const hrefs = await navHrefs(page);
    expect(hrefs.length).toBeGreaterThan(1);

    for (const href of hrefs) {
      const link = page.locator(`${desktopNav}[data-nav-item="${href}"]`);
      await link.click();
      // No waiting: the attribute must already be correct right after the click.
      await expect(link).toHaveAttribute("data-active", "true", { timeout: 1000 });
      await expect(link).toHaveAttribute("aria-current", "true");
      // Exactly one active item at a time.
      await expect(page.locator(`${desktopNav}[data-active="true"]`)).toHaveCount(1);
      expect(new URL(page.url()).hash).toBe(href);
    }
  });

  test("rapid clicks settle on the last clicked section", async ({ page }) => {
    const hrefs = await navHrefs(page);
    const last = hrefs[hrefs.length - 1];

    for (const href of hrefs) {
      await page.locator(`${desktopNav}[data-nav-item="${href}"]`).click({ delay: 0 });
    }

    const active = page.locator(`${desktopNav}[data-active="true"]`);
    await expect(active).toHaveCount(1);
    await expect(active).toHaveAttribute("data-nav-item", last);

    // And it stays there while the programmatic scroll settles.
    await page.waitForTimeout(1200);
    await expect(page.locator(`${desktopNav}[data-active="true"]`)).toHaveAttribute(
      "data-nav-item",
      last,
    );
  });

  test("scroll-spy tracks rapid section changes", async ({ page }) => {
    const hrefs = await navHrefs(page);

    for (const href of hrefs) {
      await page.evaluate((h) => {
        const el = document.getElementById(h.slice(1));
        el?.scrollIntoView({ behavior: "auto", block: "start" });
      }, href);
      await expect(page.locator(`${desktopNav}[data-active="true"]`)).toHaveCount(1);
    }

    // Jump to the very bottom: the final section must win.
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await expect(page.locator(`${desktopNav}[data-active="true"]`)).toHaveAttribute(
      "data-nav-item",
      hrefs[hrefs.length - 1],
    );
  });

  test("keyboard: Tab reaches nav items and Enter activates them", async ({ page }) => {
    const hrefs = await navHrefs(page);
    const target = hrefs[1] ?? hrefs[0];
    const link = page.locator(`${desktopNav}[data-nav-item="${target}"]`);

    await link.focus();
    await expect(link).toBeFocused();
    await page.keyboard.press("Enter");

    await expect(link).toHaveAttribute("data-active", "true");
    expect(new URL(page.url()).hash).toBe(target);

    // Arrow keys move focus between nav items without changing active state.
    await page.keyboard.press("ArrowRight");
    const focusedHref = await page.evaluate(
      () => document.activeElement?.getAttribute("data-nav-item") ?? null,
    );
    expect(focusedHref).not.toBeNull();
    expect(focusedHref).not.toBe(target);
    await expect(link).toHaveAttribute("data-active", "true");
  });

  test("tabbing forward from the logo lands on a nav item", async ({ page }) => {
    await page.locator("nav[aria-label='Main'] a[href='#hero']").focus();
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press("Tab");
      const href = await page.evaluate(
        () => document.activeElement?.getAttribute("data-nav-item") ?? null,
      );
      if (href) {
        await page.keyboard.press("Enter");
        await expect(
          page.locator(`${desktopNav}[data-nav-item="${href}"]`),
        ).toHaveAttribute("data-active", "true");
        return;
      }
    }
    throw new Error("Tab never reached a nav item");
  });
});

test.describe("mobile menu", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("selecting an item closes the menu and syncs active state", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("h1").first()).toBeVisible();

    const toggle = page.getByRole("button", { name: /open menu/i });
    await toggle.click();
    const menu = page.locator("[data-mobile-menu]");
    await expect(menu).toBeVisible();

    const href = await menu.locator("a[data-nav-item]").nth(1).getAttribute("data-nav-item");
    await menu.locator(`a[data-nav-item="${href}"]`).click();

    // Menu closes and the body scroll lock is released — no stuck overflow.
    await expect(page.locator("[data-mobile-menu]")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /open menu/i })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    expect(await page.evaluate(() => document.body.style.overflow)).toBe("");
    expect(new URL(page.url()).hash).toBe(href);

    // Re-open: the chosen item is the active one.
    await page.getByRole("button", { name: /open menu/i }).click();
    const active = page.locator("[data-mobile-menu] a[data-active='true']");
    await expect(active).toHaveCount(1);
    await expect(active).toHaveAttribute("data-nav-item", href!);
  });

  test("rapid open/select cycles never leave the menu stuck", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("h1").first()).toBeVisible();

    for (let i = 0; i < 3; i++) {
      await page.getByRole("button", { name: /open menu/i }).click();
      const menu = page.locator("[data-mobile-menu]");
      await expect(menu).toBeVisible();
      await menu.locator("a[data-nav-item]").nth(i).click();
      await expect(page.locator("[data-mobile-menu]")).toHaveCount(0);
      expect(await page.evaluate(() => document.body.style.overflow)).toBe("");
    }
  });
});

test.describe("reduced motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("nav clicks scroll instantly and sync active state", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("h1").first()).toBeVisible();

    const hrefs = await navHrefs(page);
    const target = hrefs[hrefs.length - 1];
    const link = page.locator(`${desktopNav}[data-nav-item="${target}"]`);

    const before = await page.evaluate(() => window.scrollY);
    await link.click();

    // Instant: the scroll position has already moved by the next tick, with no
    // smooth-scroll animation to wait out.
    const after = await page.evaluate(() => window.scrollY);
    expect(after).not.toBe(before);
    await expect(link).toHaveAttribute("data-active", "true");

    // Scroll-spy is synchronous too — one scroll, immediate active update.
    await page.evaluate((h) => {
      document.getElementById(h.slice(1))?.scrollIntoView({ behavior: "auto", block: "start" });
    }, hrefs[0]);
    await expect(page.locator(`${desktopNav}[data-active="true"]`)).toHaveCount(1);
  });

  test("smooth scrolling is not requested when reduced motion is on", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => {
      (window as unknown as { __behaviors: string[] }).__behaviors = [];
      const orig = Element.prototype.scrollIntoView;
      Element.prototype.scrollIntoView = function (arg?: boolean | ScrollIntoViewOptions) {
        const b = typeof arg === "object" && arg ? String(arg.behavior) : "auto";
        (window as unknown as { __behaviors: string[] }).__behaviors.push(b);
        return orig.call(this, arg as ScrollIntoViewOptions);
      };
    });

    const hrefs = await navHrefs(page);
    await page.locator(`${desktopNav}[data-nav-item="${hrefs[1] ?? hrefs[0]}"]`).click();

    const behaviors = await page.evaluate(
      () => (window as unknown as { __behaviors: string[] }).__behaviors,
    );
    expect(behaviors.length).toBeGreaterThan(0);
    expect(behaviors).not.toContain("smooth");
  });
});
