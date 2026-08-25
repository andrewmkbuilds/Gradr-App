import { Lock, Clock, XCircle, PauseCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ds/Button";

type Props = {
  /** Latest application status, if the user ever applied. */
  applicationStatus?: string | null;
  /** Affiliate profile status when a profile exists but isn't active. */
  profileStatus?: string | null;
  /** What the visitor was trying to open, used in the copy. */
  surface?: string;
};

/**
 * Locked state for affiliate-only surfaces. Rendered instead of silently
 * redirecting so people understand *why* the page is closed and what unlocks
 * it. Server-side RLS is the real gate — this is the explanation.
 */
export function AffiliateLocked({ applicationStatus, profileStatus, surface = "affiliate dashboard" }: Props) {
  const navigate = useNavigate();

  const state = profileStatus && profileStatus !== "active"
    ? ({
        icon: PauseCircle,
        title: "Your affiliate account is paused",
        body: `This ${surface} unlocks again once your affiliate account is reinstated. Reach out to support if you think this is a mistake.`,
        cta: { label: "Affiliate program", to: "/affiliate" },
      } as const)
    : applicationStatus === "pending"
      ? ({
          icon: Clock,
          title: "Your application is under review",
          body: `We're reviewing your affiliate application. The ${surface} unlocks the moment you're approved — usually within a couple of business days.`,
          cta: { label: "Program details", to: "/affiliate" },
        } as const)
      : applicationStatus === "rejected"
        ? ({
            icon: XCircle,
            title: "Application not approved",
            body: `Your affiliate application wasn't approved, so the ${surface} stays locked. You can review the program terms and apply again later.`,
            cta: { label: "Review the program", to: "/affiliate" },
          } as const)
        : ({
            icon: Lock,
            title: "Sign up as an affiliate to unlock this",
            body: `The ${surface} is for approved Gradr affiliates. Join the program to get your referral link, live earnings and payouts.`,
            cta: { label: "Become an affiliate", to: "/affiliate/apply" },
          } as const);

  const Icon = state.icon;

  return (
    <div className="max-w-2xl mx-auto py-16">
      <div className="elev-2 rounded-xl p-8 text-center">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-secondary">
          <Icon className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
        </div>
        <h1 className="type-h2 text-foreground tracking-tight">{state.title}</h1>
        <p className="mt-3 text-sm text-muted-foreground">{state.body}</p>
        <div className="mt-7 flex flex-wrap justify-center gap-3">
          <Button onClick={() => navigate(state.cta.to)}>{state.cta.label}</Button>
          <Button variant="outline" onClick={() => navigate("/dashboard")}>
            Back to dashboard
          </Button>
        </div>
      </div>
    </div>
  );
}
