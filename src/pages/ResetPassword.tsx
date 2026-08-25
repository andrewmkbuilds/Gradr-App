import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button, Input, Text } from "@/design-system/gradr-9b9b95";
import { AuthLayout } from "@/components/AuthLayout";
import { Lock, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { useLocation, useNavigate } from "react-router-dom";
import { resolveNext } from "@/lib/nextRedirect";

export default function ResetPassword() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [linkExpired, setLinkExpired] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setReady(true);
      }
    });

    const hash = window.location.hash;
    if (hash.includes("type=recovery")) {
      setReady(true);
    }

    // If no recovery session materialises, surface a real error instead of
    // spinning forever.
    const timer = window.setTimeout(() => {
      setReady((current) => {
        if (!current) setLinkExpired(true);
        return current;
      });
    }, 4000);

    return () => {
      window.clearTimeout(timer);
      subscription.unsubscribe();
    };
  }, []);

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      toast.error("Passwords don't match");
      return;
    }
    if (password.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast.success("Password updated! Redirecting...");
      setTimeout(() => navigate(resolveNext(location.search), { replace: true }), 1200);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "An error occurred";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  if (!ready) {
    return (
      <AuthLayout>
        <div className="space-y-2">
          <Text variant="h4" as="h1">
            {linkExpired ? "This reset link is no longer valid" : "Checking your reset link"}
          </Text>
          <Text variant="body-sm" tone="muted">
            {linkExpired
              ? "Password reset links expire after a short while and can only be used once. Request a new one and we'll email it straight away."
              : "One moment while we verify the link you opened."}
          </Text>
        </div>
        {linkExpired ? (
          <Button size="lg" className="w-full" onClick={() => navigate("/forgot-password")}>
            Request a new link
          </Button>
        ) : (
          <div
            className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent"
            role="status"
            aria-label="Verifying reset link"
          />
        )}
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <div className="space-y-2">
        <Text variant="h4" as="h1">Set a new password</Text>
        <Text variant="body-sm" tone="muted">
          Choose a strong password for your account.
        </Text>
      </div>

      <form onSubmit={handleUpdate} className="space-y-3.5">
        <div className="relative">
          <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input
            type="password"
            placeholder="New password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            className="h-12 pl-10"
          />
        </div>
        <div className="relative">
          <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input
            type="password"
            placeholder="Confirm new password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            minLength={6}
            className="h-12 pl-10"
          />
        </div>
        <Button
          type="submit"
          size="lg"
          className="w-full"
          disabled={loading}
        >
          {loading ? (
            <span className="flex items-center gap-2">
              <span className="h-4 w-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
              Updating...
            </span>
          ) : (
            <>
              Update password
              <ArrowRight className="h-4 w-4" />
            </>
          )}
        </Button>
      </form>
    </AuthLayout>
  );
}
