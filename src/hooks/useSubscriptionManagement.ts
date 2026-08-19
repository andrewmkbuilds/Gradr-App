import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getPaddleEnvironment } from "@/lib/paddle";

export interface SubscriptionDetails {
  hasSubscription: boolean;
  tier: string | null;
  status: string | null;
  interval: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  scheduledChange: { action: string; effective_at: string } | null;
  nextBilledAt: string | null;
  nextChargeAmount: string | number | null;
  currency: string | null;
  paymentMethod: {
    type?: string;
    card?: { type?: string; last4?: string; expiry_month?: number; expiry_year?: number };
  } | null;
  pendingPlanChange: {
    target_tier: string;
    target_interval: string;
    target_price_id: string;
    effective_at: string;
  } | null;
  dunning: {
    status: string;
    attempt_count: number;
    max_attempts: number;
    next_retry_at: string | null;
    amount_due: number | null;
    currency: string | null;
    last_failure_at: string | null;
  } | null;
}

export interface InvoiceRow {
  id: string;
  invoiceNumber: string | null;
  status: string;
  amount: number;
  currency: string;
  billedAt: string;
  subscriptionId: string | null;
  description: string | null;
}

export interface BillingTimelineEntry {
  id: string;
  event_type: string;
  title: string;
  description: string | null;
  amount_total: number | null;
  currency: string | null;
  occurred_at: string;
}

async function callSubscriptionFn<T>(action: string, extra: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.functions.invoke("payments-subscription", {
    body: { action, environment: getPaddleEnvironment(), ...extra },
  });
  if (error) throw error;
  return data as T;
}

/** Live subscription detail straight from the payments provider. */
export function useSubscriptionDetails() {
  return useQuery({
    queryKey: ["subscription-details", getPaddleEnvironment()],
    queryFn: () => callSubscriptionFn<SubscriptionDetails>("details"),
    staleTime: 30_000,
  });
}

/** Invoices and receipts for the signed-in customer. */
export function useInvoices() {
  return useQuery({
    queryKey: ["billing-invoices", getPaddleEnvironment()],
    queryFn: async () => {
      const data = await callSubscriptionFn<{ invoices: InvoiceRow[] }>("invoices");
      return data.invoices ?? [];
    },
    staleTime: 60_000,
  });
}

/** Status changes, retries and recoveries, newest first. */
export function useBillingTimeline() {
  return useQuery({
    queryKey: ["billing-timeline", getPaddleEnvironment()],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("billing_events")
        .select("id, event_type, title, description, amount_total, currency, occurred_at")
        .eq("environment", getPaddleEnvironment())
        .order("occurred_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as BillingTimelineEntry[];
    },
    staleTime: 30_000,
  });
}

/** Cancel, resume, and update-card actions with optimistic cache refresh. */
export function useSubscriptionActions() {
  const qc = useQueryClient();
  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["subscription-details"] });
    void qc.invalidateQueries({ queryKey: ["billing-timeline"] });
    void qc.invalidateQueries({ queryKey: ["subscription"] });
  };

  const updatePaymentMethod = useMutation({
    mutationFn: () => callSubscriptionFn<{ url?: string }>("payment_method"),
    onSuccess: (data) => {
      if (data?.url) window.open(data.url, "_blank", "noopener,noreferrer");
      else toast.error("We couldn't open the payment details page. Try again shortly.");
    },
    onError: () => toast.error("We couldn't open the payment details page. Try again shortly."),
  });

  const cancel = useMutation({
    mutationFn: (vars: { immediate: boolean; reason?: string }) =>
      callSubscriptionFn<{ ok: boolean }>("cancel", vars),
    onSuccess: (_data, vars) => {
      toast.success(
        vars.immediate ? "Your subscription has been cancelled." : "Cancellation scheduled for the end of your period.",
      );
      invalidate();
    },
    onError: () => toast.error("We couldn't cancel right now. Email support@gradr.me and we'll handle it."),
  });

  const resume = useMutation({
    mutationFn: () => callSubscriptionFn<{ ok: boolean }>("resume"),
    onSuccess: () => {
      toast.success("Your subscription will keep renewing.");
      invalidate();
    },
    onError: () => toast.error("We couldn't restore your subscription. Try again shortly."),
  });

  const changePlan = useMutation({
    mutationFn: (vars: { priceId: string; tier: string; interval: string }) =>
      callSubscriptionFn<{ ok: boolean; applied: boolean; scheduled: boolean; effectiveAt?: string }>(
        "change_plan",
        { priceId: vars.priceId },
      ),
    onSuccess: (data) => {
      if (data?.applied) toast.success("Upgraded — your new plan is active right away.");
      else if (data?.scheduled) {
        toast.success(
          data.effectiveAt
            ? `Change scheduled for ${new Date(data.effectiveAt).toLocaleDateString()} — you keep your current plan until then.`
            : "Change scheduled for your next renewal.",
        );
      }
      invalidate();
    },
    onError: () => toast.error("We couldn't change your plan right now. Try again shortly."),
  });

  const cancelScheduledPlanChange = useMutation({
    mutationFn: () => callSubscriptionFn<{ ok: boolean }>("cancel_scheduled_plan_change"),
    onSuccess: () => {
      toast.success("Scheduled plan change cancelled.");
      invalidate();
    },
    onError: () => toast.error("We couldn't cancel the scheduled change. Try again shortly."),
  });

  return { updatePaymentMethod, cancel, resume, changePlan, cancelScheduledPlanChange };
}
