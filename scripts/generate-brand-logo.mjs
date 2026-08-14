#!/usr/bin/env node
/**
 * Gradr brand mark generator — the single source of truth for the symbol.
 *
 * The mark ("the Gradr G") is constructed, not typeset:
 *   • a squircle ring rather than a circle, so the silhouette is ownable
 *   • an off-centre counter (shifted up-left) so the stroke gains weight at the
 *     base and lightens as it rises — momentum without an arrow
 *   • an angled terminal on the upper arm, cut on a single consistent slope
 *   • a crossbar that overshoots the outer silhouette by one module: the
 *     deliberate interruption that makes the G read as engineered
 *
 * Everything downstream (favicons, PWA icons, splash, OG, email) is rendered
 * from the PNG masters this script writes, so the geometry can only exist once.
 *
 * Usage: node scripts/generate-brand-logo.mjs
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PUBLIC = join(ROOT, "public");

/** Yacht Club palette. */
export const TEAL = "#245F73";
export const MAHOGANY = "#733E24";
/** Mahogany lifted for legibility on Deep Sea backgrounds. */
export const MAHOGANY_LIGHT = "#A9663D";
export const SOFT_WHITE = "#F2F0EF";
export const DEEP = "#0B1C22";

/* ---------------------------------------------------------------- geometry */
/**
 * 512 unit grid.
 *  outer  — the squircle silhouette (never a circle: that is the ownable part)
 *  inner  — the counter, deliberately off-centre (lifted) so the stroke gains
 *           weight at the base and lightens as it rises
 *  mouth  — a machined rectangular aperture through the right stroke, both
 *           terminals cut on one vertical
 *  bar    — a single crossbar run, capped by the mahogany module
 */
const PRIMARY = {
  outer: { x: 44, y: 44, s: 424, r: 134 },
  inner: { x: 128, y: 118, s: 256, r: 74 },
  mouth: { x: 300, top: 158, bottom: 252 },
  bar: { x: 258, y: 252, w: 210, h: 64, r: 18, cap: 88 },
};

/**
 * Favicon / small-size build. Same construction, heavier strokes and a tighter
 * aperture so the counter and the mouth still read at 16 px.
 */
const COMPACT = {
  outer: { x: 26, y: 26, s: 460, r: 146 },
  inner: { x: 122, y: 108, s: 268, r: 76 },
  mouth: { x: 300, top: 150, bottom: 256 },
  bar: { x: 250, y: 256, w: 236, h: 74, r: 20, cap: 100 },
};

function rounded({ x, y, s, r }) {
  return `M ${x + r} ${y} H ${x + s - r} A ${r} ${r} 0 0 1 ${x + s} ${y + r} V ${y + s - r} A ${r} ${r} 0 0 1 ${x + s - r} ${y + s} H ${x + r} A ${r} ${r} 0 0 1 ${x} ${y + s - r} V ${y + r} A ${r} ${r} 0 0 1 ${x + r} ${y} Z`;
}

/** Rect with only its left corners rounded — used for the crossbar runs. */
function leftRounded(x, y, w, h, r) {
  return `M ${x + r} ${y} H ${x + w} V ${y + h} H ${x + r} A ${r} ${r} 0 0 1 ${x} ${y + h - r} V ${y + r} A ${r} ${r} 0 0 1 ${x + r} ${y} Z`;
}

/**
 * @param {{ ring: string, bar: string, id?: string, title?: string, geo?: typeof PRIMARY }} opts
 */
