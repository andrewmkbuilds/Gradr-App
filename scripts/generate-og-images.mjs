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

/**
 * Standalone marketing landing pages that need their own social card
 * (kind "page" -> /og/page-<slug>.png, matched by resolveOgImage in RouteSeo).
 */
const PAGE_TARGETS = [
  {
    kind: "site",
    slug: "gradr",
    title: "AI Career Copilot for Resumes, Jobs & Interviews",
    description:
      "Score your resume against ATS rules, match live job openings, draft tailored applications, and practice realtime AI mock interviews.",
    eyebrow: "gradr.me",
  },
  {
    kind: "page",
    slug: "ai-interview-coach",
    title: "AI Interview Coach — free voice mock interviews",
    description:
      "Practice a real spoken interview for your target role. Adaptive follow-ups, a weighted score across five dimensions, and a full transcript.",
    eyebrow: "Interview Engine",
  },
];

export function ogTargets() {
  return [
    ...PAGE_TARGETS,
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
  @import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@600;800&family=Inter:wght@400;500;600&display=swap');
  *{margin:0;padding:0;box-sizing:border-box}
  body{width:1200px;height:630px;font-family:Inter,system-ui,sans-serif;
    background:radial-gradient(880px 520px at 84% -14%, #2d6f85 0%, transparent 62%),
               radial-gradient(620px 460px at -6% 112%, #733E24 0%, transparent 58%),
               #0b1c22;color:#F2F0EF;display:flex;flex-direction:column;
    justify-content:space-between;padding:66px 72px;position:relative;overflow:hidden}
  .rule{position:absolute;left:0;right:0;top:0;height:8px;
    background:linear-gradient(90deg,#245F73 0%,#245F73 62%,#733E24 62%,#733E24 100%)}
  .grid{position:absolute;inset:0;opacity:.06;
    background-image:linear-gradient(#F2F0EF 1px,transparent 1px),linear-gradient(90deg,#F2F0EF 1px,transparent 1px);
    background-size:64px 64px}
  .top{display:flex;align-items:center;gap:16px;z-index:1}
  .top img{height:56px;width:auto;border-radius:14px}
  .brand{font-family:'Bricolage Grotesque',Inter,sans-serif;font-weight:800;font-size:32px;letter-spacing:-.02em;color:#F2F0EF}
  .eyebrow{margin-left:auto;font-size:19px;font-weight:600;color:#F2F0EF;
    border:1px solid rgba(242,240,239,.28);border-radius:999px;padding:9px 22px;background:rgba(115,62,36,.55)}
  h1{z-index:1;font-family:'Bricolage Grotesque',Inter,sans-serif;font-size:64px;line-height:1.06;font-weight:800;letter-spacing:-.03em;max-width:1010px}
  p{z-index:1;font-size:27px;line-height:1.42;color:#BBBDBC;max-width:960px;
    display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
  .foot{z-index:1;display:flex;align-items:center;gap:14px;font-size:22px;color:#BBBDBC}
  .dot{width:10px;height:10px;border-radius:50%;background:#733E24}
</style></head><body>
<div class="grid"></div><div class="rule"></div>
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

/**
 * The flagship site-wide Open Graph card served at /og.png.
 *
 * This is the image every social platform shows for gradr.me and for any
 * public page without its own per-article card, so it is rendered from a
 * richer layout than the generic article template: full brand lockup,
 * value proposition, and the four product pillars.
 */
function rootCardHtml(logoDataUri) {
  const pillars = [
    ["ATS resume scoring", "Beat the filters"],
    ["Live job matching", "Roles that fit"],
    ["Application engine", "Tailored in a click"],
    ["AI mock interviews", "Practice out loud"],
  ];
  return `<!doctype html><html><head><meta charset="utf-8"/>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@600;700;800&family=Inter:wght@400;500;600;700&display=swap');
  *{margin:0;padding:0;box-sizing:border-box}
  body{width:1200px;height:630px;font-family:Inter,system-ui,sans-serif;overflow:hidden;
    background:radial-gradient(900px 560px at 88% -18%, #2f7a92 0%, transparent 60%),
               radial-gradient(680px 500px at -8% 118%, #733E24 0%, transparent 58%),
               #0b1c22;color:#F2F0EF;position:relative;
    display:flex;flex-direction:column;justify-content:space-between;padding:64px 72px 58px}
  .rule{position:absolute;left:0;right:0;top:0;height:9px;
    background:linear-gradient(90deg,#245F73 0%,#2f7a92 58%,#733E24 58%,#8d4c2c 100%)}
  .grid{position:absolute;inset:0;opacity:.055;
    background-image:linear-gradient(#F2F0EF 1px,transparent 1px),linear-gradient(90deg,#F2F0EF 1px,transparent 1px);
    background-size:60px 60px;
    -webkit-mask-image:radial-gradient(760px 520px at 24% 40%, #000 0%, transparent 78%)}
  .glow{position:absolute;width:520px;height:520px;right:-120px;bottom:-220px;border-radius:50%;
    background:radial-gradient(circle,rgba(47,122,146,.45) 0%,transparent 68%);filter:blur(12px)}
  .top{display:flex;align-items:center;gap:18px;z-index:1}
  .top img{height:62px;width:auto}
  .brand{font-family:'Bricolage Grotesque',Inter,sans-serif;font-weight:800;font-size:38px;
    letter-spacing:-.03em;color:#F2F0EF}
  .badge{margin-left:auto;font-size:19px;font-weight:600;letter-spacing:.02em;color:#F2F0EF;
    border:1px solid rgba(242,240,239,.26);border-radius:999px;padding:10px 24px;
    background:linear-gradient(90deg,rgba(36,95,115,.6),rgba(115,62,36,.5))}
  h1{z-index:1;font-family:'Bricolage Grotesque',Inter,sans-serif;font-size:74px;line-height:1.03;
    font-weight:800;letter-spacing:-.035em;max-width:1000px}
  h1 .accent{background:linear-gradient(90deg,#7fc4d8 0%,#d99a72 100%);
    -webkit-background-clip:text;background-clip:text;color:transparent}
  p.lede{z-index:1;margin-top:22px;font-size:28px;line-height:1.4;color:#c6cbcc;max-width:940px}
  .pillars{z-index:1;display:flex;gap:14px}
  .pillar{flex:1;border:1px solid rgba(242,240,239,.16);border-radius:16px;padding:16px 18px;
    background:rgba(242,240,239,.055)}
  .pillar .k{font-size:19px;font-weight:700;color:#F2F0EF;letter-spacing:-.01em}
  .pillar .v{margin-top:5px;font-size:16px;color:#9fb0b5}
  .foot{z-index:1;display:flex;align-items:center;gap:12px;font-size:22px;font-weight:600;color:#c6cbcc}
  .dot{width:10px;height:10px;border-radius:50%;background:#d99a72}
</style></head><body>
<div class="grid"></div><div class="glow"></div><div class="rule"></div>
<div class="top">
  ${logoDataUri ? `<img src="${logoDataUri}" alt=""/>` : ""}
  <span class="brand">Gradr</span>
  <span class="badge">AI Career Command Center</span>
</div>
<div>
  <h1>Build your career with <span class="accent">AI that actually helps</span></h1>
  <p class="lede">Better resumes, matched jobs, tracked applications, and realtime mock interviews — in one workspace.</p>
</div>
<div class="pillars">
  ${pillars.map(([k, v]) => `<div class="pillar"><div class="k">${esc(k)}</div><div class="v">${esc(v)}</div></div>`).join("")}
</div>
<div class="foot"><span class="dot"></span><span>gradr.me</span></div>
</body></html>`;
}

async function main() {
  const targets = ogTargets();
  const check = process.argv.includes("--check");

  if (check) {
    const missing = targets.filter(
      (t) => !existsSync(join(ROOT, "public", "og", `${t.kind}-${t.slug}.png`)),
    );
    if (!existsSync(join(ROOT, "public", "og.png"))) {
      console.log("FAIL missing site Open Graph image public/og.png");
      missing.push({ kind: "site", slug: "og.png" });
    }
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
  const logo = join(ROOT, "public", "brand", "gradr-official-app-icon-grey.png");
  if (existsSync(logo)) {
    logoDataUri = `data:image/png;base64,${readFileSync(logo).toString("base64")}`;
  }

  const browser = await chromium.launch({
    channel: process.env.OG_CHROMIUM_CHANNEL || undefined,
    executablePath: process.env.OG_CHROMIUM_PATH || undefined,
  });
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
  for (const t of targets) {
    await page.setContent(cardHtml(t, logoDataUri), { waitUntil: "networkidle" });
    const out = join(OUT_DIR, `${t.kind}-${t.slug}.png`);
    await page.screenshot({ path: out });
    console.log(`wrote og/${t.kind}-${t.slug}.png`);
  }

  // Flagship site card -> /og.png (referenced by index.html and RouteSeo).
  await page.setContent(rootCardHtml(logoDataUri), { waitUntil: "networkidle" });
  await page.screenshot({ path: join(ROOT, "public", "og.png") });
  console.log("wrote og.png");

  await browser.close();
  console.log(`\n${targets.length} Open Graph image(s) generated.`);
}

if (process.argv[1] && process.argv[1].endsWith("generate-og-images.mjs")) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
