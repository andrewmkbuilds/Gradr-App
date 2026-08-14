/**
 * OAuth incident timeline exports (CSV + printable PDF).
 *
 * Both formats are built from the same redaction pass, so a download can never
 * contain material the admin UI hides. Every field goes through `redactUrl`
 * before it is serialised.
 */
import { jsPDF } from "jspdf";
import { downloadCsv } from "@/lib/exportFile";
import { redactUrl } from "./redaction";
import type { OAuthTimeline } from "./forensics";

export interface TimelineCsvRow extends Record<string, unknown> {
  request_id: string;
  hop: number;
  timestamp: string;
  stage: string;
  provider: string;
  account_type: string;
  source: string;
  destination: string;
  final_url: string;
  state_result: string;
  nonce_result: string;
  deviation: string;
  deviation_type: string;
  note: string;
}

export const TIMELINE_CSV_COLUMNS: (keyof TimelineCsvRow)[] = [
  "request_id",
  "hop",
  "timestamp",
  "stage",
  "provider",
  "account_type",
  "source",
  "destination",
  "final_url",
  "state_result",
  "nonce_result",
  "deviation",
  "deviation_type",
  "note",
];

/** Flattens timelines to redacted CSV rows. */
export function timelinesToRows(timelines: OAuthTimeline[]): TimelineCsvRow[] {
  return timelines.flatMap((timeline) =>
    timeline.hops.map((hop) => ({
      request_id: timeline.requestId,
      hop: hop.hop_index,
      timestamp: hop.created_at,
      stage: hop.stage,
      provider: hop.provider,
      account_type: hop.account_type,
      source: redactUrl(hop.source_url),
      destination: redactUrl(hop.destination_url),
      final_url: redactUrl(hop.final_url),
      state_result: hop.state_result,
      nonce_result: hop.nonce_result,
      deviation: hop.deviation ? "yes" : "no",
      deviation_type: hop.deviation_type ?? "",
      note: redactUrl(hop.note),
    })),
  );
}

export function downloadTimelineCsv(timelines: OAuthTimeline[], filename?: string) {
  downloadCsv(
    filename ?? `gradr-oauth-timeline-${new Date().toISOString().slice(0, 10)}.csv`,
    timelinesToRows(timelines),
    TIMELINE_CSV_COLUMNS,
  );
}

type Rgb = [number, number, number];
const INK: Record<"teal" | "ink" | "muted", Rgb> = {
  teal: [36, 95, 115],
  ink: [26, 32, 35],
  muted: [110, 120, 124],
};

/** Builds a clean incident report suitable for a Safe Browsing appeal. */
export function buildTimelinePdf(timelines: OAuthTimeline[], title = "Gradr — Google OAuth Incident Timeline") {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const margin = 44;
  const width = doc.internal.pageSize.getWidth();
  let y = margin;

  const line = (text: string, size = 10, color: Rgb = INK.ink, bold = false) => {
    if (y > doc.internal.pageSize.getHeight() - margin) {
      doc.addPage();
      y = margin;
    }
    doc.setFontSize(size);
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setTextColor(color[0], color[1], color[2]);
    for (const part of doc.splitTextToSize(text, width - margin * 2) as string[]) {
      doc.text(part, margin, y);
      y += size + 4;
    }
  };

  line(title, 17, INK.teal, true);
  line(`Generated ${new Date().toISOString()} · ${timelines.length} sign-in flow(s)`, 9, INK.muted);
  line("No authorization codes, access/refresh/ID tokens or client secrets are included.", 9, INK.muted);
  y += 8;

  for (const timeline of timelines) {
    y += 6;
    line(`Request ${timeline.requestId}`, 12, INK.teal, true);
    line(
      `Started ${timeline.startedAt} · ended ${timeline.endedAt} · provider ${timeline.provider} · account ${timeline.accountType}`,
      9,
      INK.muted,
    );
    line(
      `state=${timeline.stateResult} · nonce=${timeline.nonceResult} · deviation=${timeline.deviation ? timeline.deviationTypes.join(", ") || "yes" : "no"}`,
      9,
    );
    line(`Final destination: ${redactUrl(timeline.finalUrl) || "—"}`, 9);
    for (const hop of timeline.hops) {
      line(
        `  ${hop.hop_index}. [${hop.created_at}] ${hop.stage}: ${redactUrl(hop.source_url) || "—"} → ${redactUrl(hop.destination_url) || "—"}`,
        9,
      );
      if (hop.note) line(`     note: ${redactUrl(hop.note)}`, 8, INK.muted);
    }
    y += 4;
  }

  return doc;
}

export function downloadTimelinePdf(timelines: OAuthTimeline[], filename?: string) {
  buildTimelinePdf(timelines).save(
    filename ?? `gradr-oauth-timeline-${new Date().toISOString().slice(0, 10)}.pdf`,
  );
}
