/**
 * Offline cache for Resume Intelligence.
 *
 * Keeps the user's resume versions, the uploaded file bytes and the extracted
 * text in IndexedDB so the editor keeps working with no connection. Renames and
 * deletes made offline are queued and replayed when the network returns.
 */
import { STORES, idbDelete, idbGet, idbGetAll, idbPut } from "./idb";

export interface CachedResumeVersion {
  id: string;
  user_id: string;
  file_name: string;
  file_path: string;
  version_label: string | null;
  ats_score: number | null;
  keyword_match: number | null;
  formatting_score: number | null;
  impact_score: number | null;
  readability_score: number | null;
  ai_suggestions: unknown;
  parsed_text: string | null;
  created_at: string;
  /** Present when the row was created offline and not yet pushed. */
  pending?: boolean;
  cached_at: number;
}

export interface CachedResumeFile {
  /** Resume version id, or a local draft id. */
  id: string;
  user_id: string;
  file_name: string;
  file_type: string;
  blob: Blob;
  text: string;
  cached_at: number;
}

export type PendingOp =
  | { id: string; kind: "rename"; versionId: string; label: string | null; queued_at: number }
  | { id: string; kind: "delete"; versionId: string; filePath: string; queued_at: number };

const MAX_CACHED_FILES = 8;

function opId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/* ---------------------------------- versions --------------------------------- */

export async function readCachedVersions(userId: string): Promise<CachedResumeVersion[]> {
  const rows = await idbGetAll<CachedResumeVersion>(STORES.resumeVersions);
  return rows
    .filter((row) => row.user_id === userId)
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
}

export async function cacheVersions(userId: string, versions: Omit<CachedResumeVersion, "user_id" | "cached_at">[]) {
  const existing = await readCachedVersions(userId);
  const incoming = new Set(versions.map((v) => v.id));

  // Drop server-backed rows that no longer exist; keep offline-only drafts.
  for (const row of existing) {
    if (!incoming.has(row.id) && !row.pending) {
      await idbDelete(STORES.resumeVersions, row.id);
    }
  }

  for (const version of versions) {
    await idbPut<CachedResumeVersion>(STORES.resumeVersions, {
      ...version,
      user_id: userId,
      cached_at: Date.now(),
    });
  }
}

export async function cacheVersion(userId: string, version: Omit<CachedResumeVersion, "user_id" | "cached_at">) {
  await idbPut<CachedResumeVersion>(STORES.resumeVersions, {
    ...version,
    user_id: userId,
    cached_at: Date.now(),
  });
}

export async function patchCachedVersion(versionId: string, patch: Partial<CachedResumeVersion>) {
  const current = await idbGet<CachedResumeVersion>(STORES.resumeVersions, versionId);
  if (!current) return;
  await idbPut<CachedResumeVersion>(STORES.resumeVersions, { ...current, ...patch, cached_at: Date.now() });
}

export async function removeCachedVersion(versionId: string) {
  await idbDelete(STORES.resumeVersions, versionId);
  await idbDelete(STORES.resumeFiles, versionId);
}

/* ----------------------------------- files ----------------------------------- */

export async function cacheResumeFile(entry: Omit<CachedResumeFile, "cached_at">) {
  await idbPut<CachedResumeFile>(STORES.resumeFiles, { ...entry, cached_at: Date.now() });

  // Bound the store — resume files can be several MB each.
  const all = await idbGetAll<CachedResumeFile>(STORES.resumeFiles);
  const stale = all
    .filter((f) => f.user_id === entry.user_id)
    .sort((a, b) => b.cached_at - a.cached_at)
    .slice(MAX_CACHED_FILES);
  for (const file of stale) {
    await idbDelete(STORES.resumeFiles, file.id);
  }
}

export function readCachedResumeFile(id: string) {
  return idbGet<CachedResumeFile>(STORES.resumeFiles, id);
}

export async function latestCachedResumeFile(userId: string) {
  const all = await idbGetAll<CachedResumeFile>(STORES.resumeFiles);
  return (
    all
      .filter((f) => f.user_id === userId)
      .sort((a, b) => b.cached_at - a.cached_at)[0] ?? null
  );
}

/* -------------------------------- pending ops -------------------------------- */

type PendingOpInput =
  | { kind: "rename"; versionId: string; label: string | null }
  | { kind: "delete"; versionId: string; filePath: string };

export async function queueOp(op: PendingOpInput) {
  const entry = { ...op, id: opId(), queued_at: Date.now() } as PendingOp;
  await idbPut<PendingOp>(STORES.pendingOps, entry);
  return entry;
}

export async function readPendingOps(): Promise<PendingOp[]> {
  const ops = await idbGetAll<PendingOp>(STORES.pendingOps);
  return ops.sort((a, b) => a.queued_at - b.queued_at);
}

export function clearPendingOp(id: string) {
  return idbDelete(STORES.pendingOps, id);
}
