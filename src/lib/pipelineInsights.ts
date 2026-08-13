/**
 * Pipeline intelligence — pure derivations over tracked jobs.
 *
 * Everything here is presentation logic: it reads the pipeline the user already
 * has and turns it into conversion rates, stall detection and one clear
 * next action. No network, no writes.
 */

export type PipelineStatus = "saved" | "applied" | "interview" | "offer" | "rejected";

export interface PipelineJob {
  id: string;
  title: string;
  company: string | null;
  status: PipelineStatus;
  applied_at: string | null;
  created_at: string;
  last_touch_at: string | null;
  match_score: number | null;
  follow_up_enabled?: boolean;
}

export interface FunnelStep {
  label: string;
  count: number;
  /** Conversion from the previous step, 0–100, or null for the first step. */
  rate: number | null;
}

export interface StaleJob {
  job: PipelineJob;
  days: number;
  reason: string;
}

export interface PipelineInsight {
  total: number;
  funnel: FunnelStep[];
  responseRate: number;
  interviewRate: number;
  offerRate: number;
  appliedLast7: number;
  appliedPrev7: number;
  velocityDelta: number;
  stale: StaleJob[];
  untouchedSaved: PipelineJob[];
  nextAction: { title: string; body: string; cta: string } | null;
}

const DAY = 86_400_000;

function daysSince(iso: string | null): number {
  if (!iso) return 0;
  return Math.floor((Date.now() - new Date(iso).getTime()) / DAY);
}

function pct(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return Math.round((part / whole) * 100);
}

/** Last meaningful touch on a job, used for stall detection. */
export function lastTouch(job: PipelineJob): string | null {
  return job.last_touch_at ?? job.applied_at ?? job.created_at ?? null;
}

export function buildPipelineInsight(jobs: PipelineJob[]): PipelineInsight {
  const total = jobs.length;
  const by = (s: PipelineStatus) => jobs.filter((j) => j.status === s);

  const saved = by("saved").length;
  const applied = by("applied").length;
  const interview = by("interview").length;
  const offer = by("offer").length;
  const rejected = by("rejected").length;

  // Anything past "saved" counts as having been applied to at some point.
  const everApplied = applied + interview + offer + rejected;
  const everInterviewed = interview + offer;

  const funnel: FunnelStep[] = [
    { label: "Tracked", count: total, rate: null },
    { label: "Applied", count: everApplied, rate: pct(everApplied, total) },
    { label: "Interview", count: everInterviewed, rate: pct(everInterviewed, everApplied) },
    { label: "Offer", count: offer, rate: pct(offer, everInterviewed) },
  ];

  const now = Date.now();
  const appliedLast7 = jobs.filter(
    (j) => j.applied_at && now - new Date(j.applied_at).getTime() <= 7 * DAY,
  ).length;
  const appliedPrev7 = jobs.filter((j) => {
    if (!j.applied_at) return false;
    const age = now - new Date(j.applied_at).getTime();
    return age > 7 * DAY && age <= 14 * DAY;
  }).length;

  const stale: StaleJob[] = jobs
    .filter((j) => j.status === "applied" || j.status === "interview")
    .map((j) => {
      const days = daysSince(lastTouch(j));
      return {
        job: j,
        days,
        reason:
          j.status === "interview"
            ? "No movement since the interview stage"
            : "Applied with no follow-up logged",
      };
    })
    .filter((s) => s.days >= (s.job.status === "interview" ? 5 : 7))
    .sort((a, b) => b.days - a.days)
    .slice(0, 6);

  const untouchedSaved = by("saved")
    .filter((j) => daysSince(j.created_at) >= 3)
    .sort((a, b) => (b.match_score ?? 0) - (a.match_score ?? 0))
    .slice(0, 5);

  let nextAction: PipelineInsight["nextAction"] = null;
  if (total === 0) {
    nextAction = {
      title: "Start tracking roles",
      body: "Save three roles you'd genuinely take. Gradr scores them and reminds you when to follow up.",
      cta: "Find roles",
    };
  } else if (stale.length > 0) {
    const top = stale[0]!;
    nextAction = {
      title: `Follow up on ${top.job.company ?? top.job.title}`,
      body: `${top.days} days quiet. A short, specific nudge is the single highest-return action in your pipeline right now.`,
      cta: "Open follow-ups",
    };
  } else if (untouchedSaved.length > 0) {
    nextAction = {
      title: `${untouchedSaved.length} saved role${untouchedSaved.length === 1 ? "" : "s"} still unapplied`,
      body: "Saved roles decay fast — most postings fill within two weeks. Generate a tailored pack and send one today.",
      cta: "Build application",
    };
  } else if (everApplied > 0 && everInterviewed === 0 && everApplied >= 5) {
    nextAction = {
      title: "Applications aren't converting yet",
      body: "Five-plus applications with no interview usually points at the resume, not the roles. Re-run ATS scoring against a target job.",
      cta: "Check resume",
    };
  } else if (interview > 0) {
    nextAction = {
      title: `${interview} live interview${interview === 1 ? "" : "s"} — prepare now`,
      body: "Run a mock round against the exact role. Candidates who rehearse once score materially higher on structure.",
      cta: "Start mock interview",
    };
  } else if (appliedLast7 === 0) {
    nextAction = {
      title: "No applications this week",
      body: "Momentum compounds. Two well-targeted applications beat ten generic ones — pick your strongest match.",
      cta: "Find roles",
    };
  }

  return {
    total,
    funnel,
    responseRate: pct(everInterviewed + offer, Math.max(everApplied, 1)),
    interviewRate: pct(everInterviewed, Math.max(everApplied, 1)),
    offerRate: pct(offer, Math.max(everInterviewed, 1)),
    appliedLast7,
    appliedPrev7,
    velocityDelta: appliedLast7 - appliedPrev7,
    stale,
    untouchedSaved,
    nextAction,
  };
}
