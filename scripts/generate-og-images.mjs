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

const PALETTE = {
  ink: "#132b33",       // deepest teal-ink, the card ground
  teal: "#245F73",      // Yacht Club primary
  mahogany: "#733E24",  // Yacht Club accent
  neutral: "#F2F0EF",   // off-white
  gray: "#BBBDBC",      // muted gray
};

/**
 * Shared chrome for every card: a calm teal ground, one mahogany warm-light
 * sweep and a fine grid. No cyan, no navy — this is the Yacht Club system.
 */
function shell(inner, { pad = "68px 72px" } = {}) {
  return `<!doctype html><html><head><meta charset="utf-8"/>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;800&display=swap');
  *{margin:0;padding:0;box-sizing:border-box}
  body{width:1200px;height:630px;font-family:Inter,system-ui,sans-serif;
    background:
      radial-gradient(880px 520px at 84% -14%, rgba(36,95,115,.85) 0%, transparent 62%),
      radial-gradient(720px 520px at -10% 112%, rgba(115,62,36,.55) 0%, transparent 64%),
      ${PALETTE.ink};
    color:${PALETTE.neutral};display:flex;flex-direction:column;
    justify-content:space-between;padding:${pad};position:relative;overflow:hidden}
  .grid{position:absolute;inset:0;opacity:.16;
    background-image:linear-gradient(rgba(242,240,239,.14) 1px,transparent 1px),
      linear-gradient(90deg,rgba(242,240,239,.14) 1px,transparent 1px);
    background-size:64px 64px;
    -webkit-mask-image:radial-gradient(900px 520px at 78% 8%,#000 0%,transparent 78%)}
  .warm{position:absolute;inset:auto -170px -240px auto;width:560px;height:560px;border-radius:50%;
    background:radial-gradient(circle,${PALETTE.mahogany} 0%,rgba(115,62,36,0) 68%);
    filter:blur(60px);opacity:.75}
  .rule{position:absolute;left:0;right:0;bottom:0;height:6px;
    background:linear-gradient(90deg,${PALETTE.teal} 0%,${PALETTE.mahogany} 100%)}
  .top{display:flex;align-items:center;gap:16px;z-index:1}
  .top img{height:52px;width:auto}
  .brand{font-weight:800;font-size:30px;letter-spacing:-.02em;color:${PALETTE.neutral}}
  .eyebrow{margin-left:auto;font-size:19px;font-weight:600;color:#e8cdbd;
    border:1px solid rgba(115,62,36,.65);border-radius:999px;padding:8px 20px;
    background:rgba(115,62,36,.30)}
  h1{z-index:1;font-size:64px;line-height:1.06;font-weight:800;letter-spacing:-.03em;max-width:1010px}
  p{z-index:1;font-size:27px;line-height:1.42;color:${PALETTE.gray};max-width:960px;
    display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
  .foot{z-index:1;display:flex;align-items:center;gap:14px;font-size:22px;color:${PALETTE.gray}}
  .dot{width:9px;height:9px;border-radius:50%;background:${PALETTE.mahogany}}
  .hero{z-index:1;display:flex;flex-direction:column;gap:26px}
  .wordmark{font-size:108px;font-weight:800;letter-spacing:-.045em;line-height:1}
  .tag{font-size:31px;color:#dcd8d5;font-weight:500;max-width:900px;line-height:1.35}
  .pills{display:flex;gap:12px;flex-wrap:wrap}
  .pill{font-size:20px;font-weight:600;color:${PALETTE.neutral};padding:9px 20px;border-radius:999px;
    border:1px solid rgba(242,240,239,.22);background:rgba(242,240,239,.07)}
  .pill.warm{position:static;width:auto;height:auto;filter:none;opacity:1;border-radius:999px;
    border:1px solid rgba(115,62,36,.7);background:rgba(115,62,36,.35)}
</style></head><body>
<div class="grid"></div><div class="warm"></div><div class="rule"></div>
${inner}
</body></html>`;
}

