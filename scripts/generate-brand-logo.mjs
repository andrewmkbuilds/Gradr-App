#!/usr/bin/env node
/**
 * Gradr brand asset generator.
 *
 * The official, approved Gradr mark lives in public/brand/ as source-of-truth
 * PNG artwork. It is NEVER redrawn, recoloured or reconstructed here — every
 * derivative below is a pure scale (and, where a plate is required, the
 * untouched mark composited on top of a background).
 *
 *   public/brand/gradr-official-logo.png          transparent colour mark
 *   public/brand/gradr-official-app-icon.png      app icon (black plate)
 *   public/brand/gradr-official-app-icon-grey.png app icon (grey plate)
 *   public/brand/gradr-official-mono-black.png    monochrome black
 *   public/brand/gradr-official-mono-white.png    monochrome white
 *   public/brand/gradr-official-logo-white-bg.png white background lockup
 *   public/brand/gradr-official-logo-dark-bg.png  dark background variant
 *
 * Usage: node scripts/generate-brand-logo.mjs
 */
import { execFileSync } from "child_process";
import { mkdirSync, readFileSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PUBLIC = join(ROOT, "public");
const BRAND = join(PUBLIC, "brand");

export const SOURCES = {
  logo: join(BRAND, "gradr-official-logo.png"),
  appIcon: join(BRAND, "gradr-official-app-icon.png"),
  appIconGrey: join(BRAND, "gradr-official-app-icon-grey.png"),
  monoBlack: join(BRAND, "gradr-official-mono-black.png"),
  monoWhite: join(BRAND, "gradr-official-mono-white.png"),
  whiteBg: join(BRAND, "gradr-official-logo-white-bg.png"),
  darkBg: join(BRAND, "gradr-official-logo-dark-bg.png"),
};

const magick = (args) => execFileSync("magick", args, { stdio: "inherit" });

/** Uniform scale — aspect ratio preserved, geometry untouched. */
function scale(src, size, out) {
  magick([src, "-resize", `${size}x${size}`, join(PUBLIC, out)]);
  console.log(`wrote public/${out}`);
}

/** The untouched mark composited over a plate (background adapts, logo does not). */
function plate(src, { size, background, pad = 0.16, out }) {
  const inner = Math.round(size * (1 - pad * 2));
  magick([
    src,
    "-resize",
    `${inner}x${inner}`,
    "-background",
    background,
    "-gravity",
    "center",
    "-extent",
    `${size}x${size}`,
    join(PUBLIC, out),
  ]);
  console.log(`wrote public/${out}`);
}

/** Wrap an official PNG in an SVG so vector-expecting call sites keep working. */
function svgWrapper(file, { source, mask = false, title = "Gradr" }) {
  const b64 = readFileSync(source).toString("base64");
  const href = `data:image/png;base64,${b64}`;
  const body = mask
    ? `<defs><mask id="m"><image href="${href}" x="0" y="0" width="512" height="512"/></mask></defs>` +
      `<rect width="512" height="512" fill="currentColor" mask="url(#m)"/>`
    : `<image href="${href}" x="0" y="0" width="512" height="512"/>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512" role="img" aria-label="${title}">
  <title>${title}</title>
  ${body}
</svg>
`;
  writeFileSync(join(PUBLIC, file), svg);
  console.log(`wrote public/${file}`);
}

/** Horizontal lockup: official mark + GRADR wordmark set alongside it. */
function lockup({ out, source, color }) {
  const width = 1200;
  const height = 320;
  const mark = 184;
  magick([
    "-size",
    `${width}x${height}`,
    "xc:none",
    "(",
    source,
    "-resize",
    `${mark}x${mark}`,
    ")",
    "-gravity",
    "west",
    "-geometry",
    "+180+0",
    "-composite",
    "-gravity",
    "west",
    "-fill",
    color,
    "-pointsize",
    "132",
    "-annotate",
    "+420+4",
    "GRADR",
    join(PUBLIC, out),
  ]);
  console.log(`wrote public/${out}`);
}

function main() {
  mkdirSync(PUBLIC, { recursive: true });

  // Primary transparent colour mark — the default asset everywhere in the UI.
  scale(SOURCES.logo, 512, "gradr-logo.png");
  scale(SOURCES.logo, 256, "gradr-logo-256.png");
  // Dark-surface references resolve to the same official transparent mark.
  scale(SOURCES.darkBg, 512, "gradr-logo-dark.png");
  scale(SOURCES.darkBg, 256, "gradr-logo-dark-256.png");
  // Monochrome, official assets only.
  scale(SOURCES.monoBlack, 512, "gradr-logo-mono-black.png");
  scale(SOURCES.monoWhite, 512, "gradr-logo-mono-white.png");
  // App icon (official plate artwork), used for avatars and email headers.
  scale(SOURCES.appIcon, 256, "gradr-avatar-256.png");
  scale(SOURCES.appIcon, 144, "email-logo-144.png");

  svgWrapper("gradr-logo.svg", { source: SOURCES.logo });
  svgWrapper("gradr-logo-dark.svg", { source: SOURCES.darkBg });
  svgWrapper("gradr-symbol-compact.svg", { source: SOURCES.logo });
  svgWrapper("gradr-logo-mono.svg", { source: SOURCES.monoWhite, mask: true });
  svgWrapper("gradr-mask-icon.svg", { source: SOURCES.monoWhite, mask: true });

  lockup({ out: "gradr-lockup.png", source: SOURCES.logo, color: "#0B1C22" });
  lockup({ out: "gradr-lockup-dark.png", source: SOURCES.logo, color: "#F2F0EF" });

  console.log("\nBrand assets regenerated from public/brand/ official artwork.");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
