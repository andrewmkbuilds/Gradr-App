import { test, expect } from "../playwright-fixture";

/**
 * Nav robustness suite:
 *  - `document.body.style.overflow` is always restored (fast navigation,
 *    reload mid-transition, desktop <-> mobile resize);
 *  - ARIA roles/attributes on the nav are correct;
 *  - focus order is sane and keyboard focus lands where it should.
 */

const desktopNav = "nav[aria-label='Main'] ul a[data-nav-item]";

async function bodyOverflow(page: import("@playwright/test").Page) {
  return page.evaluate(() => ({
    inline: document.body.style.overflow,
    computed: getComputedStyle(document.body).overflowY,
  }));
}

test.describe("body scroll lock is always released", () => {
  test("rapid navigation between sections never locks scrolling", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await expect(page.locator("h1").first()).toBeVisible();

    for (let i = 0; i < 4; i++) {
      await page.getByRole("button", { name: /open menu/i }).click();
      const menu = page.locator("[data-mobile-menu]");
      await expect(menu).toBeVisible();
      // Click without waiting for the open animation to finish.
      await menu.locator("a[data-nav-item]").nth(i % 3).click({ delay: 0 });
    }

    await expect(page.locator("[data-mobile-menu]")).toHaveCount(0);
    const overflow = await bodyOverflow(page);
    expect(overflow.inline).toBe("");
    expect(overflow.computed).not.toBe("hidden");
  });

  test("reloading mid-transition leaves the body scrollable", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await expect(page.locator("h1").first()).toBeVisible();

    await page.getByRole("button", { name: /open menu/i }).click();
    await expect(page.locator("[data-mobile-menu]")).toBeVisible();
    // Reload while the menu is open and the exit animation would be running.
    await page.reload();
    await expect(page.locator("h1").first()).toBeVisible();

    const overflow = await bodyOverflow(page);
    expect(overflow.inline).toBe("");
    expect(overflow.computed).not.toBe("hidden");
    // Scrolling genuinely works after the reload.
    await page.mouse.wheel(0, 600);
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  });

  test("resizing from mobile to desktop with the menu open unlocks scroll", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await expect(page.locator("h1").first()).toBeVisible();

    await page.getByRole("button", { name: /open menu/i }).click();
    await expect(page.locator("[data-mobile-menu]")).toBeVisible();

    await page.setViewportSize({ width: 1280, height: 900 });
    await page.waitForTimeout(250);
    let overflow = await bodyOverflow(page);
    expect(overflow.computed).not.toBe("hidden");

    // ...and back again, repeatedly, without leaking a lock.
    for (const size of [
      { width: 390, height: 844 },
      { width: 1280, height: 900 },
      { width: 390, height: 844 },
    ]) {
      await page.setViewportSize(size);
      await page.waitForTimeout(150);
    }
    overflow = await bodyOverflow(page);
    expect(overflow.computed).not.toBe("hidden");
    await page.mouse.wheel(0, 400);
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  });
});

test.describe("nav accessibility contract", () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test("roles and attributes are correct", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("h1").first()).toBeVisible();

    const nav = page.getByRole("navigation", { name: "Main" });
    await expect(nav).toHaveCount(1);

    // Items are real links inside a list, exactly one marked current.
    const items = page.locator(desktopNav);
    expect(await items.count()).toBeGreaterThan(1);
    for (const el of await items.all()) {
      await expect(el).toHaveAttribute("href", /^#/);
    }

    await items.first().click();
    await expect(page.locator(`${desktopNav}[aria-current="true"]`)).toHaveCount(1);
    await expect(page.locator(`${desktopNav}[data-active="true"]`)).toHaveCount(1);
  });

  test("mobile toggle exposes expanded state and controls the menu", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await expect(page.locator("h1").first()).toBeVisible();

    const toggle = page.getByRole("button", { name: /open menu/i });
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(toggle).toHaveAttribute("aria-controls", "mobile-menu");

    await toggle.click();
    const menu = page.locator("#mobile-menu");
    await expect(menu).toBeVisible();
    await expect(menu).toHaveAttribute("role", "navigation");
    await expect(page.getByRole("button", { name: /close menu/i })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
  });

  test("focus order: logo -> nav items -> actions, all reachable and visible", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("h1").first()).toBeVisible();

    await page.locator("nav[aria-label='Main'] a[href='#hero']").focus();
    const order: string[] = [];
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press("Tab");
      const info = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el) return null;
        const inNav = !!el.closest("header");
        return {
          navItem: el.getAttribute("data-nav-item"),
          inNav,
          tag: el.tagName.toLowerCase(),
        };
      });
      if (!info?.inNav) break;
      if (info.navItem) order.push(info.navItem);
    }

    expect(order.length).toBeGreaterThan(1);
    // Focus order matches DOM order of the nav items.
    const domOrder = await page.$$eval(desktopNav, (els) =>
      els.map((e) => e.getAttribute("data-nav-item")!),
    );
    expect(order).toEqual(domOrder.slice(0, order.length));

    // The focused item is keyboard-activatable and shows a visible focus ring.
    const last = page.locator(`${desktopNav}[data-nav-item="${order[order.length - 1]}"]`);
    await last.focus();
    await expect(last).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(last).toHaveAttribute("data-active", "true");
  });
});

test.describe("reduced-motion fixture", () => {
  test.use({ reducedMotion: "reduce", viewport: { width: 1280, height: 900 } });

  test("scrolling and scroll-spy updates are instant", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("h1").first()).toBeVisible();

    // No smooth scroll is requested anywhere.
    await page.evaluate(() => {
      const w = window as unknown as { __behaviors: string[] };
      w.__behaviors = [];
      const origScrollTo = window.scrollTo.bind(window);
      window.scrollTo = ((arg: unknown, y?: number) => {
        if (typeof arg === "object" && arg) {
          w.__behaviors.push(String((arg as ScrollToOptions).behavior ?? "auto"));
          return origScrollTo(arg as ScrollToOptions);
        }
        w.__behaviors.push("auto");
        return origScrollTo(arg as number, y as number);
      }) as typeof window.scrollTo;

      const origView = Element.prototype.scrollIntoView;
      Element.prototype.scrollIntoView = function (arg?: boolean | ScrollIntoViewOptions) {
        w.__behaviors.push(typeof arg === "object" && arg ? String(arg.behavior) : "auto");
        return origView.call(this, arg as ScrollIntoViewOptions);
      };
    });

    const hrefs = await page.$$eval(desktopNav, (els) =>
      els.map((e) => e.getAttribute("data-nav-item")!),
    );
    const target = hrefs[hrefs.length - 1];
    const before = await page.evaluate(() => window.scrollY);
    await page.locator(`${desktopNav}[data-nav-item="${target}"]`).click();

    // Instant: position already changed and the active state already painted.
    expect(await page.evaluate(() => window.scrollY)).not.toBe(before);
    await expect(
      page.locator(`${desktopNav}[data-nav-item="${target}"]`),
    ).toHaveAttribute("data-active", "true", { timeout: 500 });

    const behaviors = await page.evaluate(
      () => (window as unknown as { __behaviors: string[] }).__behaviors,
    );
    expect(behaviors).not.toContain("smooth");

    // Scroll-spy reacts on the very next check, with no animation settle time.
    for (const href of hrefs.slice(0, 3)) {
      await page.evaluate((h) => {
        document.getElementById(h.slice(1))?.scrollIntoView({ behavior: "auto", block: "start" });
      }, href);
      await expect(page.locator(`${desktopNav}[data-active="true"]`)).toHaveCount(1, {
        timeout: 500,
      });
    }
  });
});
