import { useState } from "react";
import { BadgePercent, Check, Loader2, X } from "lucide-react";
import { Button } from "@/components/ds/Button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { getPaddleEnvironment } from "@/lib/paddle";
import { cn } from "@/lib/utils";

export interface AppliedPromo {
  code: string;
  discountId: string;
  label: string;
}

interface PromoCodeFieldProps {
  applied: AppliedPromo | null;
  onApply: (promo: AppliedPromo | null) => void;
  className?: string;
}

const REASON_COPY: Record<string, string> = {
  not_found: "We don't recognise that code.",
  expired: "That code has expired.",
  usage_limit_reached: "That code has been fully redeemed.",
  invalid_format: "Codes are letters, numbers and dashes only.",
  rate_limited: "Too many attempts. Try again in a little while.",
};

/**
 * Promo code entry. Validation happens server-side against the payments
 * provider — the browser only ever receives a discount id for a code that
 * genuinely exists and is still redeemable.
 */
export function PromoCodeField({ applied, onApply, className }: PromoCodeFieldProps) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) return;
    setChecking(true);
    setError(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke("validate-promo", {
        body: { code: trimmed, environment: getPaddleEnvironment() },
      });
      if (fnError) throw fnError;
      if (!data?.valid) {
        setError(REASON_COPY[data?.reason as string] ?? "That code can't be used right now.");
        return;
      }
      const label = data.type === "percentage"
        ? `${Number(data.amount)}% off`
        : data.description ?? "Discount applied";
      onApply({ code: trimmed, discountId: data.discountId as string, label });
      setCode("");
      setOpen(false);
    } catch {
      setError("We couldn't check that code. Try again in a moment.");
    } finally {
      setChecking(false);
    }
  };

  if (applied) {
    return (
      <div
        className={cn(
          "flex items-center justify-between gap-3 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2",
          className,
        )}
      >
        <span className="flex items-center gap-2 text-sm font-medium text-primary">
          <Check className="h-4 w-4" aria-hidden />
          {applied.code} — {applied.label}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-muted-foreground"
          onClick={() => onApply(null)}
        >
          <X className="h-3.5 w-3.5" aria-hidden />
          <span className="sr-only">Remove promo code</span>
        </Button>
      </div>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground",
          className,
        )}
      >
        <BadgePercent className="h-4 w-4" aria-hidden />
        Have a promo code?
      </button>
    );
  }

  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex gap-2">
        <Input
          autoFocus
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          onKeyDown={(e) => e.key === "Enter" && void submit()}
          placeholder="PROMO CODE"
          aria-label="Promo code"
          maxLength={40}
          className="h-9 font-mono uppercase tracking-wide"
        />
        <Button type="button" size="sm" className="h-9" onClick={() => void submit()} disabled={checking || !code.trim()}>
          {checking ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : "Apply"}
        </Button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
