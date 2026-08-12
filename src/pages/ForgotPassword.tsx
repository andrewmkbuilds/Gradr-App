import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AuthLayout } from "@/components/AuthLayout";
import { Mail, ArrowLeft, ArrowRight, CheckCircle } from "lucide-react";
import { toast } from "sonner";
import { Link, useLocation } from "react-router-dom";
import { authPath, readNext } from "@/lib/nextRedirect";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const location = useLocation();
  const nextParam = readNext(location.search);

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password${
          nextParam ? `?next=${encodeURIComponent(nextParam)}` : ""
        }`,
      });
      if (error) throw error;
      setSent(true);
      toast.success("Check your email for a reset link!");
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "An error occurred";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout>
      {sent ? (
        <div className="space-y-6">
          <div className="space-y-2">
            <div className="h-12 w-12 rounded-full bg-primary/20 flex items-center justify-center mx-auto">
              <CheckCircle className="h-6 w-6 text-primary" />
            </div>
            <h1 className="text-xl font-semibold text-foreground text-center">Check your email</h1>
            <p className="text-sm text-muted-foreground text-center">
              We sent a reset link to{" "}
              <span className="text-foreground font-medium">{email}</span>
            </p>
          </div>
          <Link to={authPath(nextParam)}>
            <Button variant="outline" className="w-full h-11 border-border gap-2">
              <ArrowLeft className="h-4 w-4" />
              Back to sign in
            </Button>
          </Link>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="space-y-2">
            <h1 className="text-xl font-semibold text-foreground">Reset your password</h1>
            <p className="text-sm text-muted-foreground">
              Enter your email and we'll send you a reset link.
            </p>
          </div>

          <form onSubmit={handleReset} className="space-y-3.5">
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
            <Button
              type="submit"
              className="w-full h-11 bg-primary text-primary-foreground font-medium gap-2"
              disabled={loading}
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <span className="h-4 w-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                  Sending...
                </span>
              ) : (
                <>
                  Send reset link
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </Button>
          </form>

          <Link
            to={authPath(nextParam)}
            className="flex items-center justify-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to sign in
          </Link>
        </div>
      )}
    </AuthLayout>
  );
}
