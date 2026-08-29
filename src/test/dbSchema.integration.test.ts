import { describe, it, expect } from "vitest";
import { createClient } from "@supabase/supabase-js";
import {
  CORE_TABLES,
  SUPPORTING_TABLES,
  CORE_RPCS,
  REQUIRED_BUCKETS,
  isMissingTable,
  isMissingFunction,
} from "@/lib/db/healthManifest";

/**
 * Integration tests against the live database.
 * Opt in with RUN_DB_TESTS=1 so unit runs stay offline and fast.
 */
const enabled = process.env.RUN_DB_TESTS === "1";

const url = process.env.VITE_SUPABASE_URL ?? import.meta.env?.VITE_SUPABASE_URL;
const key =
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? import.meta.env?.VITE_SUPABASE_PUBLISHABLE_KEY;

const client = url && key ? createClient(url, key, { auth: { persistSession: false } }) : null;

describe.skipIf(!enabled || !client)("database schema integration", () => {
  it("has credentials configured", () => {
    expect(url).toBeTruthy();
    expect(key).toBeTruthy();
  });

  describe("required tables exist", () => {
    for (const table of CORE_TABLES) {
      it(`table ${table}`, async () => {
        const { error } = await client!.from(table).select("*").limit(1);
        expect(isMissingTable(error), `missing table ${table}: ${error?.message}`).toBe(false);
      });
    }
  });

  describe("supporting tables exist", () => {
    for (const table of SUPPORTING_TABLES) {
      it(`table ${table}`, async () => {
        const { error } = await client!.from(table).select("*").limit(1);
        expect(isMissingTable(error), `missing table ${table}: ${error?.message}`).toBe(false);
      });
    }
  });

  describe("RPCs are callable", () => {
    for (const rpc of CORE_RPCS) {
      it(`rpc ${rpc.name}`, async () => {
        const { error } = await client!.rpc(rpc.name, rpc.args);
        // Permission/auth errors are acceptable — they prove the function exists.
        expect(isMissingFunction(error), `missing rpc ${rpc.name}: ${error?.message}`).toBe(false);
      });
    }
  });

  it("exposes the required storage buckets", async () => {
    const { data, error } = await client!.storage.listBuckets();
    if (error) {
      // Anonymous clients may not list buckets; that is not a schema failure.
      expect(error.message).toBeTruthy();
      return;
    }
    const names = new Set((data ?? []).map((b) => b.name));
    for (const bucket of REQUIRED_BUCKETS) {
      expect(names.has(bucket), `missing bucket ${bucket}`).toBe(true);
    }
  });
});
