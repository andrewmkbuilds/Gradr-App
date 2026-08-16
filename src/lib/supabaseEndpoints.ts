/**
 * Canonical Supabase endpoints for the browser bundle.
 *
 * Reads VITE_SUPABASE_URL from the environment (the same source the Supabase
 * client uses), with a fallback to the current Lovable Cloud project URL so
 * edge-function calls never drift to a different project than the client.
 */
const ENV_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const FALLBACK_URL = "https://zdlajleqgmmbfsdnelch.supabase.co";

export const SUPABASE_PROJECT_URL = ENV_URL || FALLBACK_URL;

export const SUPABASE_FUNCTIONS_BASE = `${SUPABASE_PROJECT_URL}/functions/v1`;
