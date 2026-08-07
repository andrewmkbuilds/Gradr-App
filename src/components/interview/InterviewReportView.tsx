import { CheckCircle2, TrendingUp, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScoreRing } from "@/components/ScoreRing";
import type { IntegritySnapshot } from "@/lib/cv/faceMonitor";

export interface InterviewReport {
  overallScore: number;
  communication: number;
  technicalDepth: number;
  structure: number;
  confidence: number;
  summary: string;
  strengths: string[];
  improvements: string[];
  nextSteps: string[];
}

interface Props {
  report: InterviewReport;
  integrity?: IntegritySnapshot | null;
  durationSec: number;
  onRestart: () => void;
}

/** Post-session scorecard for a completed mock interview. */
export function InterviewReportView({ report, integrity, durationSec, onRestart }: Props) {
  const mins = Math.floor(durationSec / 60);
  const secs = durationSec % 60;

  const bars = [
    { label: "Communication", value: report.communication },
    { label: "Technical depth", value: report.technicalDepth },
    { label: "Answer structure", value: report.structure },
    { label: "Confidence", value: report.confidence },
  ];

  return (
    <div className="space-y-6 animate-slide-up">
      <div className="glass-card p-6 flex flex-col sm:flex-row items-center gap-6">
        <ScoreRing score={report.overallScore} size={120} label="Overall" />
        <div className="flex-1 space-y-2 text-center sm:text-left">
          <h2 className="text-xl font-semibold text-foreground">Interview scorecard</h2>
          <p className="text-sm text-muted-foreground">{report.summary}</p>
          <p className="text-xs text-muted-foreground">
            Session length {mins}m {secs}s
            {integrity ? ` · eye contact ${integrity.eyeContactPct}% · in frame ${integrity.presencePct}%` : ""}
          </p>
        </div>
      </div>

      <div className="glass-card p-6 space-y-4">
        {bars.map((b) => (
          <div key={b.label} className="space-y-1.5">
            <div className="flex justify-between text-sm">
              <span className="text-foreground">{b.label}</span>
              <span className="text-muted-foreground">{b.value}</span>
            </div>
            <div className="h-2 rounded-full bg-secondary overflow-hidden">
              <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${Math.min(100, Math.max(0, b.value))}%` }} />
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <List title="What worked" icon={<CheckCircle2 className="h-4 w-4 text-primary" />} items={report.strengths} />
        <List title="What to improve" icon={<TrendingUp className="h-4 w-4 text-amber-500" />} items={report.improvements} />
      </div>

      <List title="Next steps" icon={<ArrowRight className="h-4 w-4 text-primary" />} items={report.nextSteps} />

      <Button onClick={onRestart} className="w-full sm:w-auto">Run another interview</Button>
    </div>
  );
}

function List({ title, icon, items }: { title: string; icon: React.ReactNode; items: string[] }) {
  return (
    <div className="glass-card p-5">
      <p className="text-sm font-semibold text-foreground flex items-center gap-2 mb-3">{icon}{title}</p>
      <ul className="space-y-2">
        {items.map((item, i) => (
          <li key={i} className="text-sm text-muted-foreground flex gap-2">
            <span className="text-primary">•</span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
