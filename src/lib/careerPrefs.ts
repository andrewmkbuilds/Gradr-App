/**
 * Career targeting preferences.
 *
 * One shared shape for the onboarding flow, the dashboard briefing and the job
 * matching engine, plus the deterministic re-ranking logic that turns those
 * preferences into a score adjustment on top of the resume match score.
 *
 * Dependency-free on purpose: the same logic runs in the browser today and can
 * move to the server (digest emails, recommendations) unchanged.
 */

export interface CareerPreferences {
  targetRoles: string[];
  industries: string[];
  jobTypes: string[];
  locations: string[];
  keywords: string[];
  remotePreference: "any" | "remote" | "hybrid" | "onsite";
  experienceLevel: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  country: string | null;
  onboarded: boolean;
}

export const EMPTY_PREFERENCES: CareerPreferences = {
  targetRoles: [],
  industries: [],
  jobTypes: [],
  locations: [],
  keywords: [],
  remotePreference: "any",
  experienceLevel: null,
  salaryMin: null,
  salaryMax: null,
  country: null,
  onboarded: false,
};

export const INDUSTRY_OPTIONS = [
  "Software & SaaS",
  "Fintech",
  "Healthcare",
  "E-commerce & Retail",
  "AI & Data",
  "Media & Entertainment",
  "Education",
  "Consulting",
  "Gaming",
  "Energy & Climate",
  "Government & Nonprofit",
  "Manufacturing",
] as const;

export const JOB_TYPE_OPTIONS = ["Full-time", "Part-time", "Contract", "Internship", "Graduate"] as const;

export const EXPERIENCE_OPTIONS = [
  { value: "student", label: "Student / no experience yet" },
  { value: "entry", label: "Entry level (0–2 years)" },
  { value: "mid", label: "Mid level (2–5 years)" },
  { value: "senior", label: "Senior (5–10 years)" },
  { value: "lead", label: "Lead / staff (10+ years)" },
] as const;

export const REMOTE_OPTIONS = [
  { value: "any", label: "Open to anything" },
  { value: "remote", label: "Remote only" },
  { value: "hybrid", label: "Hybrid" },
  { value: "onsite", label: "On-site" },
] as const;

/** Rows come back with nullable arrays; normalise once at the boundary. */
export function preferencesFromRow(row: Record<string, unknown> | null | undefined): CareerPreferences {
  if (!row) return EMPTY_PREFERENCES;
  const arr = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
  const legacyRole = typeof row["target_role"] === "string" && row["target_role"] ? [row["target_role"] as string] : [];
  const roles = arr(row["target_roles"]);
  const remote = String(row["remote_preference"] ?? "any");
  return {
    targetRoles: roles.length > 0 ? roles : legacyRole,
    industries: arr(row["industries"]),
    jobTypes: arr(row["job_types"]),
    locations: arr(row["locations"]),
    keywords: arr(row["keywords"]),
    remotePreference: (["any", "remote", "hybrid", "onsite"].includes(remote) ? remote : "any") as CareerPreferences["remotePreference"],
    experienceLevel: (row["experience_level"] as string | null) ?? null,
    salaryMin: (row["salary_min"] as number | null) ?? null,
    salaryMax: (row["salary_max"] as number | null) ?? null,
    country: (row["country"] as string | null) ?? null,
    onboarded: Boolean(row["onboarded"]),
  };
}

/** Shape written back to `user_preferences`. */
export function preferencesToRow(prefs: CareerPreferences) {
  return {
    target_roles: prefs.targetRoles,
    // Kept in sync so existing single-role consumers (digest, match engine) work.
    target_role: prefs.targetRoles[0] ?? null,
    industries: prefs.industries,
    job_types: prefs.jobTypes,
    locations: prefs.locations,
    keywords: prefs.keywords,
    remote_preference: prefs.remotePreference,
    experience_level: prefs.experienceLevel,
    salary_min: prefs.salaryMin,
    salary_max: prefs.salaryMax,
    country: prefs.country,
  };
}

export function hasTargeting(prefs: CareerPreferences): boolean {
  return prefs.targetRoles.length > 0 || prefs.industries.length > 0 || prefs.salaryMin != null;
}

export interface RankableJob {
  title: string;
  company?: string | null;
  location?: string | null;
  remote?: boolean;
  description?: string;
  salary_min?: number | null;
  salary_max?: number | null;
}

