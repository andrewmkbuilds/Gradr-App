/**
 * SSR-safe / privacy-mode-safe wrapper around Web Storage.
 *
 * Touching `localStorage` at module scope (or in code that can run before the
 * browser environment exists — SSR-like previews, prerenders, jsdom tests) throws
 * a ReferenceError, which escapes React and leaves the user staring at a blank
 * screen. Safari private mode and hardened browsers can also throw on write.
 *
 * Every read/write goes through here: it degrades to an in-memory store instead
 * of throwing, so a storage failure can never take the app down.
 */

const memoryStore = new Map<string, string>();

/** True only in a real browser with a usable Storage implementation. */
export function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function backing(): Storage | null {
  if (!isBrowser()) return null;
  try {
    const ls = window.localStorage;
    // Probe: Safari private mode exposes the API but throws on write.
    const probe = "__gradr_probe__";
    ls.setItem(probe, "1");
    ls.removeItem(probe);
    return ls;
  } catch {
    return null;
  }
}

export const safeStorage = {
  get(key: string): string | null {
    const store = backing();
    if (!store) return memoryStore.get(key) ?? null;
    try {
      return store.getItem(key);
    } catch {
      return memoryStore.get(key) ?? null;
    }
  },

  set(key: string, value: string): void {
    memoryStore.set(key, value);
    const store = backing();
    if (!store) return;
    try {
      store.setItem(key, value);
    } catch {
      /* quota or disabled storage — the memory copy is the fallback */
    }
  },

  remove(key: string): void {
    memoryStore.delete(key);
    const store = backing();
    if (!store) return;
    try {
      store.removeItem(key);
    } catch {
      /* ignore */
    }
  },

  /** JSON helper that never throws on malformed values. */
  getJSON<T>(key: string, fallback: T): T {
    const raw = safeStorage.get(key);
    if (!raw) return fallback;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  },

  setJSON(key: string, value: unknown): void {
    try {
      safeStorage.set(key, JSON.stringify(value));
    } catch {
      /* non-serialisable — skip */
    }
  },
};

/**
 * Storage adapter shaped for `@supabase/supabase-js` auth options. Supabase
 * calls this on the client only, but the adapter keeps auth working (in memory)
 * even when persistent storage is unavailable instead of crashing the app.
 */
export const supabaseSafeStorage = {
  getItem: (key: string) => safeStorage.get(key),
  setItem: (key: string, value: string) => safeStorage.set(key, value),
  removeItem: (key: string) => safeStorage.remove(key),
};

export default safeStorage;
