/**
 * Audit manifest for admin CSV exports.
 *
 * Every export of recipient-level email data is itself an event worth being
 * able to reconstruct later: who pulled which slice of data, when, and how
 * many rows they got. The manifest columns are appended to every row so a
 * downloaded file is self-describing even after it leaves the dashboard.
 */

export interface ExportManifest {
  export_id: string;
  exported_at: string;
  export_filters: string;
  export_row_count: number;
}

export const MANIFEST_COLUMNS = [
  "export_id",
  "exported_at",
  "export_filters",
  "export_row_count",
] as const;

export interface ManifestFilters {
  from: string;
  to: string;
  template: string;
  status: string;
}

/** Stable, greppable encoding of the filters that produced the export. */
export function describeFilters(filters: ManifestFilters): string {
  return [
    `range=${filters.from}..${filters.to}`,
    `template=${filters.template || "all"}`,
    `status=${filters.status || "all"}`,
  ].join(";");
}

export function buildManifest(
  filters: ManifestFilters,
  rowCount: number,
  now: () => Date = () => new Date(),
  id: () => string = () => crypto.randomUUID(),
): ExportManifest {
  return {
    export_id: id(),
    exported_at: now().toISOString(),
    export_filters: describeFilters(filters),
    export_row_count: rowCount,
  };
}

/** Attaches the same manifest to every exported row. */
export function withManifest<T extends Record<string, unknown>>(
  rows: T[],
  manifest: ExportManifest,
): (T & ExportManifest)[] {
  return rows.map((row) => ({ ...row, ...manifest }));
}
