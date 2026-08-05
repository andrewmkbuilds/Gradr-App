import { Zap, Mic, Plus } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { useCredits, useSubscription } from "@/hooks/useSubscription";

interface CreditsBalanceProps {
  /** Show only one credit type (used on engine pages). */
  only?: "application" | "interview";
  compact?: boolean;
}

/** Shows current one-off credit balances with a top-up shortcut. */
export function CreditsBalance({ only, compact }: CreditsBalanceProps) {
  const { data: credits, isLoading } = useCredits();
  const { isPro } = useSubscription();
  const navigate = useNavigate();

  const items = [
    { key: "application" as const, label: "Application credits", icon: Zap, value: credits?.application_credits ?? 0 },
    { key: "interview" as const, label: "Interview prep credits", icon: Mic, value: credits?.interview_credits ?? 0 },
  ].filter((i) => !only || i.key === only);

  if (isLoading) return null;

  if (compact) {
    return (
      <div className="flex items-center gap-3 flex-wrap">
        {items.map((i) => (
          <span
            key={i.key}
            className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-card/60 backdrop-blur-sm px-3 py-1 text-xs text-muted-foreground"
          >
            <i.icon className="h-3.5 w-3.5 text-primary" />
            <span className="text-foreground font-medium">{isPro ? "Unlimited" : i.value}</span>
            {i.label.replace(" credits", "")} credits
          </span>
        ))}
        <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={() => navigate("/pricing")}>
          <Plus className="h-3 w-3" />
          Top up
        </Button>
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {items.map((i) => (
        <Card key={i.key} className="p-5 bg-card/60 backdrop-blur-sm border-border/60">
          <div className="flex items-center justify-between gap-2 mb-2">
            <span className="flex items-center gap-2 text-sm text-muted-foreground">
              <i.icon className="h-4 w-4 text-primary" />
              {i.label}
            </span>
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => navigate("/pricing")}>
              Top up
            </Button>
          </div>
          <div className="text-3xl font-bold text-foreground">{isPro ? "Unlimited" : i.value}</div>
        </Card>
      ))}
    </div>
  );
}
