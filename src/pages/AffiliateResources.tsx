import { useAffiliateSettings } from "@/hooks/useAffiliate";
import { BookOpen, FileText, ShieldCheck } from "lucide-react";

export default function AffiliateResources() {
  const { data: settings } = useAffiliateSettings();
  const rate = settings?.default_commission_rate ?? 20;
  const cookieDays = settings?.cookie_duration_days ?? 90;
  const threshold = settings?.minimum_payout_threshold ?? 50;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Affiliate Resources</h1>
        <p className="text-sm text-muted-foreground mt-1">Everything you need to promote Gradr.</p>
      </div>

      <div className="glass-card p-6">
        <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2"><BookOpen className="h-4 w-4 text-primary" /> Commission rules</h2>
        <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
          <li>Default rate: <span className="text-foreground">{rate}{settings?.default_commission_type === "percentage" ? "%" : "$"}</span> per qualifying conversion.</li>
          <li>Attribution window: <span className="text-foreground">{cookieDays} days</span>, last-touch.</li>
          <li>Commissions enter "pending" on creation and move to "approved" after the refund window passes.</li>
          <li>Refunded or chargebacked sales are automatically reversed.</li>
        </ul>
      </div>

      <div className="glass-card p-6">
        <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2"><FileText className="h-4 w-4 text-primary" /> Payout terms</h2>
        <p className="text-sm text-muted-foreground whitespace-pre-line">
          Payouts are reviewed and sent by the Gradr team once your approved commissions clear the minimum threshold. You'll get a notification when a payout is marked as paid.
        </p>
        <p className="text-sm text-foreground mt-2">Minimum payout: ${Number(threshold).toFixed(2)}</p>
      </div>

      <div className="glass-card p-6">
        <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-primary" /> Referral rules</h2>
        <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
          <li>No self-referrals.</li>
          <li>No paid search on "Gradr", or related branded keywords.</li>
          <li>No spam, misleading claims, or coupon-site stuffing.</li>
          <li>No incentivized fake signups.</li>
        </ul>
      </div>

      <div className="glass-card p-6">
        <h2 className="text-sm font-semibold text-foreground mb-3">Full affiliate terms</h2>
        <p className="text-sm text-muted-foreground whitespace-pre-line">{settings?.affiliate_terms}</p>
      </div>
    </div>
  );
}
