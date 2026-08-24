import { Button } from "@/components/ds/Button";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  AlertCircle,
  ExternalLink,
  Lightbulb,
  MessageSquareQuote,
  RefreshCw,
  Sparkles,
  Newspaper,
  Building2,
} from "lucide-react";
import { CompanyLogo } from "@/components/CompanyLogo";
import { trackJourney } from "@/lib/telemetry/journey";


export interface CompanyResearch {
  overview: string;
  industry?: string | null;
  businessModel?: string | null;
  products?: string[];
  recentDevelopments?: string[];
  roleContext?: string | null;
  interviewAngles?: string[];
  questionsToAsk?: string[];
  talkingPoints?: string[];
  confidence: "high" | "medium" | "low";
  sources?: { title: string; url: string; snippet?: string }[];
  provider?: string;
  cached?: boolean;
  generatedAt?: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  company: string;
  role?: string;
}

const confidenceTone: Record<CompanyResearch["confidence"], string> = {
  high: "bg-success/10 text-success border-success/30",
  medium: "bg-warning/10 text-warning border-warning/30",
  low: "bg-muted text-muted-foreground border-border",
};

function List({ items, icon: Icon, title }: { items?: string[]; icon: typeof Lightbulb; title: string }) {
  if (!items?.length) return null;
  return (
    <section className="space-y-2">
      <h4 className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <Icon className="h-4 w-4 text-primary" aria-hidden="true" />
        {title}
      </h4>
      <ul className="space-y-1.5">
        {items.map((item, i) => (
          <li key={i} className="flex gap-2 text-sm text-muted-foreground leading-relaxed">
            <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-primary/60" aria-hidden="true" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function CompanyResearchDialog({ open, onOpenChange, company, role }: Props) {
  const [data, setData] = useState<CompanyResearch | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (refresh = false) => {
      setLoading(true);
      setError(null);
      try {
        const { data: res, error: fnError } = await supabase.functions.invoke("company-research", {
          body: { company, role, refresh },
        });
        if (fnError || res?.error) {
          setError(res?.error || "Research could not be completed right now. Please try again.");
          setData(null);
          return;
        }
        setData(res as CompanyResearch);
        trackJourney("company_research_viewed", {
          cached: Boolean((res as CompanyResearch)?.cached),
          confidence: (res as CompanyResearch)?.confidence,
          refreshed: refresh,
        });

      } catch {
        setError("Research could not be completed right now. Please try again.");
      } finally {
        setLoading(false);
      }
    },
    [company, role],
  );

  useEffect(() => {
    if (open && company) load(false);
  }, [open, company, load]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border/60">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <DialogTitle className="flex items-center gap-2.5 text-lg">
                <CompanyLogo company={company} size={28} rounded="md" />
                <span className="truncate">{company}</span>

              </DialogTitle>
              <DialogDescription className="mt-1">
                {role ? `Interview research for ${role}` : "Company interview research"}
              </DialogDescription>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => load(true)}
              disabled={loading}
              className="shrink-0 gap-1.5 min-h-11 sm:min-h-9"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} aria-hidden="true" />
              Refresh
            </Button>
          </div>
          {data && (
            <div className="flex flex-wrap items-center gap-2 pt-3">
              <Badge variant="outline" className={`text-xs ${confidenceTone[data.confidence]}`}>
                {data.confidence} confidence
              </Badge>
              {data.industry && <Badge variant="secondary" className="text-xs">{data.industry}</Badge>}
              {data.cached && <Badge variant="outline" className="text-xs">cached</Badge>}
            </div>
          )}
        </DialogHeader>

        <ScrollArea className="max-h-[60vh]">
          <div className="px-6 py-5 space-y-6" aria-live="polite" aria-busy={loading}>
            {loading && (
              <div className="space-y-4">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-5/6" />
                <Skeleton className="h-24 w-full rounded-lg" />
                <Skeleton className="h-24 w-full rounded-lg" />
                <p className="text-xs text-muted-foreground">Searching the web and building your brief…</p>
              </div>
            )}

            {!loading && error && (
              <div className="flex gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
                <AlertCircle className="h-5 w-5 shrink-0 text-destructive" aria-hidden="true" />
                <div className="space-y-3">
                  <p className="text-sm text-foreground">{error}</p>
                  <Button size="sm" variant="outline" onClick={() => load(true)} className="gap-1.5">
                    <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                    Try again
                  </Button>
                </div>
              </div>
            )}

            {!loading && !error && data && (
              <>
                <section className="space-y-2">
                  <h4 className="text-sm font-semibold text-foreground">Overview</h4>
                  <p className="text-sm leading-relaxed text-muted-foreground">{data.overview}</p>
                  {data.businessModel && (
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      <span className="text-foreground font-medium">Business model: </span>
                      {data.businessModel}
                    </p>
                  )}
                  {data.roleContext && (
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      <span className="text-foreground font-medium">Role context: </span>
                      {data.roleContext}
                    </p>
                  )}
                </section>

                <List items={data.products} icon={Sparkles} title="Products & services" />
                <List items={data.recentDevelopments} icon={Newspaper} title="Recent developments" />

                <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-5">
                  <p className="text-xs font-medium uppercase tracking-wide text-primary">Gradr coaching</p>
                  <List items={data.interviewAngles} icon={Lightbulb} title="Angles to emphasise" />
                  <List items={data.talkingPoints} icon={Sparkles} title="Your talking points" />
                  <List items={data.questionsToAsk} icon={MessageSquareQuote} title="Questions to ask them" />
                </div>

                {!!data.sources?.length && (
                  <section className="space-y-2">
                    <h4 className="text-sm font-semibold text-foreground">Sources</h4>
                    <ul className="space-y-1.5">
                      {data.sources.map((s, i) => (
                        <li key={i}>
                          <Button variant="link" size="inline" asChild>
                          <a href={s.url} target="_blank" rel="noopener noreferrer">
                            <ExternalLink className="h-3 w-3" aria-hidden="true" />
                            <span className="truncate max-w-[28rem]">{s.title || s.url}</span>
                          </a>
                          </Button>
                        </li>
                      ))}
                    </ul>
                    <p className="text-xs text-muted-foreground pt-1">
                      Facts come from public web sources and may be incomplete — verify anything critical before your interview.
                    </p>
                  </section>
                )}
              </>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
