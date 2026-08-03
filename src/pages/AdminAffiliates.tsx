import { useState } from "react";
import { Navigate } from "react-router-dom";
import { Loader2, Check, X, Pause, Play, Search, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useIsAdmin, useAffiliateSettings } from "@/hooks/useAffiliate";
import { format } from "date-fns";
import { PayoutsPanel } from "@/components/admin/PayoutsPanel";
import { ConfirmDestructive } from "@/components/admin/ConfirmDestructive";

type Tab = "applications" | "affiliates" | "commissions" | "payouts" | "settings";

export default function AdminAffiliates() {
  const { data: isAdmin, isLoading: loadingAdmin } = useIsAdmin();
  const [tab, setTab] = useState<Tab>("applications");

  if (loadingAdmin) return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  if (!isAdmin) return <Navigate to="/" replace />;

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground tracking-tight">Affiliate Admin</h1>
        <p className="text-sm text-muted-foreground mt-1">Review applications, manage affiliates, and configure program settings.</p>
      </div>

      <div className="flex gap-2 border-b border-border overflow-x-auto">
        {(["applications", "affiliates", "commissions", "payouts", "settings"] as Tab[]).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`px-4 py-2 text-sm capitalize border-b-2 transition whitespace-nowrap ${tab === t ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
            {t}
          </button>
        ))}
      </div>

      {tab === "applications" && <ApplicationsPanel />}
      {tab === "affiliates" && <AffiliatesPanel />}
      {tab === "commissions" && <CommissionsPanel />}
      {tab === "payouts" && <PayoutsPanel />}
      {tab === "settings" && <SettingsPanel />}
    </div>
  );
}

function ApplicationsPanel() {
  const qc = useQueryClient();
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const { data, isLoading } = useQuery({
    queryKey: ["adminApplications"],
    queryFn: async () => {
      const { data } = await supabase.from("affiliate_applications").select("*").order("created_at", { ascending: false });
      return data || [];
    },
  });

  const filtered = (data || []).filter((a) => {
    if (statusFilter !== "all" && a.status !== statusFilter) return false;
    if (!query) return true;
    const q = query.toLowerCase();
    return [a.full_name, a.email, a.brand_name].some((f) => (f || "").toLowerCase().includes(q));
  });

  const approve = async (id: string) => {
    const { error } = await supabase.rpc("approve_affiliate_application", { _application_id: id });
    if (error) return toast.error(error.message);
    toast.success("Approved & affiliate profile created");
    qc.invalidateQueries({ queryKey: ["adminApplications"] });
  };
  const reject = async (id: string, reason: string) => {
    const { error } = await supabase.rpc("reject_affiliate_application", {
      _application_id: id,
      _reason: reason.trim() || null,
    });
    if (error) return toast.error(error.message);
    toast.success("Rejected — applicant notified");
    qc.invalidateQueries({ queryKey: ["adminApplications"] });
  };
  const setStatus = async (id: string, status: "suspended" | "pending") => {
    const { error } = await supabase
      .from("affiliate_applications")
      .update({ status, reviewed_date: new Date().toISOString() })
      .eq("id", id);
    if (error) return toast.error(error.message);
    toast.success(`Marked ${status}`);
    qc.invalidateQueries({ queryKey: ["adminApplications"] });
  };
  const saveNote = async (id: string, note: string) => {
    await supabase.from("affiliate_applications").update({ admin_notes: note }).eq("id", id);
    toast.success("Note saved");
  };


  if (isLoading) return <Loader2 className="h-6 w-6 animate-spin text-primary" />;

  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name, email, brand..." className="w-full pl-9 pr-3 py-2 rounded-lg bg-secondary border border-border text-sm" />
        </div>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="px-3 py-2 rounded-lg bg-secondary border border-border text-sm">
          <option value="all">All statuses</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="suspended">Suspended</option>
        </select>
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground py-12 text-center">No applications match.</p>
      ) : (
        <div className="space-y-3">
          {filtered.map((a) => (
            <details key={a.id} className="glass-card">
              <summary className="cursor-pointer p-4 flex items-center justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-foreground">{a.full_name} <span className="text-muted-foreground text-xs">· {a.email}</span></div>
                  <div className="text-xs text-muted-foreground truncate">{a.brand_name || "—"} · {a.audience_type} · {a.audience_size}</div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full ${
                    a.status === "approved" ? "bg-success/10 text-success" :
                    a.status === "rejected" ? "bg-destructive/10 text-destructive" :
                    a.status === "suspended" ? "bg-warning/10 text-warning" :
                    "bg-primary/10 text-primary"
                  }`}>{a.status}</span>
                  <span className="text-xs text-muted-foreground">{format(new Date(a.created_at), "MMM d")}</span>
                </div>
              </summary>
              <div className="px-4 pb-4 space-y-3 border-t border-border pt-4">
                <Field label="Website" value={a.website} />
                <Field label="Promotion plan" value={a.promotion_plan} />
                <Field label="Why join" value={a.why_join} />
                <Field label="Social" value={JSON.stringify(a.social_links)} />
                <Field label="Payout" value={JSON.stringify(a.payout_details)} />
                <div>
                  <label className="text-xs text-muted-foreground">Admin notes</label>
                  <textarea defaultValue={a.admin_notes || ""} onBlur={(e) => saveNote(a.id, e.target.value)} rows={2} className="w-full mt-1 px-3 py-2 rounded-lg bg-secondary border border-border text-sm" />
                </div>
                <div className="flex gap-2 flex-wrap items-center">
                  {a.status !== "approved" && <ActionBtn icon={Check} label="Approve" onClick={() => approve(a.id)} variant="primary" />}
                  {a.status !== "rejected" && <RejectApplicationButton applicantName={a.full_name} onReject={async (reason) => { await reject(a.id, reason); }} />}
                  {a.status === "approved" && (
                    <ConfirmDestructive
                      title="Suspend this affiliate application?"
                      description={<>Suspending pauses <strong>{a.full_name}</strong>'s participation. Existing referrals stay attributed, but new activity stops until reactivated.</>}
                      confirmLabel="Suspend"
                      onConfirm={async () => { await setStatus(a.id, "suspended"); }}
                    >
                      <ActionBtn icon={Pause} label="Suspend" />
                    </ConfirmDestructive>
                  )}
                  {a.status === "suspended" && <ActionBtn icon={Play} label="Reactivate" onClick={() => setStatus(a.id, "pending")} />}
                </div>

              </div>
            </details>
          ))}
        </div>
      )}
    </div>
  );
}

