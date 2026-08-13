/**
 * Public status snapshot builder.
 *
 * Reads operational tables with the service-role client and returns ONLY
 * aggregate, non-identifying data: alert counts, last successful webhook
 * delivery, uptime per endpoint group, and a coarse incident history.
 * No user ids, payloads, emails, or raw error bodies ever leave this module.
 */
export interface StatusIncident {
  id: string;
  endpoint: string;
  kind: string;
  summary: string;
  occurrences: number;
  startedAt: string;
  endedAt: string | null;
  resolved: boolean;
}

export interface StatusSnapshot {
  generatedAt: string;
  overall: "operational" | "degraded" | "outage";
  openAlerts: number;
  criticalAlerts: number;
  resolvedLast7d: number;
  lastSuccessfulDelivery: {
    provider: string;
    eventType: string | null;
    at: string;
  } | null;
  lastFailedDelivery: { provider: string; at: string } | null;
  requests24h: number;
  successRate24h: number | null;
  p95DurationMs: number | null;
  components: Array<{
    name: string;
    status: "operational" | "degraded" | "outage";
    successRate: number | null;
    checks: number;
  }>;
  incidents: StatusIncident[];
}

/** Human-readable, non-leaky label for an alert kind. */
const KIND_SUMMARY: Record<string, string> = {
  auth_rejected: "Elevated authentication rejections",
  rate_limited: "Requests were rate limited",
  server_error: "Endpoint returning errors",
  client_error: "Elevated client errors",
};

/** Group raw endpoint ids into user-meaningful components. */
export function componentFor(endpoint: string): string {
  const e = endpoint.toLowerCase();
  if (e.includes("payment") || e.includes("paddle") || e.includes("billing")) return "Billing & payments";
  if (e.includes("interview")) return "AI interview coach";
  if (e.includes("resume") || e.includes("analyze")) return "Resume intelligence";
  if (e.includes("job") || e.includes("match")) return "Job matching";
  if (e.includes("email") || e.includes("notify")) return "Email delivery";
  return "Core platform";
}

function rate(ok: number, total: number): number | null {
  return total === 0 ? null : Math.round((ok / total) * 1000) / 10;
}

function statusFromRate(successRate: number | null): "operational" | "degraded" | "outage" {
  if (successRate === null) return "operational";
  if (successRate < 80) return "outage";
  if (successRate < 98) return "degraded";
  return "operational";
}

export async function buildStatusSnapshot(): Promise<StatusSnapshot> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const now = Date.now();
  const since24h = new Date(now - 24 * 60 * 60 * 1000).toISOString();
  const since7d = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
  const since30d = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();

  const [alertsRes, eventsRes, okDeliveryRes, failDeliveryRes] = await Promise.all([
    supabaseAdmin
      .from("api_health_alerts")
      .select("id, endpoint, kind, occurrences, first_seen_at, last_seen_at, resolved, resolved_at")
      .gte("first_seen_at", since30d)
      .order("first_seen_at", { ascending: false })
      .limit(100),
    supabaseAdmin
      .from("api_health_events")
      .select("endpoint, outcome, status_code, duration_ms")
      .gte("created_at", since24h)
      .limit(5000),
    supabaseAdmin
      .from("webhook_deliveries")
      .select("provider, event_type, processed_at, updated_at")
      .eq("state", "processed")
      .order("updated_at", { ascending: false })
      .limit(1),
    supabaseAdmin
      .from("webhook_deliveries")
      .select("provider, updated_at")
      .eq("state", "failed")
      .order("updated_at", { ascending: false })
      .limit(1),
  ]);

  const alerts = alertsRes.data ?? [];
  const events = eventsRes.data ?? [];

  const openAlerts = alerts.filter((a) => !a.resolved).length;
  const criticalAlerts = alerts.filter((a) => !a.resolved && a.kind === "server_error").length;
  const resolvedLast7d = alerts.filter(
    (a) => a.resolved && a.resolved_at && a.resolved_at >= since7d,
  ).length;

  // Per-component roll-up from the last 24h of health events.
  const buckets = new Map<string, { ok: number; total: number }>();
  const durations: number[] = [];
  let ok24h = 0;
  for (const ev of events) {
    const name = componentFor(ev.endpoint);
    const b = buckets.get(name) ?? { ok: 0, total: 0 };
    b.total += 1;
    const healthy = ev.outcome === "ok" || (ev.status_code >= 200 && ev.status_code < 400);
    if (healthy) {
      b.ok += 1;
      ok24h += 1;
    }
    buckets.set(name, b);
    if (typeof ev.duration_ms === "number") durations.push(ev.duration_ms);
  }

  durations.sort((a, b) => a - b);
  const p95 = durations.length
    ? durations[Math.min(durations.length - 1, Math.floor(durations.length * 0.95))] ?? null
    : null;

  const components = [...buckets.entries()]
    .map(([name, b]) => {
      const successRate = rate(b.ok, b.total);
      return { name, status: statusFromRate(successRate), successRate, checks: b.total };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  const successRate24h = rate(ok24h, events.length);
  const overall: StatusSnapshot["overall"] =
    criticalAlerts > 0 || components.some((c) => c.status === "outage")
      ? "outage"
      : openAlerts > 0 || components.some((c) => c.status === "degraded")
        ? "degraded"
        : "operational";

  const lastOk = okDeliveryRes.data?.[0] ?? null;
  const lastFail = failDeliveryRes.data?.[0] ?? null;

  const incidents: StatusIncident[] = alerts.slice(0, 20).map((a) => ({
    id: a.id,
    endpoint: componentFor(a.endpoint),
    kind: a.kind,
    summary: KIND_SUMMARY[a.kind] ?? "Service disruption",
    occurrences: a.occurrences,
    startedAt: a.first_seen_at,
    endedAt: a.resolved ? (a.resolved_at ?? a.last_seen_at) : null,
    resolved: a.resolved,
  }));

  return {
    generatedAt: new Date(now).toISOString(),
    overall,
    openAlerts,
    criticalAlerts,
    resolvedLast7d,
    lastSuccessfulDelivery: lastOk
      ? {
          provider: lastOk.provider,
          eventType: lastOk.event_type ?? null,
          at: lastOk.processed_at ?? lastOk.updated_at,
        }
      : null,
    lastFailedDelivery: lastFail ? { provider: lastFail.provider, at: lastFail.updated_at } : null,
    requests24h: events.length,
    successRate24h,
    p95DurationMs: p95,
    components,
    incidents,
  };
}
