import { useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Download,
  FileJson,
  Github,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Table as TableIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format } from "date-fns";
import { PageHeader } from "@/components/app/PageHeader";
import {
  useCreateGithubIssue,
  useRunScan,
  useSecurityDiff,
  useSecurityFindings,
  useSignedExport,
  type DiffEntry,
  type Finding,
} from "@/hooks/useSecurityFindings";

const LEVEL_STYLE: Record<string, string> = {
  error: "bg-destructive/10 text-destructive border-destructive/30",
  warning: "bg-warning/10 text-warning border-warning/30",
  info: "bg-primary/10 text-primary border-primary/30",
};

const STATUS_STYLE: Record<DiffEntry["status"], string> = {
  new: "bg-destructive/10 text-destructive border-destructive/30",
  resolved: "bg-success/10 text-success border-success/30",
  changed: "bg-warning/10 text-warning border-warning/30",
  unchanged: "bg-muted text-muted-foreground border-border",
};

const stamp = (value?: string | null) => (value ? format(new Date(value), "d MMM yyyy, HH:mm") : "—");

export default function AdminSecurityFindings() {
  const [runId, setRunId] = useState<string | undefined>(undefined);
  const [selected, setSelected] = useState<string[]>([]);
  const [issueOpen, setIssueOpen] = useState(false);
  const [repo, setRepo] = useState("");
  const [showUnchanged, setShowUnchanged] = useState(false);

  const { data, isLoading, error } = useSecurityFindings(runId);
  const diffQuery = useSecurityDiff();
  const runScan = useRunScan();
  const signExport = useSignedExport();
  const createIssue = useCreateGithubIssue();

  const findings = data?.findings ?? [];
  const runs = data?.runs ?? [];
  const activeRun = runs.find((r) => r.id === (runId ?? data?.run_id)) ?? runs[0] ?? null;
  const issuesByFinding = useMemo(
    () => new Map((data?.issues ?? []).map((i) => [i.internal_id, i])),
    [data?.issues],
  );

  const allSelected = findings.length > 0 && selected.length === findings.length;
  const toggle = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const handleScan = () =>
    runScan.mutate(undefined, {
      onSuccess: () => toast.success("Scan complete."),
      onError: (e) => toast.error(e instanceof Error ? e.message : "Scan failed"),
    });

  /** Signed links are minted server-side, valid for 10 minutes and single-use. */
  const handleExport = (fmt: "json" | "csv") =>
    signExport.mutate(
      { format: fmt, runId: activeRun?.id ?? null, internalIds: selected },
      {
        onSuccess: ({ url }) => {
          window.open(url, "_blank", "noopener,noreferrer");
          toast.success(`Signed ${fmt.toUpperCase()} link opened. It expires in 10 minutes.`);
        },
        onError: (e) => toast.error(e instanceof Error ? e.message : "Could not create export link"),
      },
    );

  const handleCreateIssue = () =>
    createIssue.mutate(
      { repo: repo.trim(), runId: activeRun?.id ?? null, internalIds: selected },
      {
        onSuccess: (res) => {
          setIssueOpen(false);
          toast.success(`Issue #${res.issue_number} created for ${res.count} finding(s).`, {
            action: { label: "Open", onClick: () => window.open(res.issue_url, "_blank", "noopener") },
          });
        },
        onError: (e) => toast.error(e instanceof Error ? e.message : "Could not create issue"),
      },
    );

  const diff = diffQuery.data;
  const diffEntries = (diff?.entries ?? []).filter((e) => showUnchanged || e.status !== "unchanged");

  return (
    <div className="page-shell page-stack">
      <PageHeader
        eyebrow="Operations"
        icon={<ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />}
        title="Security findings"
        description="Immutable scan history for Gradr's database access rules. Exports are delivered through signed, single-use links and every privileged action is CSRF-protected and audit logged."
        actions={
          <Button onClick={handleScan} disabled={runScan.isPending}>
            {runScan.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Run scan now
          </Button>
        }
      />

      {error && (
        <Card className="border-destructive/40">
          <CardContent className="flex items-center gap-2 py-4 text-sm text-destructive">
            <AlertTriangle className="h-4 w-4" />
            {error instanceof Error ? error.message : "Could not load findings"}
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="findings">
        <TabsList>
          <TabsTrigger value="findings">Findings</TabsTrigger>
          <TabsTrigger value="diff">Scan diff</TabsTrigger>
        </TabsList>

        <TabsContent value="findings" className="space-y-4 pt-4">
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={activeRun?.id ?? ""}
              onChange={(e) => {
                setRunId(e.target.value);
                setSelected([]);
              }}
              aria-label="Scan run"
              className="rounded-lg border border-border bg-secondary px-3 py-2 text-sm text-foreground"
            >
              {runs.map((r) => (
                <option key={r.id} value={r.id}>
                  {stamp(r.finished_at ?? r.created_at)} · {r.trigger} · {r.totals?.total ?? 0} findings
                </option>
              ))}
              {runs.length === 0 && <option value="">No scans yet</option>}
            </select>

            <Button variant="outline" size="sm" onClick={() => handleExport("json")} disabled={signExport.isPending}>
              <FileJson className="mr-2 h-4 w-4" /> Signed JSON
            </Button>
            <Button variant="outline" size="sm" onClick={() => handleExport("csv")} disabled={signExport.isPending}>
              <Download className="mr-2 h-4 w-4" /> Signed CSV
            </Button>
            <Button size="sm" onClick={() => setIssueOpen(true)} disabled={selected.length === 0}>
              <Github className="mr-2 h-4 w-4" /> Create GitHub issue
              {selected.length > 0 && ` (${selected.length})`}
            </Button>
            {activeRun?.commit_sha && (
              <span className="text-xs text-muted-foreground">
                commit{" "}
                {activeRun.commit_url ? (
                  <a className="underline" href={activeRun.commit_url} target="_blank" rel="noreferrer">
                    {activeRun.commit_sha.slice(0, 8)}
                  </a>
                ) : (
                  activeRun.commit_sha.slice(0, 8)
                )}
                {activeRun.commit_ref ? ` · ${activeRun.commit_ref}` : ""}
              </span>
            )}
          </div>

          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle className="text-base">Findings</CardTitle>
                <CardDescription>
                  {findings.length} finding{findings.length === 1 ? "" : "s"} in this run
                </CardDescription>
              </div>
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={(c) => setSelected(c ? findings.map((f) => f.internal_id) : [])}
                  aria-label="Select all findings"
                />
                Select all
              </label>
            </CardHeader>
            <CardContent className="space-y-2">
              {isLoading && (
                <div className="flex justify-center py-10">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              )}
              {!isLoading && findings.length === 0 && (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  No findings recorded. Run a scan to create the first snapshot.
                </p>
              )}
              {findings.map((f: Finding) => {
                const issue = issuesByFinding.get(f.internal_id);
                return (
                  <div
                    key={f.id}
                    className="flex items-start gap-3 rounded-xl border border-border/70 bg-card/60 p-3 transition-colors hover:border-primary/40"
                  >
                    <Checkbox
                      className="mt-1"
                      checked={selected.includes(f.internal_id)}
                      onCheckedChange={() => toggle(f.internal_id)}
                      aria-label={`Select ${f.internal_id}`}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline" className={LEVEL_STYLE[f.level] ?? ""}>
                          {f.level}
                        </Badge>
                        <span className="text-sm font-medium text-foreground">{f.title}</span>
                        <code className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                          {f.internal_id}
                        </code>
                        {issue && (
                          <a
                            href={issue.issue_url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-primary underline"
                          >
                            <Github className="h-3 w-3" /> #{issue.issue_number}
                          </a>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">{f.description}</p>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="diff" className="space-y-4 pt-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {(["new", "resolved", "changed", "unchanged"] as const).map((k) => (
              <Card key={k}>
                <CardContent className="py-4">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">{k}</p>
                  <p className="text-2xl font-semibold text-foreground">{diff?.counts?.[k] ?? 0}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle className="text-base">Latest vs previous scan</CardTitle>
                <CardDescription>
                  {stamp(diff?.previous?.finished_at ?? diff?.previous?.created_at)} →{" "}
                  {stamp(diff?.latest?.finished_at ?? diff?.latest?.created_at)}
                </CardDescription>
              </div>
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <Checkbox
                  checked={showUnchanged}
                  onCheckedChange={(c) => setShowUnchanged(Boolean(c))}
                  aria-label="Show unchanged findings"
                />
                Show unchanged
              </label>
            </CardHeader>
            <CardContent className="space-y-2">
              {diffQuery.isLoading && (
                <div className="flex justify-center py-10">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              )}
              {!diffQuery.isLoading && !diff?.previous && (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  Only one scan exists so far — run another scan to compare.
                </p>
              )}
              {diffEntries.map((e) => (
                <div key={e.internal_id} className="rounded-xl border border-border/70 p-3">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className={STATUS_STYLE[e.status]}>
                      {e.status}
                    </Badge>
                    <code className="text-xs text-muted-foreground">{e.internal_id}</code>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <SideBySide label="Previous" finding={e.previous} tone="muted" />
                    <SideBySide label="Latest" finding={e.current} tone="current" />
                  </div>
                </div>
              ))}
              {!diffQuery.isLoading && diff?.previous && diffEntries.length === 0 && (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  <ShieldCheck className="mr-2 inline h-4 w-4 text-success" />
                  No changes between the last two scans.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={issueOpen} onOpenChange={setIssueOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create GitHub issue</DialogTitle>
            <DialogDescription>
              Opens one issue for the {selected.length} selected finding{selected.length === 1 ? "" : "s"},
              including JSON and CSV attachments plus the scan's commit metadata.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="repo">Repository</Label>
            <Input
              id="repo"
              placeholder="owner/repository"
              value={repo}
              onChange={(e) => setRepo(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Leave as configured default by setting a GITHUB_REPO secret. Requires the GitHub connector or a
              GITHUB_TOKEN secret.
            </p>
            <div className="flex flex-wrap gap-1 pt-1">
              {selected.slice(0, 8).map((id) => (
                <code key={id} className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                  {id}
                </code>
              ))}
              {selected.length > 8 && (
                <span className="text-[11px] text-muted-foreground">+{selected.length - 8} more</span>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIssueOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateIssue} disabled={createIssue.isPending}>
              {createIssue.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <ArrowRight className="mr-2 h-4 w-4" />
              )}
              Create issue
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SideBySide({
  label,
  finding,
  tone,
}: {
  label: string;
  finding: Finding | null;
  tone: "muted" | "current";
}) {
  return (
    <div
      className={`rounded-lg border p-3 ${
        tone === "current" ? "border-primary/30 bg-primary/5" : "border-border bg-muted/40"
      }`}
    >
      <p className="mb-1 flex items-center gap-1 text-[11px] uppercase tracking-wide text-muted-foreground">
        <TableIcon className="h-3 w-3" /> {label}
      </p>
      {finding ? (
        <>
          <p className="text-sm font-medium text-foreground">{finding.title}</p>
          <p className="mt-1 text-xs text-muted-foreground">{finding.description}</p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {finding.level} · {finding.entity}
          </p>
        </>
      ) : (
        <p className="text-xs italic text-muted-foreground">Not present in this scan</p>
      )}
    </div>
  );
}
