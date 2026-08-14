/**
 * Job-type keyword profiles.
 *
 * The resume diff view scores each version against the vocabulary a given job
 * family actually screens for, so a change can be judged per target role:
 * an edit that helps a Product Management application can hurt a Data one.
 */

export interface JobTypeProfile {
  id: string;
  label: string;
  /** Signals ATS parsers and recruiters look for in this family. */
  keywords: string[];
}

export const JOB_TYPE_PROFILES: JobTypeProfile[] = [
  {
    id: "software",
    label: "Software Engineering",
    keywords: [
      "typescript", "javascript", "python", "react", "node", "api", "microservices", "testing",
      "ci", "cd", "docker", "kubernetes", "sql", "performance", "scalability", "code", "review",
      "architecture", "git", "deployment", "debugging", "refactor",
    ],
  },
  {
    id: "data",
    label: "Data & Analytics",
    keywords: [
      "sql", "python", "pandas", "etl", "warehouse", "dbt", "tableau", "powerbi", "dashboard",
      "modelling", "statistics", "experiment", "forecasting", "segmentation", "pipeline",
      "visualization", "metrics", "cohort", "regression", "airflow",
    ],
  },
  {
    id: "product",
    label: "Product Management",
    keywords: [
      "roadmap", "discovery", "stakeholder", "backlog", "prioritisation", "prioritization",
      "requirements", "user", "research", "metrics", "retention", "activation", "launch",
      "experiment", "strategy", "okrs", "cross-functional", "customer", "pricing", "adoption",
    ],
  },
  {
    id: "design",
    label: "Design & UX",
    keywords: [
      "figma", "prototype", "wireframe", "usability", "accessibility", "design", "system",
      "typography", "interaction", "research", "personas", "journey", "handoff", "visual",
      "responsive", "iteration", "critique", "brand",
    ],
  },
  {
    id: "marketing",
    label: "Marketing & Growth",
    keywords: [
      "seo", "campaign", "content", "conversion", "funnel", "acquisition", "retention", "email",
      "lifecycle", "paid", "social", "brand", "copywriting", "analytics", "attribution", "ctr",
      "roas", "positioning", "launch", "audience",
    ],
  },
  {
    id: "operations",
    label: "Operations & Program",
    keywords: [
      "process", "vendor", "budget", "forecast", "logistics", "compliance", "sop", "efficiency",
      "cost", "reporting", "stakeholder", "scheduling", "risk", "program", "governance",
      "documentation", "throughput", "escalation",
    ],
  },
  {
    id: "finance",
    label: "Finance & Consulting",
    keywords: [
      "financial", "modelling", "modeling", "valuation", "forecast", "budget", "variance",
      "reconciliation", "audit", "excel", "reporting", "gaap", "ifrs", "analysis", "due",
      "diligence", "margin", "cashflow", "kpi",
    ],
  },
];

export interface JobTypeCoverage {
  profile: JobTypeProfile;
  matched: string[];
  missing: string[];
  /** 0-100 share of the profile vocabulary present in the resume. */
  score: number;
}

/** Scores one tokenised resume against one job-type profile. */
export function scoreAgainstProfile(tokens: Set<string>, profile: JobTypeProfile): JobTypeCoverage {
  const matched: string[] = [];
  const missing: string[] = [];
  for (const keyword of profile.keywords) {
    (tokens.has(keyword) ? matched : missing).push(keyword);
  }
  const score = profile.keywords.length
    ? Math.round((matched.length / profile.keywords.length) * 100)
    : 0;
  return { profile, matched, missing, score };
}

export interface JobTypeDelta {
  profile: JobTypeProfile;
  baseScore: number;
  compareScore: number;
  delta: number;
  gained: string[];
  lost: string[];
}

/** Per-job-type change between two tokenised resume versions. */
export function jobTypeDeltas(baseTokens: Set<string>, compareTokens: Set<string>): JobTypeDelta[] {
  return JOB_TYPE_PROFILES.map((profile) => {
    const a = scoreAgainstProfile(baseTokens, profile);
    const b = scoreAgainstProfile(compareTokens, profile);
    const aSet = new Set(a.matched);
    const bSet = new Set(b.matched);
    return {
      profile,
      baseScore: a.score,
      compareScore: b.score,
      delta: b.score - a.score,
      gained: b.matched.filter((k) => !aSet.has(k)),
      lost: a.matched.filter((k) => !bSet.has(k)),
    };
  }).sort((x, y) => y.compareScore - x.compareScore);
}
