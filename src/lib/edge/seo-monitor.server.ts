import { createClient } from "@supabase/supabase-js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const GATEWAY = "https://connector-gateway.lovable.dev/google_search_console";
const SITE = "https://gradr.me";

/** Pages we track for indexing state + Lighthouse scores. */
const TRACKED_PATHS = ["/", "/pricing", "/career-advice", "/blog/ai-resume-optimization"];
/** Lighthouse (PageSpeed Insights) is slow, so only audit the two money pages. */
const LIGHTHOUSE_PATHS = ["/", "/pricing"];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function coversTarget(siteUrl: string, target: URL) {
  if (siteUrl.startsWith("sc-domain:")) {
    const domain = siteUrl.slice("sc-domain:".length).toLowerCase();
    const host = target.hostname.toLowerCase();
    return host === domain || host.endsWith(`.${domain}`);
  }
  try {
    return target.href.startsWith(new URL(siteUrl).href);
  } catch {
    return false;
  }
}

const isoDaysAgo = (d: number) =>
  new Date(Date.now() - d * 86_400_000).toISOString().slice(0, 10);

type Alert = { level: "error" | "warning" | "info"; title: string; detail: string };

/** Run a Lighthouse audit through the public PageSpeed Insights API. */
async function lighthouseFor(url: string) {
  const api = new URL("https://www.googleapis.com/pagespeedonline/v5/runPagespeed");
  api.searchParams.set("url", url);
  api.searchParams.set("strategy", "mobile");
  for (const c of ["performance", "accessibility", "best-practices", "seo"]) {
    api.searchParams.append("category", c);
  }
  const key = process.env['PAGESPEED_API_KEY'];
  if (key) api.searchParams.set("key", key);

  try {
    const res = await fetch(api.toString());
    if (!res.ok) {
      const text = await res.text();
      console.error(`[seo-monitor] PSI failed [${res.status}]: ${text}`);
      return { url, error: `HTTP ${res.status}`, status: res.status };
    }
    const data = await res.json();
    const cats = data?.lighthouseResult?.categories ?? {};
    const audits = data?.lighthouseResult?.audits ?? {};
    const pct = (v: unknown) => (typeof v === "number" ? Math.round(v * 100) : null);
    return {
      url,
      fetchedAt: new Date().toISOString(),
      performance: pct(cats.performance?.score),
      accessibility: pct(cats.accessibility?.score),
      bestPractices: pct(cats["best-practices"]?.score),
      seo: pct(cats.seo?.score),
      lcp: audits["largest-contentful-paint"]?.displayValue ?? null,
      cls: audits["cumulative-layout-shift"]?.displayValue ?? null,
      tbt: audits["total-blocking-time"]?.displayValue ?? null,
    };
  } catch (e) {
    console.error("[seo-monitor] PSI error", e);
    return { url, error: String(e) };
  }
}