function AffiliatesPanel() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["adminAffiliates"],
    queryFn: async () => {
      const { data } = await supabase.from("affiliate_profiles").select("*").order("approval_date", { ascending: false });
      return data || [];
    },
  });
  if (isLoading) return <Loader2 className="h-6 w-6 animate-spin text-primary" />;

  const updateRate = async (id: string, rate: string) => {
    const num = rate.trim() === "" ? null : Number(rate);
    await supabase.from("affiliate_profiles").update({ custom_commission_rate: num }).eq("id", id);
    toast.success("Rate updated");
    qc.invalidateQueries({ queryKey: ["adminAffiliates"] });
  };
  const updateStatus = async (id: string, status: string) => {
    await supabase.from("affiliate_profiles").update({ status: status as "active" | "suspended" | "revoked" }).eq("id", id);
    toast.success("Status updated");
    qc.invalidateQueries({ queryKey: ["adminAffiliates"] });
  };

  return (
    <div className="glass-card overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left text-xs text-muted-foreground">
          <tr><th className="p-3">Code</th><th>Status</th><th>Custom rate</th><th>Approved</th><th></th></tr>
        </thead>
        <tbody>
          {data!.map((p) => (
            <tr key={p.id} className="border-t border-border">
              <td className="p-3 font-mono text-foreground">{p.affiliate_code}</td>
              <td>
                <select defaultValue={p.status} onChange={(e) => updateStatus(p.id, e.target.value)} className="px-2 py-1 rounded bg-secondary border border-border text-xs">
                  <option value="active">active</option>
                  <option value="suspended">suspended</option>
                  <option value="revoked">revoked</option>
                </select>
              </td>
              <td>
                <input defaultValue={p.custom_commission_rate ?? ""} onBlur={(e) => updateRate(p.id, e.target.value)} placeholder="(default)" className="w-24 px-2 py-1 rounded bg-secondary border border-border text-xs" />
              </td>
              <td className="text-xs text-muted-foreground">{format(new Date(p.approval_date), "MMM d, yyyy")}</td>
              <td></td>
            </tr>
          ))}
          {data!.length === 0 && <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">No affiliates yet.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

function CommissionsPanel() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["adminCommissions"],
    queryFn: async () => {
      const { data } = await supabase.from("affiliate_commissions").select("*, affiliate_profiles(affiliate_code)").order("created_date", { ascending: false }).limit(200);
      return data || [];
    },
  });
  if (isLoading) return <Loader2 className="h-6 w-6 animate-spin text-primary" />;

  const setStatus = async (id: string, status: string) => {
    const patch: Record<string, unknown> = { status };
    if (status === "approved") patch.approved_date = new Date().toISOString();
    if (status === "paid") patch.paid_date = new Date().toISOString();
    if (status === "reversed") patch.reversed_date = new Date().toISOString();
    await supabase.from("affiliate_commissions").update(patch).eq("id", id);
    toast.success(`Marked ${status}`);
    qc.invalidateQueries({ queryKey: ["adminCommissions"] });
  };

  return (
    <div className="glass-card overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left text-xs text-muted-foreground">
          <tr><th className="p-3">Date</th><th>Affiliate</th><th>Amount</th><th>Source</th><th>Status</th><th>Actions</th></tr>
        </thead>
        <tbody>
          {data!.map((c: any) => (
            <tr key={c.id} className="border-t border-border">
              <td className="p-3 text-xs">{format(new Date(c.created_date), "MMM d, yyyy")}</td>
              <td className="font-mono text-xs">{c.affiliate_profiles?.affiliate_code}</td>
              <td>${Number(c.commission_amount).toFixed(2)}</td>
              <td className="text-xs text-muted-foreground">${Number(c.source_amount || 0).toFixed(2)}</td>
              <td><span className="text-xs">{c.status}</span></td>
              <td className="space-x-1">
                {c.status === "pending" && <button onClick={() => setStatus(c.id, "approved")} className="text-xs text-primary hover:underline">Approve</button>}
                {c.status === "approved" && <button onClick={() => setStatus(c.id, "paid")} className="text-xs text-success hover:underline">Mark paid</button>}
                {(c.status === "pending" || c.status === "approved") && <button onClick={() => setStatus(c.id, "reversed")} className="text-xs text-destructive hover:underline">Reverse</button>}
              </td>
            </tr>
          ))}
          {data!.length === 0 && <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">No commissions yet.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

function SettingsPanel() {
  const qc = useQueryClient();
  const { data: settings, isLoading } = useAffiliateSettings();
  const [saving, setSaving] = useState(false);

  if (isLoading || !settings) return <Loader2 className="h-6 w-6 animate-spin text-primary" />;

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSaving(true);
    const fd = new FormData(e.currentTarget);
    const { error } = await supabase.from("affiliate_settings").update({
      program_enabled: fd.get("program_enabled") === "on",
      auto_approve: fd.get("auto_approve") === "on",
      last_touch_attribution_enabled: fd.get("last_touch") === "on",
      cookie_duration_days: Number(fd.get("cookie_duration_days")),
      default_commission_type: String(fd.get("default_commission_type")) as "percentage" | "flat",
      default_commission_rate: Number(fd.get("default_commission_rate")),
      minimum_payout_threshold: Number(fd.get("minimum_payout_threshold")),
      payout_instructions: String(fd.get("payout_instructions")),
      affiliate_terms: String(fd.get("affiliate_terms")),
    }).eq("id", 1);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Settings saved");
    qc.invalidateQueries({ queryKey: ["affiliateSettings"] });
  };

  const inputCls = "w-full px-3 py-2 rounded-lg bg-secondary border border-border text-sm";
  const labelCls = "text-xs font-medium text-foreground block mb-1.5";

  return (
    <form onSubmit={handleSubmit} className="glass-card p-6 space-y-5">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="program_enabled" defaultChecked={settings.program_enabled} /> Program enabled</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="auto_approve" defaultChecked={settings.auto_approve} /> Auto-approve new applications</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="last_touch" defaultChecked={settings.last_touch_attribution_enabled} /> Last-touch attribution</label>
        <div><label className={labelCls}>Cookie duration (days)</label><input name="cookie_duration_days" type="number" defaultValue={settings.cookie_duration_days} className={inputCls} /></div>
        <div>
          <label className={labelCls}>Default commission type</label>
          <select name="default_commission_type" defaultValue={settings.default_commission_type} className={inputCls}>
            <option value="percentage">Percentage</option>
            <option value="flat">Flat fee</option>
          </select>
        </div>
        <div><label className={labelCls}>Default commission rate</label><input name="default_commission_rate" type="number" step="0.01" defaultValue={Number(settings.default_commission_rate)} className={inputCls} /></div>
        <div><label className={labelCls}>Minimum payout threshold ($)</label><input name="minimum_payout_threshold" type="number" step="0.01" defaultValue={Number(settings.minimum_payout_threshold)} className={inputCls} /></div>
      </div>
      <div><label className={labelCls}>Payout instructions</label><textarea name="payout_instructions" rows={3} defaultValue={settings.payout_instructions} className={inputCls} /></div>
      <div><label className={labelCls}>Affiliate terms</label><textarea name="affiliate_terms" rows={6} defaultValue={settings.affiliate_terms} className={inputCls} /></div>
      <button disabled={saving} className="px-5 py-2 rounded-lg bg-primary text-primary-foreground font-medium hover:opacity-90 disabled:opacity-50">{saving ? "Saving…" : "Save settings"}</button>
      <p className="text-xs text-muted-foreground flex items-center gap-2"><ShieldAlert className="h-3 w-3" /> Only admins can edit these settings.</p>
    </form>
  );
}

function Field({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return <div><div className="text-xs text-muted-foreground">{label}</div><div className="text-sm text-foreground whitespace-pre-wrap">{value}</div></div>;
}
function ActionBtn({ icon: Icon, label, onClick, variant }: { icon: any; label: string; onClick?: () => void; variant?: "primary" | "destructive" }) {
  const cls = variant === "primary" ? "bg-primary text-primary-foreground" : variant === "destructive" ? "bg-destructive/10 text-destructive border border-destructive/20" : "bg-secondary text-foreground";
  return <span onClick={onClick} role="button" tabIndex={0} className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium hover:opacity-90 transition cursor-pointer ${cls}`}><Icon className="h-3.5 w-3.5" /> {label}</span>;
}

/**
 * Rejecting an application notifies the applicant and cannot be undone from
 * this screen, so it requires an explicit confirmation step with an optional
 * reason rather than a bare click.
 */
function RejectApplicationButton({
  applicantName,
  onReject,
}: {
  applicantName: string;
  onReject: (reason: string) => Promise<void>;
}) {
  const [reason, setReason] = useState("");
  return (
    <ConfirmDestructive
      title="Reject this application?"
      description={
        <>
          <strong>{applicantName}</strong> will be notified immediately that their affiliate
          application was not approved.
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            placeholder="Optional reason shown to the applicant…"
            className="w-full mt-3 px-3 py-2 rounded-lg bg-secondary border border-border text-sm text-foreground"
          />
        </>
      }
      confirmLabel="Reject application"
      onConfirm={() => onReject(reason)}
    >
      <ActionBtn icon={X} label="Reject" variant="destructive" />
    </ConfirmDestructive>
  );
}

