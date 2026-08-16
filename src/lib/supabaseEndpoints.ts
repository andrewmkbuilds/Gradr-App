/**
 * Canonical Supabase endpoints for the browser bundle.
 *
 * These intentionally do NOT read `import.meta.env.VITE_SUPABASE_URL`: the build
 * environment can inject a stale value that overrides `.env`, which would point
 * edge-function calls at a different project than the Supabase client itself.
 * Keep this file as the single source of truth for the project URL.
 */
export const SUPABASE_PROJECT_URL = "https://xaeyjrekewnwjujnrqgu.supabase.co";

export const SUPABASE_FUNCTIONS_BASE = `${SUPABASE_PROJECT_URL}/functions/v1`;
