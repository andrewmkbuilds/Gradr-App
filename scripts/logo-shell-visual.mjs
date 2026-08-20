#!/usr/bin/env node
/**
 * Visual regression: the auth logo's light shell must stay IN FRONT of the
 * spinning conic ring — in both themes, at every breakpoint, and after a
 * client-side navigation (not just on a cold load).
 *
 * Two independent assertions per case:
 *  1. DOM   — the logo mark resolves to an opaque background colour (alpha 1),
 *             so the spinner cannot bleed through the mark.
 *  2. Pixels— two clipped captures of the mark's interior, taken while the
 *             ring is mid-rotation, must be byte-identical. If the spinner
 *             were rendering on top, the interior would change between frames.
 *
 *   node scripts/logo-shell-visual.mjs [baseUrl]
 */
import { chromium } from "playwright";
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "fs";
import { join } from "path";

const BASE = (process.argv[2] ?? process.env.SMOKE_BASE_URL ?? "http://localhost:8080").replace(/\/$/, "");
const OUT = join(process.cwd(), "artifacts/logo-shell");

function findChromium() {
  for (const envPath of [process.env.PLAYWRIGHT_CHROMIUM_PATH, process.env.CHROME_PATH]) {
    if (envPath && existsSync(envPath)) return envPath;
  }
  for (const root of ["/opt/ms-playwright", join(process.env.HOME ?? "", ".cache/ms-playwright")]) {
    if (!existsSync(root)) continue;
    for (const dir of readdirSync(root).filter((d) => d.startsWith("chromium"))) {
      for (const rel of [
        "chrome-linux/chrome",
        "chrome-linux/headless_shell",
        "chrome-linux64/chrome-headless-shell",
      ]) {
        const candidate = join(root, dir, rel);
        if (existsSync(candidate)) return candidate;
      }
    }
  }
  return undefined;
}

async function launch() {
  try {
    return await chromium.launch();
  } catch {
    const executablePath = findChromium();
    if (!executablePath) throw new Error("No Chromium build available for Playwright.");
    return chromium.launch({ executablePath });
  }
}

mkdirSync(OUT, { recursive: true });

/** Mobile, tablet and desktop render different logo instances in AuthLayout. */
const VIEWPORTS = [
  { name: "mobile", width: 390, height: 844 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1280, height: 900 },
];

/**
 * `via` performs a client-side route change before asserting, so the layering
 * is checked after React re-mounts the mark — not only on a cold load.
 */
const ROUTES = [
  { name: "auth", path: "/auth", via: null },
  { name: "nav-forgot", path: "/forgot-password", via: "/auth" },
  { name: "nav-back-auth", path: "/auth", via: "/forgot-password" },
];

/**
 * Asserts every visible spinner/mark pair on the current page. Returns a list
 * of failure strings (empty when the layering is correct).
 */
async function checkLogoShell(page, label) {
  const failures = [];
  const spinners = page.locator(".conic-spin");
  const count = await spinners.count();
  if (count === 0) return [`[${label}] no .conic-spin ring found`];

  let asserted = 0;

  for (let i = 0; i < count; i += 1) {
    const spinner = spinners.nth(i);
    if (!(await spinner.isVisible())) continue;

    const info = await spinner.evaluate((el) => {
      const mark = el.nextElementSibling;
      if (!mark) return null;
      const r = mark.getBoundingClientRect();
      return {
        bg: getComputedStyle(mark).backgroundColor,
        rect: { x: r.x, y: r.y, width: r.width, height: r.height },
      };
    });

    if (!info) {
      failures.push(`[${label}] logo mark element missing next to the spinner ring`);
      continue;
    }
    if (info.rect.width < 8 || info.rect.height < 8) continue;

    const alpha = /rgba?\(([^)]+)\)/.exec(info.bg)?.[1].split(",").map((v) => v.trim());
    const isOpaque = alpha ? alpha.length < 4 || Number(alpha[3]) === 1 : false;
    if (!isOpaque) {
      failures.push(`[${label}] logo mark background is not opaque (${info.bg}) — spinner can bleed through`);
    }

    // Interior clip: inset far enough to exclude the visible ring edge.
    const inset = Math.max(2, Math.round(info.rect.width * 0.2));
    const clip = {
      x: Math.round(info.rect.x) + inset,
      y: Math.round(info.rect.y) + inset,
      width: Math.round(info.rect.width) - inset * 2,
      height: Math.round(info.rect.height) - inset * 2,
    };

    const first = await page.screenshot({ clip });
    await page.waitForTimeout(1500); // ring rotates ~1/4 turn (6s loop)
    const second = await page.screenshot({ clip });

    writeFileSync(join(OUT, `${label}-${i}-a.png`), first);
    writeFileSync(join(OUT, `${label}-${i}-b.png`), second);

    if (first.length !== second.length || !first.equals(second)) {
      failures.push(
        `[${label}] logo interior changed between frames — the spinning ring is rendering in front of the shell`,
      );
    }
    asserted += 1;
  }

  if (asserted === 0 && failures.length === 0) {
    failures.push(`[${label}] no visible logo mark could be asserted`);
  }
  if (failures.length === 0) {
    console.log(`✓ ${label}: shell opaque and interior stable across ring rotation (${asserted} mark(s))`);
  }
  return failures;
}

const failures = [];
const browser = await launch();

try {
  for (const theme of ["light", "dark"]) {
    for (const vp of VIEWPORTS) {
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        colorScheme: theme,
      });
      const page = await context.newPage();

      const applyTheme = () =>
        page.evaluate((t) => {
          document.documentElement.classList.toggle("dark", t === "dark");
          document.documentElement.classList.toggle("light", t === "light");
        }, theme);

      for (const route of ROUTES) {
        const label = `${theme}-${vp.name}-${route.name}`;
        try {
          await page.goto(`${BASE}${route.via ?? route.path}`, { waitUntil: "domcontentloaded" });
          await applyTheme();
          await page.waitForTimeout(700);

          if (route.via) {
            // Client-side transition rather than a full reload.
            await page.evaluate((path) => {
              window.history.pushState({}, "", path);
              window.dispatchEvent(new PopStateEvent("popstate"));
            }, route.path);
            await page.waitForTimeout(900);
          }

          failures.push(...(await checkLogoShell(page, label)));
        } catch (err) {
          failures.push(`[${label}] ${err instanceof Error ? err.message : String(err)}`);
        }
      }

      await context.close();
    }
  }
} finally {
  await browser.close();
}

if (failures.length) {
  console.error(`\n✖ Logo shell regression:\n - ${failures.join("\n - ")}`);
  console.error(`Captures in ${OUT}`);
  process.exit(1);
}

console.log("\n✓ Logo light shell stays in front of the spinner ring across themes, breakpoints and navigations.");
