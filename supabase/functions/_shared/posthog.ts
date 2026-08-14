/**
 * Server-side PostHog capture for revenue events.
 *
 * Paid conversions are recorded here, from the provider webhook, and never from
 * the browser: a checkout click is intent, only Paddle can confirm money moved.
 * `distinct_id` is the Gradr user id so these events join the same person as
 * their anonymous first visit.
 *
 * Analytics must never break billing — every failure is logged and swallowed.
 */
const TOKEN = Deno.env.get("POSTHOG_API_KEY");
const REGION = Deno.env.get("POSTHOG_REGION") || "eu";
const HOST = REGION === "us" ? "https://us.i.posthog.com" : "https://eu.i.posthog.com";

export async function capture(
  event: string,
  distinctId: string | null,
  properties: Record<string, unknown> = {},
) {
  if (!TOKEN) return;
  if (!distinctId) return; // Un-attributed revenue would corrupt funnel math.
  try {
    const res = await fetch(`${HOST}/i/v0/e/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: TOKEN,
        event,
        distinct_id: distinctId,
        properties: { ...properties, $lib: "gradr-server", source: "webhook" },
      }),
    });
    if (!res.ok) {
      console.error(`PostHog capture failed [${res.status}]: ${await res.text()}`);
    }
  } catch (err) {
    console.error("PostHog capture error:", err instanceof Error ? err.message : String(err));
  }
}

/** Sets durable person properties (plan, paying status) from the server. */
export async function setPerson(distinctId: string | null, props: Record<string, unknown>) {
  if (!TOKEN || !distinctId) return;
  await capture("$set", distinctId, { $set: props });
}