/** Per-article card: eyebrow, headline, dek. */
function cardHtml({ title, description, eyebrow }, logoDataUri) {
  return shell(`
<div class="top">
  ${logoDataUri ? `<img src="${logoDataUri}" alt=""/>` : ""}
  <span class="brand">Gradr</span>
  <span class="eyebrow">${esc(eyebrow)}</span>
</div>
<div>
  <h1>${esc(title)}</h1>
  <p style="margin-top:22px">${esc(description)}</p>
</div>
<div class="foot"><span class="dot"></span><span>gradr.me — AI career copilot</span></div>`);
}

/** Sitewide / landing card: big Gradr wordmark, tagline, capability pills. */
function brandCardHtml({ tagline, pills = [] }, logoDataUri) {
  return shell(`
<div class="top">
  ${logoDataUri ? `<img src="${logoDataUri}" alt=""/>` : ""}
  <span class="brand">Gradr</span>
  <span class="eyebrow">gradr.me</span>
</div>
<div class="hero">
  <div class="wordmark">Gradr</div>
  <div class="tag">${esc(tagline)}</div>
</div>
<div class="pills">
  ${pills.map((p, i) => `<span class="pill${i === 0 ? " warm" : ""}">${esc(p)}</span>`).join("")}
</div>`);
}

/**
 * Static cards that are not article-driven. Keys map to output paths so the
 * sitewide default and every keyword landing page share one visual system.
 */
const STATIC_CARDS = [
  {
    out: "og-image.jpg",
    root: true,
    tagline: "AI career copilot for resumes, job matches and interviews — one workspace, offer to signed.",
    pills: ["Resume intelligence", "Job matching", "Mock interviews", "Application pipeline"],
  },
  {
    out: "og/landing.png",
    tagline: "From first draft to signed offer — your AI career copilot for resumes, matches and interviews.",
    pills: ["Resume intelligence", "Job matching", "Mock interviews"],
  },
  {
    out: "og/blog.png",
    tagline: "Career guides on resumes, ATS scoring, job search and interview prep — written for real hiring.",
    pills: ["Guides", "Resume tactics", "Interview prep"],
  },
  {
    out: "og/ai-interview-coach.png",
    tagline: "AI interview coach — live mock interviews with real-time scoring and a written scorecard.",
    pills: ["AI interview coach", "Live scoring", "Instant feedback"],
  },
  {
    out: "og/ats-resume-checker.png",
    tagline: "Free ATS resume checker — see exactly how applicant tracking systems read your resume.",
    pills: ["ATS checker", "Keyword gaps", "Format audit"],
  },
  {
    out: "og/ai-resume-builder.png",
    tagline: "AI resume builder — tailored, ATS-ready resumes generated for the role you actually want.",
    pills: ["AI resume builder", "Role tailoring", "ATS ready"],
  },
];

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

  const browser = await chromium.launch({
    channel: process.env.OG_CHROMIUM_CHANNEL || undefined,
    executablePath: process.env.OG_CHROMIUM_PATH || undefined,
  });
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });

  // Static brand cards first: the sitewide default plus keyword landing pages.
  for (const card of STATIC_CARDS) {
    await page.setContent(brandCardHtml(card, logoDataUri), { waitUntil: "networkidle" });
    const out = join(ROOT, "public", card.out);
    mkdirSync(dirname(out), { recursive: true });
    await page.screenshot(
      card.out.endsWith(".jpg")
        ? { path: out, type: "jpeg", quality: 92 }
        : { path: out },
    );
    console.log(`wrote ${card.out}`);
  }

  for (const t of targets) {
    await page.setContent(cardHtml(t, logoDataUri), { waitUntil: "networkidle" });
    const out = join(OUT_DIR, `${t.kind}-${t.slug}.png`);
    await page.screenshot({ path: out });
    console.log(`wrote og/${t.kind}-${t.slug}.png`);
  }
  await browser.close();
  console.log(`\n${targets.length + STATIC_CARDS.length} Open Graph image(s) generated.`);
}

if (process.argv[1] && process.argv[1].endsWith("generate-og-images.mjs")) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
