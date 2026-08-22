import { useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowRight, CheckCircle2, FileText, Gift, Mic, Sparkles, Target } from "lucide-react";
import { Button } from "@/components/ds/Button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useQueryClient } from "@tanstack/react-query";
import { Seo } from "@/components/Seo";
import { useSubscription } from "@/hooks/useSubscription";
import { PLAN_PRICING, type PlanId } from "@/config/pricing";

/** First actions that pay off fastest, in the order we want people to take them. */
const CHECKLIST = [
  {
    icon: FileText,
    title: "Upload your resume",
    body: "Get an instant ATS score and line-by-line rewrite suggestions.",
    to: "/resume",
  },
  {
    icon: Target,
    title: "Match against a real job",
    body: "Paste a job description and see exactly where the gaps are.",
    to: "/job-match",
  },
  {
    icon: Mic,
    title: "Run a mock interview",
    body: "Live AI interviewer with scoring and a coaching report at the end.",
    to: "/interview",
  },
];

/** Annual plans include a one-off bonus grant — mirrors ANNUAL_BONUS server-side. */
const ANNUAL_BONUS: Record<string, { application: number; interview: number }> = {
  starter: { application: 10, interview: 3 },
  pro: { application: 25, interview: 6 },
  advanced: { application: 50, interview: 12 },
};

/** Post-checkout landing page. Paddle redirects here on success. */
export default function Welcome() {
  const [params] = useSearchParams();
  const isPack = params.get("purchase") === "pack";
  const queryClient = useQueryClient();
  const { plan, billingInterval, subscribed } = useSubscription();
  const tier = plan;
  const interval = billingInterval;
  const isSubscribed = subscribed;

  // The webhook writes entitlements a moment after redirect — poll briefly.
  useEffect(() => {
    const invalidate = () => {
      queryClient.invalidateQueries({ queryKey: ["subscription"] });
      queryClient.invalidateQueries({ queryKey: ["entitlements"] });
      queryClient.invalidateQueries({ queryKey: ["usage-credits"] });
      queryClient.invalidateQueries({ queryKey: ["purchases"] });
    };
    invalidate();
    const timers = [2000, 5000, 10000].map((ms) => window.setTimeout(invalidate, ms));
    return () => timers.forEach(window.clearTimeout);
  }, [queryClient]);

  const planName = PLAN_PRICING[(tier ?? "free") as PlanId]?.name ?? "Gradr";
  const bonus = interval === "annual" ? ANNUAL_BONUS[tier ?? ""] : undefined;

  return (
    <div className="mx-auto max-w-3xl space-y-6 py-12">
      <Seo
        title="Welcome to Gradr"
        description="Your purchase is confirmed — start using your new AI career tools."
        path="/welcome"
      />

      <Card className="space-y-6 p-10 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
          <CheckCircle2 className="h-8 w-8 text-primary" aria-hidden />
        </div>
        <div className="space-y-2">
          <h1 className="type-h1 text-foreground">{isPack ? "Credits added" : "You're all set"}</h1>
          <p className="text-muted-foreground">
            {isPack
              ? "Your credit pack is being applied to your account — it appears in your usage within a few seconds."
              : `Welcome to Gradr ${planName}. Your entitlements unlock as soon as the payment confirmation lands (usually instantly).`}
          </p>
          {!isPack && isSubscribed && (
            <div className="flex flex-wrap justify-center gap-2 pt-1">
              <Badge className="gap-1">
                <Sparkles className="h-3 w-3" aria-hidden />
                {planName} {interval === "annual" ? "Annual" : "Monthly"}
              </Badge>
            </div>
          )}
        </div>
      </Card>

      {bonus && (
        <Card className="flex items-start gap-3 border-primary/30 bg-primary/5 p-5">
          <Gift className="mt-0.5 h-5 w-5 text-primary" aria-hidden />
          <div className="space-y-1">
            <p className="text-sm font-semibold text-foreground">Your annual bonus credits are on the way</p>
            <p className="text-sm text-muted-foreground">
              {bonus.application} extra application credits and {bonus.interview} extra interview credits, added once
              for choosing yearly billing. They never expire.
            </p>
          </div>
        </Card>
      )}

      {!isPack && (
        <Card className="space-y-4 p-6">
          <div className="space-y-1">
            <h2 className="text-sm font-semibold text-foreground">Start here — 10 minutes to your first win</h2>
            <p className="text-sm text-muted-foreground">
              Three steps that turn your new plan into interviews.
            </p>
          </div>
          <ol className="space-y-3">
            {CHECKLIST.map((step, index) => (
              <li key={step.to}>
                <Link
                  to={step.to}
                  className="flex items-center gap-4 rounded-lg border border-border/70 p-4 transition-colors hover:border-primary/50 hover:bg-primary/5"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <step.icon className="h-4 w-4" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-foreground">
                      {index + 1}. {step.title}
                    </span>
                    <span className="block text-sm text-muted-foreground">{step.body}</span>
                  </span>
                  <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                </Link>
              </li>
            ))}
          </ol>
        </Card>
      )}

      <div className="flex flex-col justify-center gap-3 sm:flex-row">
        <Button asChild>
          <Link to="/">
            Go to dashboard <ArrowRight className="ml-2 h-4 w-4" aria-hidden />
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link to="/billing">View billing</Link>
        </Button>
      </div>
    </div>
  );
}
