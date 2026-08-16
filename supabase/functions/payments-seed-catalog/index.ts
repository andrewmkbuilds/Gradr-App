import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { gatewayFetch, type PaddleEnv } from "../_shared/paddle.ts";

/**
 * One-off admin utility: inspects (and seeds) the payments catalog.
 * Protected by CRON_SECRET so it can never be triggered by a visitor.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  const secret = Deno.env.get("CATALOG_SEED_SECRET");
  const body = await req.json().catch(() => ({}));
  if (!secret || body?.secret !== secret) return json({ error: "Unauthorized" }, 401);

  const environment: PaddleEnv = body?.environment === "live" ? "live" : "sandbox";
  const action = body?.action ?? "list";

  try {
    if (action === "list") {
      const [products, prices] = await Promise.all([
        gatewayFetch(environment, "/products?per_page=100").then((r) => r.json()),
        gatewayFetch(environment, "/prices?per_page=200").then((r) => r.json()),
      ]);
      return json({ products, prices });
    }

    if (action === "create") {
      const created: unknown[] = [];
      const existing = await gatewayFetch(environment, "/products?per_page=100").then((r) =>
        r.json()
      );
      const byExternal = new Map<string, string>(
        (existing?.data ?? [])
          .filter((p: { custom_data?: { external_id?: string } }) => p?.custom_data?.external_id)
          .map((p: { id: string; custom_data: { external_id: string } }) => [
            p.custom_data.external_id,
            p.id,
          ]),
      );

      for (const item of body.items ?? []) {
        let productId = byExternal.get(item.externalId);
        if (!productId) {
          const pRes = await gatewayFetch(environment, "/products", {
            method: "POST",
            body: JSON.stringify({
              name: item.productName,
              tax_category: "standard",
              custom_data: { external_id: item.externalId },
            }),
          });
          const product = await pRes.json();
          productId = product?.data?.id;
          if (!productId) {
            created.push({ externalId: item.externalId, error: product });
            continue;
          }
        }
        const priceRes = await gatewayFetch(environment, "/prices", {
          method: "POST",
          body: JSON.stringify({
            product_id: productId,
            description: item.priceDescription,
            custom_data: { external_id: item.externalId },
            unit_price: { amount: String(item.amount), currency_code: "USD" },
            ...(item.interval
              ? { billing_cycle: { interval: item.interval, frequency: 1 } }
              : {}),
            tax_mode: "account_setting",
            quantity: { minimum: 1, maximum: 1 },
          }),
        });
        created.push({ externalId: item.externalId, price: await priceRes.json() });
      }
      return json({ created });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (err) {
    console.error("payments-seed-catalog error", err);
    return json({ error: String(err) }, 500);
  }
});
