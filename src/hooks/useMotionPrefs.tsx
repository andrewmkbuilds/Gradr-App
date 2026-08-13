/**
 * Gradr motion & performance preferences.
 *
 * Layers a *user-facing* control on top of the OS `prefers-reduced-motion`
 * signal, plus a depth-intensity dial for the 3D/spatial system:
 *
 *   mode  : "system" | "full" | "reduced"   (default "system")
 *   depth : 0 .. 1                          (0 = flat, 1 = full parallax)
 *   diagnostics : show the FPS/dropped-frame overlay
 *
 * The effective reduced-motion value is exposed as `reduceMotion` and mirrored
 * onto `<html data-reduce-motion>` / `<html data-depth>` so plain CSS
 * animations degrade too, not just Framer Motion ones.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type MotionMode = "system" | "full" | "reduced";

const STORAGE_KEY = "gradr-motion-prefs";

interface StoredPrefs {
  mode: MotionMode;
  depth: number;
  diagnostics: boolean;
}

const DEFAULTS: StoredPrefs = { mode: "system", depth: 1, diagnostics: false };

interface MotionPrefsValue extends StoredPrefs {
  /** OS-level `prefers-reduced-motion: reduce`. */
  systemReduced: boolean;
  /** Final answer every component should branch on. */
  reduceMotion: boolean;
  /** Depth intensity after applying reduced-motion (0 when reduced). */
  effectiveDepth: number;
  setMode: (mode: MotionMode) => void;
  setDepth: (depth: number) => void;
  setDiagnostics: (on: boolean) => void;
}

const MotionPrefsContext = createContext<MotionPrefsValue | null>(null);

function readStored(): StoredPrefs {
  if (typeof window === "undefined") return DEFAULTS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<StoredPrefs>;
    return {
      mode:
        parsed.mode === "full" || parsed.mode === "reduced" || parsed.mode === "system"
          ? parsed.mode
          : DEFAULTS.mode,
      depth:
        typeof parsed.depth === "number" && parsed.depth >= 0 && parsed.depth <= 1
          ? parsed.depth
          : DEFAULTS.depth,
      diagnostics: parsed.diagnostics === true,
    };
  } catch {
    return DEFAULTS;
  }
}

export function MotionPrefsProvider({ children }: { children: ReactNode }) {
  // SSR-safe: start from defaults, hydrate from storage after mount.
  const [prefs, setPrefs] = useState<StoredPrefs>(DEFAULTS);
  const [systemReduced, setSystemReduced] = useState(false);

  useEffect(() => {
    setPrefs(readStored());
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setSystemReduced(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  const reduceMotion =
    prefs.mode === "reduced" || (prefs.mode === "system" && systemReduced);
  const effectiveDepth = reduceMotion ? 0 : prefs.depth;

  // Persist + mirror to the document so CSS can react instantly.
  useEffect(() => {
    if (typeof document === "undefined") return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
    } catch {
      /* storage disabled — preference stays in-memory for this session */
    }
    const root = document.documentElement;
    root.dataset['reduceMotion'] = reduceMotion ? "true" : "false";
    root.dataset['depth'] = effectiveDepth.toFixed(2);
  }, [prefs, reduceMotion, effectiveDepth]);

  const update = useCallback(
    (patch: Partial<StoredPrefs>) => setPrefs((p) => ({ ...p, ...patch })),
    [],
  );

  const value = useMemo<MotionPrefsValue>(
    () => ({
      ...prefs,
      systemReduced,
      reduceMotion,
      effectiveDepth,
      setMode: (mode) => update({ mode }),
      setDepth: (depth) => update({ depth: Math.min(1, Math.max(0, depth)) }),
      setDiagnostics: (diagnostics) => update({ diagnostics }),
    }),
    [prefs, systemReduced, reduceMotion, effectiveDepth, update],
  );

  return <MotionPrefsContext.Provider value={value}>{children}</MotionPrefsContext.Provider>;
}

/**
 * Safe outside the provider (returns system-only values) so isolated
 * components and tests never crash.
 */
export function useMotionPrefs(): MotionPrefsValue {
  const ctx = useContext(MotionPrefsContext);
  if (ctx) return ctx;
  return {
    ...DEFAULTS,
    systemReduced: false,
    reduceMotion: false,
    effectiveDepth: 1,
    setMode: () => {},
    setDepth: () => {},
    setDiagnostics: () => {},
  };
}

/** Drop-in replacement for framer-motion's `useReducedMotion`. */
export function useAppReducedMotion(): boolean {
  return useMotionPrefs().reduceMotion;
}
