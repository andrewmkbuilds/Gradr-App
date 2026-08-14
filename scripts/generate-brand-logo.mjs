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
 * 512 unit grid, optically centred on (256, 256).
 *
 *  ring   — a constant-weight annulus cut open on the right. The two terminals
 *           are radial cuts on a single pair of angles, so the aperture reads
 *           as machined rather than drawn.
 *  bar    — the mahogany crossbar of the G, which does not stop at the counter:
 *           it drives left and resolves into an arrowhead. Its tail exits
 *           through the aperture and is cut on the ring's own outer curve, so
 *           the arrow is the G's crossbar rather than a shape laid over it.
 */
const PRIMARY = {
  cx: 256,
  cy: 256,
  rOuter: 200,
  rInner: 133,
  /** Aperture, in degrees (0° = east, counter-clockwise). */
  gap: { from: -21, to: 41 },
  bar: {
    half: 32, // shaft half-height
    tip: 146, // arrowhead tip x
    wingX: 220, // where the arrowhead meets the shaft
    wingHalf: 62, // arrowhead half-height
    tailTop: 418, // tail, upper cut
    tailBottom: 452, // tail, lower cut (sits on the ring's outer curve)
  },
};

/**
 * Favicon / small-size build. Same construction: heavier stroke, wider
 * aperture and a broader arrowhead so both still read at 16 px.
 */
const COMPACT = {
  cx: 256,
  cy: 256,
  rOuter: 208,
  rInner: 124,
  gap: { from: -24, to: 44 },
  bar: {
    half: 38,
    tip: 136,
    wingX: 218,
    wingHalf: 72,
    tailTop: 412,
    tailBottom: 452,
  },
};

const pt = (cx, cy, r, deg) => {
  const a = (deg * Math.PI) / 180;
  return [cx + r * Math.cos(a), cy - r * Math.sin(a)];
};
const n = (v) => Math.round(v * 100) / 100;

/**
 * Open annulus swept counter-clockwise from `from` to `to`, with flat radial
 * terminals at both ends.
 */
function ringPath({ cx, cy, rOuter, rInner, gap }) {
  const from = gap.to;
  const to = gap.from + 360;
  const large = to - from > 180 ? 1 : 0;
  const [ox0, oy0] = pt(cx, cy, rOuter, from);
  const [ox1, oy1] = pt(cx, cy, rOuter, to);
  const [ix1, iy1] = pt(cx, cy, rInner, to);
  const [ix0, iy0] = pt(cx, cy, rInner, from);
  return [
    `M ${n(ox0)} ${n(oy0)}`,
    `A ${rOuter} ${rOuter} 0 ${large} 0 ${n(ox1)} ${n(oy1)}`,
    `L ${n(ix1)} ${n(iy1)}`,
    `A ${rInner} ${rInner} 0 ${large} 1 ${n(ix0)} ${n(iy0)}`,
    "Z",
  ].join(" ");
}

/** The crossbar: left-pointing arrowhead, shaft, angled tail. */
function arrowPath({ cy, bar: b }) {
  return [
    `M ${b.tip} ${cy}`,
    `L ${b.wingX} ${cy - b.wingHalf}`,
    `L ${b.wingX} ${cy - b.half}`,
    `L ${b.tailTop} ${cy - b.half}`,
    `L ${b.tailBottom} ${cy + b.half}`,
    `L ${b.wingX} ${cy + b.half}`,
    `L ${b.wingX} ${cy + b.wingHalf}`,
    "Z",
  ].join(" ");
}

/**
 * @param {{ ring: string, bar: string, id?: string, title?: string, geo?: typeof PRIMARY }} opts
 */
export function symbolSvg({ ring, bar, title = "Gradr", geo = PRIMARY }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512" role="img" aria-label="${title}">
  <title>${title}</title>
  <path d="${ringPath(geo)}" fill="${ring}"/>
  <path d="${arrowPath(geo)}" fill="${bar}"/>
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
  // Safari pinned-tab mask: must be a single flat black shape.
  "gradr-mask-icon.svg": symbolSvgCompact({ ring: "#000", bar: "#000", id: "mask" }),
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
const LOCKUP = { width: 1200, height: 320, mark: 184, gap: 48, type: 148 };

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
