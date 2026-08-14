/**
 * Admin CSV exports with a tamper-evident audit manifest.
 *
 * Every export ships two files: the CSV itself and a JSON manifest recording
 * who exported what, when, with which filters, plus a SHA-256 digest of the
 * exact CSV bytes so the file can be proven unmodified later.
 */
import { toCsv } from "@/lib/exportFile";

export interface AuditManifest {
  artifact: string;
  generated_at: string;
  exported_by: string;
  dataset: string;
  row_count: number;
  columns: string[];
  filters: Record<string, unknown>;
  sha256: string;
  schema_version: 1;
}

async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function saveBlob(filename: string, mime: string, body: BlobPart) {
  const url = URL.createObjectURL(new Blob([body], { type: mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * Downloads `<basename>.csv` and `<basename>.manifest.json`.
 * Returns the manifest so callers can surface the digest in the UI.
 */
export async function downloadCsvWithManifest<T extends Record<string, unknown>>(options: {
  basename: string;
  dataset: string;
  rows: T[];
  columns: (keyof T)[];
  exportedBy: string;
  filters?: Record<string, unknown>;
}): Promise<AuditManifest> {
  const { basename, dataset, rows, columns, exportedBy, filters = {} } = options;
  const csv = toCsv(rows, columns);
  const digest = await sha256Hex(csv);

  const manifest: AuditManifest = {
    artifact: `${basename}.csv`,
    generated_at: new Date().toISOString(),
    exported_by: exportedBy,
    dataset,
    row_count: rows.length,
    columns: columns.map(String),
    filters,
    sha256: digest,
    schema_version: 1,
  };

  saveBlob(`${basename}.csv`, "text/csv;charset=utf-8", csv);
  saveBlob(`${basename}.manifest.json`, "application/json", JSON.stringify(manifest, null, 2));
  return manifest;
}
