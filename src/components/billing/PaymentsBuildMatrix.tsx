import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ds/Button";
import {
  fetchBothBuildManifests,
  surfacesDisagree,
  type BuildManifestResult,
} from "@/lib/payments/buildManifest";

function envTone(env: string | null | undefined): string {
  if (env === "live") return "text-success";
  if (env === "sandbox") return "text-warning";
  return "text-destructive";
}

function SurfaceCard({ result }: { result: BuildManifestResult }) {
  const m = result.manifest;
  const label = result.surface === "preview" ? "Preview build" : "Production build";

  return (
    <div className="rounded-card border border-border/60 p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-body-sm font-semibold text-foreground">{label}</p>
        <Badge variant="outline" className={envTone(m?.resolvedEnvironment)}>
          {m?.resolvedEnvironment?.toUpperCase() ?? "UNKNOWN"}
        </Badge>
      </div>
      <p className="mt-1 break-all text-caption text-muted-foreground">{result.origin}</p>

      {m ? (
        <dl className="mt-3 space-y-1.5">
          {[
            ["Inlined token type", m.tokenType === "none" ? "none" : `${m.tokenType}_ token`],
            ["Token (masked)", m.tokenPreview ?? "not set"],
            ["VITE_PAYMENTS_ENVIRONMENT", m.environmentVar ?? "not set (derived)"],
            ["Environment in use", m.resolvedEnvironment ?? "none"],
            ["Checkout enabled", m.checkoutEnabled ? "yes" : "no"],
            ["Build mode", m.mode],
            ["Built at", m.builtAt],
          ].map(([k, v]) => (
            <div key={k} className="flex flex-wrap items-baseline justify-between gap-2">
              <dt className="text-caption text-muted-foreground">{k}</dt>
              <dd className="text-caption text-foreground">
                <code>{v}</code>
              </dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="mt-3 text-caption text-destructive">
          Manifest unreadable — {result.error}. Republish this surface so
          /payments-build.json is served.
        </p>
      )}

      {m?.mismatch && (
        <p className="mt-3 text-caption text-warning">
          The environment variable disagrees with the token prefix on this surface; the token wins.
        </p>
      )}
    </div>
  );
}

/**
 * Side-by-side view of the Paddle token *inlined into each build*.
 *
 * A bundle can only introspect itself, so production's manifest is fetched
 * over the network. That read can legitimately fail (CORS, older deploy); the
 * failure is reported as a row state, never as a broken page.
 */
export function PaymentsBuildMatrix() {
  const builds = useQuery({
    queryKey: ["payments-build-manifests"],
    retry: false,
    staleTime: 60_000,
    queryFn: fetchBothBuildManifests,
  });

  const disagree = builds.data ? surfacesDisagree(builds.data) : false;

  return (
    <Card className="p-5" id="builds">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-body font-semibold text-foreground">Build environments</h2>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void builds.refetch()}
          disabled={builds.isFetching}
        >
          <span className="inline-flex items-center gap-2">
            <RefreshCw
              className={`h-4 w-4 ${builds.isFetching ? "animate-spin" : ""}`}
              aria-hidden="true"
            />
            Re-read manifests
          </span>
        </Button>
      </div>
      <p className="mt-1 text-body-sm text-muted-foreground">
        The Paddle token type and environment compiled into each surface. Only masked tokens are
        ever shown.
      </p>

      {disagree && (
        <p
          role="status"
          className="mt-3 flex items-start gap-2 rounded-card border border-warning/40 bg-warning/10 p-3 text-body-sm text-foreground"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
          Preview and production are pointed at different Paddle catalogs. Purchases made on one
          surface will not appear on the other.
        </p>
      )}

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {(builds.data ?? []).map((r) => (
          <SurfaceCard key={r.surface} result={r} />
        ))}
        {builds.isLoading && (
          <p className="text-body-sm text-muted-foreground">Reading build manifests…</p>
        )}
      </div>
    </Card>
  );
}
