import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Copy, MousePointerClick, Users, DollarSign, TrendingUp, Loader2, Link2, BarChart3, Wrench, LayoutDashboard } from "lucide-react";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMyAffiliate } from "@/hooks/useAffiliate";
import { StatCard } from "@/components/StatCard";
import { format } from "date-fns";
import { CampaignBuilder } from "@/components/affiliate/CampaignBuilder";
import { AffiliateAnalytics } from "@/components/affiliate/AffiliateAnalytics";

type Tab = "overview" | "analytics" | "campaigns";

export default function AffiliateDashboard() {
  const navigate = useNavigate();
  const { data: my, isLoading: loadingMy } = useMyAffiliate();
  const profile = my?.profile;
  const [copied, setCopied] = useState(false);
  const [tab, setTab] = useState<Tab>("overview");

  const link = useMemo(() => {
    if (!profile) return "";
    return `${window.location.origin}/?ref=${profile.affiliate_code}`;
  }, [profile]);

  const { data, isLoading } = useQuery({
    queryKey: ["affiliateStats", profile?.id],
    enabled: !!profile,
    queryFn: async () => {
      const [clicks, referrals, commissions, payouts] = await Promise.all([
        supabase.from("affiliate_clicks").select("id, clicked_at, landing_page, utm_source").eq("affiliate_profile_id", profile!.id).order("clicked_at", { ascending: false }).limit(20),
        supabase.from("affiliate_referrals").select("*").eq("affiliate_profile_id", profile!.id).order("created_at", { ascending: false }).limit(20),
        supabase.from("affiliate_commissions").select("*").eq("affiliate_profile_id", profile!.id).order("created_date", { ascending: false }),
        supabase.from("affiliate_payouts").select("*").eq("affiliate_profile_id", profile!.id).order("created_at", { ascending: false }),
      ]);
      return {
        clicks: clicks.data || [],
        referrals: referrals.data || [],
        commissions: commissions.data || [],
        payouts: payouts.data || [],
      };
    },
  });

  if (loadingMy || isLoading) {
    return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }
  if (!profile) {
    navigate("/affiliate", { replace: true });
    return null;
  }

  const totals = (() => {
    const c = data?.commissions || [];
    const sum = (status: string) => c.filter((x) => x.status === status).reduce((a, x) => a + Number(x.commission_amount || 0), 0);
    const pending = sum("pending");
    const approved = sum("approved");
    const paid = sum("paid");
    const reversed = sum("reversed");
    return { pending, approved, paid, reversed, lifetime: pending + approved + paid, unpaid: pending + approved };
  })();

  const totalClicks = data?.clicks.length ?? 0;
  const totalReferrals = data?.referrals.length ?? 0;
  const conversions = (data?.referrals || []).filter((r) => r.conversion_date).length;
  const convRate = totalClicks ? `${Math.round((conversions / totalClicks) * 100)}%` : "—";

  const copy = async () => {
    await navigator.clipboard.writeText(link);
    setCopied(true);
    toast.success("Referral link copied");
    setTimeout(() => setCopied(false), 1500);
  };

  const tabs: { id: Tab; label: string; icon: typeof LayoutDashboard }[] = [
    { id: "overview", label: "Overview", icon: LayoutDashboard },
    { id: "analytics", label: "Analytics", icon: BarChart3 },
    { id: "campaigns", label: "Campaign links", icon: Wrench },
  ];

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Affiliate Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">Track clicks, referrals, and commissions.</p>
        </div>
        <button onClick={() => navigate("/affiliate/resources")} className="text-xs text-primary hover:underline">Resources & terms →</button>
      </div>

      <div className="glass-card p-5 flex items-center gap-3 flex-wrap">
        <Link2 className="h-5 w-5 text-primary shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="text-xs text-muted-foreground">Your referral link</div>
          <div className="text-sm font-mono text-foreground truncate">{link}</div>
        </div>
        <button onClick={copy} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm hover:opacity-90 transition">
          <Copy className="h-3.5 w-3.5" /> {copied ? "Copied" : "Copy"}
        </button>
      </div>

      <div className="flex gap-1 border-b border-border overflow-x-auto">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`inline-flex items-center gap-2 px-4 py-2.5 text-sm border-b-2 transition whitespace-nowrap ${
              tab === t.id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <t.icon className="h-3.5 w-3.5" /> {t.label}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard icon={MousePointerClick} title="Clicks" value={String(totalClicks)} subtitle="recent" />
            <StatCard icon={Users} title="Referrals" value={String(totalReferrals)} subtitle={`${conversions} converted`} />
            <StatCard icon={TrendingUp} title="Conversion rate" value={convRate} subtitle="referrals / clicks" />
            <StatCard icon={DollarSign} title="Unpaid balance" value={`$${totals.unpaid.toFixed(2)}`} subtitle={`$${totals.lifetime.toFixed(2)} lifetime`} glowing={totals.unpaid > 0} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {[
              { label: "Pending", value: totals.pending },
              { label: "Approved", value: totals.approved },
              { label: "Paid", value: totals.paid },
              { label: "Reversed", value: totals.reversed },
            ].map((s) => (
              <div key={s.label} className="glass-card p-4">
                <div className="text-xs text-muted-foreground">{s.label}</div>
                <div className="text-xl font-bold text-foreground mt-1">${s.value.toFixed(2)}</div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="glass-card p-6">
              <h3 className="text-sm font-semibold text-foreground mb-3">Recent referrals</h3>
              {data!.referrals.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">No referrals yet — share your link to start.</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {data!.referrals.slice(0, 8).map((r) => (
                    <li key={r.id} className="flex items-center justify-between p-2.5 rounded-lg bg-secondary/50">
                      <span className="text-foreground">{r.conversion_type || "signup"}</span>
                      <span className="text-xs text-muted-foreground">{format(new Date(r.created_at), "MMM d")}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="glass-card p-6">
              <h3 className="text-sm font-semibold text-foreground mb-3">Payout history</h3>
              {data!.payouts.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">No payouts yet. Payouts are processed monthly once you hit the minimum threshold.</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {data!.payouts.slice(0, 8).map((p) => (
                    <li key={p.id} className="flex items-center justify-between p-2.5 rounded-lg bg-secondary/50">
                      <div>
                        <div className="text-foreground">${Number(p.amount).toFixed(2)}</div>
                        <div className="text-xs text-muted-foreground">{p.payout_method || "—"} · {p.reference || "no ref"}</div>
                      </div>
                      <span className={`text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full ${
                        p.status === "paid" ? "bg-success/10 text-success"
                        : p.status === "failed" ? "bg-destructive/10 text-destructive"
                        : "bg-warning/10 text-warning"
                      }`}>{p.status}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </>
      )}

      {tab === "analytics" && <AffiliateAnalytics affiliateProfileId={profile.id} />}

      {tab === "campaigns" && <CampaignBuilder affiliateProfileId={profile.id} affiliateCode={profile.affiliate_code} />}
    </div>
  );
}
