import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  ExternalLink,
  Image as ImageIcon,
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

interface RouteMetadata {
  path: string;
  url: string;
  status: number;
  title: string | null;
  description: string | null;
  canonical: string | null;
  robots: string | null;
  ogTitle: string | null;
  ogDescription: string | null;
  ogImage: string | null;
  ogUrl: string | null;
  ogType: string | null;
  ogSiteName: string | null;
  twitterCard: string | null;
  twitterTitle: string | null;
  twitterDescription: string | null;
  twitterImage: string | null;
  themeColor: string | null;
  manifestHref: string | null;
  iconHrefs: string[];
  expectedOgImage: string;
  problems: string[];
  ok: boolean;
}

interface AssetCheck {
  url: string;
  status: number;
  contentType: string | null;
  bytes: number | null;
  sha256: string | null;
  version: string | null;
  cacheControl: string | null;
  problems: string[];
  ok: boolean;
}

interface Report {
  scannedAt: string;
  target: string;
  ogVersion: string;
  brand: { name: string; siteTitle: string; description: string; themeColor: string };
  routes: RouteMetadata[];
  assets: AssetCheck[];
  icons: AssetCheck[];
  manifest: { url: string; status: number; manifest: Record<string, unknown> | null; problems: string[]; ok: boolean };
  duplicateArtwork: string[][];
  summary: {
    routes: number;
    routesOk: number;
    assets: number;
    assetsOk: number;
    manifestOk: boolean;
    failures: number;
    verdict: "pass" | "fail";
  };
}

const kb = (bytes: number | null) => (bytes === null ? "—" : `${Math.round(bytes / 1024)} KB`);
const short = (hash: string | null) => (hash ? `${hash.slice(0, 12)}…` : "—");

