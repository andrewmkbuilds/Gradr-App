import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileText,
  Loader2,
  RefreshCw,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { invokeFunction } from "@/lib/invokeFunction";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSeoOverride } from "@/lib/seoOverride";

interface Hop {
  order: number;
  url: string;
  kind: string;
  at: string;
  note?: string | null;
}

interface Trace {
  id: string;
  created_at: string;
  request_id: string;
  provider: string;
  outcome: string;
  account_kind: string | null;
  duration_ms: number | null;
  expected_redirect_uri: string | null;
  final_url: string | null;
  final_domain: string | null;
  deviation: boolean;
  state_present: boolean;
  state_valid: boolean | null;
  nonce_present: boolean;
  nonce_valid: boolean | null;
  error_code: string | null;
  error_message: string | null;
  hops: Hop[] | null;
}

interface FlowCheck {
  id: string;
  created_at: string;
  run_id: string;
  account_label: string;
  source: string;
  status: string;
  final_url: string | null;
  final_domain: string | null;
  expected_final_url: string | null;
  duration_ms: number | null;
  failures: string[] | null;
  hops: Hop[] | null;
}

interface HeaderProbe {
  path: string;
  url: string;
  status: number | null;
  ok: boolean;
  problems: string[];
  headers: Record<string, string | null>;
}

interface HeaderReport {
  runId: string;
  origin: string;
  checkedAt: string;
  probes: HeaderProbe[];
  verdict: "pass" | "fail";
  failures: number;
}

const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "—";

const tri = (value: boolean | null) => (value === null ? "n/a" : value ? "valid" : "invalid");

