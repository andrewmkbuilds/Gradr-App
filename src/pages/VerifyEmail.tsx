import { useEffect, useState } from "react";
import { useNavigate } from "@/lib/router-compat";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { AuthLayout } from "@/components/AuthLayout";
import { Button } from "@/components/ui/button";
import { AlertCircle, CheckCircle2, LogOut, MailCheck, RefreshCw } from "lucide-react";
import { friendlyAuthError } from "@/lib/authErrors";

const RESEND_COOLDOWN = 60;

/**
 * Blocking state for signed-in users whose email is not confirmed yet.
 * The app itself stays inaccessible until Supabase reports a confirmed email.
 */
export default function VerifyEmail() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [cooldown, setCooldown] = useState(0);
  const [sending, setSending] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  // Poll so the page unblocks itself once the user clicks the link elsewhere.
  useEffect(() => {
    const id = window.setInterval(async () => {
      const { data } = await supabase.auth.refreshSession();
      if (data.user?.email_confirmed_at) navigate("/", { replace: true });
    }, 15000);
    return () => window.clearInterval(id);
  }, [navigate]);

  const email = user?.email ?? "";

  const resend = async () => {
    if (!email || cooldown > 0) return;
    setSending(true);
    setError(null);
    setNotice(null);
    const { error: err } = await supabase.auth.resend({
      type: "signup",
      email,
      options: { emailRedirectTo: `${window.location.origin}/` },
    });
    setSending(false);
    if (err) setError(friendlyAuthError(err.message));
    else {
      setNotice(`Verification email sent to ${email}.`);
      setCooldown(RESEND_COOLDOWN);
    }
  };

  const check = async () => {
    setChecking(true);
    setError(null);
    const { data, error: err } = await supabase.auth.refreshSession();
    setChecking(false);
    if (err) return setError(friendlyAuthError(err.message));
    if (data.user?.email_confirmed_at) navigate("/", { replace: true });
    else setError("Still unverified. Open the link in the email, then check again.");
  };

  return (
    <AuthLayout>
      <div className="space-y-6">
        <div className="space-y-2 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/15">
            <MailCheck className="h-6 w-6 text-primary" aria-hidden="true" />
          </div>
          <h1 className="text-xl font-semibold text-foreground">Verify your email</h1>
          <p className="text-sm leading-relaxed text-muted-foreground">
            We sent a confirmation link to{" "}
            <span className="font-medium text-foreground break-words">{email || "your inbox"}</span>. Confirm it
            to unlock your Gradr workspace.
          </p>
        </div>

        {error && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </div>
        )}
        {notice && (
          <div
            role="status"
            className="flex items-start gap-2 rounded-lg border border-primary/40 bg-primary/10 p-3 text-sm text-foreground"
          >
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
            <span>{notice}</span>
          </div>
        )}

        <div className="space-y-3">
          <Button onClick={check} disabled={checking} className="h-11 w-full gap-2">
            <RefreshCw className={checking ? "h-4 w-4 animate-spin" : "h-4 w-4"} aria-hidden="true" />
            {checking ? "Checking…" : "I've verified — continue"}
          </Button>
          <Button
            variant="outline"
            onClick={resend}
            disabled={sending || cooldown > 0 || !email}
            className="h-11 w-full"
          >
            {cooldown > 0 ? `Resend in ${cooldown}s` : sending ? "Sending…" : "Resend verification email"}
          </Button>
          <button
            type="button"
            onClick={() => void signOut()}
            className="mx-auto flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
            Sign out
          </button>
        </div>

        <p className="text-center text-xs text-muted-foreground">
          No email? Check spam, or wait a minute before resending.
        </p>
      </div>
    </AuthLayout>
  );
}
