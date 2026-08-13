import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { MotionConfig } from "motion/react";

export type MotionPreference = "system" | "full" | "reduced";

const STORAGE_KEY = "gradr-motion";

interface MotionContextValue {
  /** What the user chose — may be "system". */
  preference: MotionPreference;
  /** Whether motion is actually reduced right now. */
  reduced: boolean;
  /** What the OS reports, regardless of the user override. */
  systemReduced: boolean;
  setPreference: (preference: MotionPreference) => void;
}

const MotionPreferenceContext = createContext<MotionContextValue | null>(null);

function readStored(): MotionPreference {
  if (typeof window === "undefined") return "system";
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "system" || stored === "full" || stored === "reduced") return stored;
  } catch {
    /* storage disabled — fall back to the OS setting */
  }
  return "system";
}

function systemPrefersReduced(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * App-wide motion preference.
 *
 * Layers a persisted user choice on top of the OS `prefers-reduced-motion`
 * setting, drives Motion's own `MotionConfig`, and mirrors the resolved state
 * onto `<html data-motion>` so pure-CSS animations degrade too.
 */
export function MotionPreferenceProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<MotionPreference>(readStored);
  const [systemReduced, setSystemReduced] = useState<boolean>(systemPrefersReduced);

  useEffect(() => {
    if (!window.matchMedia) return;
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = (event: MediaQueryListEvent) => setSystemReduced(event.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  // Keep multiple tabs in sync.
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY) setPreferenceState(readStored());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const reduced = preference === "reduced" || (preference === "system" && systemReduced);

  useEffect(() => {
    document.documentElement.dataset.motion = reduced ? "reduced" : "full";
  }, [reduced]);

  const setPreference = useCallback((next: MotionPreference) => {
    setPreferenceState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
  }, []);

  const value = useMemo<MotionContextValue>(
    () => ({ preference, reduced, systemReduced, setPreference }),
    [preference, reduced, systemReduced, setPreference],
  );

  return (
    <MotionPreferenceContext.Provider value={value}>
      <MotionConfig reducedMotion={reduced ? "always" : "never"}>{children}</MotionConfig>
    </MotionPreferenceContext.Provider>
  );
}

export function useMotionPreference(): MotionContextValue {
  const context = useContext(MotionPreferenceContext);
  if (!context) throw new Error("useMotionPreference must be used within a MotionPreferenceProvider");
  return context;
}

/**
 * Drop-in replacement for Motion's `useReducedMotion` that also honours the
 * in-app toggle. Use this everywhere inside Gradr.
 */
export function useReducedMotionPref(): boolean {
  const context = useContext(MotionPreferenceContext);
  const [fallback, setFallback] = useState<boolean>(systemPrefersReduced);

  useEffect(() => {
    if (context || !window.matchMedia) return;
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = (event: MediaQueryListEvent) => setFallback(event.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, [context]);

  return context ? context.reduced : fallback;
}
