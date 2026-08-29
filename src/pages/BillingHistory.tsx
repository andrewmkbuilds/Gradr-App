import { useMemo, useState } from "react";
import { Download, ExternalLink, FileText, Loader2, Receipt } from "lucide-react";
import { Button } from "@/components/ds/Button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Seo } from "@/components/Seo";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getPaddleEnvironment } from "@/lib/paddle";
import { useBillingTimeline, useInvoices, type InvoiceRow } from "@/hooks/useSubscriptionManagement";
import { usePurchases } from "@/hooks/useSubscription";
import { useRealtimeBilling } from "@/hooks/useRealtimeBilling";

function money(minor: number, currency: string) {
  return new Intl.NumberFormat(undefined, { style: "currency", currency: currency.toUpperCase() })
    .format(minor / 100);
}

function day(value: string | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

const TIMELINE_TONE: Record<string, string> = {
  payment_failed: "border-destructive/40 bg-destructive/5",
  payment_retry_scheduled: "border-destructive/30 bg-destructive/5",
  subscription_paused: "border-destructive/40 bg-destructive/5",
  payment_recovered: "border-primary/40 bg-primary/5",
  subscription_started: "border-primary/40 bg-primary/5",
};

export default function BillingHistory() {
  useRealtimeBilling();
  const { data: invoices, isLoading: invoicesLoading, isError: invoicesError } = useInvoices();
  const { data: timeline, isLoading: timelineLoading, isError: timelineError } = useBillingTimeline();

  const { data: purchases } = usePurchases();
  const [downloading, setDownloading] = useState<string | null>(null);

  const packPurchases = useMemo(
    () => (purchases ?? []).filter((p) => p.status === "completed" || p.status === "paid"),
    [purchases],
  );

  const openInvoice = async (invoice: InvoiceRow) => {
    setDownloading(invoice.id);
    try {
      const { data, error } = await supabase.functions.invoke("payments-subscription", {
        body: { action: "invoice_pdf", transactionId: invoice.id, environment: getPaddleEnvironment() },
      });
      if (error || !data?.url) throw error ?? new Error("no url");
      window.open(data.url as string, "_blank", "noopener,noreferrer");
    } catch {
      toast.error("That invoice isn't ready yet. Try again in a few minutes.");
    } finally {
      setDownloading(null);
    }
  };

  const exportCsv = () => {
    const header = ["Date", "Invoice", "Description", "Amount", "Currency", "Status"];
    const rows = (invoices ?? []).map((i) => [
      new Date(i.billedAt).toISOString(),
      i.invoiceNumber ?? i.id,
      i.description ?? "",
      (i.amount / 100).toFixed(2),
      i.currency,
      i.status,
    ]);
    const csv = [header, ...rows]
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `gradr-invoices-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Seo
        title="Billing history"
        description="Invoices, subscription changes and credit pack purchases on your Gradr account."
        path="/billing/history"
      />

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="type-h1 text-foreground">Billing history</h1>
          <p className="text-sm text-muted-foreground">Every invoice, plan change and credit pack on your account.</p>
        </div>
        <Button variant="outline" size="sm" className="gap-2" onClick={exportCsv} disabled={!invoices?.length}>
          <Download className="h-4 w-4" aria-hidden />
          Export CSV
        </Button>
      </div>

      <Card className="p-6">
        <div className="mb-4 flex items-center gap-2">
          <Receipt className="h-4 w-4 text-primary" aria-hidden />
          <h2 className="text-sm font-semibold text-foreground">Invoices</h2>
        </div>
        {invoicesLoading
          ? <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          : invoicesError
          ? <p role="alert" className="text-body-sm text-muted-foreground">

              We couldn't load your invoices right now. Reload the page, or email{" "}
              <a className="underline hover:text-foreground" href="mailto:support@gradr.me">support@gradr.me</a>{" "}
              if it keeps happening.
            </p>
          : !invoices?.length
          ? <p className="text-sm text-muted-foreground">No invoices yet. They'll appear here after your first payment.</p>

          : (
            <ul className="divide-y divide-border">
              {invoices.map((invoice) => (
                <li key={invoice.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">
                      {invoice.description ?? invoice.invoiceNumber ?? "Payment"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {day(invoice.billedAt)}
                      {invoice.invoiceNumber ? ` · ${invoice.invoiceNumber}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-foreground">{money(invoice.amount, invoice.currency)}</span>
                    <Badge variant={invoice.status === "completed" ? "default" : "secondary"}>{invoice.status}</Badge>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="gap-1.5"
                      onClick={() => void openInvoice(invoice)}
                      disabled={downloading === invoice.id}
                    >
                      {downloading === invoice.id
                        ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                        : <ExternalLink className="h-3.5 w-3.5" aria-hidden />}
                      Invoice
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
      </Card>

      <Card className="p-6">
        <div className="mb-4 flex items-center gap-2">
          <FileText className="h-4 w-4 text-primary" aria-hidden />
          <h2 className="text-sm font-semibold text-foreground">Subscription activity</h2>
        </div>
        {timelineLoading
          ? <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
          : timelineError
          ? <p role="alert" className="text-body-sm text-muted-foreground">
              We couldn't load your subscription activity right now. Reload the page to try again.
            </p>
          : !timeline?.length
          ? <p className="text-sm text-muted-foreground">Nothing here yet — plan changes and payment events will show up as they happen.</p>

          : (
            <ol className="space-y-3">
              {timeline.map((entry) => (
                <li
                  key={entry.id}
                  className={`rounded-lg border p-3 ${TIMELINE_TONE[entry.event_type] ?? "border-border/70"}`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-medium text-foreground">{entry.title}</p>
                    <span className="text-xs text-muted-foreground">{day(entry.occurred_at)}</span>
                  </div>
                  {entry.description && <p className="mt-0.5 text-sm text-muted-foreground">{entry.description}</p>}
                  {entry.amount_total ? (
                    <p className="mt-1 text-xs font-medium text-foreground">
                      {money(entry.amount_total, entry.currency ?? "usd")}
                    </p>
                  ) : null}
                </li>
              ))}
            </ol>
          )}
      </Card>

      <Card className="p-6">
        <div className="mb-4 flex items-center gap-2">
          <Receipt className="h-4 w-4 text-primary" aria-hidden />
          <h2 className="text-sm font-semibold text-foreground">Credit packs</h2>
        </div>
        {!packPurchases.length
          ? <p className="text-sm text-muted-foreground">No credit packs purchased yet.</p>
          : (
            <ul className="divide-y divide-border">
              {packPurchases.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">{p.pack_label ?? p.pack_key}</p>
                    <p className="text-xs text-muted-foreground">
                      {day(p.created_at)} · {p.credits_granted} credits
                    </p>
                  </div>
                  <span className="text-sm font-medium text-foreground">{money(p.amount_total, p.currency)}</span>
                </li>
              ))}
            </ul>
          )}
      </Card>
    </div>
  );
}
