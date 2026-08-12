/** Tiny client-side download helpers for admin exports. */

function download(filename: string, mime: string, body: BlobPart) {
  const url = URL.createObjectURL(new Blob([body], { type: mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function cell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const raw = typeof value === "object" ? JSON.stringify(value) : String(value);
  // Neutralise spreadsheet formula injection on untrusted log text.
  const safe = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  return `"${safe.replace(/"/g, '""')}"`;
}

/** Serialise rows to CSV using the given column order. */
export function toCsv<T extends Record<string, unknown>>(rows: T[], columns: (keyof T)[]): string {
  const header = columns.map((c) => cell(String(c))).join(",");
  const body = rows.map((r) => columns.map((c) => cell(r[c])).join(",")).join("\n");
  return `${header}\n${body}`;
}

export function downloadCsv<T extends Record<string, unknown>>(
  filename: string,
  rows: T[],
  columns: (keyof T)[],
) {
  download(filename, "text/csv;charset=utf-8", toCsv(rows, columns));
}

export function downloadJson(filename: string, data: unknown) {
  download(filename, "application/json", JSON.stringify(data, null, 2));
}
