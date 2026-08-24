import { ReactNode } from "react";
import { Lock, Sparkles } from "lucide-react";
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
  const { isPro, isLoading } = useSubscription();
  const { data: credits, isLoading: creditsLoading } = useCredits();
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
