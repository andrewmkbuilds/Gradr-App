import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { BadgePercent, Check, Loader2, Plus, ShieldCheck, X } from "lucide-react";
import { toast } from "sonner";
import { STATUS_COPY, type VerificationStatus } from "@/config/eligibility";
import type { TablesUpdate } from "@/integrations/supabase/types";
import { adminRpc } from "@/lib/adminRpc";

type DiscountSettingsPatch = TablesUpdate<"discount_settings">;

const money = (n: number | null) => (n == null ? "—" : `$${Number(n).toFixed(2)}`);
const date = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { dateStyle: "medium" }) : "—";

function useCategories() {
  return useQuery({
    queryKey: ["admin-eligibility-categories"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("eligibility_categories")
        .select("*")
        .order("sort_order");
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** Admin console for eligibility programs, verifications and redemptions. */
export default function AdminDiscounts() {
  const queryClient = useQueryClient();
  const { data: categories } = useCategories();

  const rules = useQuery({
    queryKey: ["admin-discount-rules"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("discount_rules")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const verifications = useQuery({
    queryKey: ["admin-verifications"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("eligibility_verifications")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });

  const redemptions = useQuery({
    queryKey: ["admin-redemptions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("discount_redemptions")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });

  const settings = useQuery({
    queryKey: ["admin-discount-settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("discount_settings")
        .select("*")
        .eq("id", 1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const invalidate = (key: string) => queryClient.invalidateQueries({ queryKey: [key] });

  const toggleRule = useMutation({
    mutationFn: async (input: { id: string; active: boolean }) => {
      const { error } = await supabase
        .from("discount_rules")
        .update({ active: input.active })
        .eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: () => {
      void invalidate("admin-discount-rules");
      toast.success("Program updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const review = useMutation({
    mutationFn: async (input: { id: string; status: VerificationStatus; reason?: string }) => {
      const { error } = await adminRpc("admin_review_verification", {
        _verification_id: input.id,
        _status: input.status,
        _reason: input.reason ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void invalidate("admin-verifications");
      toast.success("Verification updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveSettings = useMutation({
    mutationFn: async (patch: DiscountSettingsPatch) => {
      const { error } = await supabase.from("discount_settings").update(patch).eq("id", 1);
      if (error) throw error;
    },
    onSuccess: () => {
      void invalidate("admin-discount-settings");
      toast.success("Settings saved");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const [draft, setDraft] = useState({
    name: "",
    eligibility_type: "student",
    percentage: "20",
    ends_at: "",
    max_redemptions: "",
    kind: "campaign" as "campaign" | "eligibility",
  });

  const createRule = useMutation({
    mutationFn: async () => {
      if (!draft.name.trim()) throw new Error("Give the program a name");
      const pct = Number(draft.percentage);
      if (!(pct > 0 && pct <= 100)) throw new Error("Percentage must be between 1 and 100");
      const { error } = await supabase.from("discount_rules").insert({
        name: draft.name.trim(),
        kind: draft.kind,
        eligibility_type: draft.eligibility_type,
        percentage: pct,
        ends_at: draft.ends_at ? new Date(draft.ends_at).toISOString() : null,
        max_redemptions: draft.max_redemptions ? Number(draft.max_redemptions) : null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void invalidate("admin-discount-rules");
      setDraft((d) => ({ ...d, name: "", ends_at: "", max_redemptions: "" }));
      toast.success("Program created");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const stats = useMemo(() => {
    const rows = redemptions.data ?? [];
    const discounted = rows.reduce((sum, r) => sum + Number(r.discount_amount ?? 0), 0);
    const net = rows.reduce((sum, r) => sum + Number(r.net_amount ?? 0), 0);
    const pending = (verifications.data ?? []).filter(
      (v) => v.status === "manual_review" || v.status === "pending",
    ).length;
    return { count: rows.length, discounted, net, pending };
  }, [redemptions.data, verifications.data]);

  return (
    <div className="max-w-6xl mx-auto space-y-6 py-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Discounts &amp; eligibility</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage verified-group pricing, campaigns and manual reviews.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-4">
        {[
          { label: "Redemptions", value: String(stats.count) },
          { label: "Discount given", value: money(stats.discounted) },
          { label: "Net revenue", value: money(stats.net) },
          { label: "Awaiting review", value: String(stats.pending) },
        ].map((s) => (
          <Card key={s.label} className="p-4">
            <p className="text-xs text-muted-foreground">{s.label}</p>
            <p className="mt-1 text-2xl font-semibold text-foreground">{s.value}</p>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="programs">
        <TabsList>
          <TabsTrigger value="programs">Programs</TabsTrigger>
          <TabsTrigger value="verifications">Verifications</TabsTrigger>
          <TabsTrigger value="redemptions">Redemptions</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="programs" className="space-y-4 pt-4">
          <Card className="p-5 space-y-4">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Plus className="h-4 w-4 text-primary" aria-hidden="true" /> New program or campaign
            </h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div className="grid gap-1.5">
                <Label htmlFor="rule-name">Name</Label>
                <Input
                  id="rule-name"
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  placeholder="Back to school 2026"
                />
              </div>
              <div className="grid gap-1.5">
                <Label>Eligibility category</Label>
                <Select
                  value={draft.eligibility_type}
                  onValueChange={(v) => setDraft({ ...draft, eligibility_type: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(categories ?? []).map((c) => (
                      <SelectItem key={c.key} value={c.key}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="rule-pct">Discount %</Label>
                <Input
                  id="rule-pct"
                  type="number"
                  min={1}
                  max={100}
                  value={draft.percentage}
                  onChange={(e) => setDraft({ ...draft, percentage: e.target.value })}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="rule-end">Ends (optional)</Label>
                <Input
                  id="rule-end"
                  type="date"
                  value={draft.ends_at}
                  onChange={(e) => setDraft({ ...draft, ends_at: e.target.value })}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="rule-max">Max redemptions (optional)</Label>
                <Input
                  id="rule-max"
                  type="number"
                  min={1}
                  value={draft.max_redemptions}
                  onChange={(e) => setDraft({ ...draft, max_redemptions: e.target.value })}
                />
              </div>
              <div className="flex items-end">
                <Button
                  className="w-full gap-2"
                  onClick={() => createRule.mutate()}
                  disabled={createRule.isPending}
                >
                  {createRule.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <BadgePercent className="h-4 w-4" aria-hidden="true" />
                  )}
                  Create program
                </Button>
              </div>
            </div>
          </Card>

          {rules.isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : (
            <div className="space-y-2">
              {(rules.data ?? []).map((r) => (
                <Card key={r.id} className="flex flex-wrap items-center gap-3 p-4">
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 text-sm font-medium text-foreground">
                      {r.name}
                      <Badge variant="secondary">{Number(r.percentage)}%</Badge>
                      <Badge variant="outline">{r.kind}</Badge>
                      {r.eligibility_type && (
                        <Badge variant="outline">{r.eligibility_type}</Badge>
                      )}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {r.redemption_count} redeemed
                      {r.max_redemptions ? ` of ${r.max_redemptions}` : ""} · ends {date(r.ends_at)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">
                      {r.active ? "Active" : "Disabled"}
                    </span>
                    <Switch
                      checked={Boolean(r.active)}
                      aria-label={`Toggle ${r.name}`}
                      onCheckedChange={(checked) =>
                        toggleRule.mutate({ id: r.id as string, active: checked })
                      }
                    />
                  </div>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="verifications" className="space-y-2 pt-4">
          {verifications.isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : (verifications.data ?? []).length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">No verifications yet.</p>
          ) : (
            (verifications.data ?? []).map((v) => {
              const copy = STATUS_COPY[v.status as VerificationStatus] ?? STATUS_COPY.pending;
              return (
                <Card key={v.id} className="flex flex-wrap items-center gap-3 p-4">
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 text-sm font-medium text-foreground">
                      {v.eligibility_type}
                      <Badge variant="outline" className={copy.tone}>
                        {copy.label}
                      </Badge>
                      <Badge variant="outline">{v.provider}</Badge>
                    </p>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      user {String(v.user_id).slice(0, 8)}… · started {date(v.created_at)} ·
                      expires {date(v.expires_at)}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1"
                      disabled={review.isPending}
                      onClick={() =>
                        review.mutate({ id: v.id as string, status: "verified" })
                      }
                    >
                      <Check className="h-3.5 w-3.5" aria-hidden="true" /> Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1"
                      disabled={review.isPending}
                      onClick={() =>
                        review.mutate({
                          id: v.id as string,
                          status: v.status === "verified" ? "revoked" : "failed",
                          reason: "Reviewed by an administrator",
                        })
                      }
                    >
                      <X className="h-3.5 w-3.5" aria-hidden="true" />
                      {v.status === "verified" ? "Revoke" : "Reject"}
                    </Button>
                  </div>
                </Card>
              );
            })
          )}
        </TabsContent>

        <TabsContent value="redemptions" className="pt-4">
          {redemptions.isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs text-muted-foreground">
                  <tr>
                    {["Date", "Category", "Plan", "%", "Gross", "Discount", "Net"].map((h) => (
                      <th key={h} className="px-3 py-2 text-left font-medium">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(redemptions.data ?? []).map((r) => (
                    <tr key={r.id} className="border-t border-border">
                      <td className="px-3 py-2">{date(r.created_at)}</td>
                      <td className="px-3 py-2">{r.eligibility_type ?? "—"}</td>
                      <td className="px-3 py-2">
                        {r.plan ?? "—"} {r.interval ? `· ${r.interval}` : ""}
                      </td>
                      <td className="px-3 py-2">{Number(r.percentage)}%</td>
                      <td className="px-3 py-2">{money(r.gross_amount)}</td>
                      <td className="px-3 py-2">{money(r.discount_amount)}</td>
                      <td className="px-3 py-2">{money(r.net_amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="settings" className="pt-4">
          <Card className="space-y-4 p-5">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <ShieldCheck className="h-4 w-4 text-primary" aria-hidden="true" /> Global rules
            </h2>
            {settings.isLoading || !settings.data ? (
              <Skeleton className="h-24 w-full" />
            ) : (
              <>
                <label className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
                  <span>
                    <span className="block text-sm font-medium text-foreground">
                      Allow discounts to stack
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      Off means the single largest eligible discount always wins.
                    </span>
                  </span>
                  <Switch
                    checked={Boolean(settings.data.allow_stacking)}
                    onCheckedChange={(checked) =>
                      saveSettings.mutate({ allow_stacking: checked })
                    }
                  />
                </label>

                <div className="rounded-lg border border-border p-3 space-y-2">
                  <p className="text-sm font-medium text-foreground">Affiliate commission basis</p>
                  <p className="text-xs text-muted-foreground">
                    Pay partners on the discounted amount the customer paid, or on the list price.
                  </p>
                  <Select
                    value={String(settings.data.affiliate_commission_basis ?? "net")}
                    onValueChange={(v) => saveSettings.mutate({ affiliate_commission_basis: v })}
                  >
                    <SelectTrigger className="max-w-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="net">Net — after discount</SelectItem>
                      <SelectItem value="gross">Gross — before discount</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {(
                  [
                    ["notify_verified", "Email when a verification is approved"],
                    ["notify_failed", "Email when a verification fails"],
                    ["notify_expiring", "Remind before a verification expires"],
                    ["notify_expired", "Email when a verification expires"],
                  ] as const
                ).map(([key, label]) => (
                  <label
                    key={key}
                    className="flex items-center justify-between gap-3 rounded-lg border border-border p-3"
                  >
                    <span className="text-sm text-foreground">{label}</span>
                    <Switch
                      checked={Boolean(settings.data?.[key])}
                      onCheckedChange={(checked) => saveSettings.mutate({ [key]: checked })}
                    />
                  </label>
                ))}
              </>
            )}
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