export interface PreferenceFit {
  /** -12 … +12 adjustment applied to the resume match score. */
  delta: number;
  reasons: string[];
  penalties: string[];
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9+ ]/g, " ").replace(/\s+/g, " ").trim();

/**
 * Deterministic preference fit. Never invents signal: every reason maps to a
 * concrete field the user filled in during onboarding.
 */
export function preferenceFit(job: RankableJob, prefs: CareerPreferences): PreferenceFit {
  const reasons: string[] = [];
  const penalties: string[] = [];
  let delta = 0;

  const haystack = norm(`${job.title} ${job.company ?? ""} ${job.description ?? ""}`);
  const titleText = norm(job.title);

  const roleHit = prefs.targetRoles.find((r) => r && titleText.includes(norm(r)));
  if (roleHit) {
    delta += 6;
    reasons.push(`Title matches your target role “${roleHit}”`);
  }

  const industryHit = prefs.industries.find((i) => i && haystack.includes(norm(i).split(" ")[0]!));
  if (industryHit) {
    delta += 3;
    reasons.push(`Looks like ${industryHit}`);
  }

  const typeHit = prefs.jobTypes.find((t) => t && haystack.includes(norm(t)));
  if (typeHit) {
    delta += 2;
    reasons.push(`${typeHit} role`);
  }

  if (prefs.remotePreference === "remote") {
    if (job.remote) {
      delta += 4;
      reasons.push("Remote, as you prefer");
    } else {
      delta -= 6;
      penalties.push("Not listed as remote");
    }
  } else if (prefs.remotePreference === "onsite" && job.remote) {
    delta -= 2;
    penalties.push("Remote role, you prefer on-site");
  }

  if (prefs.locations.length > 0 && job.location) {
    const loc = norm(job.location);
    if (prefs.locations.some((l) => l && loc.includes(norm(l)))) {
      delta += 3;
      reasons.push(`In ${job.location}`);
    }
  }

  if (prefs.salaryMin != null) {
    const top = job.salary_max ?? job.salary_min;
    if (top != null) {
      if (top >= prefs.salaryMin) {
        delta += 3;
        reasons.push("Pays at or above your salary floor");
      } else {
        delta -= 8;
        penalties.push("Below your salary floor");
      }
    }
  }
  if (prefs.salaryMax != null && job.salary_min != null && job.salary_min > prefs.salaryMax * 1.4) {
    penalties.push("Well above your stated range — may be a more senior role");
  }

  const keywordHits = prefs.keywords.filter((k) => k && haystack.includes(norm(k)));
  if (keywordHits.length > 0) {
    delta += Math.min(keywordHits.length, 3);
    reasons.push(`Mentions ${keywordHits.slice(0, 3).join(", ")}`);
  }

  return { delta: Math.max(-12, Math.min(12, delta)), reasons, penalties };
}

export interface RankedJob<T extends RankableJob> {
  job: T;
  baseScore: number;
  score: number;
  fit: PreferenceFit;
}

/** Re-rank matches with preference fit layered on the resume match score. */
export function rankJobs<T extends RankableJob>(
  jobs: T[],
  prefs: CareerPreferences,
  baseScoreOf: (job: T) => number,
): RankedJob<T>[] {
  return jobs
    .map((job) => {
      const baseScore = baseScoreOf(job);
      const fit = hasTargeting(prefs) ? preferenceFit(job, prefs) : { delta: 0, reasons: [], penalties: [] };
      return { job, baseScore, score: Math.max(0, Math.min(100, Math.round(baseScore + fit.delta))), fit };
    })
    .sort((a, b) => b.score - a.score);
}

/** Human summary used on the dashboard and the matching header. */
export function targetingSummary(prefs: CareerPreferences): string {
  const bits: string[] = [];
  if (prefs.targetRoles.length) bits.push(prefs.targetRoles.slice(0, 2).join(" / "));
  if (prefs.industries.length) bits.push(`in ${prefs.industries.slice(0, 2).join(" & ")}`);
  if (prefs.salaryMin) bits.push(`from $${Math.round(prefs.salaryMin / 1000)}k`);
  if (prefs.remotePreference === "remote") bits.push("remote");
  return bits.join(" · ");
}
