import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { toast } from "sonner";
import {
  cacheVersions,
  clearPendingOp,
  patchCachedVersion,
  queueOp,
  readCachedVersions,
  readPendingOps,
  removeCachedVersion,
} from "@/lib/offline/resumeCache";

export interface ResumeVersion {
  id: string;
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
  /** Saved locally while offline, not yet synced. */
  pending?: boolean;
}

const COLUMNS =
  "id, file_name, file_path, version_label, ats_score, keyword_match, formatting_score, impact_score, readability_score, ai_suggestions, parsed_text, created_at";

export function useResumeVersions() {
  const { user } = useAuth();
  const online = useOnlineStatus();
  const [versions, setVersions] = useState<ResumeVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [fromCache, setFromCache] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const syncing = useRef(false);

  const refreshPendingCount = useCallback(async () => {
    setPendingCount((await readPendingOps()).length);
  }, []);

  const refresh = useCallback(async () => {
    if (!user) {
      setVersions([]);
      setLoading(false);
      return;
    }
    setLoading(true);

    // Paint from IndexedDB first so the list is usable instantly and offline.
    const cached = await readCachedVersions(user.id);
    if (cached.length) {
      setVersions(cached as ResumeVersion[]);
      setFromCache(true);
      setLoading(false);
    }

    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      setFromCache(true);
      setLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from("resumes")
      .select(COLUMNS)
      .order("created_at", { ascending: false })
      .limit(30);

    if (error) {
      console.error(error);
      setFromCache(cached.length > 0);
    } else {
      const rows = (data ?? []) as ResumeVersion[];
      const localDrafts = cached.filter((c) => c.pending);
      setVersions([...localDrafts, ...rows] as ResumeVersion[]);
      setFromCache(false);
      await cacheVersions(user.id, rows as never);
    }
    setLoading(false);
    await refreshPendingCount();
  }, [user, refreshPendingCount]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  /** Replay renames/deletes made while offline. */
  const syncPending = useCallback(async () => {
    if (!user || syncing.current) return;
    const ops = await readPendingOps();
    if (!ops.length) return;
    syncing.current = true;
    let replayed = 0;
    try {
      for (const op of ops) {
        if (op.kind === "rename") {
          const { error } = await supabase
            .from("resumes")
            .update({ version_label: op.label })
            .eq("id", op.versionId);
          if (error) continue;
        } else {
          const { error } = await supabase.from("resumes").delete().eq("id", op.versionId);
          if (error) continue;
          if (op.filePath) await supabase.storage.from("resumes").remove([op.filePath]);
        }
        await clearPendingOp(op.id);
        replayed += 1;
      }
    } finally {
      syncing.current = false;
    }
    if (replayed > 0) {
      toast.success(`Synced ${replayed} offline resume change${replayed === 1 ? "" : "s"}`);
      await refresh();
    }
    await refreshPendingCount();
  }, [user, refresh, refreshPendingCount]);

  useEffect(() => {
    if (online) void syncPending();
  }, [online, syncPending]);

  const rename = useCallback(
    async (id: string, label: string) => {
      const next = label.trim() || null;
      setVersions((prev) => prev.map((v) => (v.id === id ? { ...v, version_label: next } : v)));
      await patchCachedVersion(id, { version_label: next });

      if (!online) {
        await queueOp({ kind: "rename", versionId: id, label: next });
        await refreshPendingCount();
        toast.success("Renamed offline — will sync when you're back online");
        return;
      }

      const { error } = await supabase.from("resumes").update({ version_label: next }).eq("id", id);
      if (error) {
        await queueOp({ kind: "rename", versionId: id, label: next });
        await refreshPendingCount();
        toast.message("Saved locally", { description: "We'll retry the rename automatically." });
        return;
      }
      toast.success("Version renamed");
    },
    [online, refreshPendingCount],
  );

  const remove = useCallback(
    async (version: ResumeVersion) => {
      setVersions((prev) => prev.filter((v) => v.id !== version.id));
      await removeCachedVersion(version.id);

      if (!online) {
        await queueOp({ kind: "delete", versionId: version.id, filePath: version.file_path });
        await refreshPendingCount();
        toast.success("Deleted offline — will sync when you're back online");
        return;
      }

      const { error } = await supabase.from("resumes").delete().eq("id", version.id);
      if (error) {
        await queueOp({ kind: "delete", versionId: version.id, filePath: version.file_path });
        await refreshPendingCount();
        toast.message("Deleted locally", { description: "We'll retry removing it from the cloud." });
        return;
      }
      await supabase.storage.from("resumes").remove([version.file_path]);
      toast.success("Version deleted");
    },
    [online, refreshPendingCount],
  );

  return { versions, loading, refresh, rename, remove, online, fromCache, pendingCount, syncPending };
}
