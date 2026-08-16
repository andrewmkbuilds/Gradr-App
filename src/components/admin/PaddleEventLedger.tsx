import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, ChevronDown, RefreshCw } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * Provider event ledger with the *write results* the handler produced.
 *
 * The signature log answers "did the request arrive and verify"; this answers
 * the question that actually matters during a billing incident: "did this
 * event move the user's entitlement and credits?". Each row is matched back to
 * the subscriber and purchase rows written for the same provider ids.
 */

interface Delivery {
  id: string;
  provider: string;
  environment: string | null;
  event_type: string | null;
  event_id: string | null;
  state: string | null;
  attempts: number | null;
  last_error: string | null;
  signature_verified: boolean | null;
  payload: unknown;
  created_at: string;
  processed_at: string | null;
}

interface Subscriber {
  user_id: string;
  subscription_tier: string | null;
  subscription_status: string | null;
  subscribed: boolean | null;
  updated_at: string | null;
}

interface Purchase {
  id: string;
  user_id: string;
  pack_key: string | null;
  pack_label: string | null;
  credits_granted: number | null;
  status: string | null;
  stripe_session_id: string | null;
}

/** Pull the provider ids a delivery payload refers to, whatever its shape. */
function payloadIds(payload: unknown): { transactionId?: string; subscriptionId?: string; userId?: string } {
  const data = (payload as { data?: Record<string, unknown> })?.data ?? (payload as Record<string, unknown>);
  if (!data || typeof data !== "object") return {};
  const id = typeof data.id === "string" ? data.id : undefined;
  const subscriptionId = typeof (data as { subscription_id?: string }).subscription_id === "string"
    ? (data as { subscription_id?: string }).subscription_id
    : typeof (data as { subscriptionId?: string }).subscriptionId === "string"
      ? (data as { subscriptionId?: string }).subscriptionId
      : id?.startsWith("sub_") ? id : undefined;
  const transactionId = id?.startsWith("txn_") ? id : undefined;
  const custom = (data as { custom_data?: Record<string, unknown>; customData?: Record<string, unknown> });
  const rawUser = (custom.custom_data ?? custom.customData ?? {}) as { user_id?: unknown; userId?: unknown };
  const candidate = rawUser.user_id ?? rawUser.userId;
  const userId = typeof candidate === "string" ? candidate : undefined;
  return { transactionId, subscriptionId, userId };
}

function StateBadge({ state }: { state: string | null }) {
  if (state === "processed" || state === "succeeded") return <Badge variant="secondary">{state}</Badge>;
  if (!state || state === "received" || state === "pending") return <Badge variant="outline">{state ?? "received"}</Badge>;
  return <Badge variant="destructive">{state}</Badge>;
}