export const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);

    const supabase = createClient(
      process.env['SUPABASE_URL']!,
      process.env['SUPABASE_PUBLISHABLE_KEY']!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) return json({ error: "Unauthorized" }, 401);
    const { data: isAdmin } = await supabase.rpc("has_role", {
      _user_id: auth.user.id,
      _role: "admin",
    });
    if (!isAdmin) return json({ error: "Admin access required" }, 403);

    const admin = createClient(
      process.env['SUPABASE_URL']!,
      process.env['SUPABASE_SERVICE_ROLE_KEY']!,
    );

    const body = await req.json().catch(() => ({}));
    const refresh = body?.refresh !== false;

    // Cached read: return the most recent stored snapshot + history.
    const { data: history } = await admin
      .from("seo_snapshots")
      .select("*")
      .order("captured_at", { ascending: false })
      .limit(30);
    const previous = history?.[0] ?? null;

    if (!refresh) {
      return json({ status: "ok", snapshot: previous, history: history ?? [] });
    }

    const lovableKey = process.env['LOVABLE_API_KEY'];
    const connKey = process.env['GOOGLE_SEARCH_CONSOLE_API_KEY'];
    if (!lovableKey || !connKey) {
      return json({ error: "Google Search Console is not connected for this project." }, 503);
    }
    const headers = {
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": connKey,
      "Content-Type": "application/json",
    };

    // 1. Resolve the verified property.
    const sitesRes = await fetch(`${GATEWAY}/webmasters/v3/sites`, { headers });
    if (!sitesRes.ok) {
      const text = await sitesRes.text();
      return json({ error: "Could not list Search Console properties", details: text }, sitesRes.status);
    }
    const { siteEntry = [] } = await sitesRes.json();
    const matches = (siteEntry as { siteUrl: string; permissionLevel?: string }[]).filter(
      (e) => e.permissionLevel !== "siteUnverifiedUser" && coversTarget(e.siteUrl, new URL(SITE)),
    );
    if (matches.length === 0) return json({ status: "no_property" });
    const selected: string | undefined =
      typeof body.selectedSiteUrl === "string" ? body.selectedSiteUrl : undefined;
    if (matches.length > 1 && !matches.some((m) => m.siteUrl === selected)) {
      return json({ status: "selection_required", candidates: matches.map((m) => m.siteUrl) });
    }
    const property = matches.length > 1 ? selected! : matches[0].siteUrl;
    const enc = encodeURIComponent(property);

    // 2. Performance + sitemaps.
    const perfBody = {
      startDate: isoDaysAgo(31),
      endDate: isoDaysAgo(3),
      dimensions: ["query"],
      rowLimit: 15,
    };
    const [perfRes, pagesRes, sitemapsRes] = await Promise.all([
      fetch(`${GATEWAY}/webmasters/v3/sites/${enc}/searchAnalytics/query`, {
        method: "POST",
        headers,
        body: JSON.stringify(perfBody),
      }),
      fetch(`${GATEWAY}/webmasters/v3/sites/${enc}/searchAnalytics/query`, {
        method: "POST",
        headers,
        body: JSON.stringify({ ...perfBody, dimensions: ["page"] }),
      }),
      fetch(`${GATEWAY}/webmasters/v3/sites/${enc}/sitemaps`, { headers }),
    ]);

    const perf = perfRes.ok ? await perfRes.json() : null;
    const pagesJson = pagesRes.ok ? await pagesRes.json() : null;
    const sitemapJson = sitemapsRes.ok ? await sitemapsRes.json() : null;

    type Row = { keys: string[]; clicks: number; impressions: number; ctr: number; position: number };
    const rows: Row[] = perf?.rows ?? [];
    const pageRows: Row[] = pagesJson?.rows ?? [];

    const topQueries = rows.map((r) => ({
      query: r.keys?.[0] ?? "",
      clicks: r.clicks ?? 0,
      impressions: r.impressions ?? 0,
      ctr: r.ctr ?? 0,
      position: r.position ?? 0,
    }));
    const topPages = pageRows.map((r) => ({
      page: r.keys?.[0] ?? "",
      clicks: r.clicks ?? 0,
      impressions: r.impressions ?? 0,
      ctr: r.ctr ?? 0,
      position: r.position ?? 0,
    }));

    const clicks = topQueries.reduce((a, r) => a + r.clicks, 0);
    const impressions = topQueries.reduce((a, r) => a + r.impressions, 0);
    const avgPosition = topQueries.length
      ? topQueries.reduce((a, r) => a + r.position, 0) / topQueries.length
      : null;

    const sitemaps = ((sitemapJson?.sitemap ?? []) as Record<string, unknown>[]).map((s) => ({
      path: String(s.path ?? ""),
      lastSubmitted: s.lastSubmitted ?? null,
      lastDownloaded: s.lastDownloaded ?? null,
      isPending: Boolean(s.isPending),
      warnings: Number(s.warnings ?? 0),
      errors: Number(s.errors ?? 0),
    }));

    // 3. Indexing state.
    const origin = property.startsWith("sc-domain:")
      ? `https://${property.slice("sc-domain:".length)}`
      : property.replace(/\/$/, "");
    const inspections = await Promise.all(
      TRACKED_PATHS.map(async (path) => {
        const inspectionUrl = `${origin}${path}`;
        try {
          const res = await fetch(`${GATEWAY}/v1/urlInspection/index:inspect`, {
            method: "POST",
            headers,
            body: JSON.stringify({ inspectionUrl, siteUrl: property }),
          });
          if (!res.ok) return { url: inspectionUrl, error: `HTTP ${res.status}` };
          const idx = (await res.json())?.inspectionResult?.indexStatusResult ?? {};
          return {
            url: inspectionUrl,
            verdict: idx.verdict ?? "UNKNOWN",
            coverageState: idx.coverageState ?? null,
            robotsTxtState: idx.robotsTxtState ?? null,
            pageFetchState: idx.pageFetchState ?? null,
            lastCrawlTime: idx.lastCrawlTime ?? null,
          };
        } catch (e) {
          return { url: inspectionUrl, error: String(e) };
        }
      }),
    );

    // 4. Lighthouse.
    const lighthousePages = await Promise.all(
      LIGHTHOUSE_PATHS.map((p) => lighthouseFor(`${SITE}${p}`)),
    );
    const lighthouse = { pages: lighthousePages, fetchedAt: new Date().toISOString() };

    // 5. Alerts from the current state.
    const alerts: Alert[] = [];
    for (const s of sitemaps) {
      if (s.errors > 0) {
        alerts.push({
          level: "error",
          title: "Sitemap errors reported",
          detail: `${s.path} — Search Console reports ${s.errors} error(s). The API does not return the cause; open URL Inspection in Search Console for detail.`,
        });
      } else if (s.warnings > 0) {
        alerts.push({ level: "warning", title: "Sitemap warnings", detail: `${s.path} — ${s.warnings} warning(s).` });
      }
      if (!s.lastDownloaded) {
        alerts.push({ level: "info", title: "Sitemap not fetched yet", detail: `${s.path} submitted, not downloaded yet.` });
      }
    }
    for (const i of inspections as Record<string, string | null>[]) {
      if (i.error) continue;
      if (i.verdict === "FAIL") {
        alerts.push({ level: "error", title: "Page not indexed", detail: `${i.url} — ${i.coverageState ?? "not indexed"}.` });
      } else if (i.verdict === "NEUTRAL" || i.verdict === "PARTIAL") {
        alerts.push({ level: "warning", title: "Indexing issue", detail: `${i.url} — ${i.coverageState ?? i.verdict}.` });
      }
      if (i.robotsTxtState && i.robotsTxtState !== "ALLOWED") {
        alerts.push({ level: "error", title: "Blocked by robots.txt", detail: `${i.url} — ${i.robotsTxtState}.` });
      }
    }
    for (const lh of lighthousePages as Record<string, number | string | null>[]) {
      if (lh.error) {
        alerts.push({ level: "info", title: "Lighthouse audit unavailable", detail: `${lh.url} — ${lh.error}.` });
        continue;
      }
      if (typeof lh.performance === "number" && lh.performance < 70) {
        alerts.push({ level: "warning", title: "Low mobile performance score", detail: `${lh.url} — performance ${lh.performance}/100.` });
      }
      if (typeof lh.seo === "number" && lh.seo < 90) {
        alerts.push({ level: "warning", title: "Lighthouse SEO score dropped", detail: `${lh.url} — SEO ${lh.seo}/100.` });
      }
    }

    // 6. Diff against the previous snapshot → "what changed" alerts.
    const changes: Alert[] = [];
    if (previous) {
      const prevPos = previous.avg_position === null ? null : Number(previous.avg_position);
      if (avgPosition !== null && prevPos !== null && Math.abs(avgPosition - prevPos) >= 1) {
        const worse = avgPosition > prevPos;
        changes.push({
          level: worse ? "warning" : "info",
          title: worse ? "Average position dropped" : "Average position improved",
          detail: `${prevPos.toFixed(1)} → ${avgPosition.toFixed(1)} across tracked queries.`,
        });
      }
      const prevClicks = Number(previous.clicks ?? 0);
      if (prevClicks > 0 && clicks < prevClicks * 0.7) {
        changes.push({
          level: "warning",
          title: "Clicks fell sharply",
          detail: `${prevClicks} → ${clicks} clicks over the last 28 days.`,
        });
      }
      const prevAlerts = new Set(
        ((previous.alerts ?? []) as Alert[]).map((a) => `${a.title}|${a.detail}`),
      );
      for (const a of alerts) {
        if (!prevAlerts.has(`${a.title}|${a.detail}`)) {
          changes.push({ level: a.level, title: `New: ${a.title}`, detail: a.detail });
        }
      }
      const prevLh = ((previous.lighthouse ?? {}) as { pages?: Record<string, number | string>[] }).pages ?? [];
      for (const lh of lighthousePages as Record<string, number | string | null>[]) {
        const before = prevLh.find((p) => p.url === lh.url);
        if (before && typeof before.performance === "number" && typeof lh.performance === "number") {
          const delta = lh.performance - before.performance;
          if (Math.abs(delta) >= 5) {
            changes.push({
              level: delta < 0 ? "warning" : "info",
              title: delta < 0 ? "Performance score dropped" : "Performance score improved",
              detail: `${lh.url} — ${before.performance} → ${lh.performance}.`,
            });
          }
        }
      }
    }

    const snapshot = {
      property,
      clicks,
      impressions,
      ctr: impressions ? clicks / impressions : 0,
      avg_position: avgPosition,
      top_queries: topQueries,
      top_pages: topPages,
      sitemaps,
      inspections,
      lighthouse,
      alerts,
      changes,
    };

    const { data: saved, error: saveError } = await admin
      .from("seo_snapshots")
      .insert(snapshot)
      .select()
      .single();
    if (saveError) console.error("[seo-monitor] save failed", saveError);

    return json({
      status: "ok",
      snapshot: saved ?? { ...snapshot, captured_at: new Date().toISOString() },
      history: history ?? [],
      range: { start: perfBody.startDate, end: perfBody.endDate },
    });
  } catch (e) {
    console.error("[seo-monitor] error", e);
    return json({ error: String(e) }, 500);
  }
};
