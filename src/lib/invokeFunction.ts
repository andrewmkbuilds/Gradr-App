import { supabase } from "@/integrations/supabase/client";

export interface InvokeResult<T> {
  data: T | null;
  error: (Error & { status?: number; context?: Response }) | null;
}

/**
 * Calls a backend function hosted by this app at `/api/public/<name>`.
 *
 * Drop-in replacement for the previous `supabase.functions.invoke` call shape:
 * returns `{ data, error }`, attaches the signed-in user's bearer token, and
 * exposes the raw `Response` on `error.context` so callers can read status
 * codes and JSON error bodies (rate limits, entitlement 402s, ...).
 */
export async function invokeFunction<T = unknown>(
  name: string,
  options: { body?: unknown; headers?: Record<string, string> } = {},
): Promise<InvokeResult<T>> {
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;

    const response = await fetch(`/api/public/${name}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
      body: JSON.stringify(options.body ?? {}),
    });

    let parsed: unknown = null;
    const text = await response.clone().text();
    if (text) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = text;
      }
    }

    if (!response.ok) {
      const message =
        (parsed && typeof parsed === "object" && "error" in parsed
          ? String((parsed as { error: unknown }).error)
          : null) ?? `Request failed with status ${response.status}`;
      const error = Object.assign(new Error(message), {
        status: response.status,
        context: response,
      });
      return { data: null, error };
    }

    return { data: parsed as T, error: null };
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err : new Error("Network request failed"),
    };
  }
}
