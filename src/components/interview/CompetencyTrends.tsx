import { useMemo } from "react";
import { ArrowRight, Target, TrendingDown, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "@/lib/router-compat";
import type { InterviewReport } from "@/components/interview/InterviewReportView";

export interface TrendSession {
  id: string;
  created_at: string;
  target_role: string | null;
  overall_score: number | null;
  report: InterviewReport;
}

type Key = "communication" | "technicalDepth" | "structure" | "confidence";

const COMPETENCIES: { key: Key; label: string; drill: string }[] = [
  {
    key: "communication",
    label: "Communication",
    drill: "Answer three questions out loud in 90 seconds each — no filler, one idea per sentence.",
  },
  {
    key: "technicalDepth",
    label: "Technical depth",
    drill: "Pick one project and rehearse the trade-offs you rejected, not just the solution you shipped.",
  },
  {
    key: "structure",
    label: "Structure",
    drill: "Force STAR on every behavioural answer: situation in one line, action in three, result with a number.",
  },
  {
    key: "confidence",
    label: "Confidence",
    drill: "Re-run the same question three times. Cut hedging words ('kind of', 'I guess') on each pass.",
  },
];

function avg(values: number[]) {
  if (values.length === 0) return 0;
  return Math.round(values.reduce((a, b) => a + b, 0) / values.length);
}

/** Per-competency averages, direction of travel and a targeted drill for the weakest area. */
export function CompetencyTrends({ sessions }: { sessions: TrendSession[] }) {
  const navigate = useNavigate();

  const stats = useMemo(() => {
    // Sessions arrive newest-first; compare the latest three against the ones before.
    const recent = sessions.slice(0, 3);
    const earlier = sessions.slice(3, 8);
    return COMPETENCIES.map((c) => {
      const now = avg(recent.map((s) => s.report?.[c.key] ?? 0));
      const before = earlier.length > 0 ? avg(earlier.map((s) => s.report?.[c.key] ?? 0)) : null;
      return { ...c, score: now, delta: before === null ? null : now - before };
    });
  }, [sessions]);

  if (sessions.length === 0) return null;

  const weakest = [...stats].sort((a, b) => a.score - b.score)[0]!;
  const role = sessions[0]?.target_role ?? null;

  return (
    <section className="glass-card p-5" aria-labelledby="competency-heading">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 id="competency-heading" className="text-sm font-semibold text-foreground">
          Competency trends
        </h2>
        <span className="text-xs text-muted-foreground">
          Last {Math.min(sessions.length, 3)} session{sessions.length === 1 ? "" : "s"}
          {sessions.length > 3 ? " vs earlier" : ""}
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.key} className="rounded-lg bg-secondary/50 p-3">
            <p className="flex items-center justify-between text-[11px] text-muted-foreground">
              {s.label}
              {s.delta !== null && s.delta !== 0 && (
                <span
                  className={`inline-flex items-center gap-0.5 ${s.delta > 0 ? "text-success" : "text-warning"}`}
                >
                  {s.delta > 0 ? (
                    <TrendingUp className="h-3 w-3" aria-hidden />
                  ) : (
                    <TrendingDown className="h-3 w-3" aria-hidden />
                  )}
                  {s.delta > 0 ? "+" : ""}
                  {s.delta}
                </span>
              )}
            </p>
            <p className="mt-1 font-display text-2xl font-bold tabular-nums text-foreground">{s.score}</p>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-background/60">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  s.key === weakest.key ? "bg-warning" : "bg-primary"
                }`}
                style={{ width: `${Math.max(3, Math.min(100, s.score))}%` }}
              />
            </div>
          </div>
        ))}
      </div>

      <div className="accent-card mt-4 flex flex-col gap-3 rounded-lg p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="accent-text flex items-center gap-2 text-xs font-semibold uppercase tracking-wide">
            <Target className="h-3.5 w-3.5" aria-hidden /> Targeted drill · {weakest.label}
          </p>
          <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{weakest.drill}</p>
        </div>
        <Button
          size="sm"
          variant="accent"
          className="shrink-0 gap-2"
          onClick={() =>
            navigate(`/interview${role ? `?role=${encodeURIComponent(role)}&focus=${weakest.key}` : `?focus=${weakest.key}`}`)
          }
        >
          Drill this <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </Button>
      </div>
    </section>
  );
}
