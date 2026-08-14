// Corvi Careers job source — global job search aggregator.
//
// Corvi exposes its search surface over an authenticated MCP endpoint
// (JSON-RPC 2.0 over HTTP, Bearer auth). We call it server-side only; the token
// never reaches the browser. If the token is absent the provider is a no-op so
// the primary Adzuna feed keeps working.

import type { NormalizedJob } from "./jobmaps.ts";

const CORVI_MCP_URL = () => Deno.env.get("CORVI_MCP_URL") || "https://mcp.corvi.careers/mcp";

export function corviEnabled(): boolean {
  return Boolean(Deno.env.get("CORVI_API_TOKEN"));
}

interface McpResult {
  content?: Array<{ type: string; text?: string }>;
  structuredContent?: unknown;
  isError?: boolean;
}

async function rpc(method: string, params: unknown, id: number): Promise<unknown> {
  const token = Deno.env.get("CORVI_API_TOKEN");
  if (!token) throw new Error("CORVI_API_TOKEN not configured");

  const res = await fetch(CORVI_MCP_URL(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
  });

  if (!res.ok) throw new Error(`Corvi ${method} failed: ${res.status}`);

  const raw = await res.text();
  // The endpoint may answer as SSE (`data: {...}`) or plain JSON.
  const line = raw
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith("data:") || l.startsWith("{"))
    .map((l) => (l.startsWith("data:") ? l.slice(5).trim() : l))
    .pop();

  if (!line) throw new Error("Corvi returned an empty response");
  const parsed = JSON.parse(line);
  if (parsed.error) throw new Error(`Corvi error: ${parsed.error.message ?? "unknown"}`);
  return parsed.result;
}

function extractPayload(result: McpResult): Record<string, unknown> {
  if (result?.structuredContent && typeof result.structuredContent === "object") {
    return result.structuredContent as Record<string, unknown>;
  }
  const text = result?.content?.find((c) => c.type === "text")?.text;
  if (!text) return {};
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return {};
  }
}

interface CorviLocation {
  geonameid?: number;
  name?: string;
  display_label?: string;
  remote?: boolean;
}

interface CorviListing {
  id?: number | string;
  title?: string;
  company?: string;
  location?: string;
  display_location?: string;
  url?: string;
  posted_at?: string;
  created_at?: string;
  salary?: unknown;
  data?: {
    job_type?: string | null;
    salary?: { min?: number; max?: number; currency?: string; period?: string } | null;
    top_10_keywords?: string[];
    location_lines?: string[];
  };
}

/** Resolve a free-text place into a Corvi location filter. */
async function resolveLocation(where: string): Promise<CorviLocation | null> {
  const result = (await rpc(
    "tools/call",
    { name: "location_autocomplete", arguments: { query: where } },
    2,
  )) as McpResult;
  const payload = extractPayload(result);
  const list = ((payload as { data?: CorviLocation[] }).data ?? []) as CorviLocation[];
  const first = Array.isArray(list) ? list.find((l) => typeof l.geonameid === "number") : null;
  return first ?? null;
}

function readDescription(l: CorviListing): string {
  const keywords = l.data?.top_10_keywords ?? [];
  const lines = l.data?.location_lines ?? [];
  return [...keywords, ...lines].filter(Boolean).join("\n\n");
}

export interface CorviSearchInput {
  what?: string;
  where?: string;
  remoteOnly?: boolean;
  limit?: number;
  page?: number;
}

/**
 * Search Corvi Careers. Never throws — on any failure it returns an empty list
 * plus a reason, so a Corvi outage can't take down the main job feed.
 */
export async function searchCorvi(
  input: CorviSearchInput,
): Promise<{ jobs: NormalizedJob[]; total: number; error?: string }> {
  if (!corviEnabled()) return { jobs: [], total: 0, error: "not_configured" };
  if (!input.where) return { jobs: [], total: 0, error: "location_required" };

  try {
    await rpc(
      "initialize",
      {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "gradr", version: "1.0.0" },
      },
      1,
    );

    const place = await resolveLocation(input.where);
    if (!place) return { jobs: [], total: 0, error: "location_unresolved" };

    const args: Record<string, unknown> = {
      locations: [{ geonameid: place.geonameid, name: place.name ?? place.display_label }],
      limit: Math.min(50, Math.max(1, input.limit ?? 20)),
      page: Math.max(1, input.page ?? 1),
    };
    if (input.what) args.keywords = [input.what];
    if (input.remoteOnly) args.remote = true;

    const result = (await rpc("tools/call", { name: "search_jobs", arguments: args }, 3)) as McpResult;
    if (result?.isError) throw new Error("Corvi search_jobs returned an error");

    const payload = extractPayload(result);
    const data = (payload as { data?: { search_results?: CorviListing[] } }).data;
    const listings = (data?.search_results ?? []) as CorviListing[];

    const jobs: NormalizedJob[] = (Array.isArray(listings) ? listings : [])
      .filter((l) => l?.title && l?.url)
      .map((l) => {
        const sal = l.data?.salary ?? null;
        const remoteText = `${l.title ?? ""} ${l.location ?? ""} ${(l.data?.location_lines ?? []).join(" ")}`;
        return {
          external_id: String(l.id ?? l.url),
          source: "corvi",
          title: String(l.title),
          company: l.company ?? null,
          location: l.display_location ?? l.location ?? null,
          remote: /\bremote\b|\bwork from home\b|\bwfh\b/i.test(remoteText),
          url: String(l.url),
          salary_min: typeof sal?.min === "number" ? Math.round(sal.min) : null,
          salary_max: typeof sal?.max === "number" ? Math.round(sal.max) : null,
          description: readDescription(l),
          posted_at: l.posted_at ?? l.created_at ?? null,
        };
      })
      .filter((j) => !input.remoteOnly || j.remote);

    return { jobs, total: jobs.length };
  } catch (e) {
    console.error("Corvi search failed:", e instanceof Error ? e.message : e);
    return { jobs: [], total: 0, error: "unavailable" };
  }
}
