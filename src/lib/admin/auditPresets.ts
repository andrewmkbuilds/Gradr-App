/**
 * Saved filter presets for the admin RPC audit view.
 *
 * Presets are per-admin and deliberately local to the browser: they are a
 * convenience over a read-only log, not shared configuration, so they never
 * touch the database (and cannot become another admin-write surface to guard).
 * Namespacing on the actor id keeps two admins on a shared machine apart.
 */

export interface RpcAuditFilters {
  fn: string;
  status: string;
  actorId: string;
  search: string;
  from: string;
  to: string;
}

export interface RpcAuditPreset {
  name: string;
  filters: RpcAuditFilters;
}

export const EMPTY_FILTERS: RpcAuditFilters = {
  fn: "all",
  status: "all",
  actorId: "all",
  search: "",
  from: "",
  to: "",
};

const MAX_PRESETS = 20;

const keyFor = (adminId: string | null | undefined) =>
  `gradr:rpc-audit-presets:${adminId || "anon"}`;

function isFilters(value: unknown): value is RpcAuditFilters {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (Object.keys(EMPTY_FILTERS) as (keyof RpcAuditFilters)[]).every(
    (k) => typeof v[k] === "string",
  );
}

export function loadPresets(adminId: string | null | undefined): RpcAuditPreset[] {
  try {
    const raw = localStorage.getItem(keyFor(adminId));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Storage is user-writable, so every field is re-validated on read.
    return parsed
      .filter(
        (p): p is RpcAuditPreset =>
          !!p &&
          typeof p === "object" &&
          typeof (p as RpcAuditPreset).name === "string" &&
          isFilters((p as RpcAuditPreset).filters),
      )
      .slice(0, MAX_PRESETS);
  } catch {
    return [];
  }
}

export function savePreset(
  adminId: string | null | undefined,
  name: string,
  filters: RpcAuditFilters,
): RpcAuditPreset[] {
  const trimmed = name.trim().slice(0, 60);
  if (!trimmed) return loadPresets(adminId);
  const next = [
    { name: trimmed, filters: { ...filters } },
    ...loadPresets(adminId).filter((p) => p.name !== trimmed),
  ].slice(0, MAX_PRESETS);
  persist(adminId, next);
  return next;
}

export function deletePreset(adminId: string | null | undefined, name: string): RpcAuditPreset[] {
  const next = loadPresets(adminId).filter((p) => p.name !== name);
  persist(adminId, next);
  return next;
}

function persist(adminId: string | null | undefined, presets: RpcAuditPreset[]) {
  try {
    localStorage.setItem(keyFor(adminId), JSON.stringify(presets));
  } catch {
    /* private mode / quota — presets are best-effort */
  }
}
