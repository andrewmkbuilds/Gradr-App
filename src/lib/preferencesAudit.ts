import { supabase } from "@/integrations/supabase/client";

/**
 * Records a read of `user_preferences` in the security audit log.
 *
 * Writes are audited by a database trigger; SELECTs cannot be, so the client
 * reports them through the `log_user_preferences_read` RPC. The RPC derives the
 * user id and the anonymous/authenticated flag from the JWT — never from the
 * caller — and de-duplicates to one row per user per source every 15 minutes.
 *
 * Fire-and-forget: auditing must never break a page render.
 */
export async function logPreferencesRead(source: string, found: boolean): Promise<void> {
  try {
    await supabase.rpc("log_user_preferences_read", { _source: source, _found: found });
  } catch {
    /* non-blocking */
  }
}
