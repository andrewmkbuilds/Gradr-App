/**
 * Admin brand + metadata inspector.
 *
 * Reads the *effective* head metadata a crawler would see for every key public
 * route — title, description, canonical, robots, the full og:/twitter: set —
 * plus the PWA manifest and favicon/app icons, and verifies each social card
 * actually resolves with the current Yacht Club artwork (hash + version).
 *
 * Everything is fetched over HTTP exactly like a crawler would, so what the
 * page reports is what Google, LinkedIn, Slack and WhatsApp receive rather
 * than what the source code intends.
 *
 * Admin-only: verified server-side against `has_role`, never trusted from the
 * client.
 */
import { corsHeaders } from "./shared/cors";
import { createClient } from "./shared/supabase";
import spec from "@/config/brand-spec.json";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

export interface RouteMetadata {
  path: string;
  url: string;
  status: number;
  title: string | null;
  description: string | null;
  canonical: string | null;
  robots: string | null;
  ogTitle: string | null;
  ogDescription: string | null;
  ogImage: string | null;
  ogUrl: string | null;
  ogType: string | null;
  ogSiteName: string | null;
  twitterCard: string | null;
  twitterTitle: string | null;
  twitterDescription: string | null;
  twitterImage: string | null;
  themeColor: string | null;
  manifestHref: string | null;
  iconHrefs: string[];
  expectedOgImage: string;
  problems: string[];
  ok: boolean;
}

export interface AssetCheck {
  url: string;
  status: number;
  contentType: string | null;
  bytes: number | null;
  sha256: string | null;
  version: string | null;
  cacheControl: string | null;
  problems: string[];
  ok: boolean;
}

const attr = (html: string, re: RegExp): string | null => {
  const m = html.match(re);
  return m ? decodeEntities(m[1]!.trim()) : null;
};

function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

