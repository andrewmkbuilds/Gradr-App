#!/usr/bin/env node
/**
 * Automatic Open Graph image generator.
 *
 * Renders a branded 1200x630 card for every blog post and career-advice guide
 * so shared links get a polished, per-article social preview instead of the
 * one generic site image. Output: public/og/<kind>-<slug>.png
 *
 * Usage: node scripts/generate-og-images.mjs [--check]
 *   --check  exit 1 if any article is missing an image (CI guard, no render)
 */
import { chromium } from "playwright";
import { existsSync, mkdirSync, readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = join(ROOT, "public", "og");

/** Parse the plain-data content registries without a TS compiler. */
function parseEntries(file, kind) {
  const src = readFileSync(join(ROOT, file), "utf8");
  const entries = [];
  const slugRe = /slug:\s*"([a-z0-9-]+)"/g;
  let m;
  while ((m = slugRe.exec(src))) {
    const rest = src.slice(m.index, m.index + 1400);
    const title = rest.match(/\n\s*title:\s*"([^"]+)"/);
    const desc = rest.match(/\n\s*description:\s*\n?\s*"([^"]+)"/);
    const category = rest.match(/\n\s*category:\s*"([^"]+)"/);
    entries.push({
      kind,
      slug: m[1],
      title: title ? title[1] : m[1],
      description: desc ? desc[1] : "",
      eyebrow: category ? category[1] : kind === "blog" ? "Guide" : "Career advice",
    });
  }
  return entries;
}

export function ogTargets() {
  return [
    ...parseEntries("src/content/blogPosts.ts", "blog"),
    ...parseEntries("src/content/guides.ts", "guide"),
  ];
}

export const ogImagePath = (kind, slug) => `/og/${kind}-${slug}.png`;

const esc = (s) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function cardHtml({ title, description, eyebrow }, logoDataUri) {
  return `<!doctype html><html><head><meta charset="utf-8"/>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800&display=swap');
  *{margin:0;padding:0;box-sizing:border-box}
  body{width:1200px;height:630px;font-family:Inter,system-ui,sans-serif;
    background:radial-gradient(900px 520px at 82% -12%, #1b4f6b 0%, transparent 60%),
               radial-gradient(700px 480px at -8% 108%, #123a52 0%, transparent 62%),
               #060d16;color:#eaf4ff;display:flex;flex-direction:column;
    justify-content:space-between;padding:68px 72px;position:relative;overflow:hidden}
  .glow{position:absolute;inset:auto -140px -220px auto;width:520px;height:520px;border-radius:50%;
    background:conic-gradient(from 210deg,#22d3ee,#38bdf8,#0ea5e9,#22d3ee);filter:blur(120px);opacity:.32}
  .top{display:flex;align-items:center;gap:16px;z-index:1}
  .top img{height:52px;width:auto}
  .brand{font-weight:800;font-size:30px;letter-spacing:-.02em}
  .eyebrow{margin-left:auto;font-size:19px;font-weight:600;color:#7fe3f5;
    border:1px solid rgba(127,227,245,.35);border-radius:999px;padding:8px 20px;background:rgba(34,211,238,.08)}
  h1{z-index:1;font-size:64px;line-height:1.06;font-weight:800;letter-spacing:-.03em;max-width:1010px}
  p{z-index:1;font-size:27px;line-height:1.42;color:#a9c4da;max-width:960px;
    display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
  .foot{z-index:1;display:flex;align-items:center;gap:14px;font-size:22px;color:#8fb0c8}
  .dot{width:9px;height:9px;border-radius:50%;background:#22d3ee}
</style></head><body>
<div class="glow"></div>
<div class="top">
  ${logoDataUri ? `<img src="${logoDataUri}" alt=""/>` : ""}
  <span class="brand">Gradr</span>
  <span class="eyebrow">${esc(eyebrow)}</span>
</div>
<div>
  <h1>${esc(title)}</h1>
  <p style="margin-top:22px">${esc(description)}</p>
</div>
<div class="foot"><span class="dot"></span><span>gradr.me — AI career command center</span></div>
</body></html>`;
}

async function main() {
  const targets = ogTargets();
  const check = process.argv.includes("--check");

  if (check) {
    const missing = targets.filter(
      (t) => !existsSync(join(ROOT, "public", "og", `${t.kind}-${t.slug}.png`)),
    );
    for (const t of missing) console.log(`FAIL missing OG image for ${t.kind}/${t.slug}`);
    console.log(
      missing.length
        ? `\n${missing.length} article(s) without an OG image — run: npm run og:generate`
        : `\nOG images: ${targets.length} article card(s) present.`,
    );
    process.exit(missing.length ? 1 : 0);
  }

  mkdirSync(OUT_DIR, { recursive: true });
  let logoDataUri = "";
  const logo = join(ROOT, "public", "gradr-logo.png");
  if (existsSync(logo)) {
    logoDataUri = `data:image/png;base64,${readFileSync(logo).toString("base64")}`;
  }

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
  for (const t of targets) {
    await page.setContent(cardHtml(t, logoDataUri), { waitUntil: "networkidle" });
    const out = join(OUT_DIR, `${t.kind}-${t.slug}.png`);
    await page.screenshot({ path: out });
    console.log(`wrote og/${t.kind}-${t.slug}.png`);
  }
  await browser.close();
  console.log(`\n${targets.length} Open Graph image(s) generated.`);
}

if (process.argv[1] && process.argv[1].endsWith("generate-og-images.mjs")) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
