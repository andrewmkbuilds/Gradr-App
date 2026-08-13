import { supabase } from "@/integrations/supabase/client";

/**
 * Client wrapper for admin-only database routines.
 *
 * These routines are `SECURITY DEFINER` and are no longer executable by the
 * `authenticated` role, so they cannot be called straight from the browser.
 * Every call goes through the `admin-rpc` edge function, which re-verifies the
 * caller's session and admin role server-side before touching the database.
 *
 * The return shape mirrors `supabase.rpc()` so call sites read the same way.
 */
export async function adminRpc<T = unknown>(
  fn: string,
  args: Record<string, unknown> = {},
): Promise<{ data: T | null; error: { message: string } | null }> {
  const { data, error } = await supabase.functions.invoke("admin-rpc", {
    body: { fn, args },
  });

  if (error) {
    // Surface the server's message when it sent one (403 / 400 bodies).
    const serverMessage =
      typeof data === "object" && data && "error" in data
        ? String((data as { error: unknown }).error)
        : error.message;
    return { data: null, error: { message: serverMessage } };
  }

  if (data && typeof data === "object" && "error" in data && (data as { error?: string }).error) {
    return { data: null, error: { message: String((data as { error: string }).error) } };
  }

  return { data: ((data as { data?: T })?.data ?? null) as T | null, error: null };
}
