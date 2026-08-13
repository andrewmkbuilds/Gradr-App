import { AlertTriangle, ExternalLink } from "lucide-react";
import { currentPaymentsDiagnostics } from "@/lib/paymentsConfig";

interface PaymentsConfigBannerProps {
  /** Where the banner renders — used only for copy nuance. */
  context?: "pricing" | "checkout" | "billing";
  className?: string;
}

/**
 * Explains exactly which VITE_PAYMENTS_* variables are missing (and how to fix
 * them) whenever checkout is inert. Renders nothing when payments are healthy.
 */
export function PaymentsConfigBanner({ context = "pricing", className }: PaymentsConfigBannerProps) {
  const diag = currentPaymentsDiagnostics();
  if (diag.ok) return null;

  const what =
    context === "checkout"
      ? "Checkout cannot open"
      : context === "billing"
        ? "Plan changes are unavailable"
        : "Purchases are temporarily unavailable";

  return (
    <div
      role="status"
      className={`rounded-xl border border-warning/40 bg-warning/10 p-4 text-left ${className ?? ""}`}
    >
      <div className="flex gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warning" aria-hidden="true" />
        <div className="space-y-3">
          <div>
            <p className="text-sm font-semibold text-foreground">
              {what} — payments are not configured.
            </p>
            <p className="text-sm text-muted-foreground">
              The app is running normally; only the Paddle checkout entrypoint is disabled.
            </p>
          </div>

          {diag.missing.length > 0 && (
            <p className="text-sm text-muted-foreground">
              Missing environment {diag.missing.length === 1 ? "variable" : "variables"}:{" "}
              {diag.missing.map((name, i) => (
                <span key={name}>
                  {i > 0 && ", "}
                  <code className="rounded bg-muted px-1.5 py-0.5 text-xs text-foreground">{name}</code>
                </span>
              ))}
            </p>
          )}

          <ul className="space-y-2 text-sm text-muted-foreground">
            {diag.issues.map((issue, i) => (
              <li key={i} className="ml-4 list-disc">
                <span className="text-foreground">{issue.message}</span> {issue.fix}
              </li>
            ))}
          </ul>

          <p className="text-xs text-muted-foreground">
            After updating the variables, rebuild and republish the app — Vite inlines{" "}
            <code className="rounded bg-muted px-1 py-0.5">VITE_*</code> values at build time.{" "}
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
