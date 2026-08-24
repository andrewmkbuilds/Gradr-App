import { Button } from "@/components/ds/Button";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { format } from "date-fns";
import { Loader2, Plus, CheckCircle2, X } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";

type Payout = {
  id: string;
  affiliate_profile_id: string;
  amount: number;
  payout_method: string | null;
  reference: string | null;
  status: string;
  payout_date: string | null;
  created_at: string;
  notes: string | null;
};

const PAYOUT_METHODS = ["paypal", "bank_transfer", "wise", "other"] as const;

export function PayoutsPanel() {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const { data: payouts, isLoading } = useQuery({
    queryKey: ["adminPayouts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("affiliate_payouts")
        .select("*, affiliate_profiles(affiliate_code, payout_email)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const filtered = (payouts || []).filter((p) => statusFilter === "all" || p.status === statusFilter);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex gap-2 flex-wrap">
          {["all", "pending", "processing", "paid", "failed"].map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 text-xs rounded-lg capitalize transition ${
                statusFilter === s
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-muted-foreground hover:text-foreground"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
        <CreatePayoutDialog />
      </div>

      <div className="elev-2 rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="p-3">Affiliate</th>
              <th>Amount</th>
              <th>Method</th>
              <th>Reference</th>
              <th>Status</th>
              <th>Created</th>
              <th>Paid</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={8} className="p-8 text-center"><Loader2 className="h-5 w-5 animate-spin text-primary inline" /></td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={8} className="p-10 text-center text-muted-foreground">No payouts match.</td></tr>
            ) : (
              filtered.map((p: any) => (
                <tr key={p.id} className="border-t border-border">
                  <td className="p-3">
                    <div className="font-mono text-xs">{p.affiliate_profiles?.affiliate_code}</div>
                    <div className="text-[11px] text-muted-foreground">{p.affiliate_profiles?.payout_email}</div>
                  </td>
                  <td className="font-medium">${Number(p.amount).toFixed(2)}</td>
                  <td className="capitalize text-xs">{(p.payout_method || "—").replace("_", " ")}</td>
                  <td><code className="text-[11px] text-muted-foreground">{p.reference || "—"}</code></td>
                  <td>
                    <span className={`text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full ${
                      p.status === "paid" ? "bg-success/10 text-success"
                        : p.status === "failed" ? "bg-destructive/10 text-destructive"
                        : "bg-warning/10 text-warning"
                    }`}>{p.status}</span>
                  </td>
                  <td className="text-xs text-muted-foreground">{format(new Date(p.created_at), "MMM d, yyyy")}</td>
                  <td className="text-xs text-muted-foreground">{p.payout_date ? format(new Date(p.payout_date), "MMM d") : "—"}</td>
                  <td>{p.status !== "paid" && <MarkPaidButton payout={p as Payout} />}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CreatePayoutDialog() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [affiliateId, setAffiliateId] = useState("");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<string>("paypal");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [includeUnpaid, setIncludeUnpaid] = useState(true);

  const { data: affiliates } = useQuery({
    queryKey: ["adminAffiliatesList"],
    queryFn: async () => {
      const { data } = await supabase
        .from("affiliate_profiles")
        .select("id, affiliate_code, payout_email, status")
        .eq("status", "active")
        .order("affiliate_code");
      return data || [];
    },
  });

  const { data: unpaidCommissions } = useQuery({
    queryKey: ["unpaidCommissions", affiliateId],
    enabled: !!affiliateId,
    queryFn: async () => {
      const { data } = await supabase
        .from("affiliate_commissions")
        .select("id, commission_amount, status, created_date")
        .eq("affiliate_profile_id", affiliateId)
        .in("status", ["pending", "approved"])
        .is("affiliate_payout_id", null)
        .order("created_date", { ascending: false });
      return data || [];
    },
  });

  const suggestedTotal = useMemo(
    () => (unpaidCommissions || []).reduce((a, c) => a + Number(c.commission_amount), 0),
    [unpaidCommissions]
  );

  const create = useMutation({
    mutationFn: async () => {
      if (!affiliateId) throw new Error("Choose an affiliate");
      const amt = Number(amount);
      if (!amt || amt <= 0) throw new Error("Enter a positive amount");
      const { data, error } = await supabase.rpc("admin_create_payout", {
        _affiliate_profile_id: affiliateId,
        _amount: amt,
        _payout_method: method,
        _reference: reference || undefined,
        _notes: notes || undefined,
        _commission_ids: includeUnpaid ? (unpaidCommissions || []).map((c) => c.id) : undefined,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Payout created");
      setOpen(false);
      setAffiliateId(""); setAmount(""); setReference(""); setNotes("");
      qc.invalidateQueries({ queryKey: ["adminPayouts"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const inputCls = "w-full px-3 py-2 rounded-lg bg-secondary border border-border text-sm";
  const labelCls = "text-xs font-medium text-foreground block mb-1.5";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm hover:opacity-90 transition">
          <Plus className="h-3.5 w-3.5" /> Create payout
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Create payout</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <label className={labelCls}>Affiliate *</label>
            <select value={affiliateId} onChange={(e) => setAffiliateId(e.target.value)} className={inputCls}>
              <option value="">Select an affiliate…</option>
              {(affiliates || []).map((a) => (
                <option key={a.id} value={a.id}>{a.affiliate_code} — {a.payout_email}</option>
              ))}
            </select>
          </div>
          {affiliateId && (
            <div className="rounded-lg border border-border bg-background/40 p-3 space-y-2">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={includeUnpaid} onChange={(e) => setIncludeUnpaid(e.target.checked)} />
                Link {unpaidCommissions?.length ?? 0} unpaid commission
                {unpaidCommissions?.length === 1 ? "" : "s"} (${suggestedTotal.toFixed(2)})
              </label>
              {includeUnpaid && suggestedTotal > 0 && (
                <Button
                  type="button"
                  variant="link"
                  size="inline"
                  onClick={() => setAmount(suggestedTotal.toFixed(2))}
                >
                  Use suggested amount ${suggestedTotal.toFixed(2)}
                </Button>
              )}
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Amount ($) *</label>
              <input value={amount} onChange={(e) => setAmount(e.target.value)} type="number" step="0.01" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Method *</label>
              <select value={method} onChange={(e) => setMethod(e.target.value)} className={inputCls}>
                {PAYOUT_METHODS.map((m) => (
                  <option key={m} value={m} className="capitalize">{m.replace("_", " ")}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className={labelCls}>Reference (transaction ID)</label>
            <input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="TXN-12345" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Notes (internal)</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={inputCls} />
          </div>
        </div>
        <DialogFooter>
          <button onClick={() => setOpen(false)} className="px-4 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground">Cancel</button>
          <button
            onClick={() => create.mutate()}
            disabled={create.isPending}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm disabled:opacity-50"
          >
            {create.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Create payout
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MarkPaidButton({ payout }: { payout: Payout }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [reference, setReference] = useState(payout.reference || "");
  const [method, setMethod] = useState(payout.payout_method || "paypal");

  const markPaid = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("admin_mark_payout_paid", {
        _payout_id: payout.id,
        _reference: reference || undefined,
        _payout_method: method,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Marked paid — affiliate notified");
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["adminPayouts"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="link" size="inline">
          <CheckCircle2 className="h-3 w-3" aria-hidden="true" /> Mark paid
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Mark payout as paid</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="text-sm text-muted-foreground">
            Confirm ${Number(payout.amount).toFixed(2)} sent. Any linked commissions will also flip to paid, and the affiliate will get a notification.
          </div>
          <div>
            <label className="text-xs font-medium text-foreground block mb-1.5">Method</label>
            <select value={method} onChange={(e) => setMethod(e.target.value)} className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-sm">
              {PAYOUT_METHODS.map((m) => (
                <option key={m} value={m} className="capitalize">{m.replace("_", " ")}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-foreground block mb-1.5">Reference</label>
            <input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="TXN-…" className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-sm" />
          </div>
        </div>
        <DialogFooter>
          <button onClick={() => setOpen(false)} className="px-4 py-2 rounded-lg text-sm text-muted-foreground">Cancel</button>
          <button
            onClick={() => markPaid.mutate()}
            disabled={markPaid.isPending}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-success text-success-foreground text-sm disabled:opacity-50"
          >
            {markPaid.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Confirm paid
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
