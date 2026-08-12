import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { lovable } from "@/integrations/lovable/index";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AuthLayout } from "@/components/AuthLayout";
import { Mail, Lock, User, ArrowRight } from "lucide-react";
import { toast } from "sonner";

export default function Auth() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isGuest = user?.is_anonymous === true;
  const [isSignUp, setIsSignUp] = useState(
    () => searchParams.get("mode") === "signup" || user?.is_anonymous === true,
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);

  const [pendingEmail, setPendingEmail] = useState<string | null>(null);

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

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
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
      const message = error instanceof Error ? error.message : "An error occurred";
      toast.error(message);
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
      navigate(nextParam ?? "/", { replace: true });

    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Guest sign-in failed";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout>
      <div className="space-y-2">
        <h1 className="text-xl font-semibold text-foreground">
          {isSignUp ? "Create your account" : "Sign in to CareerFlow OS"}
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
            onChange={(e) => setEmail(e.target.value)}
            required
            className="pl-10 h-11 bg-secondary border-border"
          />
        </div>
        <div className="relative">
          <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            className="pl-10 h-11 bg-secondary border-border"
          />
        </div>

        {!isSignUp && (
          <div className="flex justify-end">
            <Link
              to="/forgot-password"
              className="text-xs text-muted-foreground hover:text-primary transition-colors"
            >
              Forgot password?
            </Link>

          </div>
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
          onClick={() => setIsSignUp(!isSignUp)}
          className="text-primary hover:underline font-medium"
        >
          {isSignUp ? "Sign in" : "Create one"}
        </button>
      </p>
    </AuthLayout>
  );
}
