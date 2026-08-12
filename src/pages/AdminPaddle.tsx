import { useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Loader2,
  CreditCard,
  Users,
  RefreshCw,
  Search,
  ChevronRight,
  Receipt,
  AlertTriangle,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { downloadCsv } from "@/lib/exportFile";
import { format, formatDistanceToNow } from "date-fns";

interface PaddleCustomer {
  customer_id: string;
  email: string;
  environment: string;
  user_id: string | null;
  created_at: string;
  updated_at: string;
}

interface PaddleSubscription {
  subscription_id: string;
  customer_id: string;
  user_id: string | null;
  status: string;
  price_id: string;
  product_id: string;
  environment: string;
  current_period_end: string | null;
  scheduled_change_action: string | null;
  scheduled_change_at: string | null;
  updated_at: string;
}

interface WebhookEvent {
  id: string;
  event: string;
  decision: string;
  reason: string | null;
  environment: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
}

const STATUS_STYLE: Record<string, string> = {
  active: "bg-success/10 text-success",
  trialing: "bg-primary/10 text-primary",
  past_due: "bg-warning/10 text-warning",
  paused: "bg-warning/10 text-warning",
  canceled: "bg-destructive/10 text-destructive",
};

/** Price IDs carry the plan key, e.g. `pro_annual`. */
function planFromPriceId(priceId: string) {
  const key = priceId.split("_")[0]?.toLowerCase();
  return ["starter", "pro", "advanced"].includes(key) ? key : "—";
}

export default function AdminPaddle() {
  const { user, loading: authLoading } = useAuth();
  const [env, setEnv] = useState<"all" | "sandbox" | "live">("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<PaddleCustomer | null>(null);

  const { data: isAdmin, isLoading: roleLoading } = useQuery({
    queryKey: ["is-admin", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase.rpc("is_admin");
      return Boolean(data);
    },
  });

  const customersQuery = useQuery({
    queryKey: ["admin-paddle-customers", env],
    enabled: Boolean(isAdmin),
    queryFn: async (): Promise<PaddleCustomer[]> => {
      let q = supabase
        .from("paddle_customers")
        .select("customer_id, email, environment, user_id, created_at, updated_at")
        .order("created_at", { ascending: false })
        .limit(500);
      if (env !== "all") q = q.eq("environment", env);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as PaddleCustomer[];
    },
  });

  const subsQuery = useQuery({
    queryKey: ["admin-paddle-subscriptions", env],
    enabled: Boolean(isAdmin),
    queryFn: async (): Promise<PaddleSubscription[]> => {
      let q = supabase
        .from("paddle_subscriptions")
        .select(
          "subscription_id, customer_id, user_id, status, price_id, product_id, environment, current_period_end, scheduled_change_action, scheduled_change_at, updated_at",
        )
        .order("updated_at", { ascending: false })
        .limit(1000);
      if (env !== "all") q = q.eq("environment", env);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as PaddleSubscription[];
    },
  });

  // Recent billing webhook events for the selected customer's user.
  const eventsQuery = useQuery({
    queryKey: ["admin-paddle-events", selected?.customer_id, selected?.user_id],
    enabled: Boolean(isAdmin && selected),
    queryFn: async (): Promise<WebhookEvent[]> => {
      const base = (supabase as never as typeof supabase)
        .from("security_audit_log" as never)
        .select("id, event, decision, reason, environment, details, created_at")
        .eq("category", "billing_webhook")
        .order("created_at", { ascending: false })
        .limit(50);
      const q = selected!.user_id
        ? base.eq("user_id", selected!.user_id)
        : base.contains("details", { customer_id: selected!.customer_id });
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as WebhookEvent[];
    },
  });

  const subsByCustomer = useMemo(() => {
    const map = new Map<string, PaddleSubscription[]>();
    for (const s of subsQuery.data ?? []) {
      map.set(s.customer_id, [...(map.get(s.customer_id) ?? []), s]);
    }
    return map;
  }, [subsQuery.data]);

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (customersQuery.data ?? []).filter((c) => {
      if (!term) return true;
      const subs = subsByCustomer.get(c.customer_id) ?? [];
      return (
        c.email.toLowerCase().includes(term) ||
        c.customer_id.toLowerCase().includes(term) ||
        (c.user_id ?? "").toLowerCase().includes(term) ||
        subs.some((s) => s.subscription_id.toLowerCase().includes(term))
      );
    });
  }, [customersQuery.data, subsByCustomer, search]);

  if (authLoading || roleLoading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }
  if (!isAdmin) return <Navigate to="/" replace />;

  const allSubs = subsQuery.data ?? [];
  const activeCount = allSubs.filter((s) => ["active", "trialing"].includes(s.status)).length;
  const dunningCount = allSubs.filter((s) => ["past_due", "paused"].includes(s.status)).length;
  const loading = customersQuery.isLoading || subsQuery.isLoading;
  const selectedSubs = selected ? subsByCustomer.get(selected.customer_id) ?? [] : [];

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Paddle customers</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Local mirror of Paddle customers and subscriptions, kept in sync by the billing webhook. Open a
            customer to see their most recent webhook events.
          </p>
          <a href="/admin/payments-status" className="mt-1 inline-block text-sm text-primary underline">
            Check payments configuration status
          </a>
        </div>

        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => {
              customersQuery.refetch();
              subsQuery.refetch();
            }}
          >
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              downloadCsv(
                `paddle-customers_${format(new Date(), "yyyy-MM-dd")}.csv`,
                rows.map((c) => {
                  const s = (subsByCustomer.get(c.customer_id) ?? [])[0];
                  return {
                    email: c.email,
                    customer_id: c.customer_id,
                    user_id: c.user_id ?? "",
                    environment: c.environment,
                    subscription_id: s?.subscription_id ?? "",
                    status: s?.status ?? "",
                    plan: s ? planFromPriceId(s.price_id) : "",
                    current_period_end: s?.current_period_end ?? "",
                    created_at: c.created_at,
                  };
                }),
                [
                  "email",
                  "customer_id",
                  "user_id",
                  "environment",
                  "subscription_id",
                  "status",
                  "plan",
                  "current_period_end",
                  "created_at",
                ],
              )
            }
          >
            Export CSV
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Tile label="Customers" value={(customersQuery.data ?? []).length} icon={Users} />
        <Tile label="Active subscriptions" value={activeCount} icon={CreditCard} />
        <Tile label="Past due / paused" value={dunningCount} icon={AlertTriangle} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-56">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search email, customer, subscription or user ID"
            className="pl-9"
            aria-label="Search customers"
          />
        </div>
        <select
          value={env}
          onChange={(e) => setEnv(e.target.value as typeof env)}
          className="px-3 py-2 rounded-lg bg-secondary border border-border text-sm text-foreground"
          aria-label="Environment"
        >
          <option value="all">All environments</option>
          <option value="sandbox">Sandbox</option>
          <option value="live">Live</option>
        </select>
      </div>

      <div className="glass-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="p-3">Customer</th>
              <th>Env</th>
              <th>Subscription</th>
              <th>Plan</th>
              <th>Status</th>
              <th>Renews</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="p-10 text-center">
                  <Loader2 className="h-5 w-5 animate-spin text-primary inline" />
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-12 text-center text-muted-foreground">
                  <Receipt className="h-6 w-6 mx-auto mb-2 opacity-50" />
                  No mirrored customers yet. They appear after the first Paddle webhook.
                </td>
              </tr>
            ) : (
              rows.map((c) => {
                const subs = subsByCustomer.get(c.customer_id) ?? [];
                const s = subs[0];
                return (
                  <tr
                    key={`${c.environment}-${c.customer_id}`}
                    className="border-t border-border/60 hover:bg-secondary/40 cursor-pointer"
                    onClick={() => setSelected(c)}
                  >
                    <td className="p-3">
                      <span className="block text-foreground">{c.email}</span>
                      <span className="block font-mono text-[11px] text-muted-foreground">{c.customer_id}</span>
                    </td>
                    <td>
                      <Badge variant="secondary" className="text-[10px] capitalize">
                        {c.environment}
                      </Badge>
                    </td>
                    <td className="font-mono text-[11px] text-muted-foreground">
                      {s?.subscription_id ?? "—"}
                      {subs.length > 1 && (
                        <span className="ml-1 text-muted-foreground">+{subs.length - 1}</span>
                      )}
                    </td>
                    <td className="capitalize text-muted-foreground">{s ? planFromPriceId(s.price_id) : "—"}</td>
                    <td>
                      {s ? (
                        <span
                          className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                            STATUS_STYLE[s.status] ?? "bg-muted text-muted-foreground"
                          }`}
                        >
                          {s.status}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">no subscription</span>
                      )}
                    </td>
                    <td className="text-muted-foreground whitespace-nowrap">
                      {s?.current_period_end ? format(new Date(s.current_period_end), "d MMM yyyy") : "—"}
                    </td>
                    <td className="pr-3 text-right">
                      <ChevronRight className="h-4 w-4 text-muted-foreground inline" />
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <Sheet open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="break-all">{selected?.email}</SheetTitle>
            <SheetDescription className="font-mono text-xs break-all">
              {selected?.customer_id} · {selected?.environment}
              {selected?.user_id ? ` · user ${selected.user_id}` : " · not linked to an account"}
            </SheetDescription>
          </SheetHeader>

          <div className="mt-6 space-y-6">
            <section className="space-y-2">
              <h3 className="text-sm font-semibold text-foreground">Subscriptions</h3>
              {selectedSubs.length === 0 ? (
                <p className="text-sm text-muted-foreground">No subscriptions mirrored for this customer.</p>
              ) : (
                selectedSubs.map((s) => (
                  <div key={s.subscription_id} className="rounded-lg border border-border p-3 space-y-1 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono break-all">{s.subscription_id}</span>
                      <span
                        className={`rounded-full px-2 py-0.5 font-medium ${
                          STATUS_STYLE[s.status] ?? "bg-muted text-muted-foreground"
                        }`}
                      >
                        {s.status}
                      </span>
                    </div>
                    <p className="text-muted-foreground capitalize">
                      Plan {planFromPriceId(s.price_id)} · price {s.price_id}
                    </p>
                    <p className="text-muted-foreground">
                      Renews{" "}
                      {s.current_period_end
                        ? format(new Date(s.current_period_end), "d MMM yyyy, HH:mm")
                        : "—"}
                    </p>
                    {s.scheduled_change_action && (
                      <p className="text-warning">
                        Scheduled {s.scheduled_change_action}
                        {s.scheduled_change_at
                          ? ` on ${format(new Date(s.scheduled_change_at), "d MMM yyyy")}`
                          : ""}
                      </p>
                    )}
                  </div>
                ))
              )}
            </section>

            <section className="space-y-2">
              <h3 className="text-sm font-semibold text-foreground">Recent webhook events</h3>
              {eventsQuery.isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
              ) : (eventsQuery.data ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No billing webhook events recorded for this customer yet.
                </p>
              ) : (
                <ul className="space-y-2">
                  {(eventsQuery.data ?? []).map((e) => (
                    <li key={e.id} className="rounded-lg border border-border p-3 text-xs space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-foreground break-all">{e.event}</span>
                        <span className="text-muted-foreground whitespace-nowrap">
                          {formatDistanceToNow(new Date(e.created_at), { addSuffix: true })}
                        </span>
                      </div>
                      <p className="text-muted-foreground">
                        {e.decision}
                        {e.environment ? ` · ${e.environment}` : ""}
                        {e.reason ? ` · ${e.reason}` : ""}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </SheetContent>
      </Sheet>
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
