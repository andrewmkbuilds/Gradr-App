import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Loader2, RefreshCw, ShieldAlert, ShieldCheck, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface DkimSelector {
  selector: string;
  ok: boolean;
  keyType: string | null;
  keyBits: number | null;
  issues: string[];
}

interface AuthCheckRow {
  id: string;
  created_at: string;
  domain: string;
  sending_domain: string;
  spf_ok: boolean;
  spf_record: string | null;
  dkim_ok: boolean;
  dkim_selectors: DkimSelector[] | null;
  dmarc_ok: boolean;
  dmarc_record: string | null;
  dmarc_policy: string | null;
  test_send_ok: boolean;
  headers_verified: boolean;
  auth_results: Record<string, unknown> | null;
  issues: string[] | null;
  overall: string;
  duration_ms: number | null;
}

const TONE: Record<string, string> = {
  pass: "text-success",
  warn: "text-warning",
  fail: "text-destructive",
};

function Verdict({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-sm ${ok ? "text-success" : "text-destructive"}`}>
      {ok ? <ShieldCheck className="h-4 w-4" /> : <ShieldAlert className="h-4 w-4" />}
      {label}
    </span>
  );
}

/**
 * Live SPF/DKIM/DMARC posture for the sending domain, backed by scheduled runs
 * that send a real message and read back its Authentication-Results header.
 */
export default function EmailAuthHealth() {
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState<string | null>(null);

  const { data: checks, isLoading } = useQuery({
    queryKey: ["email-auth-checks"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("email_auth_checks")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      return (data ?? []) as unknown as AuthCheckRow[];
    },
  });

  const runCheck = useMutation({
    mutationFn: async () => {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error("Your session expired — sign in again.");
      const res = await fetch("/api/public/email-auth-check", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({}),
      });
      const payload = (await res.json()) as { error?: string; overall?: string };
      if (!res.ok) throw new Error(payload.error ?? `Check failed (${res.status})`);
      return payload;
    },
    onSuccess: (payload) => {
      toast.success(`Authentication check finished — ${payload.overall}`);
      void queryClient.invalidateQueries({ queryKey: ["email-auth-checks"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const latest = checks?.[0];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold">Sender authentication</h3>
          <p className="text-sm text-muted-foreground">
            SPF, DKIM and DMARC are re-validated against live DNS, then confirmed against a real delivered message.
          </p>
        </div>
        <Button onClick={() => runCheck.mutate()} disabled={runCheck.isPending}>
          {runCheck.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
          Run check now
        </Button>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Loading checks…</p>}

      {!isLoading && !latest && (
        <Card className="p-6 text-sm text-muted-foreground">
          No authentication checks have run yet. Run one now to record the current DNS posture.
        </Card>
      )}

      {latest && (
        <Card className="space-y-4 p-5">
          <div className="flex flex-wrap items-center gap-3">
            <Badge variant={latest.overall === "pass" ? "default" : "secondary"} className={TONE[latest.overall]}>
              {latest.overall.toUpperCase()}
            </Badge>
            <span className="text-sm text-muted-foreground">
              {latest.sending_domain} · {new Date(latest.created_at).toLocaleString()}
            </span>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1">
              <Verdict ok={latest.spf_ok} label="SPF" />
              <code className="block break-all text-xs text-muted-foreground">{latest.spf_record ?? "no record"}</code>
            </div>
            <div className="space-y-1">
              <Verdict ok={latest.dkim_ok} label="DKIM" />
              <div className="space-y-0.5 text-xs text-muted-foreground">
                {(latest.dkim_selectors ?? []).map((s) => (
                  <div key={s.selector}>
                    {s.selector}: {s.ok ? `${s.keyType ?? "rsa"} ${s.keyBits ?? "?"}-bit` : "missing or invalid"}
                  </div>
                ))}
              </div>
            </div>
            <div className="space-y-1">
              <Verdict ok={latest.dmarc_ok} label="DMARC" />
              <code className="block break-all text-xs text-muted-foreground">{latest.dmarc_record ?? "no record"}</code>
            </div>
          </div>

          <div className="flex flex-wrap gap-4 border-t pt-3 text-sm">
            <span className="inline-flex items-center gap-1.5">
              {latest.test_send_ok ? <CheckCircle2 className="h-4 w-4 text-success" /> : <TriangleAlert className="h-4 w-4 text-warning" />}
              Test send {latest.test_send_ok ? "delivered to queue" : "not sent"}
            </span>
            <span className="inline-flex items-center gap-1.5">
              {latest.headers_verified ? <CheckCircle2 className="h-4 w-4 text-success" /> : <TriangleAlert className="h-4 w-4 text-warning" />}
              Delivered signature {latest.headers_verified ? "verified" : "not read back"}
            </span>
          </div>

          {latest.headers_verified && latest.auth_results && (
            <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs">
              {JSON.stringify(latest.auth_results, null, 2)}
            </pre>
          )}

          {(latest.issues ?? []).length > 0 && (
            <ul className="space-y-1 text-sm text-muted-foreground">
              {(latest.issues ?? []).map((issue) => (
                <li key={issue} className="flex gap-2">
                  <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                  {issue}
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {(checks?.length ?? 0) > 1 && (
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="p-3">When</th>
                <th className="p-3">Result</th>
                <th className="p-3">SPF</th>
                <th className="p-3">DKIM</th>
                <th className="p-3">DMARC</th>
                <th className="p-3">Issues</th>
              </tr>
            </thead>
            <tbody>
              {checks!.slice(1).map((row) => (
                <tr
                  key={row.id}
                  className="cursor-pointer border-t hover:bg-muted/30"
                  onClick={() => setExpanded(expanded === row.id ? null : row.id)}
                >
                  <td className="p-3 whitespace-nowrap">{new Date(row.created_at).toLocaleString()}</td>
                  <td className={`p-3 font-medium ${TONE[row.overall]}`}>{row.overall}</td>
                  <td className="p-3">{row.spf_ok ? "pass" : "fail"}</td>
                  <td className="p-3">{row.dkim_ok ? "pass" : "fail"}</td>
                  <td className="p-3">{row.dmarc_policy ?? "—"}</td>
                  <td className="p-3 text-muted-foreground">
                    {expanded === row.id ? (row.issues ?? []).join("; ") || "none" : (row.issues ?? []).length}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
