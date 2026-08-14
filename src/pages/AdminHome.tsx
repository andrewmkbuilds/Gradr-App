import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  BadgePercent,
  BarChart3,
  Gauge,
  Gift,
  Image as ImageIcon,
  ClipboardCheck,
  LayoutGrid,
  Mail,
  ScrollText,
  Search,
  ShieldCheck,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/app/PageHeader";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { typography } from "@/lib/design/typography";
import { getPaddleEnvironment } from "@/lib/paddle";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";

/**
 * Admin home — one place that answers "is anything on fire?" and routes to
 * every operational surface. Counters are live; the tiles below are the map.
 */

interface SectionLink {
  title: string;
  description: string;
  url: string;
  icon: LucideIcon;
}

const SECTIONS: { group: string; links: SectionLink[] }[] = [
  {
    group: "Revenue",
    links: [
      { title: "Revenue dashboard", description: "MRR, plan mix, churn and failed payments.", url: "/admin/revenue", icon: Wallet },
      { title: "Paddle customers", description: "Customer and subscription mirror.", url: "/admin/paddle", icon: Wallet },
      { title: "Payments status", description: "Provider config and webhook health.", url: "/admin/payments-status", icon: Activity },
      { title: "Discounts", description: "Eligibility programs and redemption rules.", url: "/admin/discounts", icon: BadgePercent },
    ],
  },
  {
    group: "Product usage",
    links: [
      { title: "Usage & AI cost", description: "Feature consumption and estimated AI spend.", url: "/admin/usage", icon: Gauge },
      { title: "Nav analytics", description: "How people move through the product.", url: "/admin/nav-analytics", icon: BarChart3 },
      { title: "Blog analytics", description: "Content clicks and conversions.", url: "/admin/blog-analytics", icon: BarChart3 },
    ],
  },
  {
    group: "Trust & safety",
    links: [
      { title: "Security findings", description: "Triage, diff and file scanner findings.", url: "/admin/security-findings", icon: ShieldCheck },
      { title: "Security log", description: "Authorization and billing decisions.", url: "/admin/security-log", icon: ShieldCheck },
      { title: "OAuth forensics", description: "Google sign-in redirect chains and deviations.", url: "/admin/oauth-forensics", icon: ShieldCheck },
      { title: "Audit log", description: "Every privileged admin write.", url: "/admin/audit-log", icon: ScrollText },
      { title: "Verifications", description: "Student and institution eligibility.", url: "/admin/verifications", icon: ShieldCheck },
      { title: "Legal documents", description: "Policy versions and acceptance.", url: "/admin/legal", icon: ScrollText },
    ],
  },
  {
    group: "Growth & brand",
    links: [
      { title: "Affiliates", description: "Applications, commissions and payouts.", url: "/admin/affiliates", icon: Gift },
      { title: "Search Console", description: "Impressions, clicks and indexing.", url: "/admin/search-console", icon: Search },
      { title: "SEO monitor", description: "Route-level metadata findings.", url: "/admin/seo-monitor", icon: BarChart3 },
      { title: "Digest preview", description: "Render the daily briefing email.", url: "/admin/digest-preview", icon: Mail },
      { title: "Brand assets", description: "Logos, icons and social previews.", url: "/admin/brand-assets", icon: ImageIcon },
      { title: "Design system", description: "Tokens, elevation and components.", url: "/admin/design-system", icon: LayoutGrid },
      { title: "QA checklist", description: "Loading, empty and error states per route.", url: "/admin/qa-checklist", icon: ClipboardCheck },
    ],
  },
];

function Pulse({
  label,
  value,
  hint,
  tone = "neutral",
  loading,
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: "neutral" | "good" | "warn" | "bad";
  loading?: boolean;
}) {
  const toneClass = {
    neutral: "text-foreground",
    good: "text-success",
    warn: "text-warning",
    bad: "text-destructive",
  }[tone];

  return (
    <Card className="p-4">
      <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
      {loading ? (
        <Skeleton className="mt-2 h-8 w-20" />
      ) : (
        <p className={cn("mt-1 text-3xl font-semibold tabular-nums", toneClass)}>{value}</p>
      )}
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </Card>
  );
}

