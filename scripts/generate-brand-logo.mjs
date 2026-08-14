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
// 512 unit grid. Outer squircle 44..468 (424 module), counter offset up 10.
const O = { x: 44, y: 44, s: 424, r: 134 };
const I = { x: 128, y: 118, s: 256, r: 74 };
// Mouth: opens the right side. The upper arm terminates on a rising slope
// (low inside, high at the outer edge) — the ascent cue, read as craft not arrow.
const MOUTH = "M 384 180 L 468 140 L 512 140 L 512 244 L 262 244 L 262 180 Z";
// Crossbar: overshoots the outer edge (468) by one module — the interruption.
const BAR = { x: 296, y: 244, w: 190, h: 64, r: 10 };


function rounded({ x, y, s, r }) {
  return `M ${x + r} ${y} H ${x + s - r} A ${r} ${r} 0 0 1 ${x + s} ${y + r} V ${y + s - r} A ${r} ${r} 0 0 1 ${x + s - r} ${y + s} H ${x + r} A ${r} ${r} 0 0 1 ${x} ${y + s - r} V ${y + r} A ${r} ${r} 0 0 1 ${x + r} ${y} Z`;
}

/**
 * @param {{ ring: string, bar: string, id?: string, title?: string }} opts
 */
export function symbolSvg({ ring, bar, id = "g", title = "Gradr" }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512" role="img" aria-label="${title}">
  <title>${title}</title>
  <defs>
    <mask id="${id}-ring" maskUnits="userSpaceOnUse" x="0" y="0" width="512" height="512">
      <rect width="512" height="512" fill="#000"/>
      <path d="${rounded(O)}" fill="#fff"/>
      <path d="${rounded(I)}" fill="#000"/>
      <path d="${MOUTH}" fill="#000"/>
    </mask>
  </defs>
  <rect width="512" height="512" fill="${ring}" mask="url(#${id}-ring)"/>
  <rect x="${BAR.x}" y="${BAR.y}" width="${BAR.w}" height="${BAR.h}" rx="${BAR.r}" fill="${bar}"/>
</svg>`;
}

/** Favicon build: no overshoot tab, fatter counter — survives 16px. */
export function symbolSvgCompact({ ring, bar, id = "gc" }) {
  const o = { x: 24, y: 24, s: 464, r: 146 };
  const i = { x: 116, y: 104, s: 280, r: 80 };
  const mouth = "M 250 206 L 348 136 L 512 136 L 512 272 L 250 272 Z";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512" role="img" aria-label="Gradr">
  <title>Gradr</title>
  <defs>
    <mask id="${id}-ring" maskUnits="userSpaceOnUse" x="0" y="0" width="512" height="512">
      <rect width="512" height="512" fill="#000"/>
      <path d="${rounded(o)}" fill="#fff"/>
      <path d="${rounded(i)}" fill="#000"/>
      <path d="${mouth}" fill="#000"/>
    </mask>
  </defs>
  <rect width="512" height="512" fill="${ring}" mask="url(#${id}-ring)"/>
  <rect x="284" y="272" width="204" height="72" rx="12" fill="${bar}"/>
</svg>`;
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
  await browser.close();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
