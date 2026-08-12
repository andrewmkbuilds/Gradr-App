// ResearchProvider abstraction (server-only).
// Perplexity is used when a key is configured; otherwise Firecrawl web search
// is the research source. Raw research is NEVER returned as final coaching —
// callers pass it to Gemini for synthesis.

import { search as firecrawlSearch, FirecrawlError } from "./firecrawl";

export type ResearchSource = { title: string; url: string; snippet?: string };
export type ResearchResult = {
  provider: "perplexity" | "firecrawl";
  text: string;
  sources: ResearchSource[];
};

export interface ResearchProvider {
  id: "perplexity" | "firecrawl";
  available(): boolean;
  research(query: string, opts?: { recency?: "day" | "week" | "month" | "year" }): Promise<ResearchResult>;
}

const perplexityProvider: ResearchProvider = {
  id: "perplexity",
  available: () => !!process.env['PERPLEXITY_API_KEY'],
  async research(query, opts) {
    const key = process.env['PERPLEXITY_API_KEY']!;
    const res = await fetch("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "sonar",
        messages: [
          { role: "system", content: "Return factual, sourced, up-to-date information. Be concise. Do not give advice." },
          { role: "user", content: query },
        ],
        search_recency_filter: opts?.recency ?? "month",
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      if (res.status === 401 && body.includes("insufficient_quota")) {
        throw new Error("Research credits are exhausted for the connected Perplexity account.");
      }
      throw new Error(`Research provider failed [${res.status}]`);
    }
    const data = await res.json();
    const citations: string[] = data.citations ?? [];
    return {
      provider: "perplexity",
      text: data.choices?.[0]?.message?.content ?? "",
      sources: citations.map((u) => ({ title: safeHost(u), url: u })),
    };
  },
};

const firecrawlProvider: ResearchProvider = {
  id: "firecrawl",
  available: () => !!process.env['FIRECRAWL_API_KEY'] && !!process.env['LOVABLE_API_KEY'],
  async research(query) {
    const hits = await firecrawlSearch(query, { limit: 5, scrape: true });
    if (!hits.length) {
      throw new FirecrawlError("empty", "No public information was found for this search.", 404);
    }
    const text = hits
      .map((h, i) => `[${i + 1}] ${h.title ?? h.url}\n${(h.markdown ?? h.description ?? "").slice(0, 2500)}`)
      .join("\n\n---\n\n");
    return {
      provider: "firecrawl",
      text,
      sources: hits.map((h) => ({ title: h.title ?? safeHost(h.url), url: h.url, snippet: h.description })),
    };
  },
};

function safeHost(u: string) {
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return u;
  }
}

/** Returns the best available research provider, or null if none are configured. */
export function getResearchProvider(): ResearchProvider | null {
  for (const p of [perplexityProvider, firecrawlProvider]) {
    if (p.available()) return p;
  }
  return null;
}
