/**
 * CSP report-only analytics: spike detection, new directive/origin detection
 * and the enforcement readiness gate.
 *
 * Pure and dependency-free so the same logic runs in three places without
 * drifting: the alert cron (`src/lib/edge/csp-alerts.server.ts`), the admin
 * CSP monitor, and the unit tests.
 *
 * Vocabulary
 *  - **combo**    one `effective-directive` + `blocked-origin` pair. That pair
 *                 is what an allow-list change actually fixes, so it is the
 *                 unit we alert on rather than a raw report count.
 *  - **spike**    a combo whose reports in the recent window exceed both an
 *                 absolute floor and a multiple of its own baseline rate.
 *  - **critical** a violation on a route or directive the product cannot ship
 *                 broken: auth, the Supabase/realtime connection, or the PWA.
 */

export interface CspViolationRow {
  created_at: string;
  effective_directive?: string | null;
  violated_directive?: string | null;
  blocked_origin?: string | null;
  blocked_uri?: string | null;
  document_path?: string | null;
  document_uri?: string | null;
}

export interface CspAnalysisOptions {
  /** Evaluation instant; injectable for deterministic tests. */
  now?: Date;
  /** Recent window that counts as "right now". */
  windowHours?: number;
  /** How far back the baseline rate is measured. */
  baselineDays?: number;
  /** A combo must clear this many reports in the window before it can spike. */
  spikeMinReports?: number;
  /** …and exceed baseline rate by this factor. */
  spikeFactor?: number;
  /** Consecutive clean days required before the policy may be enforced. */
  requiredCleanDays?: number;
}

export const CSP_DEFAULTS: Required<Omit<CspAnalysisOptions, "now">> = {
  windowHours: 24,
  baselineDays: 14,
  spikeMinReports: 25,
  spikeFactor: 3,
  requiredCleanDays: 7,
};

/** Surfaces whose breakage is never acceptable — the readiness gate blocks on these. */
export const CRITICAL_SURFACES = [
  {
    id: "auth",
    label: "Authentication",
    paths: ["/auth", "/forgot-password", "/reset-password", "/verify-email", "/.lovable/oauth/"],
    origins: [
      "https://accounts.google.com",
      "https://appleid.apple.com",
      "https://login.microsoftonline.com",
    ],
  },
  {
    id: "supabase",
    label: "Supabase / backend",
    paths: [] as string[],
    origins: ["supabase.co", "supabase.in", "lovable.cloud"],
  },
  {
    id: "pwa",
    label: "PWA / installed app",
    paths: ["/site.webmanifest", "/manifest.webmanifest"],
    origins: [] as string[],
    directives: ["manifest-src", "worker-src"],
  },
] as const;

export type CriticalSurfaceId = (typeof CRITICAL_SURFACES)[number]["id"];

export interface CspCombo {
  key: string;
  directive: string;
  blockedOrigin: string;
  /** Reports inside the recent window. */
  recent: number;
  /** Reports over the whole baseline period (recent window included). */
  total: number;
  /** Baseline reports per `windowHours`, excluding the recent window. */
  baselineRate: number;
  firstSeen: string;
  lastSeen: string;
  samplePath: string | null;
  /** Critical surfaces this combo affects. */
  surfaces: CriticalSurfaceId[];
}

export interface CspSpike extends CspCombo {
  /** recent / max(baselineRate, 1) — how far above normal it is. */
  multiple: number;
}

export interface SurfaceStatus {
  id: CriticalSurfaceId;
  label: string;
  violations: number;
  lastViolationAt: string | null;
  clean: boolean;
}

export interface CspReadiness {
  ready: boolean;
  requiredCleanDays: number;
  /** Consecutive days with zero critical violations, capped at requiredCleanDays. */
  cleanDays: number;
  /** Most recent critical violation across all surfaces, if any. */
  lastCriticalAt: string | null;
  surfaces: SurfaceStatus[];
  blockers: string[];
  summary: string;
}

export interface CspAnalysis {
  now: string;
  windowHours: number;
  baselineDays: number;
  recentTotal: number;
  total: number;
  combos: CspCombo[];
  spikes: CspSpike[];
  /** Combos whose first-ever report landed inside the recent window. */
  newCombos: CspCombo[];
  readiness: CspReadiness;
}

const directiveOf = (row: CspViolationRow) =>
  (row.effective_directive ?? row.violated_directive ?? "unknown").split(/\s+/)[0] ?? "unknown";

const originOf = (row: CspViolationRow) => row.blocked_origin ?? row.blocked_uri ?? "unknown";

const pathOf = (row: CspViolationRow) => {
  if (row.document_path) return row.document_path;
  if (!row.document_uri) return null;
  try {
    return new URL(row.document_uri).pathname;
  } catch {
    return null;
  }
};

/** Which critical surfaces a single violation touches (may be none). */
export function surfacesFor(row: CspViolationRow): CriticalSurfaceId[] {
  const path = (pathOf(row) ?? "").toLowerCase();
  const origin = originOf(row).toLowerCase();
  const directive = directiveOf(row);
  const hits: CriticalSurfaceId[] = [];

  for (const surface of CRITICAL_SURFACES) {
    const byPath = surface.paths.some((p) => path.startsWith(p.toLowerCase()));
    const byOrigin = surface.origins.some((o) => origin.includes(o.toLowerCase()));
    const byDirective =
      "directives" in surface && (surface.directives as readonly string[]).includes(directive);
    if (byPath || byOrigin || byDirective) hits.push(surface.id);
  }
  return hits;
}

