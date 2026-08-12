/**
 * Single place to edit the paid pricing tiers.
 *
 * `priceId` values are the human-readable Paddle price IDs (external IDs) —
 * they are identical in sandbox and live, and are resolved to the internal
 * `pri_...` ID at runtime by the `get-paddle-price` edge function.
 *
 * Prices themselves are NEVER hard-coded here: the pricing page renders the
 * localized `formattedTotals` returned by `Paddle.PricePreview()`.
 */
export type TierName = "Starter" | "Pro" | "Advanced";

export interface Tier {
  name: TierName;
  /** Internal plan key used for entitlement gating. */
  key: "starter" | "pro" | "advanced";
  description: string;
  features: string[];
  priceId: { month: string; year: string };
  highlighted?: boolean;
}

export const TIERS: Tier[] = [
  {
    name: "Starter",
    key: "starter",
    description: "Core AI tools for an active job search.",
    features: [
      "20 resume analyses per month",
      "ATS optimization + keyword gaps",
      "10 application packages per month",
      "8 AI mock interviews per month",
      "Email support",
    ],
    priceId: { month: "starter_monthly", year: "starter_annual" },
  },
  {
    name: "Pro",
    key: "pro",
    description: "For serious job seekers ready to land roles fast.",
    features: [
      "Unlimited resume analysis",
      "Advanced ATS + AI rewrite suggestions",
      "Unlimited job matching",
      "Unlimited AI application packages",
      "Realtime AI mock interviews",
      "Priority support",
    ],
    priceId: { month: "pro_monthly", year: "pro_annual" },
    highlighted: true,
  },
  {
    name: "Advanced",
    key: "advanced",
    description: "Maximum firepower with deep research and coaching.",
    features: [
      "Everything in Pro",
      "Extended realtime interview sessions",
      "Deep company + interviewer research",
      "Personalized 7-day practice plans",
      "Priority AI queue",
      "Concierge onboarding",
    ],
    priceId: { month: "advanced_monthly", year: "advanced_annual" },
  },
];

/** Free plan shown alongside the paid tiers — no Paddle price attached. */
export const FREE_TIER = {
  name: "Free",
  key: "free" as const,
  description: "Explore the basics of CareerFlow OS.",
  features: [
    "3 resume analyses per month",
    "Basic ATS scoring",
    "1 application package per month",
    "2 AI mock interviews per month",
  ],
};

/** One-time credit packs (also priced by Paddle). */
export const CREDIT_PACKS: { priceId: string; label: string; blurb: string }[] = [
  { priceId: "applications_10", label: "10 Extra Applications", blurb: "Top up your application generator." },
  { priceId: "applications_25", label: "25 Extra Applications", blurb: "Best value for heavy application weeks." },
  { priceId: "interview_pack_3", label: "Interview Prep Pack · 3", blurb: "Three full AI mock interview sessions." },
  { priceId: "interview_pack_10", label: "Interview Prep Pack · 10", blurb: "Ten sessions for intensive prep." },
];
