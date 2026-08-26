/**
 * Saved responses used by the QA sandbox.
 *
 * Everything here is deterministic: the same query always produces the same
 * listings, scores and ATS report, so end-to-end tests can assert on exact
 * values. Records are clearly marked (`source: "fixture"`, sample URLs) so a
 * fixture result can never be mistaken for live data.
 */

export interface FixtureJob {
  external_id: string;
  source: string;
  title: string;
  company: string | null;
  location: string | null;
  remote: boolean;
  url: string;
  salary_min: number | null;
  salary_max: number | null;
  description: string;
  posted_at: string;
}

const TEMPLATES = [
  { title: "Senior Frontend Engineer", company: "Northwind Labs", remote: true, salary: [140000, 185000] },
  { title: "Product Designer", company: "Harbor Studio", remote: false, salary: [95000, 125000] },
  { title: "Full Stack Developer", company: "Beacon Systems", remote: true, salary: [120000, 160000] },
  { title: "Data Analyst", company: "Meridian Group", remote: false, salary: [80000, 105000] },
  { title: "Engineering Manager", company: "Atlas Cloud", remote: true, salary: [175000, 215000] },
  { title: "Customer Success Manager", company: "Lantern HQ", remote: false, salary: [70000, 95000] },
] as const;

export const FIXTURE_PER_PAGE = 20;
/** Three pages: 20 + 20 + 6, then an empty page — exercises pagination ends. */
export const FIXTURE_TOTAL = 46;

/** Stable epoch so `posted_at` never shifts between runs of the same test. */
const EPOCH = Date.parse("2026-01-06T09:00:00.000Z");

export function fixtureJobs(opts: {
  what?: string;
  where?: string;
  page?: number;
  remoteOnly?: boolean;
}): { jobs: FixtureJob[]; total: number } {
  const page = Math.max(1, Number(opts.page ?? 1));
  const start = (page - 1) * FIXTURE_PER_PAGE;
  const count = Math.max(0, Math.min(FIXTURE_PER_PAGE, FIXTURE_TOTAL - start));

  const jobs: FixtureJob[] = [];
  for (let i = 0; i < count; i += 1) {
    const index = start + i;
    const t = TEMPLATES[index % TEMPLATES.length];
    jobs.push({
      external_id: `fixture-${index + 1}`,
      source: "fixture",
      title: opts.what ? `${t.title} — ${opts.what}` : t.title,
      company: t.company,
      location: opts.where || (t.remote ? "Remote" : "New York, NY"),
      remote: t.remote,
      url: `https://example.com/fixture-jobs/${index + 1}`,
      salary_min: t.salary[0],
      salary_max: t.salary[1],
      description:
        `Fixture listing #${index + 1} served by the QA sandbox — this is not a live job. ` +
        `Responsibilities include shipping product work, partnering with design and raising quality.`,
      posted_at: new Date(EPOCH - (index + 1) * 3_600_000).toISOString(),
    });
  }

  return { jobs: opts.remoteOnly ? jobs.filter((j) => j.remote) : jobs, total: FIXTURE_TOTAL };
}

/** Board-scraper fixture (Apify path) — distinct ids so de-duplication is testable. */
export function fixtureScrapedJobs(query: string, location: string): FixtureJob[] {
  return [0, 1, 2].map((i) => ({
    external_id: `fixture-scraped-${i + 1}`,
    source: "indeed",
    title: `${query || "Software Engineer"} (Board listing ${i + 1})`,
    company: ["Cobalt Works", "Pier 9 Digital", "Verity Health"][i],
    location: location || "Remote",
    remote: i % 2 === 0,
    url: `https://example.com/fixture-board/${i + 1}`,
    salary_min: 90000 + i * 10000,
    salary_max: 130000 + i * 10000,
    description: "Fixture board listing served by the QA sandbox — not a live job.",
    posted_at: new Date(EPOCH - (i + 1) * 7_200_000).toISOString(),
  }));
}

/** Deterministic match scores, highest first so ordering is assertable. */
export function fixtureJobScores(count: number): { i: number; score: number; reason: string }[] {
  return Array.from({ length: count }, (_, i) => ({
    i,
    score: Math.max(41, 94 - i * 3),
    reason: "Fixture score: strong overlap on core skills, lighter on domain experience.",
  }));
}

export interface FixtureAtsResult {
  ats_score: number;
  keyword_match: number;
  formatting_score: number;
  impact_score: number;
  readability_score: number;
  suggestions: { type: string; title: string; detail: string; section?: string }[];
  evidence: { label: string; detail: string; ok: boolean }[];
  rewrites: { before: string; after: string }[];
  tailoredTo: string | null;
  metrics: {
    wordCount: number;
    quantifiedBullets: number;
    actionVerbCount: number;
    missingSkills: string[];
    matchedKeywords: string[];
    fleschReadingEase: number;
  };
}

export function fixtureAtsResult(jobTitle?: string): FixtureAtsResult {
  return {
    ats_score: 78,
    keyword_match: 71,
    formatting_score: 88,
    impact_score: 64,
    readability_score: 82,
    suggestions: [
      { type: "critical", title: "Quantify your top three bullets", detail: "Only 4 of 17 bullets carry a number. Add scale, percentage or currency to the first bullet of each role.", section: "Experience" },
      { type: "warning", title: "Add the exact role keyword", detail: `The target title "${jobTitle || "Senior Frontend Engineer"}" does not appear in your summary.`, section: "Summary" },
      { type: "improvement", title: "Tighten the skills list", detail: "Group the 22 listed skills into four labelled clusters so a recruiter can scan them in one pass.", section: "Skills" },
      { type: "good", title: "Clean, parseable structure", detail: "Single column, standard headings and no tables — this parses cleanly in every major ATS.", section: "Formatting" },
    ],
    evidence: [
      { label: "Standard section headings", detail: "Experience, Education, Skills all detected.", ok: true },
      { label: "Contact block parseable", detail: "Email and phone found in the header.", ok: true },
      { label: "No images or text boxes", detail: "Nothing that an ATS would silently drop.", ok: true },
      { label: "Dates consistent", detail: "Two roles use 'MM/YYYY' while three use 'Month YYYY'.", ok: false },
    ],
    rewrites: [
      { before: "Responsible for improving the checkout page.", after: "Rebuilt the checkout page, lifting completed orders 18% quarter over quarter." },
      { before: "Worked with designers on the design system.", after: "Partnered with 3 designers to ship a 40-component design system now used by 6 squads." },
    ],
    tailoredTo: jobTitle || null,
    metrics: {
      wordCount: 612,
      quantifiedBullets: 4,
      actionVerbCount: 21,
      missingSkills: ["TypeScript", "Accessibility", "Performance budgets"],
      matchedKeywords: ["React", "Design systems", "Testing", "Mentoring"],
      fleschReadingEase: 52.4,
    },
  };
}