export default function AdminHome() {
  const env = getPaddleEnvironment();

  const { data, isLoading } = useQuery({
    queryKey: ["admin-pulse", env],
    refetchInterval: 60_000,
    queryFn: async () => {
      const since = new Date(Date.now() - 7 * 864e5).toISOString();
      const lastScan = await supabase.from("security_scan_runs")
        .select("id, scanned_at, finding_count")
        .order("scanned_at", { ascending: false }).limit(1).maybeSingle();

      const [subs, pastDue, findings, verifications, deliveries] = await Promise.all([
        supabase.from("subscribers").select("user_id", { count: "exact", head: true })
          .eq("environment", env).eq("subscribed", true),
        supabase.from("subscribers").select("user_id", { count: "exact", head: true })
          .eq("environment", env).in("subscription_status", ["past_due", "unpaid"]),
        lastScan.data?.id
          ? supabase.from("security_scan_findings").select("level").eq("run_id", lastScan.data.id)
          : Promise.resolve({ data: [] as { level: string }[] }),
        supabase.from("eligibility_verifications").select("id", { count: "exact", head: true })
          .eq("status", "pending"),
        supabase.from("webhook_deliveries").select("state").gte("created_at", since),
      ]);

      const openCritical = (findings.data ?? []).filter(
        (f) => f.level === "error",
      ).length;
      const failedWebhooks = (deliveries.data ?? []).filter((d) => d.state === "failed").length;

      return {
        activeSubs: subs.count ?? 0,
        pastDue: pastDue.count ?? 0,
        openCritical,
        pendingVerifications: verifications.count ?? 0,
        failedWebhooks,
        lastScanAt: lastScan.data?.scanned_at ?? null,
        lastScanFindings: lastScan.data?.finding_count ?? null,
      };
    },
  });

  return (
    <div className="page-shell page-stack">
      <PageHeader
        eyebrow="Operations"
        icon={<ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />}
        title="Admin control room"
        description="Revenue, usage, security and growth — the whole operation on one screen."
        meta={<Badge variant="secondary" className="uppercase tracking-wide">{env}</Badge>}
      />

      <section aria-label="Operational pulse" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Pulse label="Active subscribers" value={data?.activeSubs ?? 0} loading={isLoading} />
        <Pulse
          label="Payment issues"
          value={data?.pastDue ?? 0}
          tone={(data?.pastDue ?? 0) > 0 ? "warn" : "good"}
          hint="past_due / unpaid"
          loading={isLoading}
        />
        <Pulse
          label="Open critical findings"
          value={data?.openCritical ?? 0}
          tone={(data?.openCritical ?? 0) > 0 ? "bad" : "good"}
          loading={isLoading}
        />
        <Pulse
          label="Failed webhooks (7d)"
          value={data?.failedWebhooks ?? 0}
          tone={(data?.failedWebhooks ?? 0) > 0 ? "warn" : "good"}
          loading={isLoading}
        />
        <Pulse
          label="Pending verifications"
          value={data?.pendingVerifications ?? 0}
          tone={(data?.pendingVerifications ?? 0) > 0 ? "warn" : "good"}
          loading={isLoading}
        />
      </section>

      <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div>
          <p className={typography.h4}>Security scan</p>
          <p className="text-sm text-muted-foreground">
            {data?.lastScanAt
              ? `Last run ${formatDistanceToNow(new Date(data.lastScanAt), { addSuffix: true })} · ${data.lastScanFindings ?? 0} findings`
              : "No scan runs recorded yet."}
          </p>
        </div>
        <Link
          to="/admin/security-findings"
          className="text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          Open Security Center
        </Link>
      </Card>

      {SECTIONS.map((section) => (
        <section key={section.group} className="space-y-3">
          <h2 className={cn(typography.h3, "text-foreground")}>{section.group}</h2>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {section.links.map((link) => (
              <Link key={link.url} to={link.url} className="group focus-visible:outline-none">
                <Card className="h-full p-4 transition-colors group-hover:border-primary/40 group-focus-visible:border-primary">
                  <div className="flex items-start gap-3">
                    <span className="rounded-lg bg-primary/10 p-2 text-primary">
                      <link.icon className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                      <p className="font-medium text-foreground">{link.title}</p>
                      <p className="text-sm text-muted-foreground">{link.description}</p>
                    </div>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
