/**
 * Client-side detector for Postgres `permission denied` errors.
 *
 * Wired into the global react-query error handler so any query — on a public
 * page or behind auth — that trips an RLS/grant regression reports a single,
 * non-identifying signal to `/api/public/permission-denied`. The admin alert
 * dashboard turns those into a spike alert; a signed-out visitor hitting a
 * `has_role` denial is treated as critical.
 */

const seen = new Set<string>();

export function isPermissionDenied(error: unknown): boolean {
  const message =
    error && typeof error === "object" && "message" in error
      ? String((error as { message: unknown }).message)
      : String(error ?? "");
  const code =
    error && typeof error === "object" && "code" in error
      ? String((error as { code: unknown }).code)
      : "";
  return /permission denied/i.test(message) || code === "42501";
}

export function reportPermissionDenied(error: unknown, authenticated: boolean): void {
  if (typeof window === "undefined" || !isPermissionDenied(error)) return;

  const e = (error ?? {}) as { message?: unknown; code?: unknown; details?: unknown };
  const message = String(e.message ?? "permission denied").slice(0, 500);
  const route = window.location.pathname;

  // One report per route+message per page session — never a feedback loop.
  const key = `${route}|${message}`;
  if (seen.has(key)) return;
  seen.add(key);

  void fetch("/api/public/permission-denied", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      route,
      authenticated,
      code: e.code ? String(e.code).slice(0, 20) : null,
      message,
    }),
    keepalive: true,
  }).catch(() => undefined);
}
