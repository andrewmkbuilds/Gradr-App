import { useQuery } from "@tanstack/react-query";
import { Navigate } from "react-router-dom";
import { Link } from "react-router-dom";
import { AlertTriangle, CheckCircle2, CreditCard, Loader2, RefreshCw, XCircle } from "lucide-react";
import { Button } from "@/components/ds/Button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/app/PageHeader";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { currentPaymentsDiagnostics } from "@/lib/paymentsConfig";
import { CREDIT_PACKS, TIERS } from "@/config/tiers";
import {
  catalogPriceIds,
  preflightMessage,
  runPaymentsPreflight,
  type PaymentsHealthStatus,
} from "@/lib/payments/preflight";

const STATUS_BADGE: Record<PaymentsHealthStatus, { label: string; className: string }> = {
  ok: { label: "Healthy", className: "text-success" },
  partial: { label: "Partial catalog", className: "text-warning" },
  unavailable: { label: "Catalog empty", className: "text-destructive" },
  error: { label: "Resolver error", className: "text-destructive" },
  disabled: { label: "Payments disabled", className: "text-muted-foreground" },
};

/** Labels each catalog price id with the plan/pack it belongs to. */
function priceLabels(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const tier of TIERS) {
    out[tier.priceId.month] = `${tier.name} — monthly`;
    out[tier.priceId.year] = `${tier.name} — yearly`;
  }
  for (const pack of CREDIT_PACKS) out[pack.priceId] = `${pack.label} — one-off`;
  return out;
}

function Row({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border/60 py-2 last:border-0">
      <span className="text-body-sm text-muted-foreground">{label}</span>
      <code className={`text-caption ${tone ?? "text-foreground"}`}>{value}</code>
    </div>
  );
}

/**
 * Admin-only "what is this build actually pointed at?" page.
 *
 * Exists because the expensive failures in this integration have all been
 * mismatches that are invisible from the UI: a live token with a sandbox
 * environment override, or a live token against a catalog that only has
 * sandbox products. Everything here is read from the running bundle, so it
 * reflects what the user's browser is really using — not what the repo says.
 *
 * Only the masked token preview is ever rendered; the full client token is
 * never printed, and the server-side API key never reaches the browser.
 */
export default function AdminPaymentsDebug() {
  const { user, loading: authLoading } = useAuth();

  const { data: isAdmin, isLoading: roleLoading } = useQuery({
    queryKey: ["is-admin", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase.rpc("has_role", { _user_id: user!.id, _role: "admin" });
      return Boolean(data);
    },
  });

  const diag = currentPaymentsDiagnostics();
  const labels = priceLabels();

  const preflight = useQuery({
    queryKey: ["payments-debug-preflight", diag.environment],
    enabled: Boolean(isAdmin),
    retry: false,
    staleTime: 15_000,
    queryFn: () => runPaymentsPreflight(catalogPriceIds()),
  });

  if (authLoading || roleLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" aria-hidden="true" />
        <span className="sr-only">Loading</span>
      </div>
    );
  }
  if (!isAdmin) return <Navigate to="/" replace />;

  const result = preflight.data;
  const badge = result ? STATUS_BADGE[result.status] : null;
  const mismatch =
    diag.tokenEnvironment &&
    diag.environment &&
    diag.tokenEnvironment !== diag.environment;

  return (
    <div className="mx-auto max-w-4xl section-stack">
      <PageHeader
        icon={<CreditCard className="h-5 w-5" aria-hidden="true" />}
        title="Payments debug"
        description="Exactly which Paddle token, environment and price ids this build resolves at runtime."
      />

      {mismatch && (
        <div role="status" className="rounded-card border border-warning/40 bg-warning/10 p-4">
          <p className="flex items-center gap-2 text-body-sm font-semibold text-foreground">
            <AlertTriangle className="h-4 w-4 text-warning" aria-hidden="true" />
            Environment mismatch
          </p>
          <p className="mt-1 text-body-sm text-muted-foreground">
            The client token is a <strong>{diag.tokenEnvironment}</strong> token but the resolved
            environment is <strong>{diag.environment}</strong>. The token prefix always wins.
          </p>
        </div>
      )}

      <Card className="p-5">
        <h2 className="text-body font-semibold text-foreground">Client configuration</h2>
        <div className="mt-3">
          <Row label="Client token (masked)" value={diag.tokenPreview ?? "not set"} />
          <Row label="Environment from token prefix" value={diag.tokenEnvironment ?? "unknown"} />
          <Row
            label="VITE_PAYMENTS_ENVIRONMENT"
            value={
              diag.missing.includes("VITE_PAYMENTS_ENVIRONMENT")
                ? "not set (derived from token)"
                : (diag.environment ?? "invalid")
            }
          />
          <Row
            label="Resolved environment in use"
            value={diag.environment ?? "none — checkout disabled"}
          />
          <Row
            label="Checkout enabled"
            value={diag.ok ? "yes" : "no"}
            tone={diag.ok ? "text-success" : "text-destructive"}
          />
        </div>
        {diag.warnings.length > 0 && (
          <ul className="mt-3 space-y-1">
            {diag.warnings.map((w, i) => (
              <li key={i} className="text-caption text-muted-foreground">
                {w.message} {w.fix}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-body font-semibold text-foreground">Catalog preflight</h2>
          <div className="flex items-center gap-2">
            {badge && (
              <Badge variant="outline" className={badge.className}>
                {badge.label}
              </Badge>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => void preflight.refetch()}
              disabled={preflight.isFetching}
            >
              <span className="inline-flex items-center gap-2">
                <RefreshCw
                  className={`h-4 w-4 ${preflight.isFetching ? "animate-spin" : ""}`}
                  aria-hidden="true"
                />
                Re-check
              </span>
            </Button>
          </div>
        </div>

        {preflight.isLoading && (
          <p className="mt-3 text-body-sm text-muted-foreground">Resolving the catalog…</p>
        )}
        {result && (
          <>
            <p className="mt-2 text-body-sm text-muted-foreground">{preflightMessage(result)}</p>
            <p className="mt-1 text-caption text-muted-foreground">
              Checked {result.checked.length} ids in {result.durationMs}ms at{" "}
              {new Date(result.checkedAt).toLocaleTimeString()}.
            </p>
            <ul className="mt-4">
              {result.checked.map((id) => {
                const missing = result.missing.includes(id);
                const unknown = result.status === "error" || result.status === "disabled";
                const Icon = unknown ? AlertTriangle : missing ? XCircle : CheckCircle2;
                const tone = unknown
                  ? "text-muted-foreground"
                  : missing
                    ? "text-destructive"
                    : "text-success";
                return (
                  <li
                    key={id}
                    className="flex items-center gap-3 border-b border-border/60 py-2 last:border-0"
                  >
                    <Icon className={`h-4 w-4 shrink-0 ${tone}`} aria-hidden="true" />
                    <code className="text-caption text-foreground">{id}</code>
                    <span className="text-caption text-muted-foreground">{labels[id] ?? ""}</span>
                    <span className={`ml-auto text-caption ${tone}`}>
                      {unknown ? "unknown" : missing ? "missing" : "resolved"}
                    </span>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </Card>

      <p className="text-caption text-muted-foreground">
        Related:{" "}
        <Link to="/admin/payments-status" className="text-primary underline">
          payments readiness
        </Link>{" "}
        ·{" "}
        <Link to="/admin/paddle" className="text-primary underline">
          Paddle operations
        </Link>
      </p>
    </div>
  );
}
