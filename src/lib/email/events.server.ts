import type { SupabaseClient } from "@supabase/supabase-js";

export type EmailEventType =
  | "queued"
  | "sent"
  | "delivered"
  | "opened"
  | "clicked"
  | "bounced"
  | "complained"
  | "failed"
  | "suppressed"
  | "deduped";

export interface EmailEventInput {
  messageId?: string | null;
  templateName?: string | null;
  recipientEmail?: string | null;
  eventType: EmailEventType;
  url?: string | null;
  userAgent?: string | null;
  metadata?: Record<string, unknown>;
}

/**
 * Append an email lifecycle event. Terminal event types are protected by a
 * unique index, so retries (webhook redelivery, queue reprocessing) are
 * silently deduplicated instead of double-counting.
 */
export async function logEmailEvent(
  supabase: SupabaseClient<any, any>,
  input: EmailEventInput,
): Promise<void> {
  const { error } = await supabase.from("email_events").insert({
    message_id: input.messageId ?? null,
    template_name: input.templateName ?? null,
    recipient_email: input.recipientEmail ?? null,
    event_type: input.eventType,
    url: input.url ?? null,
    user_agent: input.userAgent?.slice(0, 400) ?? null,
    metadata: input.metadata ?? {},
  });

  // 23505 = unique_violation -> duplicate terminal event, expected on retries.
  if (error && error.code !== "23505") {
    console.error("Failed to log email event", {
      event_type: input.eventType,
      error: error.message,
    });
  }
}

/** Read the email feature flags table into a simple map (fails open to defaults). */
export async function readEmailFlags(
  supabase: SupabaseClient<any, any>,
  defaults: Record<string, boolean> = {},
): Promise<Record<string, boolean>> {
  const { data, error } = await supabase
    .from("email_feature_flags")
    .select("key, enabled");
  if (error || !data) return defaults;
  const flags: Record<string, boolean> = { ...defaults };
  for (const row of data as Array<{ key: string; enabled: boolean }>) {
    flags[row.key] = Boolean(row.enabled);
  }
  return flags;
}
