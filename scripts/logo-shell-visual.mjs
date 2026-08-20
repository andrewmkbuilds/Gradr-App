#!/usr/bin/env node
/**
 * Visual regression: the auth logo's light shell must stay IN FRONT of the
 * spinning conic ring, in both light and dark mode.
 *
 * Two independent assertions per theme:
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

const failures = [];
const browser = await launch();

try {
  for (const theme of ["light", "dark"]) {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      colorScheme: theme,
    });
    const page = await context.newPage();
    await page.goto(`${BASE}/auth`, { waitUntil: "domcontentloaded" });
    await page.evaluate((t) => {
      document.documentElement.classList.toggle("dark", t === "dark");
      document.documentElement.classList.toggle("light", t === "light");
    }, theme);
    await page.waitForTimeout(900);

    const spinner = page.locator(".conic-spin").first();
    if ((await spinner.count()) === 0) {
      failures.push(`[${theme}] no .conic-spin ring found on /auth`);
      await context.close();
      continue;
    }

    // The mark is the sibling that carries the opaque shell background.
    const info = await spinner.evaluate((el) => {
      const mark = el.nextElementSibling;
      if (!mark) return null;
      const r = mark.getBoundingClientRect();
      const cs = getComputedStyle(mark);
      return {
        bg: cs.backgroundColor,
        zSpinner: getComputedStyle(el).zIndex,
        rect: { x: r.x, y: r.y, width: r.width, height: r.height },
      };
    });

    if (!info) {
      failures.push(`[${theme}] logo mark element missing next to the spinner ring`);
      await context.close();
      continue;
    }

    const alpha = /rgba?\(([^)]+)\)/.exec(info.bg)?.[1].split(",").map((v) => v.trim());
    const isOpaque = alpha ? alpha.length < 4 || Number(alpha[3]) === 1 : false;
    if (!isOpaque) {
      failures.push(`[${theme}] logo mark background is not opaque (${info.bg}) — spinner can bleed through`);
    }

    // Interior clip: inset far enough to exclude the visible ring edge.
    const inset = Math.round(info.rect.width * 0.2);
    const clip = {
      x: Math.round(info.rect.x) + inset,
      y: Math.round(info.rect.y) + inset,
      width: Math.round(info.rect.width) - inset * 2,
      height: Math.round(info.rect.height) - inset * 2,
    };

    const first = await page.screenshot({ clip });
    await page.waitForTimeout(1500); // ring rotates ~1/4 turn (6s loop)
    const second = await page.screenshot({ clip });

    writeFileSync(join(OUT, `logo-${theme}-a.png`), first);
    writeFileSync(join(OUT, `logo-${theme}-b.png`), second);

    const changed =
      first.length !== second.length || !first.equals(second);
    if (changed) {
      failures.push(
        `[${theme}] logo interior changed between frames — the spinning ring is rendering in front of the shell`,
      );
    } else {
      console.log(`✓ ${theme}: shell opaque (${info.bg}) and interior stable across ring rotation`);
    }

    await context.close();
  }
} finally {
  await browser.close();
}

if (failures.length) {
  console.error(`\n✖ Logo shell regression:\n - ${failures.join("\n - ")}`);
  console.error(`Captures in ${OUT}`);
  process.exit(1);
}

console.log("\n✓ Logo light shell stays in front of the spinner ring in light and dark.");