/** `content` may sit before or after `name`/`property`, so match both orders. */
function metaContent(html: string, kind: "name" | "property", key: string): string | null {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return (
    attr(html, new RegExp(`<meta[^>]+${kind}=["']${escaped}["'][^>]*content=["']([^"']*)["']`, "i")) ??
    attr(html, new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*${kind}=["']${escaped}["']`, "i"))
  );
}

function linkHref(html: string, rel: string): string | null {
  const escaped = rel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return (
    attr(html, new RegExp(`<link[^>]+rel=["'][^"']*${escaped}[^"']*["'][^>]*href=["']([^"']*)["']`, "i")) ??
    attr(html, new RegExp(`<link[^>]+href=["']([^"']*)["'][^>]*rel=["'][^"']*${escaped}[^"']*["']`, "i"))
  );
}

async function sha256(buffer: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const FORBIDDEN = spec.forbidden.strings;
const FORBIDDEN_OG = spec.forbidden.ogFilenames;

function legacyBrandHits(text: string): string[] {
  const lower = text.toLowerCase();
  const hits = new Set<string>();
  for (const needle of [...FORBIDDEN, ...FORBIDDEN_OG]) {
    if (lower.includes(needle.toLowerCase())) hits.add(needle);
  }
  return [...hits];
}

async function inspectRoute(origin: string, route: { path: string; ogImage: string; indexable: boolean }): Promise<RouteMetadata> {
  const url = `${origin}${route.path}`;
  // Social cards are always advertised on the canonical origin, even when a
  // preview host is being crawled.
  const expectedOgImage = `${spec.brand.origin}${route.ogImage}`;
  const problems: string[] = [];
  let html = "";
  let status = 0;

  try {
    const res = await fetch(url, { redirect: "follow", headers: { "user-agent": "GradrBrandInspector/1.0" } });
    status = res.status;
    html = await res.text();
  } catch (err) {
    problems.push(`fetch failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  const head = html.slice(0, Math.max(html.indexOf("</head>"), 0) || html.length);
  const meta: RouteMetadata = {
    path: route.path,
    url,
    status,
    title: attr(html, /<title[^>]*>([^<]*)<\/title>/i),
    description: metaContent(head, "name", "description"),
    canonical: linkHref(head, "canonical"),
    robots: metaContent(head, "name", "robots"),
    ogTitle: metaContent(head, "property", "og:title"),
    ogDescription: metaContent(head, "property", "og:description"),
    ogImage: metaContent(head, "property", "og:image"),
    ogUrl: metaContent(head, "property", "og:url"),
    ogType: metaContent(head, "property", "og:type"),
    ogSiteName: metaContent(head, "property", "og:site_name"),
    twitterCard: metaContent(head, "name", "twitter:card"),
    twitterTitle: metaContent(head, "name", "twitter:title"),
    twitterDescription: metaContent(head, "name", "twitter:description"),
    twitterImage: metaContent(head, "name", "twitter:image"),
    themeColor: metaContent(head, "name", "theme-color"),
    manifestHref: linkHref(head, "manifest"),
    iconHrefs: [...head.matchAll(/<link[^>]+rel=["'][^"']*icon[^"']*["'][^>]*>/gi)]
      .map((m) => attr(m[0]!, /href=["']([^"']*)["']/i))
      .filter((v): v is string => Boolean(v)),
    expectedOgImage,
    problems,
    ok: false,
  };

  if (status !== 200) problems.push(`HTTP ${status || "error"}`);
  if (!meta.title || meta.title.length < 10) problems.push("missing or too-short <title>");
  if (!meta.description || meta.description.length < 40) problems.push("missing or too-short description");
  if (!meta.canonical?.startsWith("http")) problems.push("canonical missing or not absolute");
  if (!meta.ogTitle) problems.push("missing og:title");
  if (!meta.ogDescription) problems.push("missing og:description");
  if (!meta.ogImage?.startsWith("http")) problems.push("og:image missing or not absolute");
  if (meta.twitterCard !== "summary_large_image") problems.push("twitter:card is not summary_large_image");
  if (!meta.twitterImage) problems.push("missing twitter:image");
  if (meta.ogSiteName && meta.ogSiteName !== spec.brand.name) {
    problems.push(`og:site_name is "${meta.ogSiteName}" (expected "${spec.brand.name}")`);
  }
  if (meta.ogImage && !meta.ogImage.startsWith(expectedOgImage)) {
    problems.push(`og:image points at ${meta.ogImage} (expected ${expectedOgImage})`);
  }
  if (meta.ogImage && !meta.ogImage.includes(`v=${spec.ogVersion}`)) {
    problems.push(`og:image is missing the current cache-buster v=${spec.ogVersion}`);
  }
  if (meta.ogImage && meta.twitterImage && meta.ogImage !== meta.twitterImage) {
    problems.push("og:image and twitter:image disagree");
  }
  if (route.indexable && meta.robots?.includes("noindex")) problems.push("public route is marked noindex");
  if (!route.indexable && !meta.robots?.includes("noindex")) problems.push("private route is missing noindex");

  const hits = legacyBrandHits(head);
  if (hits.length) problems.push(`legacy branding in head: ${hits.join(", ")}`);

  meta.ok = problems.length === 0;
  return meta;
}

async function inspectAsset(url: string, expectVersion: boolean): Promise<AssetCheck> {
  const problems: string[] = [];
  const parsed = (() => {
    try {
      return new URL(url);
    } catch {
      return null;
    }
  })();
  const version = parsed?.searchParams.get("v") ?? null;

  let status = 0;
  let contentType: string | null = null;
  let cacheControl: string | null = null;
  let bytes: number | null = null;
  let hash: string | null = null;

  try {
    const res = await fetch(url, { headers: { "user-agent": "GradrBrandInspector/1.0" } });
    status = res.status;
    contentType = res.headers.get("content-type");
    cacheControl = res.headers.get("cache-control");
    const buf = await res.arrayBuffer();
    bytes = buf.byteLength;
    if (res.ok) hash = await sha256(buf);
  } catch (err) {
    problems.push(`fetch failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  if (status !== 200) problems.push(`HTTP ${status || "error"}`);
  if (contentType && !/^image\//.test(contentType) && !/json|manifest/.test(contentType)) {
    problems.push(`unexpected content-type ${contentType}`);
  }
  if (bytes !== null && bytes < 1024) problems.push("response is suspiciously small (placeholder or error page?)");
  if (expectVersion && version !== spec.ogVersion) {
    problems.push(`stale cache-buster (${version ?? "none"} vs ${spec.ogVersion})`);
  }
  for (const legacy of FORBIDDEN_OG) {
    if (url.toLowerCase().includes(legacy.toLowerCase())) problems.push(`legacy OG filename ${legacy}`);
  }

  return { url, status, contentType, bytes, sha256: hash, version, cacheControl, problems, ok: problems.length === 0 };
}

async function inspectManifest(origin: string) {
  const url = `${origin}${spec.manifestPath}`;
  const problems: string[] = [];
  let data: Record<string, unknown> | null = null;
  let status = 0;

  try {
    const res = await fetch(url, { headers: { "user-agent": "GradrBrandInspector/1.0" } });
    status = res.status;
    const text = await res.text();
    const hits = legacyBrandHits(text);
    if (hits.length) problems.push(`legacy branding in manifest: ${hits.join(", ")}`);
    try {
      data = JSON.parse(text) as Record<string, unknown>;
    } catch {
      problems.push("manifest is not valid JSON");
    }
  } catch (err) {
    problems.push(`fetch failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  if (status !== 200) problems.push(`HTTP ${status || "error"}`);
  if (data) {
    const expected = spec.manifest as Record<string, unknown>;
    for (const key of ["name", "short_name", "description", "theme_color", "background_color", "start_url"]) {
      if (data[key] !== expected[key]) {
        problems.push(`${key} is "${String(data[key])}" (expected "${String(expected[key])}")`);
      }
    }
    const icons = Array.isArray(data["icons"]) ? (data["icons"] as { src?: string }[]) : [];
    for (const required of spec.manifest.requiredIcons) {
      if (!icons.some((i) => i.src === required)) problems.push(`manifest is missing icon ${required}`);
    }
  }

  return { url, status, manifest: data, problems, ok: problems.length === 0 };
}

export const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return json({ error: "Authentication required" }, 401);

  const admin = createClient(
    process.env["SUPABASE_URL"]!,
    process.env["SUPABASE_SERVICE_ROLE_KEY"]!,
    { auth: { persistSession: false } },
  );
  const { data: userData, error: userError } = await admin.auth.getUser(token);
  const user = userData?.user;
  if (userError || !user) return json({ error: "Authentication required" }, 401);
  if (user.is_anonymous) return json({ error: "Admin access required" }, 403);
  const { data: isAdmin, error: roleError } = await admin.rpc("has_role", { _user_id: user.id, _role: "admin" });
  if (roleError || isAdmin !== true) return json({ error: "Admin access required" }, 403);

  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    /* an empty body means "scan the deployed site with defaults" */
  }

  // Admins can point the scan at the live domain or at whichever origin is
  // serving this request (preview deploys), but never at an arbitrary host.
  const requestOrigin = new URL(req.url).origin;
  const target = body["target"] === "current" ? requestOrigin : spec.brand.origin;

  const routes = spec.routes;
  const routeResults: RouteMetadata[] = [];
  // Small batches keep the worker well inside its subrequest budget.
  for (let i = 0; i < routes.length; i += 4) {
    routeResults.push(...(await Promise.all(routes.slice(i, i + 4).map((r) => inspectRoute(target, r)))));
  }

  const socialUrls = [...new Set(routeResults.map((r) => r.ogImage).filter((v): v is string => Boolean(v)))];
  const assets: AssetCheck[] = [];
  for (let i = 0; i < socialUrls.length; i += 4) {
    assets.push(...(await Promise.all(socialUrls.slice(i, i + 4).map((u) => inspectAsset(u, true)))));
  }
  const icons: AssetCheck[] = await Promise.all(
    spec.icons.map((path) => inspectAsset(`${target}${path}`, false)),
  );

  const manifest = await inspectManifest(target);

  // Distinct social artwork should be distinct files; identical hashes mean a
  // card was never regenerated and is silently reusing another route's image.
  const byHash = new Map<string, string[]>();
  for (const asset of assets) {
    if (!asset.sha256) continue;
    byHash.set(asset.sha256, [...(byHash.get(asset.sha256) ?? []), asset.url]);
  }
  const duplicateArtwork = [...byHash.values()].filter((urls) => urls.length > 1);

  const failures =
    routeResults.filter((r) => !r.ok).length +
    assets.filter((a) => !a.ok).length +
    icons.filter((a) => !a.ok).length +
    (manifest.ok ? 0 : 1);

  return json({
    scannedAt: new Date().toISOString(),
    target,
    ogVersion: spec.ogVersion,
    brand: spec.brand,
    routes: routeResults,
    assets,
    icons,
    manifest,
    duplicateArtwork,
    summary: {
      routes: routeResults.length,
      routesOk: routeResults.filter((r) => r.ok).length,
      assets: assets.length + icons.length,
      assetsOk: assets.filter((a) => a.ok).length + icons.filter((a) => a.ok).length,
      manifestOk: manifest.ok,
      failures,
      verdict: failures === 0 ? "pass" : "fail",
    },
  });
};
