import { ReactNode } from "react";
import { AlertTriangle, Lock, RefreshCw, Sparkles } from "lucide-react";
import { Button } from "@/components/ds/Button";
import { Card } from "@/components/ui/card";
import { useNavigate } from "react-router-dom";
import { useCredits, useSubscription } from "@/hooks/useSubscription";
import { PageHeader } from "@/components/app/PageHeader";

interface ProGateProps {
  children: ReactNode;
  feature?: string;
  description?: string;
  /** If set, users holding pay-per-use credits of this type also get access. */
  creditType?: "application" | "interview";
}

/** Renders children for Pro subscribers (or credit holders); free users get an upgrade prompt. */
export function ProGate({ children, feature = "This feature", description, creditType }: ProGateProps) {
  const { isPro, isLoading, isError, refetch } = useSubscription();
  const { data: credits, isLoading: creditsLoading, isError: creditsError, refetch: refetchCredits } = useCredits();
  const navigate = useNavigate();

  const hasCredits = creditType
    ? (creditType === "application"
      ? credits?.application_credits ?? 0
      : credits?.interview_credits ?? 0) > 0
    : false;

  if (isLoading || (creditType && creditsLoading)) {
    return (
      <div className="flex items-center justify-center py-12" role="status" aria-live="polite">
        <div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" aria-hidden="true" />
        <span className="sr-only">Checking your plan…</span>
      </div>
    );
  }

  if (isPro || hasCredits) return <>{children}</>;

  // A failed lookup is not the same as "you are on the free plan" — showing the
  // upgrade wall to a paying subscriber after a network blip is worse than
  // asking them to retry.
  if (isError || (creditType && creditsError)) {
    return (
      <div className="page-shell page-stack mx-auto max-w-3xl">
        <PageHeader title={feature} description={description} />
        <Card className="p-8 text-center border-border/60 bg-card/60 backdrop-blur-sm">
          <div className="mx-auto h-11 w-11 rounded-xl bg-destructive/10 flex items-center justify-center mb-4">
            <AlertTriangle className="h-5 w-5 text-destructive" aria-hidden="true" />
          </div>
          <h2 className="text-lg font-semibold text-foreground mb-1.5">We couldn't check your plan</h2>
          <p className="text-sm text-muted-foreground max-w-md mx-auto mb-5">
            Your subscription details didn't load. This is usually a temporary connection problem.
          </p>
          <Button
            onClick={() => {
              void refetch();
              void refetchCredits();
            }}
            className="gap-2"
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Try again
          </Button>
        </Card>
      </div>
    );
  }


  return (
    <div className="page-shell page-stack mx-auto max-w-3xl">
      <PageHeader title={feature} description={description} />
      <Card className="p-8 text-center border-border/60 bg-card/60 backdrop-blur-sm">
        <div className="mx-auto h-11 w-11 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
          <Lock className="h-5 w-5 text-primary" aria-hidden="true" />
        </div>
        <h2 className="text-lg font-semibold text-foreground mb-1.5">{feature} is a Pro feature</h2>
        <p className="text-sm text-muted-foreground max-w-md mx-auto mb-5">
          {description ??
            "Upgrade to Gradr Pro for unlimited AI analysis, matching and interview coaching."}
        </p>
        <Button onClick={() => navigate("/pricing")} className="gap-2">
          <Sparkles className="h-4 w-4" aria-hidden="true" />
          View plans
        </Button>
      </Card>
    </div>
  );
}