export function symbolSvg({ ring, bar, id = "g", title = "Gradr", geo = PRIMARY }) {
  const { outer, inner, mouth, bar: b } = geo;
  const mouthPath = `M ${mouth.x} ${mouth.top} L 512 ${mouth.top} L 512 ${mouth.bottom} L ${mouth.x} ${mouth.bottom} Z`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512" role="img" aria-label="${title}">
  <title>${title}</title>
  <defs>
    <mask id="${id}-ring" maskUnits="userSpaceOnUse" x="0" y="0" width="512" height="512">
      <rect width="512" height="512" fill="#000"/>
      <path d="${rounded(outer)}" fill="#fff"/>
      <path d="${rounded(inner)}" fill="#000"/>
      <path d="${mouthPath}" fill="#000"/>
    </mask>
  </defs>
  <rect width="512" height="512" fill="${ring}" mask="url(#${id}-ring)"/>
  <path d="${leftRounded(b.x, b.y, b.w, b.h, b.r)}" fill="${ring}"/>
  <path d="${leftRounded(b.x, b.y, b.cap, b.h, b.r)}" fill="${bar}"/>
</svg>`;
}

export function symbolSvgCompact({ ring, bar, id = "gc" }) {
  return symbolSvg({ ring, bar, id, geo: COMPACT });
}


/* ------------------------------------------------------------------ output */
const VARIANTS = {
  "gradr-logo.svg": symbolSvg({ ring: TEAL, bar: MAHOGANY, id: "light" }),
  "gradr-logo-dark.svg": symbolSvg({ ring: SOFT_WHITE, bar: MAHOGANY_LIGHT, id: "dark" }),
  "gradr-logo-mono.svg": symbolSvg({ ring: "currentColor", bar: "currentColor", id: "mono" }),
  "gradr-symbol-compact.svg": symbolSvgCompact({ ring: TEAL, bar: MAHOGANY }),
};

const dataUri = (svg) => `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;

/** PNG masters rendered from the vector. */
const PNGS = [
  { file: "gradr-logo.png", size: 512, svg: VARIANTS["gradr-logo.svg"] },
  { file: "gradr-logo-dark.png", size: 512, svg: VARIANTS["gradr-logo-dark.svg"] },
  { file: "gradr-logo-256.png", size: 256, svg: VARIANTS["gradr-logo.svg"] },
  { file: "gradr-logo-dark-256.png", size: 256, svg: VARIANTS["gradr-logo-dark.svg"] },
  {
    file: "gradr-avatar-256.png",
    size: 256,
    svg: VARIANTS["gradr-logo-dark.svg"],
    background: TEAL,
    pad: 0.18,
    radius: 60,
  },
  {
    file: "email-logo-144.png",
    size: 144,
    svg: VARIANTS["gradr-logo-dark.svg"],
    background: DEEP,
    pad: 0.18,
    radius: 34,
  },
];

function pngHtml(svg, { size, background = "transparent", pad = 0.02, radius = 0 }) {
  return `<!doctype html><html><head><meta charset="utf-8"/><style>
  *{margin:0;padding:0;box-sizing:border-box}
  html,body{width:${size}px;height:${size}px;background:transparent}
  .plate{width:${size}px;height:${size}px;background:${background};border-radius:${radius}px;
    display:flex;align-items:center;justify-content:center;padding:${Math.round(size * pad)}px}
  img{width:100%;height:100%;object-fit:contain}
</style></head><body><div class="plate"><img src="${dataUri(svg)}" alt=""/></div></body></html>`;
}

/**
 * Horizontal lockup: symbol + GRADR wordmark. Bricolage Grotesque at 600 with
 * open tracking — the wordmark stays quiet so the symbol carries the identity.
 */
const LOCKUPS = [
  { file: "gradr-lockup.png", svg: () => VARIANTS["gradr-logo.svg"], color: DEEP },
  { file: "gradr-lockup-dark.png", svg: () => VARIANTS["gradr-logo-dark.svg"], color: SOFT_WHITE },
];
const LOCKUP = { width: 1200, height: 320, mark: 208, gap: 56, type: 150 };

function lockupHtml(svg, color) {
  const { width, height, mark, gap, type } = LOCKUP;
  return `<!doctype html><html><head><meta charset="utf-8"/>
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600&display=swap" rel="stylesheet">
  <style>
  *{margin:0;padding:0;box-sizing:border-box}
  html,body{width:${width}px;height:${height}px;background:transparent}
  .row{width:${width}px;height:${height}px;display:flex;align-items:center;justify-content:center;gap:${gap}px}
  img{width:${mark}px;height:${mark}px;display:block}
  span{font-family:"Bricolage Grotesque",sans-serif;font-weight:600;font-size:${type}px;
    letter-spacing:0.02em;line-height:1;color:${color};padding-bottom:0.06em}
</style></head><body><div class="row"><img src="${dataUri(svg)}" alt=""/><span>GRADR</span></div></body></html>`;
}

async function main() {
  mkdirSync(PUBLIC, { recursive: true });
  for (const [file, svg] of Object.entries(VARIANTS)) {
    writeFileSync(join(PUBLIC, file), `${svg}\n`);
    console.log(`wrote public/${file}`);
  }

  const browser = await chromium.launch({ executablePath: process.env.OG_CHROMIUM_PATH || undefined });
  for (const target of PNGS) {
    const page = await browser.newPage({
      viewport: { width: target.size, height: target.size },
      deviceScaleFactor: 1,
    });
    await page.setContent(pngHtml(target.svg, target), { waitUntil: "networkidle" });
    await page.screenshot({
      path: join(PUBLIC, target.file),
      omitBackground: !target.background,
    });
    await page.close();
    console.log(`wrote public/${target.file}`);
  }

  for (const lock of LOCKUPS) {
    const page = await browser.newPage({
      viewport: { width: LOCKUP.width, height: LOCKUP.height },
      deviceScaleFactor: 1,
    });
    await page.setContent(lockupHtml(lock.svg(), lock.color), { waitUntil: "networkidle" });
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: join(PUBLIC, lock.file), omitBackground: true });
    await page.close();
    console.log(`wrote public/${lock.file}`);
  }
  await browser.close();
}


if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
