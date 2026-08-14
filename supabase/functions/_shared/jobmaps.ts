// JobMaps (jobmaps.ch) job source — Swiss / Liechtenstein market.
//
// JobMaps exposes its public search surface over an authenticated MCP endpoint
// (JSON-RPC 2.0 over HTTP, Bearer auth). We call it server-side only; the token
// never reaches the browser. If the token is absent the provider is a no-op so
// the primary Adzuna feed keeps working.

const JOBMAPS_MCP_URL = Deno.env.get("JOBMAPS_MCP_URL") || "https://jobmaps.ch/mcp";

export interface NormalizedJob {
  external_id: string;
  source: string;
  title: string;
  company: string | null;
  location: string | null;
  remote: boolean;
  url: string;
  salary_min: number | null;
  salary_max: number | null;
  description: string;
  posted_at: string | null;
}

export function jobmapsEnabled(): boolean {
  return Boolean(Deno.env.get("JOBMAPS_API_TOKEN"));
}

interface McpResult {
  content?: Array<{ type: string; text?: string }>;
  structuredContent?: unknown;
  isError?: boolean;
}

async function rpc(method: string, params: unknown, id: number): Promise<unknown> {
  const token = Deno.env.get("JOBMAPS_API_TOKEN");
  if (!token) throw new Error("JOBMAPS_API_TOKEN not configured");

  const res = await fetch(JOBMAPS_MCP_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
  });

  if (!res.ok) {
    throw new Error(`JobMaps ${method} failed: ${res.status}`);
  }

  const raw = await res.text();
  // The endpoint may answer as SSE (`data: {...}`) or plain JSON.
  const line = raw
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith("data:") || l.startsWith("{"))
    .map((l) => (l.startsWith("data:") ? l.slice(5).trim() : l))
    .pop();

  if (!line) throw new Error("JobMaps returned an empty response");
  const parsed = JSON.parse(line);
  if (parsed.error) throw new Error(`JobMaps error: ${parsed.error.message ?? "unknown"}`);
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

interface JobMapsListing {
  id?: number | string;
  title?: string;
  company_name?: string;
  location?: string | { city?: string; canton?: string };
  summary?: string;
  description?: string;
  url?: string;
  remote_type?: string;
  employment_type?: string;
  created_at?: string;
}

function readLocation(loc: JobMapsListing["location"]): string | null {
  if (!loc) return null;
  if (typeof loc === "string") return loc;
  return [loc.city, loc.canton].filter(Boolean).join(", ") || null;
}

export interface JobMapsSearchInput {
  what?: string;
  where?: string;
  remoteOnly?: boolean;
  limit?: number;
}

/**
 * Search JobMaps. Never throws — on any failure it returns an empty list plus a
 * reason, so a JobMaps outage can't take down the main job feed.
 */
export async function searchJobMaps(
  input: JobMapsSearchInput,
): Promise<{ jobs: NormalizedJob[]; total: number; error?: string }> {
  if (!jobmapsEnabled()) return { jobs: [], total: 0, error: "not_configured" };

  try {
    await rpc("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "gradr", version: "1.0.0" },
    }, 1);

    const args: Record<string, unknown> = {
      limit: Math.min(50, Math.max(1, input.limit ?? 20)),
    };
    if (input.what) args.query = input.what;
    if (input.where) args.city = input.where;
    if (input.remoteOnly) args.remote_types = ["remote", "hybrid"];

    const result = (await rpc("tools/call", { name: "search_jobs", arguments: args }, 2)) as McpResult;
    if (result?.isError) throw new Error("JobMaps search_jobs returned an error");

    const payload = extractPayload(result);
    const listings = (payload.listings ?? payload.jobs ?? payload.results ?? []) as JobMapsListing[];

    const jobs: NormalizedJob[] = (Array.isArray(listings) ? listings : [])
      .filter((l) => l?.title && l?.url)
      .map((l) => ({
        external_id: String(l.id ?? l.url),
        source: "jobmaps",
        title: String(l.title),
        company: l.company_name ?? null,
        location: readLocation(l.location),
        remote: l.remote_type === "remote" || l.remote_type === "hybrid",
        url: String(l.url),
        salary_min: null,
        salary_max: null,
        description: l.description ?? l.summary ?? "",
        posted_at: l.created_at ?? null,
      }));

    const total = typeof payload.total_count === "number" ? payload.total_count : jobs.length;
    return { jobs, total };
  } catch (e) {
    console.error("JobMaps search failed:", e instanceof Error ? e.message : e);
    return { jobs: [], total: 0, error: "unavailable" };
  }
}
