/**
 * Supabase-aware fetch instrumentation.
 *
 * Wraps the fetch used by the Supabase JS client so every failing PostgREST,
 * Auth, Storage or Edge Function call leaves a breadcrumb and (for 5xx /
 * network failures) an error in Sentry, with enough context to debug:
 * the API area, the table/function name, the HTTP status and the Postgres
 * error code. No request bodies, tokens or row data are ever captured.
 */
import { addBreadcrumb, captureError } from "./sentry";

type SupabaseArea = "rest" | "auth" | "storage" | "functions" | "realtime" | "unknown";

interface CallInfo {
  area: SupabaseArea;
  /** Table, bucket or function name — never a full URL with query values. */
  resource: string;
  method: string;
}

function describe(input: RequestInfo | URL, init?: RequestInit): CallInfo {
  const raw =
    typeof input === "string" ? input : input instanceof URL ? input.href : (input as Request).url;
  const method = (init?.method || (input as Request)?.method || "GET").toUpperCase();

  let path = raw;
  try {
    path = new URL(raw).pathname;
  } catch {
    /* keep raw */
  }

  const match = /\/(rest\/v1|auth\/v1|storage\/v1|functions\/v1|realtime\/v1)\/(.*)$/.exec(path);
  if (!match) return { area: "unknown", resource: path, method };

  const area = match[1].split("/")[0] as SupabaseArea;
  const resource = (match[2] || "").split("/").filter(Boolean).slice(0, 2).join("/") || "(root)";
  return { area, resource, method };
}

/** Pull the Postgres/GoTrue error code out of the JSON body without keeping data. */
async function readErrorCode(response: Response): Promise<string | undefined> {
  try {
    const body = await response.clone().json();
    if (body && typeof body === "object") {
      const rec = body as Record<string, unknown>;
      const code = rec.code ?? rec.error_code ?? rec.error;
      if (typeof code === "string") return code;
    }
  } catch {
    /* non-JSON body */
  }
  return undefined;
}

export function instrumentedFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const info = describe(input, init);
  const startedAt = Date.now();

  return fetch(input, init).then(
    async (response) => {
      const duration = Date.now() - startedAt;
      if (response.ok) {
        addBreadcrumb("supabase", `${info.method} ${info.area}/${info.resource}`, {
          status: response.status,
          duration_ms: duration,
        });
        return response;
      }

      const code = await readErrorCode(response);
      const context = {
        area: info.area,
        resource: info.resource,
        method: info.method,
        status: response.status,
        pg_code: code,
        duration_ms: duration,
      };

      addBreadcrumb("supabase", `FAILED ${info.method} ${info.area}/${info.resource}`, context);

      // 4xx are usually expected (RLS denials, 401 before sign-in, 404 on
      // maybeSingle) — breadcrumb only. 5xx means the backend actually broke.
      if (response.status >= 500) {
        captureError(
          new Error(`Supabase ${info.area} ${response.status} on ${info.resource}`),
          context,
        );
      }
      return response;
    },
    (error: unknown) => {
      captureError(error, {
        area: info.area,
        resource: info.resource,
        method: info.method,
        kind: "network",
        duration_ms: Date.now() - startedAt,
      });
      throw error;
    },
  );
}
