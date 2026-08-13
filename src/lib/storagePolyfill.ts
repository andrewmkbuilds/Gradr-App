/**
 * Installs an in-memory `localStorage` / `sessionStorage` shim when the real
 * one is missing or unusable.
 *
 * Some modules — including the auto-generated Supabase client, which reads
 * `localStorage` at module scope — assume Web Storage always exists. In
 * SSR-like previews, prerender passes, or hardened/private browsing contexts
 * that assumption throws before React mounts and the user gets a blank page.
 *
 * Import this module for side effects as the very first import in the app
 * entry so the shim is installed before any consumer runs.
 */
function makeMemoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    key: (i: number) => Array.from(map.keys())[i] ?? null,
    getItem: (k: string) => (map.has(k) ? (map.get(k) as string) : null),
    setItem: (k: string, v: string) => void map.set(k, String(v)),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
  } as Storage;
}

function ensure(name: "localStorage" | "sessionStorage", target: Record<string, unknown>) {
  try {
    const existing = (target as { [k: string]: Storage | undefined })[name];
    if (existing) {
      const probe = "__gradr_storage_probe__";
      existing.setItem(probe, "1");
      existing.removeItem(probe);
      return;
    }
  } catch {
    /* present but unusable — replace it below */
  }
  try {
    Object.defineProperty(target, name, {
      value: makeMemoryStorage(),
      configurable: true,
      writable: true,
    });
  } catch {
    /* frozen global — nothing more we can do */
  }
}

const globalTarget = (typeof globalThis !== "undefined" ? globalThis : undefined) as
  | (Record<string, unknown> & { window?: unknown })
  | undefined;

if (globalTarget) {
  ensure("localStorage", globalTarget);
  ensure("sessionStorage", globalTarget);
}

export {};
