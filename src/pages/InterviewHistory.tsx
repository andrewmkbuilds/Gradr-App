import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, FileDown, CalendarDays, ArrowLeft, Trash2, Mic } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { ScoreRing } from "@/components/ScoreRing";
import type { InterviewReport } from "@/components/interview/InterviewReportView";
import { PracticePlanView, type PracticePlan } from "@/components/interview/PracticePlanView";
import { exportReportPdf, downloadBlob } from "@/lib/interview/reportPdf";

interface SessionRow {
  id: string;
  created_at: string;
  target_role: string | null;
  duration_sec: number;
  overall_score: number | null;
  report: InterviewReport;
  practice_plan: PracticePlan | null;
}

export default function InterviewHistory() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<SessionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const { data, error } = await supabase
        .from("interview_sessions")
        .select("id, created_at, target_role, duration_sec, overall_score, report, practice_plan")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) toast.error("Couldn't load your interview history.");
      setRows((data ?? []) as unknown as SessionRow[]);
      setLoading(false);
    })();
  }, []);

  const trend = useMemo(
    () => [...rows].reverse().map((r) => r.overall_score ?? 0),
    [rows],
  );

  const handleExport = async (row: SessionRow) => {
    setBusyId(row.id);
    try {
      const { blob } = await exportReportPdf({
        report: row.report,
        targetRole: row.target_role,
        durationSec: row.duration_sec,
        createdAt: row.created_at,
        plan: row.practice_plan,
        sessionId: row.id,
      });
      downloadBlob(blob, "gradr-interview-scorecard.pdf");
      toast.success("Scorecard saved to your account and downloaded.");
    } catch {
      toast.error("Couldn't export that scorecard.");
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("interview_sessions").delete().eq("id", id);
    if (error) return toast.error("Couldn't delete that session.");
    setRows((prev) => prev.filter((r) => r.id !== id));
    toast.success("Session deleted.");
  };

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="type-h1 text-foreground tracking-tight">Interview history</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Review past sessions, compare scores and revisit key feedback.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => navigate("/interview")}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
      </div>

      {rows.length === 0 && (
        <div className="elev-2 rounded-xl p-10 flex flex-col items-center text-center">
          <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
            <Mic className="h-7 w-7 text-primary" />
          </div>
          <p className="text-sm text-muted-foreground max-w-sm mb-5">
            No sessions yet. Run a mock interview and your scorecards will appear here as a timeline.
          </p>
          <Button onClick={() => navigate("/interview")}>Start a mock interview</Button>
        </div>
      )}

      {rows.length > 1 && (
        <div className="elev-2 rounded-xl p-5">
          <p className="text-sm font-semibold text-foreground mb-3">Score trend</p>
          <div className="flex items-end gap-2 h-24">
            {trend.map((score, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-1">
                <div
                  className="w-full rounded-t-md bg-primary/70 transition-all"
                  style={{ height: `${Math.max(4, Math.min(100, score))}%` }}
                />
                <span className="text-[10px] text-muted-foreground tabular-nums">{score}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <ol className="relative space-y-4 border-l border-border pl-6">
        {rows.map((row) => {
          const open = openId === row.id;
          const r = row.report;
          return (
            <li key={row.id} className="relative">
              <span className="absolute -left-[31px] top-6 h-3 w-3 rounded-full bg-primary ring-4 ring-background" />
              <div className="elev-2 rounded-xl p-5 space-y-4">
                <div className="flex flex-wrap items-center gap-4">
                  <ScoreRing score={row.overall_score ?? r.overallScore} size={64} label="Score" />
                  <div className="flex-1 min-w-[180px]">
                    <p className="text-sm font-semibold text-foreground">
                      {row.target_role || "General interview"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(row.created_at).toLocaleString()} ·{" "}
                      {Math.floor(row.duration_sec / 60)}m {row.duration_sec % 60}s
                      {row.practice_plan ? " · 7-day plan ready" : ""}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => setOpenId(open ? null : row.id)}>
                      {open ? "Hide" : "Details"}
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => handleExport(row)} disabled={busyId === row.id}>
                      {busyId === row.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <FileDown className="h-4 w-4" />
                      )}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handleDelete(row.id)}>
                      <Trash2 className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    ["Communication", r.communication],
                    ["Technical", r.technicalDepth],
                    ["Structure", r.structure],
                    ["Confidence", r.confidence],
                  ].map(([label, value]) => (
                    <div key={label as string} className="rounded-lg bg-secondary/60 px-3 py-2">
                      <p className="text-[11px] text-muted-foreground">{label}</p>
                      <p className="text-sm font-semibold text-foreground tabular-nums">{value}</p>
                    </div>
                  ))}
                </div>

                {open && (
                  <div className="space-y-4 pt-2">
                    <p className="text-sm text-muted-foreground">{r.summary}</p>
                    <div className="grid gap-4 md:grid-cols-2">
                      <Feedback title="What worked" items={r.strengths} />
                      <Feedback title="What to improve" items={r.improvements} />
                    </div>
                    <Feedback title="Next steps" items={r.nextSteps} />
                    {row.practice_plan && (
                      <div className="pt-2">
                        <p className="text-sm font-semibold text-foreground flex items-center gap-2 mb-3">
                          <CalendarDays className="h-4 w-4 text-primary" /> Saved practice plan
                        </p>
                        <PracticePlanView plan={row.practice_plan} />
                      </div>
                    )}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function Feedback({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-lg border border-border p-4">
      <p className="text-sm font-semibold text-foreground mb-2">{title}</p>
      <ul className="space-y-1.5">
        {(items ?? []).map((item, i) => (
          <li key={i} className="text-sm text-muted-foreground flex gap-2">
            <span className="text-primary">•</span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
