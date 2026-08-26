/**
 * Deterministic stand-in listings for environments without Adzuna credentials.
 *
 * The sandbox and preview backends have no `ADZUNA_APP_ID` / `ADZUNA_APP_KEY`,
 * which used to make `/jobs` fail with a 500 and left the whole search surface
 * untestable. Rather than pretend the search worked, we return a small, clearly
 * labelled fixture set (`source: "sample"`, `sources.adzuna.status:
 * "missing_credentials"`) so the UI can be exercised end to end while the
 * response still tells the caller the data is not live.
 *
 * Never used when real credentials are configured.
 */
export interface MockJobShape {
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
];

/** 20 listings per page, stable per (what, where, page) so tests can assert them. */
export function mockJobs(opts: {
  what: string;
  where: string;
  page: number;
  remoteOnly: boolean;
  perPage?: number;
}): { jobs: MockJobShape[]; total: number } {
  const perPage = opts.perPage ?? 20;
  const total = 46; // enough to exercise three pages
  const start = (opts.page - 1) * perPage;
  const count = Math.max(0, Math.min(perPage, total - start));
  const now = Date.now();

  const jobs: MockJobShape[] = [];
  for (let i = 0; i < count; i += 1) {
    const index = start + i;
    const t = TEMPLATES[index % TEMPLATES.length];
    const title = opts.what ? `${t.title} — ${opts.what}` : t.title;
    jobs.push({
      external_id: `sample-${index + 1}`,
      source: "sample",
      title,
      company: t.company,
      location: opts.where || (t.remote ? "Remote" : "New York, NY"),
      remote: t.remote,
      url: `https://example.com/sample-jobs/${index + 1}`,
      salary_min: t.salary[0],
      salary_max: t.salary[1],
      description:
        `Sample listing #${index + 1} used because live job-board credentials are not configured in this environment. ` +
        `Responsibilities include shipping product work, collaborating across teams and improving quality.`,
      posted_at: new Date(now - (index + 1) * 3_600_000).toISOString(),
    });
  }

  const filtered = opts.remoteOnly ? jobs.filter((j) => j.remote) : jobs;
  return { jobs: filtered, total };
}
