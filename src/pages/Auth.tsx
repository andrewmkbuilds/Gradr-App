import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { lovable } from "@/integrations/lovable/index";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AuthLayout } from "@/components/AuthLayout";
import { Mail, Lock, User, ArrowRight, CheckCircle, AlertCircle } from "lucide-react";
import {
  authCallbackUrl,
  consumeAuthCallbackError,
  readNext,
} from "@/lib/nextRedirect";
import { toast } from "sonner";
import { z } from "zod";

/** Client-side field validation — mirrors the server rules, fails fast and inline. */
const emailSchema = z
  .string()
  .trim()
  .min(1, "Enter your email address.")
  .email("Enter a valid email address.")
  .max(255, "Email must be under 255 characters.");
const passwordSchema = z
  .string()
  .min(6, "Password must be at least 6 characters.")
  .max(72, "Password must be under 72 characters.");
const nameSchema = z
  .string()
  .trim()
  .min(1, "Enter your full name.")
  .max(80, "Name must be under 80 characters.");

type FieldErrors = { fullName?: string; email?: string; password?: string };

export default function Auth() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const isGuest = user?.is_anonymous === true;
  const [isSignUp, setIsSignUp] = useState(
    () => searchParams.get("mode") === "signup" || user?.is_anonymous === true,
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const [resending, setResending] = useState(false);
  const [resendIn, setResendIn] = useState(0);

  // Single source of truth for the post-auth destination (validated, loop-safe).
  const nextParam = readNext(location.search);
  const nextTarget = nextParam ?? "/";
  // Email links and OAuth always come back to /auth: the session is established
  // from the URL first, then AuthRoute forwards to `next`.
  const postAuthUrl = authCallbackUrl(nextParam);

  // Surface expired/invalid confirmation links instead of silently showing the form.
  useEffect(() => {
    const message = consumeAuthCallbackError();
    if (message) toast.error(message);
  }, []);

  // Belt and braces: AuthRoute redirects once a real session exists, but if this
  // page is ever rendered with one (e.g. session restored after confirmation),
  // forward to the destination rather than stranding the user on the form.
  useEffect(() => {
    if (user && user.is_anonymous !== true) {
      navigate(nextTarget, { replace: true });
    }
  }, [user, nextTarget, navigate]);

  // Map raw auth errors to short, human copy shown inline under the form.
  const friendlyAuthError = (raw: string): string => {
    const m = raw.toLowerCase();
    if (m.includes("already registered") || m.includes("already been registered") || m.includes("user already exists"))
      return "That email already has an account. Try signing in instead.";
    if (m.includes("email address") && m.includes("invalid")) return "Enter a valid email address.";
    if (m.includes("password should be at least")) return "Password must be at least 6 characters.";
    if (m.includes("weak password") || m.includes("pwned") || m.includes("compromised"))
      return "That password is too weak. Pick something longer and less common.";
    if (m.includes("invalid login credentials")) return "Incorrect email or password.";
    if (m.includes("email not confirmed")) return "Confirm your email first — check your inbox for the link.";
    if (m.includes("rate limit") || m.includes("too many")) return "Too many attempts. Wait a minute and try again.";
    if (m.includes("signups not allowed") || m.includes("signup is disabled"))
      return "New signups are currently disabled.";
    if (m.includes("failed to fetch") || m.includes("network"))
      return "Network error — check your connection and try again.";
    return raw;
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setFormError(null);
    try {
      if (isSignUp) {
        if (isGuest) {
          // Upgrade the existing anonymous session so guest data is preserved.
          const { error } = await supabase.auth.updateUser(
            { email, password, data: { full_name: fullName } },
            { emailRedirectTo: postAuthUrl },
          );
          if (error) throw error;
          setPendingEmail(email);
          toast.success("Check your email to confirm your new account!");
          return;
        }
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { full_name: fullName },
            emailRedirectTo: postAuthUrl,
          },
        });
        if (error) throw error;
        if (data.session) {
          // Email confirmation is disabled — the user is signed in right now.
          navigate(nextTarget, { replace: true });
          return;
        }
        setPendingEmail(email);
        toast.success("Check your email to confirm your account!");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate(nextTarget, { replace: true });
      }
    } catch (error: unknown) {
      const raw = error instanceof Error ? error.message : "Something went wrong. Please try again.";
      setFormError(friendlyAuthError(raw));
    } finally {
      setLoading(false);
    }
  };




  const handleOAuth = async (provider: "google" | "apple" | "microsoft") => {
    const { error } = await lovable.auth.signInWithOAuth(provider, {
      redirect_uri: postAuthUrl,
    });
    if (error) toast.error(`${provider} sign-in failed`);
  };

  const handleGuest = async () => {
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInAnonymously();
      if (error) throw error;
      toast.success("Signed in as guest");
      // Guests stay allowed on /auth (so they can upgrade later), so navigate explicitly.
      navigate(nextTarget, { replace: true });

    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Guest sign-in failed";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  if (pendingEmail) {
    return (
      <AuthLayout>
        <div className="space-y-6 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/20">
            <CheckCircle className="h-6 w-6 text-primary" />
          </div>
          <div className="space-y-2">
            <h1 className="text-xl font-semibold text-foreground">Confirm your email</h1>
            <p className="text-sm text-muted-foreground">
              We sent a confirmation link to{" "}
              <span className="font-medium text-foreground">{pendingEmail}</span>. Open it and
              you'll land straight on{" "}
              <span className="font-medium text-foreground">{nextTarget}</span>.
            </p>
          </div>
          {isGuest && (
            <p className="text-xs text-muted-foreground">
              Your guest work is saved — keep using the app while you confirm.
            </p>
          )}
          <div className="space-y-2">
            {isGuest && (
              <Button className="w-full h-11" onClick={() => navigate(nextTarget, { replace: true })}>
                Continue for now
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            )}
            <Button
              variant="ghost"
              className="w-full h-11 text-muted-foreground"
              onClick={() => setPendingEmail(null)}
            >
              Use a different email
            </Button>
          </div>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>

      <div className="space-y-2">
        <h1 className="text-xl font-semibold text-foreground">
          {isSignUp ? "Create your account" : "Sign in to Gradr"}
        </h1>
        <p className="text-sm text-muted-foreground">
          {isSignUp
            ? "Start dominating your job search."
            : "Sign in to continue your career strategy."}
        </p>
      </div>

      {/* OAuth buttons */}
      <div className="space-y-2.5">
        <Button
          variant="outline"
          className="w-full h-11 border-border text-foreground hover:bg-secondary justify-center gap-3"
          onClick={() => handleOAuth("google")}
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          Continue with Google
        </Button>
        <Button
          variant="outline"
          className="w-full h-11 border-border text-foreground hover:bg-secondary justify-center gap-3"
          onClick={() => handleOAuth("apple")}
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
            <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
          </svg>
          Continue with Apple
        </Button>
        <Button
          variant="outline"
          className="w-full h-11 border-border text-foreground hover:bg-secondary justify-center gap-3"
          onClick={() => handleOAuth("microsoft")}
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
            <path d="M11.4 24H0V12.6h11.4V24zM24 24H12.6V12.6H24V24zM11.4 11.4H0V0h11.4v11.4zM24 11.4H12.6V0H24v11.4z"/>
          </svg>
          Continue with Microsoft
        </Button>
      </div>

      {/* Divider */}
      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t border-border" />
        </div>
        <div className="relative flex justify-center text-xs uppercase tracking-wider">
          <span className="bg-background px-3 text-muted-foreground">or</span>
        </div>
      </div>

      {/* Email form */}
      <form onSubmit={handleEmailAuth} className="space-y-3.5">
        {isSignUp && (
          <div className="relative">
            <User className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Full name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="pl-10 h-11 bg-secondary border-border"
            />
          </div>
        )}
        <div className="relative">
          <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input
            type="email"
            placeholder="Email address"
            value={email}
            onChange={(e) => { setEmail(e.target.value); setFormError(null); }}
            required
            aria-invalid={!!formError}
            className="pl-10 h-11 bg-secondary border-border"

          />
        </div>
        <div className="relative">
          <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => { setPassword(e.target.value); setFormError(null); }}
            required
            minLength={6}
            className="pl-10 h-11 bg-secondary border-border"
          />
        </div>

        {!isSignUp && (
          <div className="flex justify-end">
            <Link
              to={nextParam ? `/forgot-password?next=${encodeURIComponent(nextParam)}` : "/forgot-password"}
              className="text-xs text-muted-foreground hover:text-primary transition-colors"
            >
              Forgot password?
            </Link>

          </div>
        )}

        {formError && (
          <p
            role="alert"
            aria-live="polite"
            className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{formError}</span>
          </p>
        )}

        <Button
          type="submit"

          className="w-full h-11 bg-primary text-primary-foreground font-medium gap-2"
          disabled={loading}
        >
          {loading ? (
            <span className="flex items-center gap-2">
              <span className="h-4 w-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
              Processing...
            </span>
          ) : (
            <>
              {isSignUp ? "Create account" : "Sign in"}
              <ArrowRight className="h-4 w-4" />
            </>
          )}
        </Button>
      </form>

      <Button
        type="button"
        variant="ghost"
        className="w-full h-11 text-muted-foreground hover:text-foreground"
        onClick={handleGuest}
        disabled={loading}
      >
        Continue as guest
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        {isSignUp ? "Already have an account?" : "No account yet?"}{" "}
        <button
          type="button"
          onClick={() => { setIsSignUp(!isSignUp); setFormError(null); }}
          className="text-primary hover:underline font-medium"

        >
          {isSignUp ? "Sign in" : "Create one"}
        </button>
      </p>
    </AuthLayout>
  );
}
