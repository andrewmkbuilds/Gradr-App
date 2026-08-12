import { corsHeaders } from "./shared/cors";
import { gatewayFetch, type PaddleEnv } from "./shared/paddle";

export const handler = async (req: Request): Promise<Response> => {
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

    const res = await gatewayFetch(
      environment,
      `/prices?external_id=${encodeURIComponent(priceId)}`,
    );
    const data = await res.json();
    const paddleId = data?.data?.[0]?.id;
    if (!paddleId) return json({ error: "Price not found" }, 404);

    return json({ paddleId });
  } catch (err) {
    console.error("get-paddle-price error", err);
    return json({ error: "Unable to resolve price" }, 500);
  }
};
