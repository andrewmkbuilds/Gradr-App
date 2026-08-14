/**
 * QA state override.
 *
 * Any surface can be forced into its loading / empty / error presentation by
 * adding `?qa=loading|empty|error` to the URL. This exists so the final-QA
 * checklist can verify every state of every route without mutating data.
 *
 * The override is read-only and purely presentational: it never changes what
 * is written to the backend, and it is ignored unless the query param is
 * present, so production traffic is unaffected.
 */
import { useMemo } from "react";
import { useLocation } from "react-router-dom";
import type { QaState } from "./routes";

export type { QaState };

function parse(search: string): QaState | null {
  const value = new URLSearchParams(search).get("qa");
  return value === "loading" || value === "empty" || value === "error" ? value : null;
}

/** Non-hook read — safe outside React (query fns, loaders). */
export function getQaState(): QaState | null {
  if (typeof window === "undefined") return null;
  return parse(window.location.search);
}

/** Current QA override, or null in normal use. */
export function useQaState(): QaState | null {
  const { search } = useLocation();
  return useMemo(() => parse(search), [search]);
}

export interface QaQueryShape<T> {
  data: T | undefined;
  isLoading: boolean;
  isError: boolean;
  error?: unknown;
}

/**
 * Wraps a query-like result so the QA override wins.
 *
 * ```ts
 * const jobs = useQaQuery(useQuery(...), []);
 * ```
 */
export function useQaQuery<T>(result: QaQueryShape<T>, emptyValue: T): QaQueryShape<T> {
  const qa = useQaState();
  return useMemo(() => {
    if (!qa) return result;
    if (qa === "loading") return { ...result, data: undefined, isLoading: true, isError: false };
    if (qa === "empty") return { ...result, data: emptyValue, isLoading: false, isError: false };
    return {
      ...result,
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error("QA preview error state"),
    };
  }, [qa, result, emptyValue]);
}

/** True when the page is rendered inside the QA checklist preview frame. */
export function isQaFrame(): boolean {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("qaFrame") === "1";
}
