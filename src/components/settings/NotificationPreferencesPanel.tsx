import { useEffect, useState } from "react";
import { Bell, Loader2, Mail, MailX, MonitorSmartphone, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Per-category notification channels. Defaults mirror the database defaults so
 * the UI never shows a state the backend wouldn't apply before the first save.
 *
 * Billing categories gate the dunning/renewal alert pipeline; product
 * categories gate the non-essential emails classified in
 * `src/lib/email/templateCatalog.ts` — the send function checks the same rows
 * through `email_category_allowed` before queueing anything.
 */
interface Prefs {
  dunning_email: boolean;
  dunning_in_app: boolean;
  renewal_email: boolean;
  renewal_in_app: boolean;
  webhook_issue_email: boolean;
  webhook_issue_in_app: boolean;
  refund_email: boolean;
  refund_in_app: boolean;
  job_matches_email: boolean;
  job_matches_in_app: boolean;
  application_reminders_email: boolean;
  application_reminders_in_app: boolean;
  product_insights_email: boolean;
  product_insights_in_app: boolean;
}

const DEFAULTS: Prefs = {
  dunning_email: true,
  dunning_in_app: true,
  renewal_email: true,
  renewal_in_app: true,
  webhook_issue_email: false,
  webhook_issue_in_app: true,
  refund_email: true,
  refund_in_app: true,
  job_matches_email: true,
  job_matches_in_app: true,
  application_reminders_email: true,
  application_reminders_in_app: true,
  product_insights_email: true,
  product_insights_in_app: true,
};

interface CategoryDef {
  key: string;
  title: string;
  description: string;
}

const BILLING_CATEGORIES: CategoryDef[] = [
  {
    key: "dunning",
    title: "Failed payments",
    description: "Declined cards, retry attempts and the final warning before your plan pauses.",
  },
  {
    key: "renewal",
    title: "Renewals & plan changes",
    description: "Upcoming renewals, receipts, upgrades, downgrades and cancellations.",
  },
  {
    key: "refund",
    title: "Refunds & credits",
    description: "Refunds we process and any credits removed from your balance.",
  },
  {
    key: "webhook_issue",
    title: "Billing sync issues",
    description: "Rare cases where a purchase takes longer than expected to apply.",
  },
];

const PRODUCT_CATEGORIES: CategoryDef[] = [
  {
    key: "job_matches",
    title: "Job matches",
    description: "New roles that match a search you saved.",
  },
  {
    key: "application_reminders",
    title: "Application follow-ups",
    description: "Reminders for follow-ups you scheduled on tracked applications.",
  },
  {
    key: "product_insights",
    title: "Resume & interview results",
    description: "Resume analyses, ATS score changes, interview reports and career plans you requested.",
  },
];

export function NotificationPreferencesPanel() {
  const { user } = useAuth();
  const [prefs, setPrefs] = useState<Prefs>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let active = true;
    (async () => {
      const { data } = await (
        supabase as unknown as {
          from: (t: string) => {
            select: (cols: string) => {
              eq: (col: string, val: string) => {
                maybeSingle: () => Promise<{ data: Prefs | null }>;
              };
            };
          };
        }
      )
        .from("notification_preferences")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();
      if (!active) return;
      if (data) setPrefs({ ...DEFAULTS, ...(data as Prefs) });
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [user]);

  const toggle = async (key: keyof Prefs, value: boolean) => {
    if (!user) return;
    const previous = prefs;
    const next = { ...prefs, [key]: value };
    setPrefs(next);
    setSavingKey(key);
    const { error } = await (
      supabase as unknown as {
        from: (t: string) => {
          upsert: (
            row: Record<string, unknown>,
            opts: { onConflict: string },
          ) => Promise<{ error: unknown }>;
        };
      }
    )
      .from("notification_preferences")
      .upsert({ user_id: user.id, ...next, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
    setSavingKey(null);
    if (error) {
      setPrefs(previous);
      toast.error("Couldn't save that preference");
    }
  };

  const renderRows = (categories: CategoryDef[]) => (
    <div className="divide-y divide-border/60">
      <div className="hidden sm:flex items-center justify-end gap-8 pb-2 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5 w-14 justify-center"><Mail className="h-3.5 w-3.5" />Email</span>
        <span className="flex items-center gap-1.5 w-14 justify-center"><MonitorSmartphone className="h-3.5 w-3.5" />In-app</span>
      </div>
      {categories.map((c) => {
        const emailKey = `${c.key}_email` as keyof Prefs;
        const inAppKey = `${c.key}_in_app` as keyof Prefs;
        return (
          <div key={c.key} className="flex items-start justify-between gap-6 py-4">
            <div className="min-w-0">
              <p className="font-medium text-sm">{c.title}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{c.description}</p>
            </div>
            <div className="flex items-center gap-8 shrink-0">
              <div className="w-14 flex justify-center">
                <Switch
                  aria-label={`${c.title} email`}
                  checked={prefs[emailKey]}
                  disabled={savingKey === emailKey}
                  onCheckedChange={(v) => toggle(emailKey, v)}
                />
              </div>
              <div className="w-14 flex justify-center">
                <Switch
                  aria-label={`${c.title} in-app`}
                  checked={prefs[inAppKey]}
                  disabled={savingKey === inAppKey}
                  onCheckedChange={(v) => toggle(inAppKey, v)}
                />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );

  const skeleton = <div className="space-y-3">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full" />)}</div>;

  return (
    <div className="space-y-6">
      <Card className="p-6 space-y-5 elev-1">
        <div className="flex items-start gap-3">
          <Bell className="h-5 w-5 text-primary mt-0.5" />
          <div>
            <h2 className="text-lg font-semibold">Billing notifications</h2>
            <p className="text-sm text-muted-foreground">
              Choose how we reach you about payments. Critical account emails are always sent.
            </p>
          </div>
        </div>
        {loading ? skeleton : renderRows(BILLING_CATEGORIES)}
      </Card>

      <Card className="p-6 space-y-5 elev-1">
        <div className="flex items-start gap-3">
          <Sparkles className="h-5 w-5 text-primary mt-0.5" />
          <div>
            <h2 className="text-lg font-semibold">Product notifications</h2>
            <p className="text-sm text-muted-foreground">
              Optional updates about work you started in Gradr. Turning a category off stops those
              emails immediately — we check this before anything is queued.
            </p>
          </div>
        </div>
        {loading ? skeleton : renderRows(PRODUCT_CATEGORIES)}
        <div className="flex items-start gap-3 rounded-control bg-surface-muted p-4">
          <MailX className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
          <p className="text-xs text-muted-foreground">
            Every email also carries an unsubscribe link. Using it stops all non-essential mail to
            your address; account, security and billing notices still send because they're required
            to run your account. Gradr never sends newsletters or promotional email.
          </p>
        </div>
      </Card>

      {savingKey && (
        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
          <Loader2 className="h-3 w-3 animate-spin" /> Saving…
        </p>
      )}
    </div>
  );
}
