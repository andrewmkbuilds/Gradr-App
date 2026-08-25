import { useState } from "react";
import { Sparkles, TrendingUp, HelpCircle, FileDown, FileText, Play } from "lucide-react";
import { Button } from "@/components/ds/Button";
import type { InterviewReport } from "@/components/interview/InterviewReportView";
import {
  downloadTranscriptDoc,
  downloadTranscriptPdf,
  type TranscriptTurn,
} from "@/lib/interview/transcriptExport";

interface Props {
  report: InterviewReport;
  messages: TranscriptTurn[];
  targetRole?: string | null | undefined;
  durationSec: number;
  onPractiseQuestion?: (question: string) => void;
}

/** Derives practice questions when the model didn't return any. */
function fallbackQuestions(report: InterviewReport) {
  return (report.improvements ?? []).slice(0, 3).map(
    (i) => `Walk me through an example that shows you can ${i.replace(/^[A-Z]/, (c) => c.toLowerCase()).replace(/\.$/, "")}.`,
  );
}

const columns = [
  { key: "strengths", title: "Strengths", icon: Sparkles, tone: "text-primary" },
  { key: "improvements", title: "Improvements", icon: TrendingUp, tone: "text-mahogany" },
] as const;

/** End-of-session debrief: what went well, what to fix, and what to practise next. */
export function SessionDebrief({ report, messages, targetRole, durationSec, onPractiseQuestion }: Props) {
  const [exporting, setExporting] = useState(false);
  const questions = report.recommendedQuestions?.length
    ? report.recommendedQuestions
    : fallbackQuestions(report);

  const exportArgs = { messages, targetRole, durationSec };

  const runExport = (fn: (a: typeof exportArgs) => void) => {
    setExporting(true);
    try {
      fn(exportArgs);
    } finally {
      setExporting(false);
    }
  };

  return (
    <section className="elev-2 rounded-xl space-y-6 p-5 sm:p-6" aria-labelledby="debrief-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="debrief-title" className="text-lg font-semibold tracking-tight text-foreground">
            Session debrief
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">{report.summary}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={exporting || messages.length === 0}
            onClick={() => runExport(downloadTranscriptPdf)}
          >
            <FileDown className="mr-2 h-4 w-4" aria-hidden="true" />
            Transcript PDF
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={exporting || messages.length === 0}
            onClick={() => runExport(downloadTranscriptDoc)}
          >
            <FileText className="mr-2 h-4 w-4" aria-hidden="true" />
            Transcript DOC
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {columns.map(({ key, title, icon: Icon, tone }) => (
          <div key={key} className="rounded-xl border border-border bg-secondary/30 p-4">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Icon className={`h-4 w-4 ${tone}`} aria-hidden="true" />
              {title}
            </h2>
            <ul className="mt-3 space-y-2">
              {(report[key] ?? []).map((item, i) => (
                <li key={i} className="flex gap-2 text-sm leading-relaxed text-muted-foreground">
                  <span aria-hidden="true" className={tone}>
                    •
                  </span>
                  <span>{item}</span>
                </li>
              ))}
              {(report[key] ?? []).length === 0 && (
                <li className="text-sm text-muted-foreground">Nothing flagged in this session.</li>
              )}
            </ul>
          </div>
        ))}
      </div>

      {questions.length > 0 && (
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <HelpCircle className="h-4 w-4 text-mahogany" aria-hidden="true" />
            Next recommended questions
          </h2>
          <ul className="mt-3 space-y-2">
            {questions.map((q, i) => (
              <li
                key={i}
                className="accent-card flex flex-wrap items-center justify-between gap-2 rounded-lg px-3.5 py-2.5"
              >
                <span className="min-w-0 flex-1 text-sm leading-relaxed text-foreground">{q}</span>
                {onPractiseQuestion && (
                  <Button variant="ghost" size="sm" onClick={() => onPractiseQuestion(q)}>
                    <Play className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                    Practise
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
