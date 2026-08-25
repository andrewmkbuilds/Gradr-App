import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { gatewayFetch, type PaddleEnv } from "../_shared/paddle.ts";

/**
 * Resolves human-readable price ids (`pro_monthly`, `applications_10`, …) to
 * Paddle `pri_...` ids.
 *
 * Two shapes:
 *   { priceId }   -> { paddleId }            (404 when the price is missing)
 *   { priceIds }  -> { paddleIds, missing }  (always 200, partial results OK)
 *
 * The batch shape exists so the pricing page never loses every localized price
 * because one catalog entry has not been seeded in the active environment.
 */

interface PaddlePrice {
  id: string;
  custom_data?: { external_id?: string } | null;
}

/** Walks every page of the catalog; Paddle has no server-side external_id filter. */
async function loadCatalog(environment: PaddleEnv): Promise<Map<string, string>> {
  const byExternalId = new Map<string, string>();
  let after: string | null = null;

  for (let page = 0; page < 10; page += 1) {
    const query = `/prices?per_page=200&status=active${after ? `&after=${encodeURIComponent(after)}` : ""}`;
    const res = await gatewayFetch(environment, query);
    if (!res.ok) throw new Error(`Paddle catalog request failed (${res.status})`);
    const body = await res.json();
    const rows: PaddlePrice[] = body?.data ?? [];
    for (const row of rows) {
      const externalId = row?.custom_data?.external_id;
      if (externalId && row.id) byExternalId.set(externalId, row.id);
    }
    if (!body?.meta?.pagination?.has_more || rows.length === 0) break;
    after = rows[rows.length - 1]?.id ?? null;
    if (!after) break;
  }

  return byExternalId;
}

const isValidId = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0 && value.length <= 64;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const body = await req.json().catch(() => ({}));
    const environment: PaddleEnv = body?.environment === "live" ? "live" : "sandbox";

    const batch = Array.isArray(body?.priceIds) ? body.priceIds.filter(isValidId).slice(0, 50) : null;
    const single = isValidId(body?.priceId) ? body.priceId : null;
    if (!batch?.length && !single) return json({ error: "Invalid priceId" }, 400);

    const catalog = await loadCatalog(environment);

    if (batch?.length) {
      const paddleIds: Record<string, string> = {};
      const missing: string[] = [];
      for (const id of batch) {
        const paddleId = catalog.get(id);
        if (paddleId) paddleIds[id] = paddleId;
        else missing.push(id);
      }
      // Partial success is a valid answer: the client renders catalog prices
      // for whatever could not be resolved instead of failing the whole page.
      return json({ paddleIds, missing, environment });
    }

    const paddleId = catalog.get(single!);
    if (!paddleId) {
      return json({ error: "Price not found", code: "price_not_found", priceId: single, environment }, 404);
    }
    return json({ paddleId });
  } catch (err) {
    console.error("get-paddle-price error", err);
    return json({ error: "Unable to resolve price", code: "resolver_error" }, 500);
  }
});
