import { useEffect, useState } from "react";

/**
 * Debounce a rapidly-changing value (a search box) before it reaches a query
 * key. Admin RPC calls are throttled server-side at 120/minute, so firing one
 * request per keystroke is both wasteful and a route to a self-inflicted
 * `rate_limited` audit row.
 */
export function useDebouncedValue<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);

  return debounced;
}
