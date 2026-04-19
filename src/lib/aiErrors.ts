import { toast } from "sonner";

/**
 * Standardized error handler for AI edge function calls.
 * Detects 401 (signed out) and 429 (rate limit) responses and shows
 * a friendly toast. Returns true if handled, false otherwise.
 */
export function handleAiFunctionError(
  fnError: unknown,
  data?: { error?: string } | null,
): boolean {
  // supabase.functions.invoke surfaces non-2xx as FunctionsHttpError with .context.response
  const anyErr = fnError as any;
  const status: number | undefined =
    anyErr?.context?.status ?? anyErr?.status ?? anyErr?.context?.response?.status;
  const message: string =
    data?.error ?? anyErr?.message ?? "Something went wrong";

  if (status === 401 || /unauthorized/i.test(message)) {
    toast.error("Please sign in to use this feature", {
      description: "Your session may have expired. Sign in again to continue.",
      action: {
        label: "Sign in",
        onClick: () => {
          window.location.href = "/auth";
        },
      },
    });
    return true;
  }

  if (status === 429 || /rate limit/i.test(message)) {
    toast.error("You're going a bit fast", {
      description: message || "Please wait a moment before trying again.",
    });
    return true;
  }

  if (status === 402 || /credits exhausted/i.test(message)) {
    toast.error("AI credits exhausted", {
      description: "Please add more credits to continue.",
    });
    return true;
  }

  return false;
}
