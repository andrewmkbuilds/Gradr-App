import { useState } from "react";
import { Navigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Loader2, ShieldCheck, CreditCard, Gauge, Bot } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { formatDistanceToNow } from "date-fns";

interface SecurityEvent {
  id: string;
  category: "billing_webhook" | "entitlement_check" | "ai_authorization";
  event: string;
  decision: string;
  user_id: string | null;
  feature: string | null;
  environment: string | null;
  reason: string | null;
  source: string | null;
  details: Record<string, unknown>;
  created_at: string;
}

const CATEGORY_LABEL: Record<string, string> = {
  billing_webhook: "Billing webhook",
  entitlement_check: "Entitlement check",
  ai_authorization: "AI authorization",
};

const DECISION_STYLE: Record<string, string> = {
  allowed: "bg-success/10 text-success",
  processed: "bg-success/10 text-success",
  received: "bg-primary/10 text-primary",
  denied: "bg-destructive/10 text-destructive",
  failed: "bg-destructive/10 text-destructive",
};

export default function AdminSecurityLog() {
  const { user, loading: authLoading } = useAuth();
  const [category, setCategory] = useState("all");
  const [decision, setDecision] = useState("all");
  const [days, setDays] = useState(30);

  const { data: isAdmin, isLoading: roleLoading } = useQuery({
    queryKey: ["is-admin", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase.rpc("has_role", { _user_id: user!.id, _role: "admin" });
      return Boolean(data);
    },
  });

  const { data: events, isLoading } = useQuery({
    queryKey: ["security-audit", category, decision, days],
    enabled: Boolean(isAdmin),
    queryFn: async (): Promise<SecurityEvent[]> => {
      const since = new Date(Date.now() - days * 86_400_000).toISOString();
      let q = (supabase as any)
        .from("security_audit_log")
        .select("*")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(300);
      if (category !== "all") q = q.eq("category", category);
      if (decision !== "all") q = q.eq("decision", decision);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as SecurityEvent[];
    },
  });

  if (authLoading || roleLoading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }
  if (!isAdmin) return <Navigate to="/" replace />;

  const rows = events ?? [];
  const counts = {
    billing: rows.filter((r) => r.category === "billing_webhook").length,
    entitlement: rows.filter((r) => r.category === "entitlement_check").length,
    ai: rows.filter((r) => r.category === "ai_authorization").length,
  };

  const selectCls = "px-3 py-2 rounded-lg bg-secondary border border-border text-sm text-foreground";

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground tracking-tight">Security Log</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Billing webhook events, entitlement checks, and AI-call authorization decisions, recorded per user.
          Entries are written server-side only and cannot be edited or deleted.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Tile label="Billing webhooks" value={counts.billing} icon={CreditCard} />
        <Tile label="Entitlement checks" value={counts.entitlement} icon={Gauge} />
        <Tile label="AI authorizations" value={counts.ai} icon={Bot} />
      </div>

      <div className="flex gap-2 flex-wrap">
        <select value={category} onChange={(e) => setCategory(e.target.value)} className={selectCls} aria-label="Category">
          <option value="all">All categories</option>
          <option value="billing_webhook">Billing webhooks</option>
          <option value="entitlement_check">Entitlement checks</option>
          <option value="ai_authorization">AI authorizations</option>
        </select>
        <select value={decision} onChange={(e) => setDecision(e.target.value)} className={selectCls} aria-label="Decision">
          <option value="all">All outcomes</option>
          <option value="allowed">Allowed</option>
          <option value="denied">Denied</option>
          <option value="received">Received</option>
          <option value="processed">Processed</option>
          <option value="failed">Failed</option>
        </select>
        <select value={days} onChange={(e) => setDays(Number(e.target.value))} className={selectCls} aria-label="Time range">
          <option value={7}>Last 7 days</option>
          <option value={30}>Last 30 days</option>
          <option value={90}>Last 90 days</option>
        </select>
      </div>

      <div className="glass-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="p-3">When</th>
              <th>Category</th>
              <th>Event</th>
              <th>Outcome</th>
              <th>User</th>
              <th>Feature</th>
              <th>Env</th>
              <th>Reason</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={8} className="p-10 text-center">
                  <Loader2 className="h-5 w-5 animate-spin text-primary inline" />
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="p-12 text-center text-muted-foreground">
                  <ShieldCheck className="h-6 w-6 mx-auto mb-2 opacity-50" />
                  No security events for these filters.
                </td>
              </tr>
            ) : (
              rows.map((e) => (
                <tr key={e.id} className="border-t border-border/60">
                  <td className="p-3 whitespace-nowrap text-muted-foreground">
                    {formatDistanceToNow(new Date(e.created_at), { addSuffix: true })}
                  </td>
                  <td className="text-foreground">{CATEGORY_LABEL[e.category] ?? e.category}</td>
                  <td className="text-muted-foreground">{e.event}</td>
                  <td>
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                        DECISION_STYLE[e.decision] ?? "bg-muted text-muted-foreground"
                      }`}
                    >
                      {e.decision}
                    </span>
                  </td>
                  <td className="text-muted-foreground font-mono text-xs">
                    {e.user_id ? e.user_id.slice(0, 8) : "—"}
                  </td>
                  <td className="text-muted-foreground">{e.feature ?? "—"}</td>
                  <td className="text-muted-foreground">{e.environment ?? "—"}</td>
                  <td className="text-muted-foreground">{e.reason ?? "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Tile({ label, value, icon: Icon }: { label: string; value: number; icon: typeof CreditCard }) {
  return (
    <div className="glass-card p-4 flex items-center gap-3">
      <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
        <Icon className="h-5 w-5 text-primary" />
      </div>
      <div>
        <p className="text-xl font-semibold text-foreground">{value}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}
