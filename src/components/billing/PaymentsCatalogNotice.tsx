import { AlertTriangle, Loader2, PackageOpen, RefreshCw } from "lucide-react";
import { Button } from "@/components/ds/Button";
import type { PaymentsPreflight } from "@/lib/payments/preflight";

interface PaymentsCatalogNoticeProps {
  preflight: PaymentsPreflight | null;
  /** True while the preflight is in flight — suppresses the retry spinner state. */
  loading?: boolean;
  onRetry?: () => void;
  className?: string;
}

/**
 * Explains a Paddle catalog that has no (or only some) products in the active
 * environment.
 *
 * This is the "products aren't set up yet" state, which is materially
 * different from "payments are misconfigured" (`PaymentsConfigBanner`) and
 * from "we couldn't localize the prices" (a cosmetic fallback). Here the
 * client token and resolver are healthy — the catalog is simply empty, which
 * is exactly what happens between swapping in the live token and Paddle
 * approving/syncing the live products. Without this the visitor only finds
 * out when the checkout overlay dies.
 *
 * Renders nothing for healthy, disabled or errored preflights: an unreachable
 * resolver says nothing about the catalog and is handled as a transient
 * checkout failure instead.
 */
export function PaymentsCatalogNotice({
  preflight,
  loading,
  onRetry,
  className,
}: PaymentsCatalogNoticeProps) {
  if (!preflight) return null;
  if (preflight.status !== "unavailable" && preflight.status !== "partial") return null;

  const everythingMissing = preflight.status === "unavailable";
  const Icon = everythingMissing ? PackageOpen : AlertTriangle;

  return (
    <div
      role="status"
      data-testid="payments-catalog-notice"
      data-preflight-status={preflight.status}
      className={`rounded-card border border-warning/40 bg-warning/10 p-4 text-left ${className ?? ""}`}
    >
      <div className="flex gap-3">
        <Icon className="mt-0.5 h-5 w-5 shrink-0 text-warning" aria-hidden="true" />
        <div className="space-y-3">
          <div className="space-y-1">
            <p className="text-body-sm font-semibold text-foreground">
              {everythingMissing
                ? "Plans aren't available to buy just yet"
                : "Some plans aren't available to buy just yet"}
            </p>
            <p className="text-body-sm text-muted-foreground">
              {everythingMissing
                ? "Our payment provider hasn't finished setting up our products, so checkout can't open yet. Everything else in Gradr works normally, and your free plan is unaffected."
                : "A few plans are still being set up with our payment provider. The ones below can be purchased as usual."}
            </p>
          </div>

          {!everythingMissing && preflight.missing.length > 0 && (
            <p className="text-caption text-muted-foreground">
              Unavailable right now:{" "}
              {preflight.missing.map((id, i) => (
                <span key={id}>
                  {i > 0 && ", "}
                  <code className="rounded-control bg-surface-muted px-1.5 py-0.5 text-caption text-foreground">
                    {id}
                  </code>
                </span>
              ))}
            </p>
          )}

          <p className="text-caption text-muted-foreground">
            Need a plan today? Email{" "}
            <a href="mailto:support@gradr.me" className="text-primary underline">
              support@gradr.me
            </a>{" "}
            and we'll set it up for you manually.
          </p>

          {onRetry && (
            <Button variant="outline" size="sm" onClick={onRetry} disabled={loading}>
              {loading ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  Checking…
                </span>
              ) : (
                <span className="inline-flex items-center gap-2">
                  <RefreshCw className="h-4 w-4" aria-hidden="true" />
                  Check again
                </span>
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
