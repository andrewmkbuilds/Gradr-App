import { useNavigate } from "react-router-dom";
import { DollarSign, Users, TrendingUp, Clock, Sparkles, CheckCircle2, ArrowRight, Loader2 } from "lucide-react";
import { useMyAffiliate, useAffiliateSettings } from "@/hooks/useAffiliate";

export default function AffiliateProgram() {
  const navigate = useNavigate();
  const { data: my, isLoading } = useMyAffiliate();
  const { data: settings } = useAffiliateSettings();

  const rate = settings?.default_commission_rate ?? 20;
  const rateType = settings?.default_commission_type ?? "percentage";
  const cookieDays = settings?.cookie_duration_days ?? 90;

  const renderCta = () => {
    if (isLoading) return <Loader2 className="h-5 w-5 animate-spin text-primary" />;
    if (my?.profile && my.profile.status === "active") {
      return (
        <button onClick={() => navigate("/affiliate/dashboard")} className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-primary text-primary-foreground font-medium hover:opacity-90 transition">
          Open affiliate dashboard <ArrowRight className="h-4 w-4" />
        </button>
      );
    }
    if (my?.application?.status === "pending") {
      return (
        <div className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-warning/10 text-warning font-medium border border-warning/20">
          <Clock className="h-4 w-4" /> Application under review
        </div>
      );
    }
    if (my?.application?.status === "rejected") {
      return (
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-destructive/10 text-destructive text-sm border border-destructive/20">
            Previous application was not approved
          </div>
          <button onClick={() => navigate("/affiliate/apply")} className="block px-6 py-3 rounded-lg bg-primary text-primary-foreground font-medium hover:opacity-90 transition">
            Reapply
          </button>
        </div>
      );
    }
    return (
      <button onClick={() => navigate("/affiliate/apply")} className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-primary text-primary-foreground font-medium hover:opacity-90 transition glow-border">
        Apply to become an affiliate <ArrowRight className="h-4 w-4" />
      </button>
    );
  };

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      <div className="text-center space-y-4 animate-slide-up">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium">
          <Sparkles className="h-3 w-3" /> CareerFlow OS Partner Program
        </div>
        <h1 className="text-4xl font-bold text-foreground tracking-tight">
          Earn {rateType === "percentage" ? `${rate}%` : `$${rate}`} for every paying customer you refer
        </h1>
        <p className="text-muted-foreground max-w-2xl mx-auto">
          Share CareerFlow OS with your audience and earn recurring commissions on every subscription —
          backed by a {cookieDays}-day cookie window so you get credit for the full buying journey.
        </p>
        <div className="pt-4">{renderCta()}</div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { icon: DollarSign, title: `${rate}${rateType === "percentage" ? "%" : "$"} recurring`, desc: "Earn on every recurring payment, not just the first one." },
          { icon: Clock, title: `${cookieDays}-day cookie`, desc: "Industry-leading attribution window — full credit for the journey." },
          { icon: Users, title: "Audience aligned", desc: "Perfect for career creators, coaches, bootcamps, and communities." },
        ].map((b) => (
          <div key={b.title} className="glass-card p-6 animate-slide-up">
            <b.icon className="h-5 w-5 text-primary mb-3" />
            <div className="text-sm font-semibold text-foreground">{b.title}</div>
            <p className="text-xs text-muted-foreground mt-1">{b.desc}</p>
          </div>
        ))}
      </div>

      <div className="glass-card p-6 animate-slide-up">
        <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-primary" /> How it works
        </h2>
        <ol className="space-y-3 text-sm">
          {[
            "Apply with your audience info and promo plan — most applications reviewed within 48 hours.",
            "Once approved, get a unique referral link (myapp.com?ref=YOURCODE) and a real-time dashboard.",
            `Share your link — every click is tracked and remembered for ${cookieDays} days.`,
            "Earn commissions when referred users sign up and upgrade. Track everything in your dashboard.",
            "Get paid monthly once you cross the minimum payout threshold.",
          ].map((step, i) => (
            <li key={i} className="flex gap-3">
              <span className="h-6 w-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center shrink-0">{i + 1}</span>
              <span className="text-muted-foreground pt-0.5">{step}</span>
            </li>
          ))}
        </ol>
      </div>

      <div className="glass-card p-6 animate-slide-up">
        <h2 className="text-lg font-semibold text-foreground mb-3">Terms summary</h2>
        <ul className="space-y-2 text-sm text-muted-foreground">
          {[
            "No self-referrals or incentivized fake signups.",
            "No paid search on CareerFlow OS branded keywords.",
            "Commissions are reversed on refunds or chargebacks.",
            "CareerFlow OS may revoke status for policy violations at any time.",
          ].map((t) => (
            <li key={t} className="flex gap-2"><CheckCircle2 className="h-4 w-4 text-primary shrink-0 mt-0.5" /> {t}</li>
          ))}
        </ul>
        {settings?.affiliate_terms && (
          <p className="text-xs text-muted-foreground mt-4 whitespace-pre-line border-t border-border pt-4">
            {settings.affiliate_terms}
          </p>
        )}
      </div>
    </div>
  );
}
