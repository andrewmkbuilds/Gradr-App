/**
 * Human copy for admin endpoint failures.
 *
 * Admin surfaces call edge functions that legitimately answer 401/403 (not an
 * admin, expired session) or 5xx (dependency down). Neither should ever leave
 * a blank panel or leak a raw stack — every admin view renders one of these
 * descriptions with a retry affordance instead.
 */

export type AdminErrorKind = "unauthenticated" | "forbidden" | "notFound" | "server" | "network" | "unknown";

export interface AdminErrorInfo {
  kind: AdminErrorKind;
  status?: number;
  title: string;
  description: string;
  /** False when retrying cannot possibly help (e.g. missing admin role). */
  retryable: boolean;
  /** Raw message, kept for the collapsible technical detail line. */
  detail?: string;
}

/** supabase.functions.invoke surfaces non-2xx as FunctionsHttpError. */
export function extractStatus(error: unknown): number | undefined {
  const anyErr = error as
    | { context?: { status?: number; response?: { status?: number } }; status?: number }
    | null
    | undefined;
  return anyErr?.context?.status ?? anyErr?.status ?? anyErr?.context?.response?.status;
}

export function describeAdminError(error: unknown, resource = "this data"): AdminErrorInfo {
  const status = extractStatus(error);
  const detail = error instanceof Error ? error.message : error ? String(error) : undefined;
  const offline = typeof navigator !== "undefined" && navigator.onLine === false;

  if (offline) {
    return {
      kind: "network",
      title: "You're offline",
      description: `We can't reach the admin service right now. Reconnect and retry to load ${resource}.`,
      retryable: true,
      detail,
    };
  }

  if (status === 401) {
    return {
      kind: "unauthenticated",
      status,
      title: "Your session expired",
      description: "Sign in again to continue — nothing was changed.",
      retryable: true,
      detail,
    };
  }

  if (status === 403) {
    return {
      kind: "forbidden",
      status,
      title: "Admin access required",
      description: `Your account doesn't have permission to view ${resource}. Ask an owner to grant you the admin role.`,
      retryable: false,
      detail,
    };
  }

  if (status === 404) {
    return {
      kind: "notFound",
      status,
      title: "Nothing to show yet",
      description: `We couldn't find ${resource}. It may not have been generated for this environment yet.`,
      retryable: true,
      detail,
    };
  }

  if (status && status >= 500) {
    return {
      kind: "server",
      status,
      title: "The admin service hit an error",
      description: `Loading ${resource} failed on our side. It's usually temporary — retry in a moment.`,
      retryable: true,
      detail,
    };
  }

  if (!status && /failed to fetch|network|load failed/i.test(detail ?? "")) {
    return {
      kind: "network",
      title: "Couldn't reach the admin service",
      description: `The request for ${resource} never completed. Check your connection and retry.`,
      retryable: true,
      detail,
    };
  }

  return {
    kind: "unknown",
    status,
    title: "We couldn't load this",
    description: `Something went wrong loading ${resource}.`,
    retryable: true,
    detail,
  };
}
