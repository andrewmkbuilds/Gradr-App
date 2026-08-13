import { AlertTriangle, ArrowRight, CheckCircle2, Sparkles } from "lucide-react";

export interface TriageInput {
  atsScore: number;
  keywordMatch: number;
  formattingScore: number;
  impactScore: number;
  readabilityScore: number;
  missingSkills?: string[];
  quantifiedBullets?: number;
  wordCount?: number;
}

export interface TriageIssue {
  id: string;
  severity: "critical" | "important" | "polish";
  title: string;
  why: string;
  fix: string;
  /** Estimated ATS points recovered if fixed. */
  impact: number;
}

const WEIGHTS = { keyword: 0.35, impact: 0.25, formatting: 0.25, readability: 0.15 };

/** Deterministic triage: what is wrong, why it costs you, and what to do next. */
export function triageResume(input: TriageInput): TriageIssue[] {
  const issues: TriageIssue[] = [];
  const gap = (v: number, w: number) => Math.max(0, Math.round((100 - v) * w));

  if (input.keywordMatch < 85) {
    const missing = (input.missingSkills ?? []).slice(0, 5);
    issues.push({
      id: "keywords",
      severity: input.keywordMatch < 60 ? "critical" : "important",
      title: `Keyword coverage is ${Math.round(input.keywordMatch)}%`,
      why: "Screeners filter on exact terms before a human reads a line of your resume.",
      fix: missing.length
        ? `Work these into real bullets: ${missing.join(", ")}.`
        : "Paste the job description above and re-scan to score against that exact posting.",
      impact: gap(input.keywordMatch, WEIGHTS.keyword),
    });
  }

  if (input.impactScore < 85) {
    issues.push({
      id: "impact",
      severity: input.impactScore < 55 ? "critical" : "important",
      title: `Only ${input.quantifiedBullets ?? 0} bullets carry a number`,
      why: "Quantified outcomes are the single strongest differentiator in recruiter testing.",
      fix: "Rewrite your top 3 bullets as action + metric + result (e.g. 'cut build time 40%').",
      impact: gap(input.impactScore, WEIGHTS.impact),
    });
  }

  if (input.formattingScore < 90) {
    issues.push({
      id: "formatting",
      severity: input.formattingScore < 65 ? "critical" : "polish",
      title: `Formatting scores ${Math.round(input.formattingScore)}%`,
      why: "Tables, columns and graphics get mangled during ATS text extraction.",
      fix: "Move to a single column, standard section headings, and no text inside images.",
      impact: gap(input.formattingScore, WEIGHTS.formatting),
    });
  }

  if (input.readabilityScore < 80) {
    issues.push({
      id: "readability",
      severity: "polish",
      title: "Dense phrasing slows the 7-second scan",
      why: "Recruiters skim. Long sentences push your best evidence below the fold.",
      fix: "Trim bullets to one line each and lead with the verb.",
      impact: gap(input.readabilityScore, WEIGHTS.readability),
    });
  }

  if ((input.wordCount ?? 0) > 900) {
    issues.push({
      id: "length",
      severity: "polish",
      title: `${input.wordCount} words is long for one role`,
      why: "Beyond ~800 words, relevance per line drops and screens get skipped.",
      fix: "Cut roles older than 10 years down to a single summary line.",
      impact: 3,
    });
  }

  const rank = { critical: 0, important: 1, polish: 2 };
  return issues.sort((a, b) => rank[a.severity] - rank[b.severity] || b.impact - a.impact);
}

const SEVERITY = {
  critical: { label: "Fix first", chip: "bg-destructive/15 text-destructive", icon: AlertTriangle },
  important: { label: "High impact", chip: "bg-primary/15 text-primary", icon: Sparkles },
  polish: { label: "Polish", chip: "bg-mahogany/12 text-mahogany", icon: ArrowRight },
} as const;

export function IssueTriage({ input }: { input: TriageInput }) {
  const issues = triageResume(input);
  const recoverable = issues.reduce((s, i) => s + i.impact, 0);

  if (issues.length === 0) {
    return (
      <div className="glass-card flex items-center gap-3 p-6">
        <CheckCircle2 className="h-5 w-5 shrink-0 text-success" aria-hidden />
        <div>
          <p className="text-sm font-semibold text-foreground">Nothing critical left</p>
          <p className="text-xs text-muted-foreground">
            This resume clears every ATS check we score. Take it to matched roles.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="glass-card p-6">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-foreground">What to fix, in order</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Ranked by ATS points recovered, not by how easy they are.
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="font-display text-2xl font-bold tabular-nums text-foreground">+{recoverable}</p>
          <p className="text-[0.65rem] uppercase tracking-[0.16em] text-muted-foreground">Points on the table</p>
        </div>
      </div>

      <ol className="mt-5 space-y-3">
        {issues.map((issue, i) => {
          const meta = SEVERITY[issue.severity];
          const Icon = meta.icon;
          return (
            <li key={issue.id} className="rounded-xl bg-secondary/50 p-4">
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
                <div className="flex min-w-0 items-start gap-3">
                  <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg ${meta.chip}`}>
                    <Icon className="h-3.5 w-3.5" aria-hidden />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">
                      <span className="mr-2 text-muted-foreground tabular-nums">{i + 1}.</span>
                      {issue.title}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">{issue.why}</p>
                    <p className="mt-2 text-xs text-foreground/90">
                      <span className="font-medium">Do this: </span>
                      {issue.fix}
                    </p>
                  </div>
                </div>
                <span className={`shrink-0 rounded-md px-2 py-1 text-[0.65rem] font-medium ${meta.chip}`}>
                  {meta.label} · +{issue.impact}
                </span>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
