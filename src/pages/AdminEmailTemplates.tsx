import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { Mail, MailCheck, MailX, Megaphone, RefreshCw, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/app/PageHeader";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ds/Button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmailTemplateSandbox } from "@/components/admin/EmailTemplateSandbox";
import {
  CATEGORY_LABELS,
  EMAIL_TEMPLATE_CATALOG,
  type EmailTemplateInfo,
} from "@/lib/email/templateCatalog";

interface SendStat {
  sent: number;
  pending: number;
  suppressed: number;
  failed: number;
  lastSentAt: string | null;
}

const EMPTY: SendStat = { sent: 0, pending: 0, suppressed: 0, failed: 0, lastSentAt: null };

/**
 * Catalog of every registered Gradr email with its classification and live
 * send status.
 *
 * The classification mirrors the edge-function table that actually gates
 * sending, so "Transactional" here means the send function will let it through
 * and "Marketing" means it is hard-blocked before it can be queued. Gradr
 * registers no marketing templates — the column exists so a regression is
 * visible instead of silent.
 */
export default function AdminEmailTemplates() {
  const [search, setSearch] = useState("");
  const [kindFilter, setKindFilter] = useState("all");

  const { data: stats, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["admin", "email-send-stats"],
    queryFn: async (): Promise<Record<string, SendStat>> => {
      const { data, error } = await (supabase as any)
        .from("email_send_log")
        .select("template_name, status, created_at")
        .order("created_at", { ascending: false })
        .limit(5000);
      if (error) throw error;
      const map: Record<string, SendStat> = {};
      for (const row of (data ?? []) as { template_name: string; status: string; created_at: string }[]) {
        const stat = (map[row.template_name] ??= { ...EMPTY });
        if (row.status === "sent") {
          stat.sent += 1;
          if (!stat.lastSentAt) stat.lastSentAt = row.created_at;
        } else if (row.status === "pending") stat.pending += 1;
        else if (row.status === "suppressed") stat.suppressed += 1;
        else stat.failed += 1;
      }
      return map;
    },
    staleTime: 30_000,
  });

  const unclassified = useMemo(() => {
    const known = new Set(EMAIL_TEMPLATE_CATALOG.map((t) => t.name));
    return Object.keys(stats ?? {}).filter((name) => !known.has(name));
  }, [stats]);

  const groups = useMemo(() => {
    const term = search.trim().toLowerCase();
    const filtered = EMAIL_TEMPLATE_CATALOG.filter((t) => {
      if (kindFilter !== "all" && t.kind !== kindFilter) return false;
      if (!term) return true;
      return t.name.includes(term) || t.trigger.toLowerCase().includes(term);
    });
    const byGroup = new Map<string, EmailTemplateInfo[]>();
    for (const t of filtered) {
      const list = byGroup.get(t.group) ?? [];
      list.push(t);
      byGroup.set(t.group, list);
    }
    return [...byGroup.entries()];
  }, [search, kindFilter]);

  const marketingCount = EMAIL_TEMPLATE_CATALOG.filter((t) => t.kind === "marketing").length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Email templates"
        description="Every registered email, how it is classified, and how it has been sending."
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="p-4 elev-1">
          <p className="text-xs text-muted-foreground">Registered templates</p>
          <p className="text-2xl font-semibold mt-1">{EMAIL_TEMPLATE_CATALOG.length}</p>
        </Card>
        <Card className="p-4 elev-1">
          <p className="text-xs text-muted-foreground flex items-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5" /> Transactional
          </p>
          <p className="text-2xl font-semibold mt-1">{EMAIL_TEMPLATE_CATALOG.length - marketingCount}</p>
        </Card>
        <Card className="p-4 elev-1">
          <p className="text-xs text-muted-foreground flex items-center gap-1.5">
            <Megaphone className="h-3.5 w-3.5" /> Marketing
          </p>
          <p className="text-2xl font-semibold mt-1">{marketingCount}</p>
          <p className="text-xs text-muted-foreground mt-1">
            {marketingCount === 0 ? "None registered — sends are blocked." : "Blocked before queueing."}
          </p>
        </Card>
      </div>

      {unclassified.length > 0 && (
        <Card className="p-4 elev-1 border-destructive/40">
          <p className="text-sm font-medium text-destructive">Unclassified templates found in send history</p>
          <p className="text-xs text-muted-foreground mt-1">{unclassified.join(", ")}</p>
        </Card>
      )}

      <EmailTemplateSandbox />

      <div className="flex flex-wrap items-center gap-3">
        <Input
          placeholder="Search templates…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
          aria-label="Search email templates"
        />
        <Select value={kindFilter} onValueChange={setKindFilter}>
          <SelectTrigger className="w-44" aria-label="Filter by kind">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All kinds</SelectItem>
            <SelectItem value="transactional">Transactional</SelectItem>
            <SelectItem value="marketing">Marketing</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" onClick={() => refetch()} loading={isFetching}>
          <RefreshCw className="h-4 w-4" /> Refresh
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-32 w-full" />)}</div>
      ) : (
        groups.map(([group, templates]) => (
          <Card key={group} className="p-0 overflow-hidden elev-1">
            <div className="px-5 py-3 border-b border-border/60 flex items-center gap-2">
              <Mail className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold">{group}</h2>
            </div>
            <div className="divide-y divide-border/60">
              {templates.map((t) => {
                const stat = stats?.[t.name] ?? EMPTY;
                return (
                  <div key={t.name} className="px-5 py-4 flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <code className="text-code">{t.name}</code>
                        <Badge variant={t.kind === "transactional" ? "secondary" : "destructive"}>
                          {t.kind}
                        </Badge>
                        <Badge variant="outline">{CATEGORY_LABELS[t.category]}</Badge>
                        {t.category !== "essential" && <Badge variant="outline">opt-out</Badge>}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">Sends when: {t.trigger}</p>
                    </div>
                    <div className="flex items-center gap-4 text-xs shrink-0">
                      <span className="flex items-center gap-1.5">
                        <MailCheck className="h-3.5 w-3.5 text-muted-foreground" />
                        {stat.sent} sent
                      </span>
                      <span className="flex items-center gap-1.5">
                        <MailX className="h-3.5 w-3.5 text-muted-foreground" />
                        {stat.suppressed} skipped
                      </span>
                      <span className="text-muted-foreground">
                        {stat.failed} failed
                        {stat.pending ? ` · ${stat.pending} queued` : ""}
                      </span>
                      <span className="text-muted-foreground w-28 text-right">
                        {stat.lastSentAt
                          ? `${formatDistanceToNow(new Date(stat.lastSentAt))} ago`
                          : "never sent"}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        ))
      )}
    </div>
  );
}
