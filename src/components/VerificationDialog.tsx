import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, ExternalLink, Loader2, Lock, RefreshCw, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { eligibilityIcon } from "@/config/eligibility";
import {
  useEligibilityCategories,
  useMyEligibility,
  useStartVerification,
} from "@/hooks/useEligibility";
import { trackEvent } from "@/lib/analytics";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pre-select a category and skip straight to the confirm step. */
  defaultType?: string | null;
}

/**
 * Multi-step eligibility verification launcher.
 *
 * Documents and personal evidence are handled entirely by the verification
 * provider — this dialog only ever sees a status, which is why the privacy
 * step can promise that nothing sensitive is stored by Gradr.
 */
export function VerificationDialog({ open, onOpenChange, defaultType = null }: Props) {
  const { data: categories, isLoading } = useEligibilityCategories();
  const { statusFor, refetch } = useMyEligibility();
  const start = useStartVerification();

  const [selected, setSelected] = useState<string | null>(defaultType);
  const [launchedUrl, setLaunchedUrl] = useState<string | null>(null);
  const [awaitingResult, setAwaitingResult] = useState(false);

  useEffect(() => {
    if (open) {
      setSelected(defaultType);
      setLaunchedUrl(null);
      setAwaitingResult(false);
    }
  }, [open, defaultType]);

  const verifiable = useMemo(
    () => (categories ?? []).filter((c) => c.requires_verification && c.self_serve),
    [categories],
  );
  const category = verifiable.find((c) => c.key === selected) ?? null;

  const launch = async () => {
    if (!category) return;
    try {
      const result = await start.mutateAsync({ eligibilityType: category.key });
      trackEvent("eligibility_verification_started", {
        metadata: { eligibility_type: category.key, provider: result.provider },
      });

      if (result.alreadyVerified) {
        toast.success("You're already verified for this discount.");
        onOpenChange(false);
        return;
      }
      if (result.verificationUrl) {
        setLaunchedUrl(result.verificationUrl);
        setAwaitingResult(true);
        window.open(result.verificationUrl, "_blank", "noopener,noreferrer");
      } else {
        setAwaitingResult(true);
        toast.success("Request submitted. Our team will review it shortly.");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't start verification.");
    }
  };

  const refresh = async () => {
    if (!category) return;
    try {
      const result = await start.mutateAsync({
        eligibilityType: category.key,
        action: "refresh",
      });
      await refetch();
      if (result.status === "verified") {
        toast.success("Verified! Your discount is active.");
        onOpenChange(false);
      } else {
        toast.info("Not confirmed yet. Finish the provider steps, then check again.");
      }
    } catch {
      toast.info("We couldn't check the status just yet. Try again in a moment.");
    }
  };

  const existing = category ? statusFor(category.key) : undefined;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" aria-hidden="true" />
            {category ? `Verify: ${category.label}` : "Get your discount"}
          </DialogTitle>
          <DialogDescription>
            {category
              ? "Verification is handled by our verification partner. Gradr never stores your documents."
              : "Pick what describes you. Verification takes about a minute."}
          </DialogDescription>
        </DialogHeader>

        {!category ? (
          <div className="grid gap-2 py-1 max-h-[55vh] overflow-y-auto">
            {isLoading
              ? [0, 1, 2].map((i) => <Skeleton key={i} className="h-16 w-full" />)
              : verifiable.map((c) => {
                  const Icon = eligibilityIcon(c.key);
                  const mine = statusFor(c.key);
                  return (
                    <button
                      key={c.key}
                      onClick={() => setSelected(c.key)}
                      className="flex items-center gap-3 rounded-lg border border-border bg-card/60 p-3 text-left transition-colors hover:border-primary/50 hover:bg-primary/5"
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                        <Icon className="h-4 w-4 text-primary" aria-hidden="true" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium text-foreground">{c.label}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {c.description}
                        </span>
                      </span>
                      {mine?.status === "verified" ? (
                        <Badge variant="secondary">Verified</Badge>
                      ) : c.default_discount_percent > 0 ? (
                        <Badge className="shrink-0">{c.default_discount_percent}% off</Badge>
                      ) : null}
                    </button>
                  );
                })}
          </div>
        ) : (
          <div className="space-y-4 py-1">
            <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-2">
              <p className="flex items-center gap-2 text-sm font-medium text-foreground">
                <Lock className="h-4 w-4 text-primary" aria-hidden="true" />
                What we store
              </p>
              <ul className="space-y-1 text-xs text-muted-foreground">
                <li>Only your verification status and when it expires.</li>
                <li>No documents, student IDs or service records reach Gradr.</li>
                <li>
                  Your discount stays valid for {category.verification_validity_days} days, then you
                  re-verify.
                </li>
              </ul>
            </div>

            {existing?.status === "failed" && existing.failure_reason && (
              <p className="text-xs text-destructive">{existing.failure_reason}</p>
            )}

            {awaitingResult && (
              <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 text-sm text-foreground">
                <p className="font-medium">Waiting for your verification result…</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {launchedUrl
                    ? "Finish the steps in the new tab, then check the status here."
                    : "Your request is queued for manual review. We'll email you when it's decided."}
                </p>
                {launchedUrl && (
                  <a
                    href={launchedUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-flex items-center gap-1 text-xs text-primary underline"
                  >
                    Reopen verification <ExternalLink className="h-3 w-3" aria-hidden="true" />
                  </a>
                )}
              </div>
            )}
          </div>
        )}

        <DialogFooter className="gap-2 sm:justify-between">
          {category && !defaultType ? (
            <Button variant="ghost" onClick={() => setSelected(null)} className="gap-1">
              <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back
            </Button>
          ) : (
            <span />
          )}
          {category && (
            awaitingResult ? (
              <Button onClick={refresh} disabled={start.isPending} className="gap-2">
                {start.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <RefreshCw className="h-4 w-4" aria-hidden="true" />
                )}
                Check status
              </Button>
            ) : (
              <Button onClick={launch} disabled={start.isPending} className="gap-2">
                {start.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                )}
                Start verification
              </Button>
            )
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