function Stat({ label, value, tone }: { label: string; value: string; tone?: "ok" | "bad" }) {
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

function Field({ label, value, expected }: { label: string; value: string | null; expected?: string | null }) {
  const mismatch = expected !== undefined && expected !== null && value !== null && !value.startsWith(expected);
  return (
    <div className="grid grid-cols-[9rem_1fr] gap-3 border-b border-border/60 py-1.5 text-sm last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className={`break-all ${value ? (mismatch ? "text-destructive" : "text-foreground") : "text-destructive"}`}>
        {value ?? "— missing —"}
      </span>
    </div>
  );
}

export default function AdminBrandMetadata() {
  useSeoOverride({ title: "Brand & metadata", description: "Effective head metadata, social cards and PWA manifest for every key Gradr route." });
  const [report, setReport] = useState<Report | null>(null);
  const [target, setTarget] = useState<"deployed" | "current">("deployed");
  const [openPath, setOpenPath] = useState<string | null>(null);

  const scan = useMutation({
    mutationFn: async () => {
      const { data, error } = await invokeFunction<Report>("brand-metadata", { body: { target } });
      if (error) throw error;
      return data!;
    },
    onSuccess: (data) => {
      setReport(data);
      if (data.summary.verdict === "pass") toast.success("All routes, cards and manifest match Yacht Club branding");
      else toast.error(`${data.summary.failures} check(s) need attention`);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const copySummary = () => {
    if (!report) return;
    const lines = [
      `Gradr brand metadata — ${report.target} — ${new Date(report.scannedAt).toLocaleString()}`,
      `Verdict: ${report.summary.verdict.toUpperCase()} (${report.summary.failures} failing check(s))`,
      `OG version: ${report.ogVersion}`,
      "",
      ...report.routes.map((r) => `${r.ok ? "ok  " : "FAIL"} ${r.path}${r.problems.length ? ` — ${r.problems.join("; ")}` : ""}`),
      ...report.assets.map((a) => `${a.ok ? "ok  " : "FAIL"} ${a.url} (${short(a.sha256)})`),
      `${report.manifest.ok ? "ok  " : "FAIL"} manifest${report.manifest.problems.length ? ` — ${report.manifest.problems.join("; ")}` : ""}`,
    ];
    void navigator.clipboard.writeText(lines.join("\n"));
    toast.success("Re-scrape summary copied");
  };

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 p-4 md:p-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <ShieldCheck className="h-6 w-6 text-primary" /> Brand &amp; metadata
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            What crawlers actually receive for every key route — head tags, social card URLs and bytes, favicons and the
            PWA manifest — checked against the current Gradr Yacht Club spec.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-border p-0.5">
            {(["deployed", "current"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTarget(t)}
                className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
                  target === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {t === "deployed" ? "gradr.me" : "This origin"}
              </button>
            ))}
          </div>
          <Button onClick={() => scan.mutate()} disabled={scan.isPending}>
            {scan.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            Run re-scrape verification
          </Button>
        </div>
      </header>

      {!report && !scan.isPending && (
        <div className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          Run a verification to fetch live metadata for {""}
          <span className="text-foreground">{target === "deployed" ? "gradr.me" : "this origin"}</span>.
        </div>
      )}

      {report && (
        <>
          <div className="grid gap-3 sm:grid-cols-4">
            <Stat
              label="Verdict"
              value={report.summary.verdict === "pass" ? "Pass" : `${report.summary.failures} failing`}
              tone={report.summary.verdict === "pass" ? "ok" : "bad"}
            />
            <Stat label="Routes" value={`${report.summary.routesOk}/${report.summary.routes}`} />
            <Stat label="Assets" value={`${report.summary.assetsOk}/${report.summary.assets}`} />
            <Stat label="OG version" value={report.ogVersion} />
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>Scanned {new Date(report.scannedAt).toLocaleString()} · {report.target}</span>
            <Button size="sm" variant="outline" onClick={copySummary}>
              <Copy className="mr-2 h-3.5 w-3.5" /> Copy summary
            </Button>
          </div>

          {report.duplicateArtwork.length > 0 && (
            <div className="rounded-xl border border-warning/40 bg-warning/10 p-4 text-sm">
              <p className="flex items-center gap-2 font-medium text-warning">
                <AlertTriangle className="h-4 w-4" /> Duplicate social artwork
              </p>
              {report.duplicateArtwork.map((group, i) => (
                <p key={i} className="mt-1 break-all text-muted-foreground">{group.join("  ·  ")}</p>
              ))}
            </div>
          )}

          <Tabs defaultValue="routes">
            <TabsList>
              <TabsTrigger value="routes">Routes</TabsTrigger>
              <TabsTrigger value="cards">Social cards</TabsTrigger>
              <TabsTrigger value="manifest">Icons &amp; manifest</TabsTrigger>
            </TabsList>

            <TabsContent value="routes" className="space-y-2 pt-4">
              {report.routes.map((r) => (
                <div key={r.path} className="rounded-xl border border-border bg-card">
                  <button
                    onClick={() => setOpenPath(openPath === r.path ? null : r.path)}
                    className="flex w-full items-center gap-3 p-4 text-left"
                  >
                    {r.ok ? (
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" />
                    ) : (
                      <XCircle className="h-4 w-4 shrink-0 text-destructive" />
                    )}
                    <span className="font-medium">{r.path}</span>
                    <Badge variant="outline">{r.status || "err"}</Badge>
                    {r.robots?.includes("noindex") && <Badge variant="secondary">noindex</Badge>}
                    <span className="ml-auto truncate text-xs text-muted-foreground">
                      {r.problems.length ? r.problems[0] : (r.title ?? "")}
                    </span>
                  </button>
                  {openPath === r.path && (
                    <div className="space-y-3 border-t border-border p-4">
                      {r.problems.length > 0 && (
                        <ul className="space-y-1 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                          {r.problems.map((p) => (
                            <li key={p}>• {p}</li>
                          ))}
                        </ul>
                      )}
                      <div className="grid gap-6 lg:grid-cols-[1fr_auto]">
                        <div>
                          <Field label="title" value={r.title} />
                          <Field label="description" value={r.description} />
                          <Field label="canonical" value={r.canonical} />
                          <Field label="robots" value={r.robots} />
                          <Field label="og:title" value={r.ogTitle} />
                          <Field label="og:description" value={r.ogDescription} />
                          <Field label="og:url" value={r.ogUrl} />
                          <Field label="og:type" value={r.ogType} />
                          <Field label="og:site_name" value={r.ogSiteName} />
                          <Field label="og:image" value={r.ogImage} expected={r.expectedOgImage} />
                          <Field label="twitter:card" value={r.twitterCard} />
                          <Field label="twitter:image" value={r.twitterImage} />
                          <Field label="theme-color" value={r.themeColor} />
                          <Field label="manifest" value={r.manifestHref} />
                          <Field label="icons" value={r.iconHrefs.join(", ") || null} />
                        </div>
                        {r.ogImage && (
                          <a href={r.ogImage} target="_blank" rel="noreferrer" className="block shrink-0">
                            <img
                              src={r.ogImage}
                              alt={`Social card for ${r.path}`}
                              loading="lazy"
                              className="h-auto w-64 rounded-lg border border-border"
                            />
                            <span className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
                              <ExternalLink className="h-3 w-3" /> Open card
                            </span>
                          </a>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </TabsContent>

            <TabsContent value="cards" className="pt-4">
              <div className="overflow-x-auto rounded-xl border border-border">
                <table className="w-full text-sm">
                  <thead className="bg-secondary/50 text-left text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="p-3">Card</th>
                      <th className="p-3">Status</th>
                      <th className="p-3">Version</th>
                      <th className="p-3">Size</th>
                      <th className="p-3">SHA-256</th>
                      <th className="p-3">Issues</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.assets.map((a) => (
                      <tr key={a.url} className="border-t border-border">
                        <td className="max-w-sm break-all p-3">
                          <a href={a.url} target="_blank" rel="noreferrer" className="hover:underline">
                            {a.url.replace(report.target, "")}
                          </a>
                        </td>
                        <td className="p-3">{a.status || "err"}</td>
                        <td className={`p-3 ${a.version === report.ogVersion ? "" : "text-destructive"}`}>{a.version ?? "—"}</td>
                        <td className="p-3">{kb(a.bytes)}</td>
                        <td className="p-3 font-mono text-xs">{short(a.sha256)}</td>
                        <td className="p-3 text-destructive">{a.problems.join("; ") || ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </TabsContent>

            <TabsContent value="manifest" className="space-y-4 pt-4">
              <div className="rounded-xl border border-border bg-card p-4">
                <p className="flex items-center gap-2 font-medium">
                  <ImageIcon className="h-4 w-4 text-primary" /> Favicons &amp; app icons
                </p>
                <div className="mt-3 flex flex-wrap gap-4">
                  {report.icons.map((icon) => (
                    <div key={icon.url} className="w-32 text-center">
                      <img src={icon.url} alt="" className="mx-auto h-16 w-16 rounded-lg border border-border object-contain" />
                      <p className="mt-1 truncate text-xs text-muted-foreground">{icon.url.replace(report.target, "")}</p>
                      <p className={`text-xs ${icon.ok ? "text-primary" : "text-destructive"}`}>
                        {icon.ok ? kb(icon.bytes) : icon.problems[0]}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded-xl border border-border bg-card p-4">
                <p className="flex items-center gap-2 font-medium">
                  {report.manifest.ok ? (
                    <CheckCircle2 className="h-4 w-4 text-primary" />
                  ) : (
                    <XCircle className="h-4 w-4 text-destructive" />
                  )}
                  PWA manifest
                </p>
                {report.manifest.problems.length > 0 && (
                  <ul className="mt-2 space-y-1 text-sm text-destructive">
                    {report.manifest.problems.map((p) => (
                      <li key={p}>• {p}</li>
                    ))}
                  </ul>
                )}
                <pre className="mt-3 max-h-96 overflow-auto rounded-lg bg-secondary/50 p-3 text-xs">
                  {JSON.stringify(report.manifest.manifest, null, 2)}
                </pre>
              </div>
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}