export function analyzeCsp(rows: CspViolationRow[], options: CspAnalysisOptions = {}): CspAnalysis {
  const cfg = { ...CSP_DEFAULTS, ...options };
  const now = options.now ?? new Date();
  const nowMs = now.getTime();
  const windowMs = cfg.windowHours * 3_600_000;
  const baselineMs = cfg.baselineDays * 86_400_000;
  const windowStart = nowMs - windowMs;
  const baselineStart = nowMs - baselineMs;

  const inRange = rows.filter((r) => {
    const t = Date.parse(r.created_at);
    return Number.isFinite(t) && t >= baselineStart;
  });

  const map = new Map<string, CspCombo>();
  for (const row of inRange) {
    const directive = directiveOf(row);
    const blockedOrigin = originOf(row);
    const key = `${directive}|${blockedOrigin}`;
    const at = new Date(Date.parse(row.created_at)).toISOString();
    const recent = Date.parse(row.created_at) >= windowStart ? 1 : 0;

    const existing = map.get(key);
    if (existing) {
      existing.total += 1;
      existing.recent += recent;
      if (at < existing.firstSeen) existing.firstSeen = at;
      if (at > existing.lastSeen) existing.lastSeen = at;
      existing.samplePath ??= pathOf(row);
    } else {
      map.set(key, {
        key,
        directive,
        blockedOrigin,
        recent,
        total: 1,
        baselineRate: 0,
        firstSeen: at,
        lastSeen: at,
        samplePath: pathOf(row),
        surfaces: surfacesFor(row),
      });
    }
    const combo = map.get(key)!;
    for (const s of surfacesFor(row)) if (!combo.surfaces.includes(s)) combo.surfaces.push(s);
  }

  // Baseline rate is measured per identical-length window, so "3x normal" means
  // three times what this combo usually produces in the same number of hours.
  const baselineWindows = Math.max(1, (baselineMs - windowMs) / windowMs);
  const combos = [...map.values()].map((combo) => ({
    ...combo,
    baselineRate: Number(((combo.total - combo.recent) / baselineWindows).toFixed(2)),
  }));

  const spikes: CspSpike[] = combos
    .filter((c) => c.recent >= cfg.spikeMinReports)
    .map((c) => ({ ...c, multiple: Number((c.recent / Math.max(c.baselineRate, 1)).toFixed(2)) }))
    .filter((c) => c.multiple >= cfg.spikeFactor)
    .sort((a, b) => b.recent - a.recent);

  const newCombos = combos
    .filter((c) => Date.parse(c.firstSeen) >= windowStart)
    .sort((a, b) => b.recent - a.recent);

  return {
    now: now.toISOString(),
    windowHours: cfg.windowHours,
    baselineDays: cfg.baselineDays,
    recentTotal: combos.reduce((s, c) => s + c.recent, 0),
    total: combos.reduce((s, c) => s + c.total, 0),
    combos: combos.sort((a, b) => b.recent - a.recent || b.total - a.total),
    spikes,
    newCombos,
    readiness: evaluateEnforcementReadiness(inRange, { ...options, now }),
  };
}

/**
 * The enforce-CSP gate.
 *
 * The candidate policy may only be promoted from report-only to enforced when
 * *every* critical surface — auth, Supabase, PWA — has produced zero violations
 * for `requiredCleanDays` consecutive days. Anything else is a blocker with a
 * plain-English reason, so the gate explains itself instead of just failing.
 */
export function evaluateEnforcementReadiness(
  rows: CspViolationRow[],
  options: CspAnalysisOptions = {},
): CspReadiness {
  const cfg = { ...CSP_DEFAULTS, ...options };
  const now = options.now ?? new Date();
  const since = now.getTime() - cfg.requiredCleanDays * 86_400_000;

  const surfaces: SurfaceStatus[] = CRITICAL_SURFACES.map((s) => ({
    id: s.id,
    label: s.label,
    violations: 0,
    lastViolationAt: null,
    clean: true,
  }));

  let lastCriticalMs = 0;
  for (const row of rows) {
    const t = Date.parse(row.created_at);
    if (!Number.isFinite(t) || t < since) continue;
    for (const id of surfacesFor(row)) {
      const status = surfaces.find((s) => s.id === id)!;
      status.violations += 1;
      status.clean = false;
      if (!status.lastViolationAt || t > Date.parse(status.lastViolationAt)) {
        status.lastViolationAt = new Date(t).toISOString();
      }
      if (t > lastCriticalMs) lastCriticalMs = t;
    }
  }

  const cleanDays = lastCriticalMs
    ? Math.max(0, Math.min(cfg.requiredCleanDays, Math.floor((now.getTime() - lastCriticalMs) / 86_400_000)))
    : cfg.requiredCleanDays;

  const blockers = surfaces
    .filter((s) => !s.clean)
    .map(
      (s) =>
        `${s.label}: ${s.violations} violation${s.violations > 1 ? "s" : ""} in the last ${cfg.requiredCleanDays} days (latest ${s.lastViolationAt}).`,
    );

  const ready = blockers.length === 0 && cleanDays >= cfg.requiredCleanDays;

  return {
    ready,
    requiredCleanDays: cfg.requiredCleanDays,
    cleanDays,
    lastCriticalAt: lastCriticalMs ? new Date(lastCriticalMs).toISOString() : null,
    surfaces,
    blockers,
    summary: ready
      ? `Zero critical violations across auth, Supabase and PWA for ${cfg.requiredCleanDays} consecutive days — the candidate policy is safe to enforce.`
      : `Not ready: ${blockers.length || 1} blocker${blockers.length === 1 ? "" : "s"} — ${cleanDays}/${cfg.requiredCleanDays} clean days.`,
  };
}
