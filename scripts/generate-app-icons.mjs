#!/usr/bin/env node
/**
 * Gradr app icon / favicon / splash generator.
 *
 * Renders the official Gradr logo (public/gradr-logo.png — never redesigned,
 * only recoloured to the Yacht Club palette) into every icon size the web,
 * iOS and Android ask for, plus maskable icons and iOS launch images.
 *
 * It also writes src/config/brandAssets.generated.ts so the in-app brand
 * asset page always lists exactly what exists on disk.
 *
 * Usage:
 *   node scripts/generate-app-icons.mjs            # render everything
 *   node scripts/generate-app-icons.mjs --check    # CI guard, no render
 */
import { chromium } from "playwright";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PUBLIC = join(ROOT, "public");
const ICON_DIR = join(PUBLIC, "icons");
const SPLASH_DIR = join(PUBLIC, "splash");

/** Reads width/height straight out of a PNG IHDR chunk (no image deps). */
function pngSize(file) {
  const buf = readFileSync(file);
  if (buf.length < 24 || buf.readUInt32BE(0) !== 0x89504e47) return null;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

/** Yacht Club palette — keep in sync with src/index.css tokens. */
const TEAL = "#245F73";
const DEEP = "#0b1c22";
const SOFT_WHITE = "#F2F0EF";

/**
 * Transparent icons rendered straight from the logo.
 * `pad` is the share of the canvas left as breathing room around the mark.
 */
const TRANSPARENT_ICONS = [
  { file: "icons/favicon-16.png", size: 16, pad: 0.02, label: "Favicon (browser tab)" },
  { file: "icons/favicon-32.png", size: 32, pad: 0.02, label: "Favicon (retina tab)" },
  { file: "icons/favicon-48.png", size: 48, pad: 0.02, label: "Favicon (Windows tile)" },
  { file: "favicon.png", size: 64, pad: 0.02, label: "Favicon (default)" },
  { file: "icons/icon-96.png", size: 96, pad: 0.04, label: "Android launcher (ldpi)" },
  { file: "icons/icon-128.png", size: 128, pad: 0.04, label: "Chrome Web Store / desktop" },
  { file: "icons/icon-256.png", size: 256, pad: 0.04, label: "Desktop app icon" },
  { file: "icons/icon-384.png", size: 384, pad: 0.04, label: "Android launcher (xxhdpi)" },
  { file: "icon-192.png", size: 192, pad: 0.04, label: "PWA icon (Android home screen)" },
  { file: "icon-512.png", size: 512, pad: 0.04, label: "PWA icon (splash + store listing)" },
];

/**
 * iOS ignores transparency and composites home-screen icons on black, so every
 * Apple touch icon is rendered on an opaque Deep Sea background.
 */
const APPLE_ICONS = [
  { file: "icons/apple-touch-icon-120.png", size: 120, label: "iPhone home screen (@2x)" },
  { file: "icons/apple-touch-icon-152.png", size: 152, label: "iPad home screen (@2x)" },
  { file: "icons/apple-touch-icon-167.png", size: 167, label: "iPad Pro home screen" },
  { file: "apple-touch-icon.png", size: 180, label: "iPhone home screen (@3x)" },
];

/**
 * Maskable icons: Android crops to a circle/squircle, so the mark sits inside
 * the 80% safe zone on a filled Ocean Teal plate.
 */
const MASKABLE_ICONS = [
  { file: "icons/maskable-192.png", size: 192, label: "Android maskable (adaptive)" },
  { file: "icons/maskable-512.png", size: 512, label: "Android maskable (large)" },
];

/** iOS launch images for the most common installed-device viewports. */
const SPLASH_SCREENS = [
  { file: "splash/splash-1290x2796.png", width: 1290, height: 2796, media: "(device-width: 430px) and (device-height: 932px) and (-webkit-device-pixel-ratio: 3)", label: "iPhone 15/16 Pro Max" },
  { file: "splash/splash-1179x2556.png", width: 1179, height: 2556, media: "(device-width: 393px) and (device-height: 852px) and (-webkit-device-pixel-ratio: 3)", label: "iPhone 15/16" },
  { file: "splash/splash-1170x2532.png", width: 1170, height: 2532, media: "(device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3)", label: "iPhone 12–14" },
  { file: "splash/splash-1125x2436.png", width: 1125, height: 2436, media: "(device-width: 375px) and (device-height: 812px) and (-webkit-device-pixel-ratio: 3)", label: "iPhone X/XS/11 Pro" },
  { file: "splash/splash-1536x2048.png", width: 1536, height: 2048, media: "(device-width: 768px) and (device-height: 1024px) and (-webkit-device-pixel-ratio: 2)", label: "iPad 9.7\"" },
  { file: "splash/splash-1668x2388.png", width: 1668, height: 2388, media: "(device-width: 834px) and (device-height: 1194px) and (-webkit-device-pixel-ratio: 2)", label: "iPad Pro 11\"" },
  { file: "splash/splash-2048x2732.png", width: 2048, height: 2732, media: "(device-width: 1024px) and (device-height: 1366px) and (-webkit-device-pixel-ratio: 2)", label: "iPad Pro 12.9\"" },
];

export function iconTargets() {
  return [...TRANSPARENT_ICONS, ...APPLE_ICONS, ...MASKABLE_ICONS];
}
export function splashTargets() {
  return SPLASH_SCREENS;
}
export { SPLASH_SCREENS };

function iconHtml(logo, { size, pad = 0.04, background = "transparent", radius = 0 }) {
  const inset = Math.round(size * pad);
  return `<!doctype html><html><head><meta charset="utf-8"/><style>
  *{margin:0;padding:0;box-sizing:border-box}
  html,body{width:${size}px;height:${size}px;background:transparent}
  .plate{width:${size}px;height:${size}px;background:${background};
    border-radius:${radius}px;display:flex;align-items:center;justify-content:center;
    padding:${inset}px}
  img{width:100%;height:100%;object-fit:contain;image-rendering:auto}
</style></head><body><div class="plate"><img src="${logo}" alt=""/></div></body></html>`;
}

function splashHtml(logo, { width, height }) {
  const mark = Math.round(Math.min(width, height) * 0.28);
  return `<!doctype html><html><head><meta charset="utf-8"/><style>
  @import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@800&display=swap');
  *{margin:0;padding:0;box-sizing:border-box}
  body{width:${width}px;height:${height}px;display:flex;flex-direction:column;
    align-items:center;justify-content:center;gap:${Math.round(mark * 0.18)}px;
    background:radial-gradient(${width}px ${height * 0.6}px at 50% 28%, #2d6f85 0%, transparent 62%), ${DEEP};
    font-family:'Bricolage Grotesque',system-ui,sans-serif;color:${SOFT_WHITE}}
  img{width:${mark}px;height:${mark}px;object-fit:contain}
  span{font-size:${Math.round(mark * 0.24)}px;font-weight:800;letter-spacing:-.02em}
</style></head><body><img src="${logo}" alt=""/><span>Gradr</span></body></html>`;
}

async function main() {
  const check = process.argv.includes("--check");
  const all = [...iconTargets(), ...SPLASH_SCREENS];

  if (check) {
    const failures = [];

    // 1. Every generated target exists and carries the declared pixel size.
    for (const t of all) {
      const abs = join(PUBLIC, t.file);
      if (!existsSync(abs)) {
        failures.push(`missing app icon asset: public/${t.file}`);
        continue;
      }
      const dim = pngSize(abs);
      const w = t.width ?? t.size;
      const h = t.height ?? t.size;
      if (!dim) {
        failures.push(`not a readable PNG: public/${t.file}`);
      } else if (dim.width !== w || dim.height !== h) {
        failures.push(
          `size mismatch public/${t.file}: declared ${w}x${h}, actual ${dim.width}x${dim.height}`,
        );
      }
    }

    // 2. Every icon referenced by the manifest resolves and matches its `sizes`.
    const manifestPath = join(PUBLIC, "site.webmanifest");
    if (!existsSync(manifestPath)) {
      failures.push("missing public/site.webmanifest");
    } else {
      const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
      for (const icon of manifest.icons ?? []) {
        const rel = icon.src.replace(/^\//, "");
        const abs = join(PUBLIC, rel);
        if (!existsSync(abs)) {
          failures.push(`manifest icon not found: ${icon.src}`);
          continue;
        }
        const dim = pngSize(abs);
        const [w, h] = String(icon.sizes || "").split("x").map(Number);
        if (dim && w && h && (dim.width !== w || dim.height !== h)) {
          failures.push(`manifest icon ${icon.src} declares ${icon.sizes} but is ${dim.width}x${dim.height}`);
        }
      }
    }

    // 3. Every icon/splash href in index.html resolves on disk.
    const htmlPath = join(ROOT, "index.html");
    const html = readFileSync(htmlPath, "utf8");
    const hrefs = [...html.matchAll(/<link[^>]+rel="(icon|apple-touch-icon|apple-touch-startup-image|mask-icon|manifest)"[^>]*>/g)]
      .map((m) => m[0].match(/href="([^"]+)"/)?.[1])
      .filter(Boolean);
    for (const href of hrefs) {
      if (/^https?:/.test(href)) continue;
      if (!existsSync(join(PUBLIC, href.replace(/^\//, "")))) {
        failures.push(`index.html references missing asset: ${href}`);
      }
    }

    for (const f of failures) console.log(`FAIL ${f}`);
    console.log(
      failures.length
        ? `\n${failures.length} icon problem(s) — run: npm run icons:generate`
        : `\nApp icons: ${all.length} asset(s) present, manifest + head references verified.`,
    );
    process.exit(failures.length ? 1 : 0);
  }


  const master = join(PUBLIC, "gradr-logo.png");
  if (!existsSync(master)) throw new Error("public/gradr-logo.png (icon master) is missing");
  const logo = `data:image/png;base64,${readFileSync(master).toString("base64")}`;
  // Soft-white mark, for the opaque Deep Sea / Ocean Teal plates.
  const logoDark = `data:image/png;base64,${readFileSync(join(PUBLIC, "gradr-logo-dark.png")).toString("base64")}`;
  // Small-size build: heavier strokes, tighter aperture — used at 64px and below.
  const compact = `data:image/svg+xml;base64,${Buffer.from(readFileSync(join(PUBLIC, "gradr-symbol-compact.svg"))).toString("base64")}`;


  mkdirSync(ICON_DIR, { recursive: true });
  mkdirSync(SPLASH_DIR, { recursive: true });

  const browser = await chromium.launch({
    channel: process.env.OG_CHROMIUM_CHANNEL || undefined,
    executablePath: process.env.OG_CHROMIUM_PATH || undefined,
  });

  const render = async (html, { width, height, file, omitBackground }) => {
    const page = await browser.newPage({
      viewport: { width, height },
      deviceScaleFactor: 1,
    });
    await page.setContent(html, { waitUntil: "networkidle" });
    await page.screenshot({ path: join(PUBLIC, file), omitBackground });
    await page.close();
    console.log(`wrote public/${file}`);
  };

  for (const t of TRANSPARENT_ICONS) {
    await render(iconHtml(logo, t), {
      width: t.size,
      height: t.size,
      file: t.file,
      omitBackground: true,
    });
  }
  for (const t of APPLE_ICONS) {
    await render(
      iconHtml(logo, { size: t.size, pad: 0.12, background: DEEP, radius: 0 }),
      { width: t.size, height: t.size, file: t.file, omitBackground: false },
    );
  }
  for (const t of MASKABLE_ICONS) {
    await render(
      iconHtml(logo, { size: t.size, pad: 0.2, background: TEAL, radius: 0 }),
      { width: t.size, height: t.size, file: t.file, omitBackground: false },
    );
  }
  for (const t of SPLASH_SCREENS) {
    await render(splashHtml(logo, t), {
      width: t.width,
      height: t.height,
      file: t.file,
      omitBackground: false,
    });
  }

  await browser.close();
  writeManifestModule();
  console.log(`\n${all.length} icon/splash asset(s) generated.`);
}

/** Emit the typed registry consumed by /admin/brand-assets. */
function writeManifestModule() {
  const rows = [
    ...TRANSPARENT_ICONS.map((t) => ({ ...t, group: "favicon", width: t.size, height: t.size })),
    ...APPLE_ICONS.map((t) => ({ ...t, group: "apple", width: t.size, height: t.size })),
    ...MASKABLE_ICONS.map((t) => ({ ...t, group: "maskable", width: t.size, height: t.size })),
    ...SPLASH_SCREENS.map((t) => ({ ...t, group: "splash" })),
    { file: "gradr-logo.png", group: "logo", width: 512, height: 512, label: "Primary logo (light surfaces)" },
    { file: "gradr-logo-dark.png", group: "logo", width: 512, height: 512, label: "Primary logo (dark surfaces)" },
    { file: "gradr-logo.svg", group: "logo", width: 0, height: 0, label: "Vector logo (infinite scale)" },
    { file: "og-image-v2.jpg", group: "social", width: 1200, height: 630, label: "Open Graph / Twitter card" },
    { file: "og/site-gradr.png", group: "social", width: 1200, height: 630, label: "Site social card (source)" },
  ].map((t) => {
    const abs = join(PUBLIC, t.file);
    return {
      file: `/${t.file}`,
      group: t.group,
      label: t.label,
      width: t.width,
      height: t.height,
      bytes: existsSync(abs) ? statSync(abs).size : 0,
    };
  });

  const out = `// AUTO-GENERATED by scripts/generate-app-icons.mjs — do not edit by hand.
export type BrandAssetGroup = "favicon" | "apple" | "maskable" | "splash" | "logo" | "social";

export interface BrandAsset {
  /** Public URL, served from /public. */
  file: string;
  group: BrandAssetGroup;
  /** Where the asset is used. */
  label: string;
  /** Intrinsic pixel size (0 for vector). */
  width: number;
  height: number;
  bytes: number;
}

export const BRAND_ASSETS: BrandAsset[] = ${JSON.stringify(rows, null, 2)};
`;
  writeFileSync(join(ROOT, "src/config/brandAssets.generated.ts"), out);
  console.log("wrote src/config/brandAssets.generated.ts");
}

if (process.argv[1] && process.argv[1].endsWith("generate-app-icons.mjs")) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
