/**
 * Admin-only auth email preview & link inspector.
 *
 * Renders each of the six Supabase auth emails from the exact components the
 * auth webhook uses, then reports:
 *  - the CTA button href
 *  - every copy/paste fallback link in the body
 *  - whether both equal the dynamic action URL that was passed in
 *  - any forbidden host (lovable.app, gradr-app, localhost) found in the HTML
 *
 * An admin can paste a real Supabase action URL to confirm the template passes
 * it through untouched before publishing. Nothing privileged is exposed: the
 * endpoint verifies an admin JWT server-side and returns only rendered output.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Check, Link2, Loader2, RefreshCw, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";

const ENDPOINT = "/api/public/admin-email-ops";

async function callApi<T>(body: Record<string, unknown>): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Your session expired — sign in again.");
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const payload = (await res.json()) as T & { error?: string };
  if (!res.ok) throw new Error(payload.error ?? `Request failed (${res.status})`);
  return payload;
}

interface AllowlistVerdict {
  allowed: boolean;
  reasons: string[];
  actionHost: string | null;
  actionPath: string | null;
  redirectHost: string | null;
  redirectPath: string | null;
}

interface PreviewResponse {
  templates: { key: string; label: string }[];
  template: string;
  label: string;
  subject: string;
  html: string;
  text: string;
  actionUrl: string | null;
  allowlist: AllowlistVerdict;
  links: {
    buttonHref: string | null;
    fallbackLinks: string[];
    allHrefs: string[];
    externalHrefs: string[];
    forbidden: string[];
    matchesActionUrl: boolean | null;
    textContainsActionUrl: boolean | null;
  };
}

interface AuditRow {
  id: string;
  created_at: string;
  action_type: string;
  recipient_redacted: string | null;
  link_origin: string | null;
  link_path: string | null;
  link_type: string | null;
  redirect_to: string | null;
  token_param: string | null;
  token_digest: string | null;
  url_digest: string | null;
  link_valid: boolean;
  allowlist_ok: boolean | null;
  allowlist_reasons: string[] | null;
  redirect_sanitized: boolean | null;
  blocked: boolean | null;
  run_id: string | null;
  message_id: string | null;
}

function Verdict({ ok, label }: { ok: boolean; label: string }) {
  return (
    <Badge variant="outline" className={ok ? "text-success" : "text-destructive"}>
      {ok ? <Check className="mr-1 h-3 w-3" /> : <AlertTriangle className="mr-1 h-3 w-3" />}
      {label}
    </Badge>
  );
}

/** Default export window: the trailing 30 days, as yyyy-mm-dd for <input type=date>. */
function isoDay(offsetDays = 0): string {
  return new Date(Date.now() - offsetDays * 864e5).toISOString().slice(0, 10);
}

