import { createServerFn } from "@tanstack/react-start";
import { buildStatusSnapshot } from "./status.server";

/**
 * Public, unauthenticated status feed. Returns aggregates only — see
 * `status.server.ts` for the redaction rules.
 */
export const getStatusSnapshot = createServerFn({ method: "GET" }).handler(async () => {
  try {
    return await buildStatusSnapshot();
  } catch {
    // Never let the status page itself be the outage.
    return null;
  }
});
