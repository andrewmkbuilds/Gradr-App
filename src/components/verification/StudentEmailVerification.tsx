import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import {
  ArrowLeft,
  CheckCircle2,
  GraduationCap,
  Loader2,
  Lock,
  Mail,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { trackEvent } from "@/lib/analytics";

type Step = "email" | "code" | "done";

interface Props {
  /** Opens the "request my school" form. */
  onRequestInstitution: (email: string) => void;
  onVerified?: () => void;
  discountPercent?: number;
}

interface FnResult {
  ok?: boolean;
  error?: string;
  recognized?: boolean;
  domain?: string;
  institution?: string;
  verified?: boolean;
  discountPercent?: number;
}

async function callVerify(body: Record<string, unknown>): Promise<FnResult> {
  const { data, error } = await supabase.functions.invoke("verify-academic-email", { body });
  if (error) {
    // Edge errors hide the real message inside the response body.
    let details = error.message;
    try {
      const ctx = (error as { context?: Response }).context;
      if (ctx) {
        const parsed = JSON.parse(await ctx.text());
        details = parsed.error ?? details;
      }
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
 * Student verification by academic email ownership.
 *
 * No documents, no student ID, no third party: we email a one-time code to an
 * academic address and grant the discount only once that code is confirmed.
 */
export function StudentEmailVerification({
  onRequestInstitution,
  onVerified,
  discountPercent = 50,
}: Props) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sending, setSending] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unrecognised, setUnrecognised] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const emailValid = useMemo(() => /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(email.trim()), [email]);

  const sendCode = async () => {
    setError(null);
    setUnrecognised(false);
    setSending(true);
    try {
      await callVerify({ action: "start", email: email.trim().toLowerCase() });
      setStep("code");
      setCooldown(60);
      trackEvent("student_verification_code_sent", { location: "verification_dialog" });
      toast.success("Code sent", { description: `Check ${email.trim()} for a 6-digit code.` });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Couldn't send the code.";
      setError(message);
      if (/domain/i.test(message)) setUnrecognised(true);
    } finally {
      setSending(false);
    }
  };

  const confirmCode = async (value: string) => {
    setError(null);
    setConfirming(true);
    try {
      const result = await callVerify({
        action: "confirm",
        email: email.trim().toLowerCase(),
        code: value,
      });
      setStep("done");
      void queryClient.invalidateQueries({ queryKey: ["my-eligibility"] });
      trackEvent("student_verification_completed", { location: "verification_dialog" });
      toast.success("Student status verified", {
        description: `Your ${result.discountPercent ?? discountPercent}% student discount is active.`,
      });
      onVerified?.();
    } catch (e) {
      setCode("");
      setError(e instanceof Error ? e.message : "That code didn't work.");
    } finally {
      setConfirming(false);
    }
  };

  if (step === "done") {
    return (
      <div className="space-y-4 py-2">
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <CheckCircle2 className="h-4 w-4 text-primary" aria-hidden="true" />
            Student status verified
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {email} is confirmed. Your {discountPercent}% student discount is applied automatically at
            checkout.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 py-1">
      {step === "email" && (
        <>
          <div className="space-y-1.5">
            <Label htmlFor="student-email">School or university email address</Label>
            <Input
              id="student-email"
              type="email"
              inputMode="email"
              autoComplete="email"
              value={email}
              placeholder="you@university.edu"
              onChange={(e) => {
                setEmail(e.target.value);
                setError(null);
                setUnrecognised(false);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && emailValid && !sending) void sendCode();
              }}
              aria-invalid={Boolean(error)}
              aria-describedby="student-email-help"
            />
            <p id="student-email-help" className="text-xs text-muted-foreground">
              We accept academic domains such as .edu, .edu.xx, .ac.xx, .org and any approved
              school domain.
            </p>
          </div>

          {error && (
            <p role="alert" className="text-xs text-destructive">
              {error}
            </p>
          )}

          <div className="rounded-lg border border-dashed border-border p-3">
            <p className="text-xs font-medium text-foreground">Don't see your school?</p>
            <Button
              type="button"
              variant="link"
              className="h-auto px-0 text-xs"
              onClick={() => onRequestInstitution(email.trim())}
            >
              Request your school or university to be added
            </Button>
            {unrecognised && (
              <p className="text-xs text-muted-foreground">
                An admin reviews every request. Approved domains work instantly for future students.
              </p>
            )}
          </div>

          <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-4">
            <p className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Lock className="h-4 w-4 text-primary" aria-hidden="true" />
              What we store and why
            </p>
            <ul className="space-y-1 text-xs text-muted-foreground">
              <li>Only your academic email address and its domain, to confirm enrolment.</li>
              <li>No student ID, no documents, no third-party verification service.</li>
              <li>Your discount renews when we re-check the address at the end of its validity.</li>
            </ul>
          </div>

          <Button
            onClick={sendCode}
            disabled={!emailValid || sending}
            className="w-full gap-2 sm:w-auto"
          >
            {sending ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Mail className="h-4 w-4" aria-hidden="true" />
            )}
            Send verification code
          </Button>
        </>
      )}

      {step === "code" && (
        <>
          <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
            <GraduationCap className="mr-1.5 inline h-4 w-4 text-primary" aria-hidden="true" />
            We sent a 6-digit code to <strong className="text-foreground">{email}</strong>. It expires
            in 15 minutes.
          </div>

          <div className="space-y-2">
            <Label htmlFor="student-code">Verification code</Label>
            <InputOTP
              id="student-code"
              maxLength={6}
              value={code}
              disabled={confirming}
              onChange={(v) => {
                setCode(v);
                setError(null);
                if (v.length === 6) void confirmCode(v);
              }}
            >
              <InputOTPGroup className="w-full justify-between">
                {[0, 1, 2, 3, 4, 5].map((i) => (
                  <InputOTPSlot key={i} index={i} className="h-12 flex-1" />
                ))}
              </InputOTPGroup>
            </InputOTP>
            {error && (
              <p role="alert" className="text-xs text-destructive">
                {error}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Button
              onClick={() => confirmCode(code)}
              disabled={code.length !== 6 || confirming}
              className="gap-2"
            >
              {confirming ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <ShieldCheck className="h-4 w-4" aria-hidden="true" />
              )}
              Verify my student status
            </Button>
            <Button variant="outline" onClick={sendCode} disabled={sending || cooldown > 0}>
              {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}
            </Button>
            <Button
              variant="ghost"
              className="gap-1 sm:ml-auto"
              onClick={() => {
                setStep("email");
                setCode("");
                setError(null);
              }}
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Change email
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