export function PaddleEventLedger() {
  const [expanded, setExpanded] = useState<string | null>(null);

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["admin-paddle-event-ledger"],
    queryFn: async () => {
      const { data: deliveries, error } = await supabase
        .from("webhook_deliveries")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;

      const rows = (deliveries ?? []) as unknown as Delivery[];
      const userIds = [...new Set(rows.map((r) => payloadIds(r.payload).userId).filter(Boolean))] as string[];
      const txnIds = [...new Set(rows.map((r) => payloadIds(r.payload).transactionId).filter(Boolean))] as string[];

      const [subs, purchases, credits] = await Promise.all([
        userIds.length
          ? supabase.from("subscribers")
              .select("user_id, subscription_tier, subscription_status, subscribed, updated_at")
              .in("user_id", userIds)
          : Promise.resolve({ data: [] as Subscriber[] }),
        txnIds.length
          ? supabase.from("purchases")
              .select("id, user_id, pack_key, pack_label, credits_granted, status, stripe_session_id")
              .in("stripe_session_id", txnIds)
          : Promise.resolve({ data: [] as Purchase[] }),
        userIds.length
          ? supabase.from("usage_credits")
              .select("user_id, application_credits, interview_credits, updated_at")
              .in("user_id", userIds)
          : Promise.resolve({ data: [] as Record<string, unknown>[] }),
      ]);

      return {
        rows,
        subs: (subs.data ?? []) as unknown as Subscriber[],
        purchases: (purchases.data ?? []) as unknown as Purchase[],
        credits: (credits.data ?? []) as unknown as {
          user_id: string; application_credits: number; interview_credits: number;
        }[],
      };
    },
  });

  const summary = useMemo(() => {
    const rows = data?.rows ?? [];
    const failed = rows.filter((r) => r.last_error || r.state === "failed").length;
    const noWrite = rows.filter((r) => !payloadIds(r.payload).userId).length;
    return { total: rows.length, failed, noWrite };
  }, [data]);

  return (
    <Card className="p-6 space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Provider event ledger</h2>
          <p className="text-xs text-muted-foreground">
            Each event with the entitlement and credit rows it wrote. {summary.total} events ·{" "}
            {summary.failed} failed · {summary.noWrite} unattributed to a user.
          </p>
        </div>
        <Button variant="outline" size="sm" className="gap-2" onClick={() => void refetch()} disabled={isFetching}>
          <RefreshCw className={cn("h-4 w-4", isFetching && "animate-spin")} />
          Refresh
        </Button>
      </div>

      {isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : (data?.rows.length ?? 0) === 0 ? (
        <p className="text-sm text-muted-foreground">No provider events recorded yet.</p>
      ) : (
        <div className="divide-y divide-border">
          {data!.rows.map((row) => {
            const ids = payloadIds(row.payload);
            const sub = data!.subs.find((s) => s.user_id === ids.userId);
            const purchase = data!.purchases.find((p) => p.stripe_session_id === ids.transactionId);
            const credit = data!.credits.find((c) => c.user_id === ids.userId);
            const open = expanded === row.id;
            const bad = Boolean(row.last_error) || row.state === "failed";

            return (
              <div key={row.id} className="py-3 space-y-2 text-sm">
                <button
                  type="button"
                  className="w-full flex items-start justify-between gap-3 text-left"
                  onClick={() => setExpanded(open ? null : row.id)}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      {bad
                        ? <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
                        : <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />}
                      <span className="text-foreground font-medium truncate">{row.event_type ?? "unknown event"}</span>
                      <StateBadge state={row.state} />
                      {row.environment && <Badge variant="outline">{row.environment}</Badge>}
                      {(row.attempts ?? 0) > 1 && <Badge variant="outline">{row.attempts} attempts</Badge>}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1 truncate">
                      {formatDistanceToNow(new Date(row.created_at), { addSuffix: true })}
                      {row.event_id ? ` · ${row.event_id}` : ""}
                      {ids.userId ? ` · user ${ids.userId.slice(0, 8)}` : " · no user matched"}
                    </div>
                  </div>
                  <ChevronDown className={cn("h-4 w-4 text-muted-foreground shrink-0 transition-transform", open && "rotate-180")} />
                </button>

                <div className="flex flex-wrap gap-2 text-xs">
                  <Badge variant={sub ? "secondary" : "outline"}>
                    Entitlement: {sub ? `${sub.subscription_tier ?? "free"} · ${sub.subscription_status ?? "none"}` : "no row"}
                  </Badge>
                  <Badge variant={purchase ? "secondary" : "outline"}>
                    Purchase: {purchase ? `${purchase.pack_label ?? purchase.pack_key} · +${purchase.credits_granted ?? 0}` : "none"}
                  </Badge>
                  <Badge variant={credit ? "secondary" : "outline"}>
                    Credits now: {credit ? `${credit.application_credits} app · ${credit.interview_credits} interview` : "no row"}
                  </Badge>
                </div>

                {row.last_error && <p className="text-xs text-destructive break-words">{row.last_error}</p>}

                {open && (
                  <pre className="max-h-72 overflow-auto rounded-md bg-muted/50 p-3 text-[11px] leading-relaxed text-muted-foreground">
                    {JSON.stringify(row.payload, null, 2)}
                  </pre>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
