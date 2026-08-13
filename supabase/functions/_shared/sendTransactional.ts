/**
 * Server-side helper for dispatching transactional email from other edge
 * functions (webhooks, cron, admin actions).
 *
 * It calls `send-transactional-email` with the service-role key, which is the
 * only caller class allowed to address arbitrary recipients. Failures are
 * logged and swallowed: email is never allowed to break the business flow that
 * triggered it (a Paddle webhook must still return 200).
 */
export async function sendTransactionalEmail(params: {
  templateName: string;
  recipientEmail: string;
  idempotencyKey: string;
  templateData?: Record<string, unknown>;
}): Promise<boolean> {
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) {
    console.error("sendTransactionalEmail: missing service credentials");
    return false;
  }

  try {
    const res = await fetch(`${url}/functions/v1/send-transactional-email`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceKey}`,
        apikey: serviceKey,
      },
      body: JSON.stringify({
        templateName: params.templateName,
        recipientEmail: params.recipientEmail,
        idempotencyKey: params.idempotencyKey,
        templateData: params.templateData ?? {},
      }),
    });
    if (!res.ok) {
      console.error("sendTransactionalEmail failed", {
        template: params.templateName,
        status: res.status,
        body: await res.text().catch(() => ""),
      });
      return false;
    }
    return true;
  } catch (err) {
    console.error("sendTransactionalEmail threw", {
      template: params.templateName,
      err: String(err),
    });
    return false;
  }
}

/** Money formatting shared by the billing emails (Paddle sends minor units). */
export function formatMoney(minorUnits: unknown, currency = "USD"): string {
  const n = Number(minorUnits);
  if (!Number.isFinite(n)) return "";
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(n / 100);
  } catch {
    return `${(n / 100).toFixed(2)} ${currency}`;
  }
}

/** Human date for email bodies, e.g. "12 March 2026". */
export function formatDate(value: unknown): string {
  if (!value) return "";
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { day: "numeric", month: "long", year: "numeric" });
}
