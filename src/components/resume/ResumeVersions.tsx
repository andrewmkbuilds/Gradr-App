import { useState } from "react";
import { FileText, Loader2, Pencil, Trash2, Check, X, Layers, CloudOff, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useResumeVersions, type ResumeVersion } from "@/hooks/useResumeVersions";

interface Props {
  activeId?: string | null;
  onSelect: (version: ResumeVersion) => void;
}

export function ResumeVersions({ activeId, onSelect }: Props) {
  const { versions, loading, rename, remove, online, fromCache, pendingCount } = useResumeVersions();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  if (loading) {
    return (
      <div className="elev-2 rounded-xl flex items-center gap-2 p-5 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading your saved versions…
      </div>
    );
  }

  if (versions.length === 0) {
    return (
      <div className="elev-2 rounded-xl p-5">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Layers className="h-4 w-4 text-primary" /> Resume versions
        </h3>
        <p className="mt-2 text-sm text-muted-foreground">
          Every resume you analyse is saved here as a version. Tailor one to a job title and it will be labelled
          automatically, so you can compare scores side by side.
        </p>
      </div>
    );
  }

  return (
    <div className="elev-2 rounded-xl p-5">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Layers className="h-4 w-4 text-primary" /> Resume versions
        </h3>
        <div className="flex items-center gap-2">
          {(!online || fromCache) && (
            <span className="inline-flex items-center gap-1 rounded-full bg-surface-secondary px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
              <CloudOff className="h-3 w-3" aria-hidden="true" />
              Offline copy
            </span>
          )}
          {pendingCount > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-brand-secondary/12 px-2 py-0.5 text-[10px] font-medium text-brand-secondary">
              <RefreshCw className="h-3 w-3" aria-hidden="true" />
              {pendingCount} to sync
            </span>
          )}
          <span className="text-xs text-muted-foreground">{versions.length} saved</span>
        </div>
      </div>

      <ul className="mt-4 space-y-2">
        {versions.map((v) => {
          const isActive = v.id === activeId;
          const label = v.version_label || v.file_name;
          return (
            <li
              key={v.id}
              className={`flex flex-wrap items-center gap-3 rounded-lg border p-3 transition-colors ${
                isActive ? "border-primary/50 bg-primary/5" : "border-border/60 bg-secondary/40"
              }`}
            >
              <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />

              {editingId === v.id ? (
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <Input
                    value={draft}
                    autoFocus
                    onChange={(e) => setDraft(e.target.value)}
                    className="h-8 bg-background/60"
                    placeholder="Version name"
                  />
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
                    aria-label="Save version name"
                    onClick={async () => {
                      await rename(v.id, draft);
                      setEditingId(null);
                    }}
                  >
                    <Check className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
                    aria-label="Cancel rename"
                    onClick={() => setEditingId(null)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => onSelect(v)}
                  className="min-w-0 flex-1 text-left"
                >
                  <p className="truncate text-sm font-medium text-foreground">{label}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {new Date(v.created_at).toLocaleDateString()} • ATS {v.ats_score ?? "—"}
                    {typeof v.keyword_match === "number" ? ` • Keywords ${v.keyword_match}%` : ""}
                  </p>
                </button>
              )}

              {editingId !== v.id && (
                <div className="flex items-center gap-1">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
                    aria-label={`Rename ${label}`}
                    onClick={() => {
                      setEditingId(v.id);
                      setDraft(v.version_label || v.file_name);
                    }}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-destructive hover:text-destructive"
                    aria-label={`Delete ${label}`}
                    onClick={() => remove(v)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
