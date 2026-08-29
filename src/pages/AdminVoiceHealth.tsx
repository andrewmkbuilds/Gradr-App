import { useCallback, useEffect, useState } from "react";
import { Activity, AudioLines, Clock, Database, RefreshCw, TrendingDown } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/app/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ds/Button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { voiceReasonCopy, toVoiceProviderReason } from "@/lib/interview/voiceErrors";

/**
 * Voice health dashboard.
 *
 * Answers the operational questions the settings console cannot: is the
 * primary engine actually speaking, how often does a session drop to a
 * fallback, how long candidates wait for the first audio, and which persona is
 * failing and why.
 */

interface PersonaHealth {
  personaId: string;
  voiceId: string;
  total: number;
  successRate: number | null;
  fallbackRate: number | null;
  cacheHitRate: number | null;
  medianLatencyMs: number | null;
  p95LatencyMs: number | null;
  lastFailure: { code: string | null; reason: string | null; at: string } | null;
}

interface HealthPayload {
  hours: number;
  since: string;
  totals: {
    total: number;
    ok: number;
    failures: number;
    successRate: number | null;
    fallbackRate: number | null;
    cacheHitRate: number | null;
    medianLatencyMs: number | null;
    p95LatencyMs: number | null;
    cacheEntries: number;
  };
  personas: PersonaHealth[];
}

const RANGES = [
  { hours: 24, label: "24h" },
  { hours: 168, label: "7d" },
  { hours: 720, label: "30d" },
] as const;

const pct = (value: number | null) => (value === null ? "—" : `${Math.round(value * 100)}%`);
const ms = (value: number | null) => (value === null ? "—" : `${Math.round(value)} ms`);

function Metric({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof Activity;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <Card className="space-y-1 p-4">
      <p className="flex items-center gap-2 text-caption text-muted-foreground">
        <Icon className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
        {label}
      </p>
      <p className="font-display text-h4 tabular-nums text-foreground">{value}</p>
      {hint && <p className="text-caption text-muted-foreground">{hint}</p>}
    </Card>
  );
}

export default function AdminVoiceHealth() {
  const [data, setData] = useState<HealthPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [hours, setHours] = useState<number>(24);

  const load = useCallback(async (range: number) => {
    setLoading(true);
    try {
      const { data: payload, error } = await supabase.functions.invoke("voice-diagnostics", {
        body: { action: "health", hours: range },
      });
      if (error) throw error;
      setData(payload as HealthPayload);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Could not load voice health");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(hours);
  }, [hours, load]);

  const totals = data?.totals;

  return (
    <div className="page-shell space-y-6 py-6">
      <PageHeader
        eyebrow="Admin"
        title="Voice health"
        description="Success rate, fallback rate, synthesis latency and the latest failure reason for every interviewer persona."
        icon={<AudioLines className="h-3.5 w-3.5" aria-hidden="true" />}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2" role="group" aria-label="Time range">
          {RANGES.map((r) => (
            <Button
              key={r.hours}
              variant={hours === r.hours ? "default" : "outline"}
              size="sm"
              aria-pressed={hours === r.hours}
              onClick={() => setHours(r.hours)}
            >
              {r.label}
            </Button>
          ))}
        </div>
        <Button variant="outline" size="sm" onClick={() => void load(hours)}>
          <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
          Refresh
        </Button>
      </div>

      {loading ? (
        <Skeleton className="h-40 w-full rounded-2xl" />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Metric
              icon={Activity}
              label="Success rate"
              value={pct(totals?.successRate ?? null)}
              hint={`${totals?.ok ?? 0} of ${totals?.total ?? 0} synthesis calls`}
            />
            <Metric
              icon={TrendingDown}
              label="Fallback rate"
              value={pct(totals?.fallbackRate ?? null)}
              hint="Served by a secondary engine"
            />
            <Metric
              icon={Clock}
              label="Median latency"
              value={ms(totals?.medianLatencyMs ?? null)}
              hint={`p95 ${ms(totals?.p95LatencyMs ?? null)}`}
            />
            <Metric
              icon={Database}
              label="Cache hit rate"
              value={pct(totals?.cacheHitRate ?? null)}
              hint={`${totals?.cacheEntries ?? 0} cached clips`}
            />
          </div>

          <Card className="p-0">
            <div className="border-b border-border p-4">
              <h2 className="font-display text-h6 text-foreground">Per persona</h2>
              <p className="text-body-sm text-muted-foreground">
                Every interviewer persona and the voice currently assigned to it.
              </p>
            </div>
            {data?.personas.length ? (
              <div className="overflow-x-auto">
                <table className="w-full text-body-sm">
                  <caption className="sr-only">Voice health metrics by interviewer persona</caption>
                  <thead>
                    <tr className="border-b border-border text-left text-caption uppercase tracking-wide text-muted-foreground">
                      <th scope="col" className="p-3 font-medium">Persona</th>
                      <th scope="col" className="p-3 font-medium">Voice</th>
                      <th scope="col" className="p-3 font-medium">Calls</th>
                      <th scope="col" className="p-3 font-medium">Success</th>
                      <th scope="col" className="p-3 font-medium">Fallback</th>
                      <th scope="col" className="p-3 font-medium">Cache</th>
                      <th scope="col" className="p-3 font-medium">Median</th>
                      <th scope="col" className="p-3 font-medium">p95</th>
                      <th scope="col" className="p-3 font-medium">Last failure</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.personas.map((p) => (
                      <tr key={p.personaId} className="border-b border-border last:border-0">
                        <td className="p-3 font-medium text-foreground">{p.personaId}</td>
                        <td className="p-3 text-muted-foreground">{p.voiceId}</td>
                        <td className="p-3 tabular-nums text-muted-foreground">{p.total}</td>
                        <td className="p-3 tabular-nums">
                          <Badge variant={(p.successRate ?? 1) >= 0.95 ? "secondary" : "destructive"}>
                            {pct(p.successRate)}
                          </Badge>
                        </td>
                        <td className="p-3 tabular-nums text-muted-foreground">{pct(p.fallbackRate)}</td>
                        <td className="p-3 tabular-nums text-muted-foreground">{pct(p.cacheHitRate)}</td>
                        <td className="p-3 tabular-nums text-muted-foreground">{ms(p.medianLatencyMs)}</td>
                        <td className="p-3 tabular-nums text-muted-foreground">{ms(p.p95LatencyMs)}</td>
                        <td className="p-3 text-muted-foreground">
                          {p.lastFailure ? (
                            <span title={new Date(p.lastFailure.at).toLocaleString()}>
                              {p.lastFailure.code ?? "Unknown"} ·{" "}
                              {voiceReasonCopy(toVoiceProviderReason(p.lastFailure.reason))?.label ?? "Unknown reason"}
                            </span>
                          ) : (
                            "None"
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="p-4 text-body-sm text-muted-foreground">
                No synthesis activity in this window.
              </p>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
