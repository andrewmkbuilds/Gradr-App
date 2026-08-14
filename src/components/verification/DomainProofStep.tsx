import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { CheckCircle2, Loader2, Mail, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  /** Institutional address the request will be submitted with. */
  email: string;
  category: "student" | "educator";
  proven: boolean;
  onProven: (email: string) => void;
  onRequestInstitution?: (email: string) => void;
}

interface FnResult {
  ok?: boolean;
  error?: string;
  recognized?: boolean;
  verified?: boolean;
}

async function call(body: Record<string, unknown>): Promise<FnResult> {
  const { data, error } = await supabase.functions.invoke("verify-academic-email", { body });
  if (error) {
    let details = error.message;
    try {
      const ctx = (error as { context?: Response }).context;
      if (ctx) details = (JSON.parse(await ctx.text()) as { error?: string }).error ?? details;
    } catch {
      /* keep the generic message */
    }
    throw new Error(details);
  }
  const result = (data ?? {}) as FnResult;
  if (result.ok === false) throw new Error(result.error ?? "Verification failed");
  return result;
}

/**
 * Domain ownership proof.
 *
 * Institutional categories can only be submitted once the applicant proves they
 * can receive mail at the domain they claim: we email a one-time code and the
 * request stays blocked until it is confirmed.
 */
export function DomainProofStep({ email, category, proven, onProven, onRequestInstitution }: Props) {
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unrecognised, setUnrecognised] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  const valid = useMemo(() => /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(email.trim()), [email]);

  useEffect(() => {
    setSent(false);
    setCode("");
    setError(null);
    setUnrecognised(false);
  }, [email]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  if (proven) {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-primary/30 bg-primary/5 p-3">
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
        <div>
          <p className="text-sm font-medium text-foreground">Domain ownership confirmed</p>
          <p className="text-xs text-muted-foreground">
            You proved you can receive mail at {email}. A reviewer takes it from here.
          </p>
        </div>
      </div>
    );
  }

  const send = async () => {
    setBusy(true);
    setError(null);
    setUnrecognised(false);
    try {
      await call({ action: "start", email, purpose: "domain_proof", category });
      setSent(true);
      setCooldown(60);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Couldn't send the code.";
      setError(message);
      if (/don't recognise|recognise that domain/i.test(message)) setUnrecognised(true);
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      await call({ action: "confirm", email, code, purpose: "domain_proof", category });
      onProven(email.trim().toLowerCase());
    } catch (e) {
      setError(e instanceof Error ? e.message : "That code didn't work.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3 rounded-lg border border-warning/40 bg-warning/5 p-3">
      <div className="flex items-start gap-2">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
        <div>
          <p className="text-sm font-medium text-foreground">Prove you own this domain</p>
          <p className="text-xs text-muted-foreground">
            We only trust an institutional domain once you show you can read its mail. Confirm a
            one-time code sent to <strong>{email || "your institutional address"}</strong> before
            submitting.
          </p>
        </div>
      </div>

      {!sent ? (
        <Button size="sm" onClick={send} disabled={!valid || busy} className="gap-2">
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Mail className="h-4 w-4" aria-hidden="true" />
          )}
          Email me a code
        </Button>
      ) : (
        <div className="space-y-2">
          <Label htmlFor="proof-code" className="text-xs">
            6-digit code
          </Label>
          <InputOTP id="proof-code" maxLength={6} value={code} onChange={setCode}>
            <InputOTPGroup>
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <InputOTPSlot key={i} index={i} />
              ))}
            </InputOTPGroup>
          </InputOTP>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={confirm} disabled={code.length !== 6 || busy} className="gap-2">
              {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              Confirm code
            </Button>
            <Button size="sm" variant="ghost" onClick={send} disabled={busy || cooldown > 0}>
              {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}
            </Button>
          </div>
        </div>
      )}

      {error && <p className="text-xs text-destructive">{error}</p>}

      {unrecognised && onRequestInstitution && (
        <Button
          type="button"
          variant="link"
          className="h-auto px-0 text-xs"
          onClick={() => onRequestInstitution(email)}
        >
          Request your institution to be added
        </Button>
      )}

      {!valid && (
        <p className="text-xs text-muted-foreground">
          Enter your institutional email above to unlock this step.
        </p>
      )}
    </div>
  );
}
