import { Check, Sparkles, Rocket, Crown, Zap, Mic } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useBillingActions, useSubscription } from "@/hooks/useSubscription";
import { toast } from "sonner";

type PlanRef = { tier: "starter" | "pro"; interval: "monthly" | "annual" } | null;

const tiers: {
  name: string;
  price: string;
  period: string;
  description: string;
  icon: typeof Sparkles;
  highlighted: boolean;
  plan: PlanRef;
  note?: string;
  features: string[];
  cta: string;
}[] = [
  {
    name: "Free",
    price: "$0",
    period: "forever",
    description: "Explore the basics of CareerFlow OS.",
    icon: Sparkles,
    highlighted: false,
    plan: null,
    features: [
      "1 resume analysis per month",
      "Basic ATS scoring",
      "5 job matches per month",
      "Community support",
    ],
    cta: "Get started",
  },
  {
    name: "Starter",
    price: "$9",
    period: "per month",
    description: "Core AI tools for an active job search.",
    icon: Zap,
    highlighted: false,
    plan: { tier: "starter", interval: "monthly" },
    note: "or $84 billed annually",
    features: [
      "10 resume analyses per month",
      "ATS optimization",
      "50 job matches per month",
      "5 cover letters per month",
      "Email support",
    ],
    cta: "Start Starter",
  },
  {
    name: "Pro Monthly",
    price: "$19",
    period: "per month",
    description: "For serious job seekers ready to land roles fast.",
    icon: Rocket,
    highlighted: false,
    plan: { tier: "pro", interval: "monthly" },
    features: [
      "Unlimited resume analysis",
      "Advanced ATS + AI suggestions",
      "Unlimited job matching",
      "AI-generated cover letters",
      "Mock interview coach",
      "Priority email support",
    ],
    cta: "Start Pro",
  },
  {
    name: "Pro Annual",
    price: "$168",
    period: "per year",
    description: "Everything in Pro — billed yearly, just $14/month.",
    icon: Crown,
    highlighted: true,
    plan: { tier: "pro", interval: "annual" },
    note: "Equivalent to $14/month · save $60",
    features: [
      "Everything in Pro Monthly",
      "Save $60 vs monthly billing",
      "Priority feature access",
      "Annual career strategy review",
    ],
    cta: "Start Annual",
  },
];


const packs = [
  { key: "applications_10", label: "10 Extra Applications", price: "$9", icon: Zap, blurb: "Top up your application generator." },
  { key: "applications_25", label: "25 Extra Applications", price: "$19", icon: Zap, blurb: "Best value for heavy application weeks." },
  { key: "interview_pack_3", label: "Interview Prep Pack · 3", price: "$12", icon: Mic, blurb: "Three full AI mock interview sessions." },
  { key: "interview_pack_10", label: "Interview Prep Pack · 10", price: "$34", icon: Mic, blurb: "Ten sessions for intensive prep." },
];

export default function Pricing() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isPro, billingInterval } = useSubscription();
  const { pending, startSubscription, buyPack } = useBillingActions();
  const [tab, setTab] = useState<"plans" | "packs">("plans");

  const handleSelect = (plan: PlanRef) => {
    if (!user) {
      navigate("/auth");
      return;
    }
    if (!plan) {
      toast.success("You're on the Free plan!");
      return;
    }
    void startSubscription(plan.interval, plan.tier);
  };


  const handlePack = (key: string) => {
    if (!user) {
      navigate("/auth");
      return;
    }
    void buyPack(key);
  };

  return (
    <div className="max-w-6xl mx-auto py-8 space-y-10">
      <div className="text-center space-y-3">
        <h1 className="text-4xl font-bold tracking-tight text-foreground">Choose your career edge</h1>
        <p className="text-muted-foreground max-w-xl mx-auto">
          Start free. Upgrade when you're ready to dominate your job search with full AI firepower.
        </p>
        <div className="inline-flex rounded-lg border border-border p-1 bg-card/50">
          {(["plans", "packs"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-1.5 text-sm rounded-md transition-colors ${
                tab === t ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t === "plans" ? "Subscriptions" : "Pay-per-use packs"}
            </button>
          ))}
        </div>
      </div>

      {tab === "plans" ? (
        <div className="grid gap-6 md:grid-cols-3">
          {tiers.map((tier) => {
            const Icon = tier.icon;
            const current = isPro && tier.plan === billingInterval;
            return (
              <Card
                key={tier.name}
                className={`relative p-6 flex flex-col ${
                  tier.highlighted ? "border-primary shadow-lg shadow-primary/10 scale-[1.02]" : "border-border"
                }`}
              >
                {tier.highlighted && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground text-xs font-semibold px-3 py-1 rounded-full">
                    Best value
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
                  onClick={() => (current ? navigate("/billing") : handleSelect(tier.plan))}
                  variant={tier.highlighted ? "default" : "outline"}
                  className="w-full"
                  disabled={pending === tier.plan}
                >
                  {current ? "Manage plan" : pending === tier.plan ? "Opening checkout…" : tier.cta}
                </Button>
              </Card>
            );
          })}
        </div>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {packs.map((pack) => {
            const Icon = pack.icon;
            return (
              <Card key={pack.key} className="p-5 flex flex-col">
                <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center mb-3">
                  <Icon className="h-4 w-4 text-primary" />
                </div>
                <h3 className="text-sm font-semibold text-foreground">{pack.label}</h3>
                <p className="text-xs text-muted-foreground mt-1 mb-4 flex-1">{pack.blurb}</p>
                <div className="text-2xl font-bold text-foreground mb-4">{pack.price}</div>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => handlePack(pack.key)}
                  disabled={pending === pack.key}
                >
                  {pending === pack.key ? "Opening checkout…" : "Buy pack"}
                </Button>
              </Card>
            );
          })}
        </div>
      )}

      <p className="text-center text-xs text-muted-foreground">
        Secure checkout and billing powered by Stripe. Cancel anytime from your billing page.
      </p>
    </div>
  );
}
