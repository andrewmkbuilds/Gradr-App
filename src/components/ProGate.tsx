import { ReactNode } from "react";
import { Lock, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useNavigate } from "react-router-dom";
import { useSubscription } from "@/hooks/useSubscription";

interface ProGateProps {
  children: ReactNode;
  feature?: string;
  description?: string;
}

/** Renders children for Pro subscribers; free users get an upgrade prompt instead. */
export function ProGate({ children, feature = "This feature", description }: ProGateProps) {
  const { isPro, isLoading } = useSubscription();
  const navigate = useNavigate();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (isPro) return <>{children}</>;

  return (
    <Card className="p-8 text-center border-border/60 bg-card/60 backdrop-blur-sm">
      <div className="mx-auto h-11 w-11 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
        <Lock className="h-5 w-5 text-primary" />
      </div>
      <h3 className="text-lg font-semibold text-foreground mb-1.5">{feature} is a Pro feature</h3>
      <p className="text-sm text-muted-foreground max-w-md mx-auto mb-5">
        {description ??
          "Upgrade to CareerFlow OS Pro for unlimited AI analysis, matching and interview coaching."}
      </p>
      <Button onClick={() => navigate("/pricing")} className="gap-2">
        <Sparkles className="h-4 w-4" />
        View plans
      </Button>
    </Card>
  );
}
