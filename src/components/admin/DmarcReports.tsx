import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, ShieldCheck, TriangleAlert, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface ReportRow {
  id: string;
  org_name: string;
  external_report_id: string;
  date_begin: string;
  date_end: string;
  policy_domain: string;
  policy_p: string | null;
  policy_pct: number | null;
  policy_adkim: string | null;
  policy_aspf: string | null;
  total_messages: number;
  pass_messages: number;
  fail_messages: number;
}

interface RecordRow {
  id: string;
  source_ip: string;
  message_count: number;
  disposition: string | null;
  dkim_result: string | null;
  spf_result: string | null;
  header_from: string | null;
  dkim_domain: string | null;
  spf_domain: string | null;
  aligned: boolean;
}

function pct(part: number, total: number) {
  if (!total) return "—";
  return `${Math.round((part / total) * 1000) / 10}%`;
}

/** DMARC aggregate reports: proof that enforcement is live and alignment passes. */
export default function DmarcReports() {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const { data: reports, isLoading } = useQuery({
    queryKey: ["dmarc-reports"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dmarc_reports")
        .select("*")
        .order("date_end", { ascending: false })
        .limit(60);
      if (error) throw error;
      return (data ?? []) as unknown as ReportRow[];
    },
  });

  const { data: records } = useQuery({
    queryKey: ["dmarc-report-records", selected],
    enabled: Boolean(selected),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dmarc_report_records")
        .select("*")
        .eq("report_id", selected!)
        .order("message_count", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as RecordRow[];
    },
  });

  const totals = useMemo(() => {
    const rows = reports ?? [];
    const messages = rows.reduce((s, r) => s + r.total_messages, 0);
    const pass = rows.reduce((s, r) => s + r.pass_messages, 0);
    const enforcing = rows.filter((r) => r.policy_p === "quarantine" || r.policy_p === "reject").length;
    return { messages, pass, fail: messages - pass, enforcing, reports: rows.length };
  }, [reports]);

  const upload = useMutation({
    mutationFn: async (file: File) => {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error("Your session expired — sign in again.");
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      let binary = "";
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
      const res = await fetch("/api/public/dmarc-ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ filename: file.name, contentBase64: btoa(binary) }),
      });
      const payload = (await res.json()) as { error?: string; orgName?: string; records?: number };
      if (!res.ok) throw new Error(payload.error ?? `Upload failed (${res.status})`);
      return payload;
    },
    onSuccess: (payload) => {
      toast.success(`Imported ${payload.records ?? 0} rows from ${payload.orgName ?? "report"}`);
      void queryClient.invalidateQueries({ queryKey: ["dmarc-reports"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold">DMARC aggregate reports</h3>
          <p className="text-sm text-muted-foreground">
            Daily reports from mailbox providers, showing whether mail claiming to be gradr.me passes alignment.
          </p>
        </div>
        <div>
          <input
            ref={fileInput}
            type="file"
            accept=".xml,.gz,application/xml,application/gzip"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) upload.mutate(file);
              e.target.value = "";
            }}
          />
          <Button variant="outline" onClick={() => fileInput.current?.click()} disabled={upload.isPending}>
            {upload.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
            Upload report
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        {[
          { label: "Reports", value: totals.reports },
          { label: "Messages", value: totals.messages },
          { label: "Aligned", value: pct(totals.pass, totals.messages) },
          { label: "Enforcing", value: `${totals.enforcing}/${totals.reports}` },
        ].map((stat) => (
          <Card key={stat.label} className="p-4">
            <p className="text-xs uppercase text-muted-foreground">{stat.label}</p>
            <p className="text-2xl font-semibold">{stat.value}</p>
          </Card>
        ))}
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Loading reports…</p>}

      {!isLoading && (reports?.length ?? 0) === 0 && (
        <Card className="p-6 text-sm text-muted-foreground">
          No aggregate reports ingested yet. Providers send them daily to the address in the DMARC record;
          you can also upload one manually to check parsing.
        </Card>
      )}

      {(reports?.length ?? 0) > 0 && (
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="p-3">Reporter</th>
                <th className="p-3">Window</th>
                <th className="p-3">Policy</th>
                <th className="p-3">Messages</th>
                <th className="p-3">Aligned</th>
                <th className="p-3">Failing</th>
              </tr>
            </thead>
            <tbody>
              {reports!.map((row) => (
                <tr
                  key={row.id}
                  className={`cursor-pointer border-t hover:bg-muted/30 ${selected === row.id ? "bg-muted/40" : ""}`}
                  onClick={() => setSelected(selected === row.id ? null : row.id)}
                >
                  <td className="p-3">{row.org_name}</td>
                  <td className="p-3 whitespace-nowrap">
                    {new Date(row.date_begin).toLocaleDateString()} – {new Date(row.date_end).toLocaleDateString()}
                  </td>
                  <td className="p-3">
                    <Badge variant={row.policy_p === "none" ? "secondary" : "default"}>
                      p={row.policy_p ?? "?"}
                      {row.policy_pct !== null && row.policy_pct < 100 ? ` pct=${row.policy_pct}` : ""}
                    </Badge>
                  </td>
                  <td className="p-3">{row.total_messages}</td>
                  <td className="p-3">{pct(row.pass_messages, row.total_messages)}</td>
                  <td className={`p-3 ${row.fail_messages > 0 ? "text-destructive" : "text-muted-foreground"}`}>
                    {row.fail_messages}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {selected && (
        <Card className="overflow-x-auto">
          <div className="flex items-center gap-2 border-b p-3 text-sm font-medium">
            <ShieldCheck className="h-4 w-4" /> Sending sources in this report
          </div>
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="p-3">Source IP</th>
                <th className="p-3">Volume</th>
                <th className="p-3">Disposition</th>
                <th className="p-3">DKIM</th>
                <th className="p-3">SPF</th>
                <th className="p-3">From</th>
              </tr>
            </thead>
            <tbody>
              {(records ?? []).map((rec) => (
                <tr key={rec.id} className="border-t">
                  <td className="p-3 font-mono text-xs">{rec.source_ip}</td>
                  <td className="p-3">{rec.message_count}</td>
                  <td className="p-3">{rec.disposition ?? "—"}</td>
                  <td className={`p-3 ${rec.dkim_result === "pass" ? "text-success" : "text-destructive"}`}>
                    {rec.dkim_result ?? "—"}
                    {rec.dkim_domain ? ` (${rec.dkim_domain})` : ""}
                  </td>
                  <td className={`p-3 ${rec.spf_result === "pass" ? "text-success" : "text-destructive"}`}>
                    {rec.spf_result ?? "—"}
                  </td>
                  <td className="p-3">
                    {!rec.aligned && <TriangleAlert className="mr-1 inline h-3.5 w-3.5 text-warning" />}
                    {rec.header_from ?? "—"}
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