export default function AdminAuthEmailPreview() {
  const [template, setTemplate] = useState("signup");
  const [actionUrlDraft, setActionUrlDraft] = useState("");
  const [actionUrl, setActionUrl] = useState("");
  const [from, setFrom] = useState(isoDay(30));
  const [to, setTo] = useState(isoDay(0));
  const [exporting, setExporting] = useState<"json" | "csv" | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  const preview = useQuery({
    queryKey: ["auth-email-preview", template, actionUrl],
    queryFn: () =>
      callApi<PreviewResponse>({ action: "auth-preview", template, actionUrl, auditImages: true }),
  });

  const audit = useQuery({
    queryKey: ["auth-email-link-audit", from, to],
    queryFn: () =>
      callApi<{ rows: AuditRow[] }>({
        action: "auth-link-audit",
        from: new Date(`${from}T00:00:00Z`).toISOString(),
        to: new Date(`${to}T23:59:59Z`).toISOString(),
      }),
  });

  /**
   * Download the rendered email plus the audit entries for the selected range.
   * The endpoint streams a file, so this bypasses `callApi` (which parses JSON)
   * and turns the response into a blob.
   */
  async function download(format: "json" | "csv") {
    setExporting(format);
    setExportError(null);
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error("Your session expired — sign in again.");
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          action: "auth-preview-export",
          format,
          template,
          actionUrl,
          from: new Date(`${from}T00:00:00Z`).toISOString(),
          to: new Date(`${to}T23:59:59Z`).toISOString(),
        }),
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error ?? `Export failed (${res.status})`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `gradr-auth-email-${template}-${from}_${to}.${format}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      setExportError(error instanceof Error ? error.message : "Export failed");
    } finally {
      setExporting(null);
    }
  }

  const links = preview.data?.links;
  const allowlist = preview.data?.allowlist;
  const resolvedActionUrl = preview.data?.actionUrl ?? null;


  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold text-foreground">Auth email preview</h1>
        <p className="text-sm text-muted-foreground">
          Inspect every authentication email and its link behaviour before publishing. Paste a real
          action URL to verify the template forwards it untouched.
        </p>
      </header>

      <Card className="space-y-4 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[14rem] space-y-1">
            <Label>Template</Label>
            <Select value={template} onValueChange={setTemplate}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(preview.data?.templates ?? [{ key: template, label: template }]).map((t) => (
                  <SelectItem key={t.key} value={t.key}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-[20rem] flex-1 space-y-1">
            <Label>Action URL override (optional)</Label>
            <Input
              value={actionUrlDraft}
              onChange={(e) => setActionUrlDraft(e.target.value)}
              placeholder="https://…supabase.co/auth/v1/verify?token=…&type=signup&redirect_to=…"
            />
          </div>
          <Button onClick={() => setActionUrl(actionUrlDraft.trim())} variant="secondary">
            <Link2 className="mr-2 h-4 w-4" /> Render with URL
          </Button>
          <Button onClick={() => preview.refetch()} variant="ghost">
            <RefreshCw className="mr-2 h-4 w-4" /> Refresh
          </Button>
        </div>

        {preview.error && (
          <p className="text-sm text-destructive">{(preview.error as Error).message}</p>
        )}

        {preview.data && (
          <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-3">
            <p className="text-sm text-muted-foreground">
              Subject: <span className="text-foreground">{preview.data.subject}</span>
            </p>
            <div className="flex flex-wrap gap-2">
              {resolvedActionUrl ? (
                <>
                  <Verdict ok={links?.matchesActionUrl === true} label="Button href matches action URL" />
                  <Verdict ok={links?.textContainsActionUrl === true} label="Plain-text fallback present" />
                </>
              ) : (
                <Badge variant="outline">
                  <ShieldCheck className="mr-1 h-3 w-3" /> Code-only email — no action link
                </Badge>
              )}
              <Verdict ok={(links?.forbidden ?? []).length === 0} label="No forbidden hosts" />
              <Verdict ok={(links?.externalHrefs ?? []).length === 0} label="No unexpected external links" />
              {resolvedActionUrl && (
                <Verdict ok={allowlist?.allowed === true} label="Redirect target allowlisted" />
              )}
            </div>

            {resolvedActionUrl && allowlist && !allowlist.allowed && (
              <div className="space-y-1 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs">
                <p className="font-medium text-destructive">
                  This link would be rewritten or blocked before sending:
                </p>
                <ul className="list-disc space-y-0.5 pl-4 text-destructive">
                  {allowlist.reasons.map((reason, i) => (
                    <li key={i}>{reason}</li>
                  ))}
                </ul>
              </div>
            )}



            <dl className="grid gap-2 text-xs sm:grid-cols-[10rem_1fr]">
              <dt className="text-muted-foreground">Action URL</dt>
              <dd className="break-all text-foreground">{resolvedActionUrl ?? "—"}</dd>
              <dt className="text-muted-foreground">Button href</dt>
              <dd className="break-all text-foreground">{links?.buttonHref ?? "—"}</dd>
              <dt className="text-muted-foreground">Fallback link(s)</dt>
              <dd className="space-y-1 break-all text-foreground">
                {(links?.fallbackLinks ?? []).length === 0
                  ? "—"
                  : links!.fallbackLinks.map((l, i) => <p key={i}>{l}</p>)}
              </dd>
              <dt className="text-muted-foreground">All hrefs</dt>
              <dd className="space-y-1 break-all text-muted-foreground">
                {(links?.allHrefs ?? []).map((l, i) => <p key={i}>{l}</p>)}
              </dd>
              {(links?.forbidden ?? []).length > 0 && (
                <>
                  <dt className="text-destructive">Forbidden hosts</dt>
                  <dd className="text-destructive">{links!.forbidden.join(", ")}</dd>
                </>
              )}
            </dl>
          </div>
        )}

        <Tabs defaultValue="html">
          <TabsList>
            <TabsTrigger value="html">Rendered</TabsTrigger>
            <TabsTrigger value="text">Plain text</TabsTrigger>
          </TabsList>
          <TabsContent value="html">
            {preview.isLoading ? (
              <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Rendering…
              </p>
            ) : (
              <iframe
                title={`${template} auth email preview`}
                srcDoc={preview.data?.html ?? ""}
                className="h-[36rem] w-full rounded-lg border border-border bg-white"
              />
            )}
          </TabsContent>
          <TabsContent value="text">
            <pre className="max-h-[36rem] overflow-auto rounded-lg border border-border bg-muted/40 p-4 text-xs text-foreground">
              {preview.data?.text ?? ""}
            </pre>
          </TabsContent>
        </Tabs>
      </Card>

      <Card className="p-4">
        <h2 className="mb-1 text-lg font-semibold text-foreground">Sent-link audit trail</h2>
        <p className="mb-3 text-sm text-muted-foreground">
          Which dynamic action URL each authentication email was built with. Tokens are stored only
          as one-way fingerprints, so this record can never be used to sign in as someone.
        </p>

        <div className="mb-4 flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label htmlFor="audit-from">From</Label>
            <Input
              id="audit-from"
              type="date"
              value={from}
              max={to}
              onChange={(e) => setFrom(e.target.value)}
              className="w-40"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="audit-to">To</Label>
            <Input
              id="audit-to"
              type="date"
              value={to}
              min={from}
              onChange={(e) => setTo(e.target.value)}
              className="w-40"
            />
          </div>
          <Button variant="secondary" disabled={exporting !== null} onClick={() => download("json")}>
            {exporting === "json" ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Download className="mr-2 h-4 w-4" />
            )}
            Export JSON (email + audit)
          </Button>
          <Button variant="outline" disabled={exporting !== null} onClick={() => download("csv")}>
            {exporting === "csv" ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Download className="mr-2 h-4 w-4" />
            )}
            Export CSV (audit)
          </Button>
        </div>
        {exportError && <p className="mb-3 text-sm text-destructive">{exportError}</p>}

        {(audit.data?.rows ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">No auth emails recorded in this window.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-muted-foreground">
                <tr>
                  <th className="py-2 pr-3">When</th>
                  <th className="py-2 pr-3">Type</th>
                  <th className="py-2 pr-3">Recipient</th>
                  <th className="py-2 pr-3">Link origin</th>
                  <th className="py-2 pr-3">Path</th>
                  <th className="py-2 pr-3">Redirect</th>
                  <th className="py-2 pr-3">Allowlist</th>
                  <th className="py-2 pr-3">URL fingerprint</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {(audit.data?.rows ?? []).map((r) => (
                  <tr key={r.id}>
                    <td className="py-2 pr-3 whitespace-nowrap">
                      {new Date(r.created_at).toLocaleString()}
                    </td>
                    <td className="py-2 pr-3">
                      <Badge variant="outline">{r.action_type}</Badge>
                    </td>
                    <td className="py-2 pr-3">{r.recipient_redacted ?? "—"}</td>
                    <td className="py-2 pr-3">{r.link_origin ?? "—"}</td>
                    <td className="py-2 pr-3">{r.link_path ?? "—"}</td>
                    <td className="py-2 pr-3 max-w-[16rem] truncate">{r.redirect_to ?? "—"}</td>
                    <td className="py-2 pr-3">
                      {r.allowlist_ok === false ? (
                        <span
                          className="text-destructive"
                          title={(r.allowlist_reasons ?? []).join(" · ")}
                        >
                          {r.redirect_sanitized ? "Rewritten" : "Failed"}
                        </span>
                      ) : (
                        <span className="text-success">Pass</span>
                      )}
                    </td>
                    <td className="py-2 pr-3 font-mono">{r.url_digest?.slice(0, 12) ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

    </div>
  );
}
