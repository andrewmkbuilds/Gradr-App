import { Check, Sparkles, Rocket, Crown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

const tiers = [
  {
    name: "Starter",
    price: "$0",
    period: "forever",
    description: "Explore the basics of CareerFlow OS.",
    icon: Sparkles,
    highlighted: false,
    features: [
      "1 resume analysis per month",
      "Basic ATS scoring",
      "5 job matches per month",
      "Community support",
    ],
    cta: "Get started",
  },
  {
    name: "Pro",
    price: "$19",
    period: "per month",
    description: "For serious job seekers ready to land roles fast.",
    icon: Rocket,
    highlighted: true,
    features: [
      "Unlimited resume analysis",
      "Advanced ATS + AI suggestions",
      "Unlimited job matching",
      "AI-generated cover letters",
      "Mock interview coach",
      "Priority email support",
    ],
    cta: "Upgrade to Pro",
  },
  {
    name: "Executive",
    price: "$49",
    period: "per month",
    description: "For senior professionals and career switchers.",
    icon: Crown,
    highlighted: false,
    features: [
      "Everything in Pro",
      "1:1 strategy sessions",
      "Personal brand & LinkedIn audit",
      "Salary negotiation playbooks",
      "Dedicated career advisor",
    ],
    cta: "Go Executive",
  },
];

export default function Pricing() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const handleSelect = (tierName: string) => {
    if (!user) {
      navigate("/auth");
      return;
    }
    if (tierName === "Starter") {
      toast.success("You're on the Starter plan!");
      return;
    }
    toast.info("Checkout coming soon — payments setup in progress.");
  };

  return (
    <div className="max-w-6xl mx-auto py-8 space-y-10">
      <div className="text-center space-y-3">
        <h1 className="text-4xl font-bold tracking-tight text-foreground">
          Choose your career edge
        </h1>
        <p className="text-muted-foreground max-w-xl mx-auto">
          Start free. Upgrade when you're ready to dominate your job search with
          full AI firepower.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {tiers.map((tier) => {
          const Icon = tier.icon;
          return (
            <Card
              key={tier.name}
              className={`relative p-6 flex flex-col ${
                tier.highlighted
                  ? "border-primary shadow-lg shadow-primary/10 scale-[1.02]"
                  : "border-border"
              }`}
            >
              {tier.highlighted && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground text-xs font-semibold px-3 py-1 rounded-full">
                  Most popular
                </div>
              )}

              <div className="flex items-center gap-2 mb-4">
                <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Icon className="h-4 w-4 text-primary" />
                </div>
                <h3 className="text-lg font-semibold text-foreground">{tier.name}</h3>
              </div>

              <div className="mb-3">
                <span className="text-4xl font-bold text-foreground">{tier.price}</span>
                <span className="text-sm text-muted-foreground ml-1">/ {tier.period}</span>
              </div>

              <p className="text-sm text-muted-foreground mb-6">{tier.description}</p>

              <ul className="space-y-2.5 mb-6 flex-1">
                {tier.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm text-foreground">
                    <Check className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>

              <Button
                onClick={() => handleSelect(tier.name)}
                variant={tier.highlighted ? "default" : "outline"}
                className="w-full"
              >
                {tier.cta}
              </Button>
            </Card>
          );
        })}
      </div>

      <p className="text-center text-xs text-muted-foreground">
        All plans include secure cloud storage, regular AI updates, and cancel anytime.
      </p>
    </div>
  );
}
