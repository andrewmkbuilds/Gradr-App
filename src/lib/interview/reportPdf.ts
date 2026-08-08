import { jsPDF } from "jspdf";
import { supabase } from "@/integrations/supabase/client";
import type { InterviewReport } from "@/components/interview/InterviewReportView";
import type { PracticePlan } from "@/components/interview/PracticePlanView";

const MARGIN = 48;
const LINE = 16;

interface BuildArgs {
  report: InterviewReport;
  targetRole?: string | null;
  durationSec?: number;
  createdAt?: string;
  plan?: PracticePlan | null;
}

/** Renders the scorecard (and optional practice plan) into a jsPDF document. */
export function buildReportPdf({ report, targetRole, durationSec = 0, createdAt, plan }: BuildArgs): jsPDF {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const width = doc.internal.pageSize.getWidth();
  const height = doc.internal.pageSize.getHeight();
  let y = MARGIN;

  const ensureSpace = (needed = LINE) => {
    if (y + needed > height - MARGIN) {
      doc.addPage();
      y = MARGIN;
    }
  };

  const text = (value: string, size = 11, style: "normal" | "bold" = "normal") => {
    doc.setFont("helvetica", style);
    doc.setFontSize(size);
    const lines = doc.splitTextToSize(value, width - MARGIN * 2) as string[];
    lines.forEach((line) => {
      ensureSpace();
      doc.text(line, MARGIN, y);
      y += size + 5;
    });
  };

  const heading = (value: string) => {
    ensureSpace(30);
    y += 10;
    text(value, 14, "bold");
    y += 2;
  };

  const bullets = (items: string[]) => {
    items.forEach((item) => text(`•  ${item}`, 11));
  };

  text("Gradr — AI Mock Interview Scorecard", 20, "bold");
  text(
    [
      targetRole ? `Role: ${targetRole}` : "Role: General interview",
      `Date: ${new Date(createdAt ?? Date.now()).toLocaleString()}`,
      `Duration: ${Math.floor(durationSec / 60)}m ${durationSec % 60}s`,
    ].join("   |   "),
    10,
  );

  heading(`Overall score: ${report.overallScore}/100`);
  text(report.summary, 11);

  heading("Competency breakdown");
  [
    ["Communication", report.communication],
    ["Technical depth", report.technicalDepth],
    ["Answer structure", report.structure],
    ["Confidence", report.confidence],
  ].forEach(([label, value]) => text(`${label}: ${value}/100`, 11));

  heading("What worked");
  bullets(report.strengths ?? []);
  heading("What to improve");
  bullets(report.improvements ?? []);
  heading("Next steps");
  bullets(report.nextSteps ?? []);

  if (plan) {
    doc.addPage();
    y = MARGIN;
    text("7-Day Follow-up Practice Plan", 18, "bold");
    text(plan.summary, 11);
    if (plan.focusAreas?.length) text(`Focus areas: ${plan.focusAreas.join(", ")}`, 10);
    plan.days.forEach((d) => {
      heading(`Day ${d.day} — ${d.theme} (${d.minutes} min)`);
      text(d.objective, 11);
      if (d.questions?.length) {
        text("Practice questions", 11, "bold");
        bullets(d.questions);
      }
      if (d.drills?.length) {
        text("Drills", 11, "bold");
        bullets(d.drills);
      }
    });
  }

  ensureSpace(24);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text("Scores are coaching estimates, not hiring predictions.", MARGIN, height - 28);

  return doc;
}

/** Builds the PDF, uploads it to private storage and returns its path + signed URL. */
export async function exportReportPdf(args: BuildArgs & { sessionId?: string | null }) {
  const doc = buildReportPdf(args);
  const blob = doc.output("blob");

  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) throw new Error("You need to be signed in to save reports.");

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const path = `${userId}/interview-scorecard-${stamp}.pdf`;

  const { error } = await supabase.storage
    .from("interview-reports")
    .upload(path, blob, { contentType: "application/pdf", upsert: true });
  if (error) throw error;

  if (args.sessionId) {
    await supabase.from("interview_sessions").update({ pdf_path: path }).eq("id", args.sessionId);
  }

  const { data: signed } = await supabase.storage
    .from("interview-reports")
    .createSignedUrl(path, 60 * 60);

  return { path, signedUrl: signed?.signedUrl ?? null, blob };
}

/** Triggers a local download of a generated PDF blob. */
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
