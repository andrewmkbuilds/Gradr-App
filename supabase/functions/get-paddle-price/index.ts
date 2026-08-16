import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { gatewayFetch, type PaddleEnv } from "../_shared/paddle.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const body = await req.json().catch(() => ({}));
    const priceId = typeof body?.priceId === "string" ? body.priceId : "";
    const environment: PaddleEnv = body?.environment === "live" ? "live" : "sandbox";
    if (!priceId || priceId.length > 64) return json({ error: "Invalid priceId" }, 400);

    // The catalog tags each price with `custom_data.external_id` (the
    // human-readable id used across the app), so resolve by scanning active
    // prices rather than a server-side filter Paddle does not support.
    const res = await gatewayFetch(environment, "/prices?per_page=200&status=active");
    const data = await res.json();
    const match = (data?.data ?? []).find(
      (p: { custom_data?: { external_id?: string } }) =>
        p?.custom_data?.external_id === priceId,
    );
    const paddleId = match?.id;
    if (!paddleId) return json({ error: "Price not found" }, 404);

    return json({ paddleId });
  } catch (err) {
    console.error("get-paddle-price error", err);
    return json({ error: "Unable to resolve price" }, 500);
  }
});