function Verdict({ ok, label }: { ok: boolean; label?: string }) {
  return (
    <Badge variant={ok ? "secondary" : "destructive"} className="gap-1">
      {ok ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
      {label ?? (ok ? "Pass" : "Fail")}
    </Badge>
  );
}

function Stat({ label, value, tone }: { label: string; value: string | number; tone?: "ok" | "bad" }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p
        className={`mt-1 text-2xl font-semibold ${
          tone === "ok" ? "text-primary" : tone === "bad" ? "text-destructive" : "text-foreground"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function HopChain({ hops }: { hops: Hop[] | null }) {
  if (!hops?.length) return <p className="text-sm text-muted-foreground">No hops recorded.</p>;
  return (
    <ol className="space-y-2">
      {hops.map((hop) => (
        <li key={`${hop.order}-${hop.url}`} className="flex gap-3 text-sm">
          <span className="mt-0.5 shrink-0 rounded-md bg-muted px-2 py-0.5 font-mono text-xs">
            {hop.order}
          </span>
          <div className="min-w-0">
            <p className="break-all font-mono text-xs text-foreground">{hop.url}</p>
            <p className="text-xs text-muted-foreground">
              {hop.kind}
              {hop.note ? ` · ${hop.note}` : ""} · {when(hop.at)}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}

export default function AdminOAuthForensics() {
  useSeoOverride({
    title: "OAuth Forensics | Gradr Admin",
    description: "Redirect chains, state/nonce validation, security headers and automated OAuth checks.",
  });

  const [expanded, setExpanded] = useState<string | null>(null);
  const [headerReport, setHeaderReport] = useState<HeaderReport | null>(null);

  const traces = useQuery({
    queryKey: ["oauth-forensics", "traces"],
    queryFn: async () => {
      const { data, error } = await invokeFunction<{ traces: Trace[]; expectedFinalUrl: string }>(
        "oauth-forensics",
        { body: { action: "traces", limit: 50 } },
      );
      if (error) throw error;
      return data!;
    },
  });

  const checks = useQuery({
    queryKey: ["oauth-forensics", "checks"],
    queryFn: async () => {
      const { data, error } = await invokeFunction<{ checks: FlowCheck[] }>("oauth-forensics", {
        body: { action: "checks", limit: 50 },
      });
      if (error) throw error;
      return data!.checks;
    },
  });

  const runHeaderCheck = useMutation({
    mutationFn: async () => {
      const { data, error } = await invokeFunction<HeaderReport>("oauth-forensics", {
        body: { action: "headers" },
      });
      if (error) throw error;
      return data!;
    },
    onSuccess: (report) => {
      setHeaderReport(report);
      if (report.verdict === "pass") toast.success("All OAuth paths return the expected security headers");
      else toast.error(`${report.failures} path(s) failed the header check`);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const exportIncident = useMutation({
    mutationFn: async (format: "md" | "json") => {
      const { data, error } = await invokeFunction<{ markdown: string; generatedAt: string }>(
        "oauth-forensics",
        { body: { action: "export", days: 14, limit: 100 } },
      );
      if (error) throw error;
      return { format, report: data! };
    },
    onSuccess: ({ format, report }) => {
      const stamp = new Date(report.generatedAt).toISOString().slice(0, 10);
      const body = format === "md" ? report.markdown : JSON.stringify(report, null, 2);
      const blob = new Blob([body], {
        type: format === "md" ? "text/markdown" : "application/json",
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `gradr-oauth-incident-${stamp}.${format}`;
      anchor.click();
      URL.revokeObjectURL(url);
      toast.success("Incident timeline exported");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const rows = traces.data?.traces ?? [];
  const deviations = rows.filter((t) => t.deviation).length;
  const stateFailures = rows.filter((t) => t.state_valid === false || t.nonce_valid === false).length;
  const failedChecks = (checks.data ?? []).filter((c) => c.status !== "pass").length;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-8 px-4 py-10">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-semibold tracking-tight">
            <ShieldCheck className="h-7 w-7 text-primary" />
            OAuth Forensics
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Every Google sign-in redirect chain, the state and nonce validation outcome, live security
            headers on OAuth paths, and the automated daily headless-browser check. Export the whole
            thing as a timeline for a Safe Browsing false-positive report.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={() => {
              void traces.refetch();
              void checks.refetch();
            }}
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
          <Button variant="secondary" onClick={() => exportIncident.mutate("json")} disabled={exportIncident.isPending}>
            {exportIncident.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Download className="mr-2 h-4 w-4" />
            )}
            Export JSON
          </Button>
          <Button onClick={() => exportIncident.mutate("md")} disabled={exportIncident.isPending}>
            <FileText className="mr-2 h-4 w-4" />
            Export incident timeline
          </Button>
        </div>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Sign-ins traced" value={rows.length} />
        <Stat label="Domain deviations" value={deviations} tone={deviations ? "bad" : "ok"} />
        <Stat label="State/nonce failures" value={stateFailures} tone={stateFailures ? "bad" : "ok"} />
        <Stat label="Failed daily checks" value={failedChecks} tone={failedChecks ? "bad" : "ok"} />
      </div>

      <Tabs defaultValue="traces">
        <TabsList>
          <TabsTrigger value="traces">Redirect chains</TabsTrigger>
          <TabsTrigger value="headers">Security headers</TabsTrigger>
          <TabsTrigger value="checks">Daily flow checks</TabsTrigger>
        </TabsList>

        <TabsContent value="traces" className="mt-6 space-y-3">
          {traces.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading sign-in traces…</p>
          ) : rows.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              No OAuth sign-ins recorded yet. The next Google sign-in will appear here with its full
              redirect chain.
            </p>
          ) : (
            rows.map((trace) => (
              <div key={trace.id} className="rounded-xl border border-border bg-card">
                <button
                  type="button"
                  onClick={() => setExpanded(expanded === trace.id ? null : trace.id)}
                  className="flex w-full flex-wrap items-center justify-between gap-3 p-4 text-left"
                >
                  <div className="min-w-0">
                    <p className="font-mono text-xs text-muted-foreground">{trace.request_id}</p>
                    <p className="mt-1 text-sm font-medium">
                      {trace.provider} · {trace.final_domain ?? "unknown domain"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {when(trace.created_at)} · {trace.duration_ms ?? "—"} ms · state {tri(trace.state_valid)} ·
                      nonce {tri(trace.nonce_valid)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {trace.deviation ? (
                      <Badge variant="destructive" className="gap-1">
                        <AlertTriangle className="h-3 w-3" /> Domain deviation
                      </Badge>
                    ) : (
                      <Verdict ok={trace.outcome !== "error"} label={trace.outcome} />
                    )}
                  </div>
                </button>
                {expanded === trace.id && (
                  <div className="space-y-3 border-t border-border p-4">
                    <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
                      <p>Expected redirect: <span className="break-all font-mono">{trace.expected_redirect_uri ?? "—"}</span></p>
                      <p>Final URL: <span className="break-all font-mono">{trace.final_url ?? "—"}</span></p>
                      <p>State returned: {trace.state_present ? "yes" : "no"} ({tri(trace.state_valid)})</p>
                      <p>Nonce returned: {trace.nonce_present ? "yes" : "no"} ({tri(trace.nonce_valid)})</p>
                    </div>
                    {trace.error_code && (
                      <p className="text-xs text-destructive">
                        {trace.error_code}: {trace.error_message}
                      </p>
                    )}
                    <HopChain hops={trace.hops} />
                  </div>
                )}
              </div>
            ))
          )}
        </TabsContent>

        <TabsContent value="headers" className="mt-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              Fetches gradr.me live and asserts CSP, HSTS and Referrer-Policy on <code>/auth</code> and every
              OAuth-related path.
            </p>
            <Button onClick={() => runHeaderCheck.mutate()} disabled={runHeaderCheck.isPending}>
              {runHeaderCheck.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <ShieldCheck className="mr-2 h-4 w-4" />
              )}
              Run runtime check
            </Button>
          </div>
          {headerReport && (
            <div className="space-y-3">
              <div className="flex items-center gap-3 text-sm">
                <Verdict ok={headerReport.verdict === "pass"} />
                <span className="text-muted-foreground">
                  {headerReport.origin} · {when(headerReport.checkedAt)}
                </span>
              </div>
              {headerReport.probes.map((probe) => (
                <div key={probe.path} className="rounded-xl border border-border bg-card p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-mono text-sm">{probe.path}</p>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">HTTP {probe.status ?? "—"}</Badge>
                      <Verdict ok={probe.ok} />
                    </div>
                  </div>
                  <dl className="mt-3 grid gap-1 text-xs">
                    {["content-security-policy", "strict-transport-security", "referrer-policy"].map((key) => (
                      <div key={key} className="flex gap-2">
                        <dt className="w-56 shrink-0 text-muted-foreground">{key}</dt>
                        <dd className="break-all font-mono">{probe.headers[key] ?? "— missing —"}</dd>
                      </div>
                    ))}
                  </dl>
                  {probe.problems.length > 0 && (
                    <ul className="mt-3 space-y-1 text-xs text-destructive">
                      {probe.problems.map((problem) => (
                        <li key={problem}>• {problem}</li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="checks" className="mt-6 space-y-3">
          {(checks.data ?? []).length === 0 ? (
            <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              No automated runs ingested yet. The daily headless-Chrome job posts results here.
            </p>
          ) : (
            (checks.data ?? []).map((check) => (
              <div key={check.id} className="rounded-xl border border-border bg-card p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium">
                      {check.account_label} account · {check.source}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {when(check.created_at)} · {check.duration_ms ?? "—"} ms
                    </p>
                  </div>
                  <Verdict ok={check.status === "pass"} label={check.status} />
                </div>
                <p className="mt-2 break-all font-mono text-xs text-muted-foreground">
                  {check.final_url ?? "—"}{" "}
                  <span className="text-muted-foreground/70">(expected {check.expected_final_url})</span>
                </p>
                {(check.failures ?? []).length > 0 && (
                  <ul className="mt-2 space-y-1 text-xs text-destructive">
                    {(check.failures ?? []).map((failure) => (
                      <li key={failure}>• {failure}</li>
                    ))}
                  </ul>
                )}
                {(check.hops ?? []).length > 0 && (
                  <div className="mt-3">
                    <HopChain hops={check.hops} />
                  </div>
                )}
              </div>
            ))
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
