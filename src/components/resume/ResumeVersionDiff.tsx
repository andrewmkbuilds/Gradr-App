import { useMemo, useState } from "react";
import { ArrowRight, GitCompare, Minus, Plus, TrendingDown, TrendingUp } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useResumeVersions, type ResumeVersion } from "@/hooks/useResumeVersions";
import { cn } from "@/lib/utils";

interface MetricRow {
  key: keyof ResumeVersion;
  label: string;
  hint: string;
}

const METRICS: MetricRow[] = [
  { key: "ats_score", label: "ATS score", hint: "Overall parser-readiness composite." },
  { key: "keyword_match", label: "Keyword match", hint: "Overlap with the target role's keywords." },
  { key: "formatting_score", label: "Formatting", hint: "Structure, sections and parser-safe layout." },
  { key: "impact_score", label: "Impact statements", hint: "Quantified, verb-led achievements." },
  { key: "readability_score", label: "Readability", hint: "Sentence length and density." },
];

const STOP = new Set([
  "the","and","for","with","that","this","from","have","has","was","were","are","you","your","our","their","a","an","of",
  "to","in","on","at","by","as","is","it","be","or","we","i","my","me","us","they","them","he","she","his","her","but",
]);

function tokens(text: string | null | undefined) {
  if (!text) return new Set<string>();
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9+#. ]/g, " ")
      .split(/\s+/)
      .map((w) => w.replace(/^[.]+|[.]+$/g, ""))
      .filter((w) => w.length > 2 && !STOP.has(w) && !/^\d+$/.test(w)),
  );
}

function label(v: ResumeVersion) {
  return v.version_label || v.file_name;
}

function DeltaPill({ delta }: { delta: number }) {
  if (delta === 0) {
    return <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><Minus className="h-3 w-3" aria-hidden="true" />no change</span>;
  }
  const up = delta > 0;
  const Icon = up ? TrendingUp : TrendingDown;
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs font-medium", up ? "text-success" : "text-destructive")}>
      <Icon className="h-3 w-3" aria-hidden="true" />
      {up ? "+" : ""}{delta}
    </span>
  );
}

/**
 * Side-by-side comparison of two saved resume versions: what each score did and
 * which keywords were gained or lost between the two documents.
 */
export function ResumeVersionDiff() {
  const { versions, loading } = useResumeVersions();
  const [baseId, setBaseId] = useState<string>("");
  const [compareId, setCompareId] = useState<string>("");

  const defaults = useMemo(() => {
    if (versions.length < 2) return { base: "", compare: "" };
    return { base: versions[1].id, compare: versions[0].id };
  }, [versions]);

  const base = versions.find((v) => v.id === (baseId || defaults.base));
  const compare = versions.find((v) => v.id === (compareId || defaults.compare));

  const keywordDiff = useMemo(() => {
    const a = tokens(base?.parsed_text);
    const b = tokens(compare?.parsed_text);
    const added: string[] = [];
    const removed: string[] = [];
    b.forEach((w) => { if (!a.has(w)) added.push(w); });
    a.forEach((w) => { if (!b.has(w)) removed.push(w); });
    return { added: added.sort().slice(0, 24), removed: removed.sort().slice(0, 24), hasText: a.size > 0 || b.size > 0 };
  }, [base, compare]);

  if (loading) {
    return <div className="elev-2 h-40 animate-pulse rounded-xl" />;
  }

  if (versions.length < 2) {
    return (
      <div className="elev-2 rounded-xl p-5">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <GitCompare className="h-4 w-4 text-primary" aria-hidden="true" /> Compare versions
        </h3>
        <p className="mt-2 text-sm text-muted-foreground">
          Analyse or tailor a second resume and this panel will show exactly what changed between versions — and how each
          edit moved your ATS and keyword scores.
        </p>
      </div>
    );
  }

  const atsDelta = (compare?.ats_score ?? 0) - (base?.ats_score ?? 0);

  return (
    <div className="elev-2 rounded-xl p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <GitCompare className="h-4 w-4 text-primary" aria-hidden="true" /> Compare versions
        </h3>
        <DeltaPill delta={atsDelta} />
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-end">
        <div className="grid gap-1.5">
          <Label htmlFor="diff-base" className="text-xs text-muted-foreground">Baseline</Label>
          <Select value={base?.id ?? ""} onValueChange={setBaseId}>
            <SelectTrigger id="diff-base"><SelectValue /></SelectTrigger>
            <SelectContent>
              {versions.map((v) => <SelectItem key={v.id} value={v.id}>{label(v)}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <ArrowRight className="mx-auto hidden h-4 w-4 shrink-0 text-muted-foreground sm:mb-3 sm:block" aria-hidden="true" />
        <div className="grid gap-1.5">
          <Label htmlFor="diff-compare" className="text-xs text-muted-foreground">Compared version</Label>
          <Select value={compare?.id ?? ""} onValueChange={setCompareId}>
            <SelectTrigger id="diff-compare"><SelectValue /></SelectTrigger>
            <SelectContent>
              {versions.map((v) => <SelectItem key={v.id} value={v.id}>{label(v)}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <table className="mt-5 w-full text-sm">
        <caption className="sr-only">Score comparison between two resume versions</caption>
        <thead>
          <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
            <th scope="col" className="pb-2 font-medium">Metric</th>
            <th scope="col" className="pb-2 text-right font-medium">Baseline</th>
            <th scope="col" className="pb-2 text-right font-medium">Compared</th>
            <th scope="col" className="pb-2 text-right font-medium">Change</th>
          </tr>
        </thead>
        <tbody>
          {METRICS.map((m) => {
            const a = (base?.[m.key] as number | null) ?? 0;
            const b = (compare?.[m.key] as number | null) ?? 0;
            return (
              <tr key={String(m.key)} className="border-t border-border/60">
                <th scope="row" className="py-2 pr-3 text-left font-normal">
                  <span className="text-foreground">{m.label}</span>
                  <span className="block text-[11px] text-muted-foreground">{m.hint}</span>
                </th>
                <td className="py-2 text-right tabular-nums text-muted-foreground">{a}</td>
                <td className="py-2 text-right tabular-nums text-foreground">{b}</td>
                <td className="py-2 text-right"><DeltaPill delta={b - a} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <div>
          <p className="flex items-center gap-1.5 text-xs font-medium text-success">
            <Plus className="h-3.5 w-3.5" aria-hidden="true" /> Keywords gained ({keywordDiff.added.length})
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {keywordDiff.added.length === 0 ? (
              <span className="text-xs text-muted-foreground">
                {keywordDiff.hasText ? "No new terms in this version." : "Re-analyse these versions to unlock keyword diffing."}
              </span>
            ) : (
              keywordDiff.added.map((w) => (
                <span key={w} className="rounded-full bg-success/10 px-2 py-0.5 text-[11px] text-success">{w}</span>
              ))
            )}
          </div>
        </div>
        <div>
          <p className="flex items-center gap-1.5 text-xs font-medium text-destructive">
            <Minus className="h-3.5 w-3.5" aria-hidden="true" /> Keywords dropped ({keywordDiff.removed.length})
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {keywordDiff.removed.length === 0 ? (
              <span className="text-xs text-muted-foreground">Nothing was removed.</span>
            ) : (
              keywordDiff.removed.map((w) => (
                <span key={w} className="rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] text-destructive">{w}</span>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
