import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

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
}

const COLUMNS =
  "id, file_name, file_path, version_label, ats_score, keyword_match, formatting_score, impact_score, readability_score, ai_suggestions, parsed_text, created_at";

export function useResumeVersions() {
  const { user } = useAuth();
  const [versions, setVersions] = useState<ResumeVersion[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) {
      setVersions([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from("resumes")
      .select(COLUMNS)
      .order("created_at", { ascending: false })
      .limit(30);
    if (error) {
      console.error(error);
    } else {
      setVersions((data ?? []) as ResumeVersion[]);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const rename = useCallback(
    async (id: string, label: string) => {
      const { error } = await supabase
        .from("resumes")
        .update({ version_label: label.trim() || null })
        .eq("id", id);
      if (error) {
        toast.error("Couldn't rename this version");
        return;
      }
      setVersions((prev) => prev.map((v) => (v.id === id ? { ...v, version_label: label.trim() || null } : v)));
      toast.success("Version renamed");
    },
    [],
  );

  const remove = useCallback(async (version: ResumeVersion) => {
    const { error } = await supabase.from("resumes").delete().eq("id", version.id);
    if (error) {
      toast.error("Couldn't delete this version");
      return;
    }
    await supabase.storage.from("resumes").remove([version.file_path]);
    setVersions((prev) => prev.filter((v) => v.id !== version.id));
    toast.success("Version deleted");
  }, []);

  return { versions, loading, refresh, rename, remove };
}
