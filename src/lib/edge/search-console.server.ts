import { createClient } from "./shared/supabase";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const GATEWAY = "https://connector-gateway.lovable.dev/google_search_console";

/** URLs we surface indexing state for in the crawl-health dashboard. */
const INSPECT_PATHS = [
  "/",
  "/pricing",
  "/ai-resume-builder",
  "/ats-resume-checker",
  "/ai-interview-coach",
  "/career-advice",
  "/job-search",
  "/blog/ai-resume-optimization",
];

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

function isoDaysAgo(days: number) {
  return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
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

    const body = await req.json().catch(() => ({}));
    const siteOrigin: string = typeof body.siteUrl === "string" && body.siteUrl
      ? body.siteUrl
      : "https://gradr.me/";
    const selected: string | undefined =
      typeof body.selectedSiteUrl === "string" ? body.selectedSiteUrl : undefined;

    // 1. Resolve a verified property.
    const sitesRes = await fetch(`${GATEWAY}/webmasters/v3/sites`, { headers });
    if (!sitesRes.ok) {
      const text = await sitesRes.text();
      console.error(`[gsc] list sites failed [${sitesRes.status}]: ${text}`);
      return json({ error: "Could not list Search Console properties", details: text }, sitesRes.status);
    }
    const { siteEntry = [] } = await sitesRes.json();
    const target = new URL(siteOrigin);
    const matches = (siteEntry as { siteUrl: string; permissionLevel?: string }[]).filter(
      (e) => e.permissionLevel !== "siteUnverifiedUser" && coversTarget(e.siteUrl, target),
    );
    if (matches.length === 0) {
      return json({ status: "no_property", candidates: [] });
    }
    let property = matches[0].siteUrl;
    if (matches.length > 1) {
      const picked = selected && matches.find((m) => m.siteUrl === selected);
      if (!picked) {
        return json({ status: "selection_required", candidates: matches.map((m) => m.siteUrl) });
      }
      property = picked.siteUrl;
    }
    const enc = encodeURIComponent(property);

    // 2. Performance (last 28 complete days).
    const perfBody = {
      startDate: isoDaysAgo(31),
      endDate: isoDaysAgo(3),
      dimensions: ["query"],
      rowLimit: 10,
    };
    // 90-day daily series powers the SEO performance dashboard trend charts.
    const seriesBody = {
      startDate: isoDaysAgo(93),
      endDate: isoDaysAgo(3),
      dimensions: ["date"],
      rowLimit: 200,
    };
    const [perfRes, pagesRes, sitemapsRes, seriesRes] = await Promise.all([
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
      fetch(`${GATEWAY}/webmasters/v3/sites/${enc}/searchAnalytics/query`, {
        method: "POST",
        headers,
        body: JSON.stringify(seriesBody),
      }),
    ]);

    const perf = perfRes.ok ? await perfRes.json() : null;
    const pages = pagesRes.ok ? await pagesRes.json() : null;
    const sitemapsJson = sitemapsRes.ok ? await sitemapsRes.json() : null;
    const series = seriesRes.ok ? await seriesRes.json() : null;
    const timeseries = ((series?.rows ?? []) as { keys: string[]; clicks: number; impressions: number; ctr: number; position: number }[])
      .map((r) => ({
        date: r.keys?.[0] ?? "",
        clicks: r.clicks ?? 0,
        impressions: r.impressions ?? 0,
        ctr: r.ctr ?? 0,
        position: r.position ?? null,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const rows = (perf?.rows ?? []) as { keys: string[]; clicks: number; impressions: number; ctr: number; position: number }[];
    const pageRows = (pages?.rows ?? []) as typeof rows;

    // 3. Indexing state for key URLs.
    const origin = property.startsWith("sc-domain:")
      ? `https://${property.slice("sc-domain:".length)}`
      : property.replace(/\/$/, "");
    const inspections = await Promise.all(
      INSPECT_PATHS.map(async (path) => {
        const inspectionUrl = `${origin}${path}`;
        try {
          const res = await fetch(`${GATEWAY}/v1/urlInspection/index:inspect`, {
            method: "POST",
            headers,
            body: JSON.stringify({ inspectionUrl, siteUrl: property }),
          });
          if (!res.ok) {
            return { url: inspectionUrl, error: `HTTP ${res.status}` };
          }
          const data = await res.json();
          const idx = data?.inspectionResult?.indexStatusResult ?? {};
          return {
            url: inspectionUrl,
            verdict: idx.verdict ?? "UNKNOWN",
            coverageState: idx.coverageState ?? null,
            robotsTxtState: idx.robotsTxtState ?? null,
            indexingState: idx.indexingState ?? null,
            pageFetchState: idx.pageFetchState ?? null,
            lastCrawlTime: idx.lastCrawlTime ?? null,
            googleCanonical: idx.googleCanonical ?? null,
            userCanonical: idx.userCanonical ?? null,
            crawledAs: idx.crawledAs ?? null,
          };
        } catch (e) {
          return { url: inspectionUrl, error: String(e) };
        }
      }),
    );

    const sitemaps = ((sitemapsJson?.sitemap ?? []) as Record<string, unknown>[]).map((s) => ({
      path: String(s.path ?? ""),
      lastSubmitted: s.lastSubmitted ?? null,
      lastDownloaded: s.lastDownloaded ?? null,
      isPending: Boolean(s.isPending),
      warnings: Number(s.warnings ?? 0),
      errors: Number(s.errors ?? 0),
      contents: s.contents ?? [],
    }));

    // 4. Derive alerts.
    const alerts: { level: "error" | "warning" | "info"; title: string; detail: string }[] = [];
    for (const s of sitemaps) {
      if (s.errors > 0) {
        alerts.push({
          level: "error",
          title: "Sitemap errors reported",
          detail: `${s.path} — Search Console reports ${s.errors} error(s). The exact cause is not returned by the API; open URL Inspection in Search Console for detail.`,
        });
      } else if (s.warnings > 0) {
        alerts.push({
          level: "warning",
          title: "Sitemap warnings reported",
          detail: `${s.path} — ${s.warnings} warning(s).`,
        });
      }
      if (!s.lastDownloaded) {
        alerts.push({
          level: "info",
          title: "Sitemap not fetched yet",
          detail: `${s.path} has been submitted but Google has not downloaded it yet.`,
        });
      }
    }
    for (const i of inspections) {
      if ("error" in i && i.error) continue;
      const r = i as Extract<typeof i, { verdict: string }>;
      if (r.verdict === "FAIL") {
        alerts.push({
          level: "error",
          title: "Page not indexed",
          detail: `${r.url} — ${r.coverageState ?? "not indexed"}.`,
        });
      } else if (r.verdict === "NEUTRAL" || r.verdict === "PARTIAL") {
        alerts.push({
          level: "warning",
          title: "Indexing issue",
          detail: `${r.url} — ${r.coverageState ?? r.verdict}.`,
        });
      }
      if (r.robotsTxtState && r.robotsTxtState !== "ALLOWED") {
        alerts.push({
          level: "error",
          title: "Blocked by robots.txt",
          detail: `${r.url} — robots state: ${r.robotsTxtState}.`,
        });
      }
      if (r.pageFetchState && !["SUCCESSFUL", "PAGE_FETCH_STATE_UNSPECIFIED"].includes(r.pageFetchState)) {
        alerts.push({
          level: "error",
          title: "Crawl / fetch error",
          detail: `${r.url} — fetch state: ${r.pageFetchState}.`,
        });
      }
    }

    const totals = rows.reduce(
      (acc, r) => ({
        clicks: acc.clicks + (r.clicks ?? 0),
        impressions: acc.impressions + (r.impressions ?? 0),
      }),
      { clicks: 0, impressions: 0 },
    );

    return json({
      status: "ok",
      property,
      range: { start: perfBody.startDate, end: perfBody.endDate },
      totals: {
        ...totals,
        ctr: totals.impressions ? totals.clicks / totals.impressions : 0,
        avgPosition: rows.length
          ? rows.reduce((a, r) => a + (r.position ?? 0), 0) / rows.length
          : null,
      },
      topQueries: rows.map((r) => ({
        query: r.keys?.[0] ?? "",
        clicks: r.clicks,
        impressions: r.impressions,
        ctr: r.ctr,
        position: r.position,
      })),
      topPages: pageRows.map((r) => ({
        page: r.keys?.[0] ?? "",
        clicks: r.clicks,
        impressions: r.impressions,
        ctr: r.ctr,
        position: r.position,
      })),
      sitemaps,
      timeseries,
      seriesRange: { start: seriesBody.startDate, end: seriesBody.endDate },
      coverage: inspections.reduce(
        (acc, i) => {
          if ("error" in i && i.error) acc.unknown += 1;
          else if ((i as { verdict?: string }).verdict === "PASS") acc.indexed += 1;
          else if ((i as { verdict?: string }).verdict === "FAIL") acc.notIndexed += 1;
          else acc.issues += 1;
          return acc;
        },
        { indexed: 0, notIndexed: 0, issues: 0, unknown: 0 },
      ),
      inspections,
      alerts,
      refreshedAt: new Date().toISOString(),
    });
  } catch (e) {
    console.error("[search-console]", e);
    return json({ error: e instanceof Error ? e.message : "Unexpected error" }, 500);
  }
};
