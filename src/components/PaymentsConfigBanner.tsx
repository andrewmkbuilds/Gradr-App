import { AlertTriangle, ExternalLink } from "lucide-react";
import { currentPaymentsValidation } from "@/lib/payments/validate";

interface PaymentsConfigBannerProps {
  /** Where the banner renders — used only for copy nuance. */
  context?: "pricing" | "checkout" | "billing";
  className?: string;
}

/**
 * Surfaces the runtime payment-configuration validation.
 *
 * Two distinct states, both previously invisible to users:
 *   • blocking — no token / invalid environment: checkout cannot open.
 *   • warning  — token and VITE_PAYMENTS_ENVIRONMENT disagree. Checkout still
 *     works, but against a different Paddle catalog than the build claims, so
 *     we say which one is actually being charged instead of quietly disabling
 *     plan changes.
 *
 * Renders nothing when the configuration is coherent.
 */
export function PaymentsConfigBanner({ context = "pricing", className }: PaymentsConfigBannerProps) {
  const validation = currentPaymentsValidation();
  if (validation.severity === "ok") return null;

  const blocking = validation.blocksCheckout;
  const what =
    context === "checkout"
      ? "Checkout cannot open"
      : context === "billing"
        ? "Plan changes are unavailable"
        : "Purchases are temporarily unavailable";

  const tone = blocking ? "border-destructive/40 bg-destructive/10" : "border-warning/40 bg-warning/10";
  const iconTone = blocking ? "text-destructive" : "text-warning";

  return (
    <div role="status" className={`rounded-card border p-4 text-left ${tone} ${className ?? ""}`}>
      <div className="flex gap-3">
        <AlertTriangle className={`mt-0.5 h-5 w-5 shrink-0 ${iconTone}`} aria-hidden="true" />
        <div className="space-y-3">
          <div>
            <p className="text-body-sm font-semibold text-foreground">
              {blocking ? `${what} — ${validation.title}` : validation.title}
            </p>
            <p className="text-body-sm text-muted-foreground">{validation.detail}</p>
          </div>

          <div>
            <p className="text-body-sm font-medium text-foreground">How to fix this</p>
            <ol className="mt-1 space-y-1 text-body-sm text-muted-foreground">
              {validation.steps.map((step, i) => (
                <li key={i} className="ml-4 list-decimal">
                  {step}
                </li>
              ))}
            </ol>
          </div>

          <p className="text-caption text-muted-foreground">
            <a
              href="https://docs.lovable.dev/features/payments"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-primary underline"
            >
              Payments docs
              <ExternalLink className="h-3 w-3" aria-hidden="true" />
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
