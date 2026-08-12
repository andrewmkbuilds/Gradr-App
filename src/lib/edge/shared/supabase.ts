// Loosely-typed Supabase client for ported backend handlers.
// These handlers query tables and RPCs with runtime-validated shapes, so they
// intentionally opt out of the generated Database types.
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const createClient = (url: string, key: string, options?: any): any =>
  createSupabaseClient(url, key, options);
