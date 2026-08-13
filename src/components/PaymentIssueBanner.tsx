import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useBillingActions, usePaymentIssue } from "@/hooks/useSubscription";

/** Surfaces failed/overdue invoices and lets the user retry payment in the portal. */
export function PaymentIssueBanner() {
  const { hasPaymentIssue, status } = usePaymentIssue();
  const { pending, openPortal, restorePurchases } = useBillingActions();

  if (!hasPaymentIssue) return null;

  return (
    <div className="rounded-xl border border-destructive/40 bg-destructive/10 backdrop-blur-sm p-4 flex flex-col sm:flex-row sm:items-center gap-3">
      <AlertTriangle className="h-5 w-5 text-destructive shrink-0" />
      <div className="flex-1">
        <p className="text-sm font-semibold text-foreground">
          {status === "past_due" ? "Your last payment failed" : "Your subscription needs attention"}
        </p>
        <p className="text-xs text-muted-foreground">
          Update your card to keep Pro access. We retry automatically, but you can reattempt now.
        </p>
      </div>
      <div className="flex gap-2">
        <Button size="sm" onClick={() => void openPortal()} disabled={pending === "portal"}>
          Update payment
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => void restorePurchases()}
          disabled={pending === "restore"}
        >
          Recheck
        </Button>
      </div>
    </div>
  );
}
