import { useEffect, useMemo, useState } from "react";
import { ArrowRight, GitCompare, Loader2, Minus, Plus, TrendingDown, TrendingUp } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { diffResumes, scoreDeltas, type DiffLine } from "@/lib/resumeDiff";
import type { ResumeVersion } from "@/hooks/useResumeVersions";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  versions: ResumeVersion[];
  initialBaseId?: string | null;
}

const labelOf = (v: ResumeVersion) => v.version_label || v.file_name;

function DeltaPill({ delta }: { delta: number | null }) {
  if (delta === null) return <span className="text-xs text-muted-foreground">—</span>;
  if (delta === 0)
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        <Minus className="h-3 w-3" aria-hidden /> no change
      </span>
    );
  const up = delta > 0;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium ${up ? "text-success" : "text-destructive"}`}>
      {up ? <TrendingUp className="h-3 w-3" aria-hidden /> : <TrendingDown className="h-3 w-3" aria-hidden />}
      {up ? "+" : ""}
      {delta}
    </span>
  );
}

function LineRow({ line }: { line: DiffLine }) {
  if (line.kind === "unchanged") {
    return <p className="px-3 py-1 text-xs text-muted-foreground">{line.before}</p>;
  }
  if (line.kind === "added") {
    return (
      <p className="flex gap-2 border-l-2 border-success bg-success/10 px-3 py-1 text-xs text-foreground">
        <Plus className="mt-0.5 h-3 w-3 shrink-0 text-success" aria-hidden />
        {line.after}
      </p>
    );
  }
  if (line.kind === "removed") {
    return (
      <p className="flex gap-2 border-l-2 border-destructive bg-destructive/10 px-3 py-1 text-xs text-muted-foreground line-through">
        <Minus className="mt-0.5 h-3 w-3 shrink-0 text-destructive" aria-hidden />
        {line.before}
      </p>
    );
  }
  return (
    <div className="border-l-2 border-warning bg-warning/10 px-3 py-1.5">
      <p className="text-xs text-muted-foreground">
        {line.beforeWords?.map((w, i) => (
          <span key={i} className={w.changed ? "rounded bg-destructive/20 px-0.5 line-through" : ""}>
            {w.text}{" "}
          </span>
        ))}
      </p>
      <p className="mt-1 text-xs text-foreground">
        {line.afterWords?.map((w, i) => (
          <span key={i} className={w.changed ? "rounded bg-success/20 px-0.5 font-medium" : ""}>
            {w.text}{" "}
          </span>
        ))}
      </p>
    </div>
  );
}

export function ResumeCompare({ open, onOpenChange, versions, initialBaseId }: Props) {
  const ordered = useMemo(
    () => [...versions].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()),
    [versions],
  );
  const [baseId, setBaseId] = useState<string>("");
  const [compareId, setCompareId] = useState<string>("");
  const [texts, setTexts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [showUnchanged, setShowUnchanged] = useState(false);

  useEffect(() => {
    if (!open || ordered.length < 2) return;
    const newest = ordered[ordered.length - 1]!;
    const previous = ordered[ordered.length - 2]!;
    setCompareId((c) => c || initialBaseId || newest.id);
    setBaseId((b) => b || (initialBaseId && initialBaseId !== previous.id ? previous.id : previous.id));
  }, [open, ordered, initialBaseId]);

  useEffect(() => {
    const ids = [baseId, compareId].filter((id) => id && texts[id] === undefined);
    if (ids.length === 0) return;
    let cancelled = false;
    setLoading(true);
    void (async () => {
      const { data } = await supabase.from("resumes").select("id, parsed_text").in("id", ids);
      if (cancelled) return;
      const next: Record<string, string> = {};
      for (const row of data ?? []) next[row.id] = row.parsed_text ?? "";
      setTexts((prev) => ({ ...prev, ...next }));
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [baseId, compareId, texts]);

  const base = ordered.find((v) => v.id === baseId);
  const compare = ordered.find((v) => v.id === compareId);
  const baseText = baseId ? texts[baseId] : undefined;
  const compareText = compareId ? texts[compareId] : undefined;

  const diff = useMemo(() => {
    if (baseText === undefined || compareText === undefined) return null;
    return diffResumes(baseText, compareText);
  }, [baseText, compareText]);

  const deltas = useMemo(() => {
    if (!base || !compare) return [];
    return scoreDeltas(base as unknown as Record<string, number | null>, compare as unknown as Record<string, number | null>);
  }, [base, compare]);

  const hasText = Boolean(baseText) && Boolean(compareText);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitCompare className="h-5 w-5 text-primary" aria-hidden />
            Compare resume versions
          </DialogTitle>
          <DialogDescription>
            See exactly what changed between two versions and what it did to your ATS scores.
          </DialogDescription>
        </DialogHeader>

        {ordered.length < 2 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            You need at least two saved versions to compare. Analyse or tailor another resume first.
          </p>
        ) : (
          <div className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-end">
              <div>
                <label className="mb-1 block text-xs text-muted-foreground" id="base-label">
                  Baseline
                </label>
                <Select value={baseId} onValueChange={setBaseId}>
                  <SelectTrigger aria-labelledby="base-label">
                    <SelectValue placeholder="Pick a version" />
                  </SelectTrigger>
                  <SelectContent>
                    {ordered.map((v) => (
                      <SelectItem key={v.id} value={v.id} disabled={v.id === compareId}>
                        {labelOf(v)} • {new Date(v.created_at).toLocaleDateString()}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <ArrowRight className="mx-auto hidden h-4 w-4 shrink-0 text-muted-foreground sm:mb-3 sm:block" aria-hidden />
              <div>
                <label className="mb-1 block text-xs text-muted-foreground" id="compare-label">
                  Compared version
                </label>
                <Select value={compareId} onValueChange={setCompareId}>
                  <SelectTrigger aria-labelledby="compare-label">
                    <SelectValue placeholder="Pick a version" />
                  </SelectTrigger>
                  <SelectContent>
                    {ordered.map((v) => (
                      <SelectItem key={v.id} value={v.id} disabled={v.id === baseId}>
                        {labelOf(v)} • {new Date(v.created_at).toLocaleDateString()}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-5">
              {deltas.map((d) => (
                <div key={d.label} className="rounded-xl border border-border/60 bg-secondary/40 p-3">
                  <p className="text-[0.7rem] uppercase tracking-wide text-muted-foreground">{d.label}</p>
                  <p className="mt-1 text-sm tabular-nums text-foreground">
                    {d.before ?? "—"} → <span className="font-semibold">{d.after ?? "—"}</span>
                  </p>
                  <div className="mt-1">
                    <DeltaPill delta={d.delta} />
                  </div>
                </div>
              ))}
            </div>

            {loading ? (
              <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading resume text…
              </div>
            ) : !hasText ? (
              <p className="rounded-xl border border-dashed border-border p-5 text-sm text-muted-foreground">
                One of these versions was saved before Gradr stored parsed text, so a line-by-line diff isn't available.
                The score comparison above still applies — re-analyse the older file to unlock the full diff.
              </p>
            ) : diff ? (
              <>
                <div className="flex flex-wrap items-center gap-3 text-xs">
                  <span className="rounded-full bg-success/15 px-2 py-0.5 text-success">{diff.addedCount} added</span>
                  <span className="rounded-full bg-warning/15 px-2 py-0.5 text-warning">{diff.changedCount} rewritten</span>
                  <span className="rounded-full bg-destructive/15 px-2 py-0.5 text-destructive">{diff.removedCount} removed</span>
                  <label className="ml-auto flex items-center gap-2 text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={showUnchanged}
                      onChange={(e) => setShowUnchanged(e.target.checked)}
                      className="h-3.5 w-3.5 rounded border-border"
                    />
                    Show unchanged lines
                  </label>
                </div>

                {(diff.newKeywords.length > 0 || diff.droppedKeywords.length > 0) && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-xl border border-border/60 p-3">
                      <p className="text-xs font-medium text-foreground">New keywords</p>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {diff.newKeywords.length === 0 ? (
                          <span className="text-xs text-muted-foreground">None</span>
                        ) : (
                          diff.newKeywords.map((k) => (
                            <span key={k} className="rounded bg-success/15 px-1.5 py-0.5 text-[0.7rem] text-success">
                              {k}
                            </span>
                          ))
                        )}
                      </div>
                    </div>
                    <div className="rounded-xl border border-border/60 p-3">
                      <p className="text-xs font-medium text-foreground">Dropped keywords</p>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {diff.droppedKeywords.length === 0 ? (
                          <span className="text-xs text-muted-foreground">None</span>
                        ) : (
                          diff.droppedKeywords.map((k) => (
                            <span key={k} className="rounded bg-destructive/15 px-1.5 py-0.5 text-[0.7rem] text-destructive">
                              {k}
                            </span>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                )}

                <div className="max-h-[40vh] overflow-y-auto rounded-xl border border-border/60 bg-background/50 py-2">
                  {diff.lines
                    .filter((l) => showUnchanged || l.kind !== "unchanged")
                    .map((line, i) => (
                      <LineRow key={i} line={line} />
                    ))}
                </div>
              </>
            ) : null}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
