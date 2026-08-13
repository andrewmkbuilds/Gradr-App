import { jsPDF } from "jspdf";
import { downloadBlob } from "@/lib/interview/reportPdf";
import { yachtClub } from "@/lib/design/yachtClub";

export type TranscriptTurn = { role: "user" | "assistant"; content: string };

interface Args {
  messages: TranscriptTurn[];
  targetRole?: string | null | undefined;
  durationSec?: number;
  createdAt?: string | number;
}

const MARGIN = 48;

function header({ targetRole, durationSec = 0, createdAt }: Args) {
  return [
    targetRole ? `Role: ${targetRole}` : "Role: General interview",
    `Date: ${new Date(createdAt ?? Date.now()).toLocaleString()}`,
    `Duration: ${Math.floor(durationSec / 60)}m ${durationSec % 60}s`,
  ].join("   |   ");
}

function fileStamp() {
  return new Date().toISOString().slice(0, 10);
}

/** Renders the full interview transcript as a formatted PDF and downloads it. */
export function downloadTranscriptPdf(args: Args) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const width = doc.internal.pageSize.getWidth();
  const height = doc.internal.pageSize.getHeight();
  let y = MARGIN;

  const write = (value: string, size = 11, style: "normal" | "bold" | "italic" = "normal") => {
    doc.setFont("helvetica", style);
    doc.setFontSize(size);
    const lines = doc.splitTextToSize(value, width - MARGIN * 2) as string[];
    lines.forEach((line) => {
      if (y + size > height - MARGIN) {
        doc.addPage();
        y = MARGIN;
      }
      doc.text(line, MARGIN, y);
      y += size + 5;
    });
  };

  write("Gradr — Mock Interview Transcript", 20, "bold");
  write(header(args), 10);
  y += 8;

  args.messages.forEach((m) => {
    write(m.role === "assistant" ? "Interviewer" : "You", 11, "bold");
    write(m.content, 11);
    y += 6;
  });

  downloadBlob(doc.output("blob"), `gradr-interview-transcript-${fileStamp()}.pdf`);
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * Renders the transcript as a Word-openable .doc (HTML-based) document.
 * Word and Google Docs both open this format with formatting preserved.
 */
export function downloadTranscriptDoc(args: Args) {
  const body = args.messages
    .map(
      (m) =>
        `<p style="margin:0 0 4pt 0;font-weight:bold;color:${
          m.role === "assistant" ? yachtClub.oceanTeal : yachtClub.ink
        }">${m.role === "assistant" ? "Interviewer" : "You"}</p>` +
        `<p style="margin:0 0 12pt 0;line-height:1.5">${escapeHtml(m.content).replace(/\n/g, "<br/>")}</p>`,
    )
    .join("");

  const html = `<!DOCTYPE html><html xmlns:w="urn:schemas-microsoft-com:office:word"><head>
<meta charset="utf-8"><title>Gradr Interview Transcript</title></head>
<body style="font-family:Calibri,Arial,sans-serif;font-size:11pt">
<h1 style="font-size:18pt;margin:0">Gradr — Mock Interview Transcript</h1>
<p style="color:${yachtClub.stone};margin:4pt 0 18pt 0">${escapeHtml(header(args))}</p>
${body}
</body></html>`;

  downloadBlob(
    new Blob([html], { type: "application/msword" }),
    `gradr-interview-transcript-${fileStamp()}.doc`,
  );
}
