/**
 * Capability detection for the Canvas UI effect layer.
 *
 * Canvas UI's html-in-canvas components are progressive enhancement on top of
 * real DOM. This module decides — cheaply and synchronously — whether a given
 * effect is allowed to run at all, so that the heavy WebGL modules are never
 * even downloaded on devices that cannot or should not run them.
 *
 * Nothing here imports a Canvas UI component: the probes are standalone so the
 * ~50KB effect chunks stay out of the initial bundle.
 */

/** Visual budget a surface is allowed to spend. */
export type CanvasFxTier = "off" | "lite" | "full";

/** Minimum tier a given effect slot needs in order to mount. */
export type CanvasFxDemand = "lite" | "full";

type NavigatorWithHints = Navigator & {
  deviceMemory?: number;
  connection?: { saveData?: boolean; effectiveType?: string };
};

let htmlInCanvasCache: boolean | null = null;

/**
 * True when the browser exposes the experimental html-in-canvas API that every
 * Canvas UI component is built on (Chrome, behind the `canvas-draw-element`
 * flag or an origin trial token).
 *
 * Mirrors the probe each Canvas UI component runs internally, duplicated here
 * so we can answer the question without importing the component.
 */
export function supportsHtmlInCanvas(): boolean {
  if (typeof document === "undefined") return false;
  if (htmlInCanvasCache !== null) return htmlInCanvasCache;
  try {
    const probe = document.createElement("canvas") as HTMLCanvasElement & {
      requestPaint?: () => void;
    };
    const ctx = probe.getContext("2d") as
      | (CanvasRenderingContext2D & { drawElementImage?: unknown })
      | null;
    htmlInCanvasCache = Boolean(
      ctx &&
        typeof ctx.drawElementImage === "function" &&
        typeof probe.requestPaint === "function",
    );
  } catch {
    htmlInCanvasCache = false;
  }
  return htmlInCanvasCache;
}

let webglCache: boolean | null = null;

/**
 * True when WebGL2 plus float render targets are available. Every Canvas UI
 * effect bails out (returns a null instance) without these, so checking up
 * front lets us skip the download entirely.
 */
export function supportsCanvasFxGpu(): boolean {
  if (typeof document === "undefined") return false;
  if (webglCache !== null) return webglCache;
  try {
    const probe = document.createElement("canvas");
    const gl = probe.getContext("webgl2", {
      alpha: true,
      depth: false,
      stencil: false,
      antialias: false,
    });
    webglCache = Boolean(
      gl &&
        !gl.isContextLost() &&
        (gl.getExtension("EXT_color_buffer_float") ||
          gl.getExtension("EXT_color_buffer_half_float")),
    );
    // Release the probe context immediately; contexts are a limited resource.
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
  } catch {
    webglCache = false;
  }
  return webglCache;
}

/** True when the visitor asked us to move less data. */
function prefersLessData(): boolean {
  if (typeof navigator === "undefined") return false;
  const nav = navigator as NavigatorWithHints;
  if (nav.connection?.saveData) return true;
  const effective = nav.connection?.effectiveType;
  return effective === "slow-2g" || effective === "2g";
}

/** Rough "can this device afford a fragment shader over live DOM" check. */
function isLowPowerDevice(): boolean {
  if (typeof navigator === "undefined") return true;
  const nav = navigator as NavigatorWithHints;
  if (typeof nav.deviceMemory === "number" && nav.deviceMemory < 4) return true;
  if (
    typeof nav.hardwareConcurrency === "number" &&
    nav.hardwareConcurrency > 0 &&
    nav.hardwareConcurrency < 4
  )
    return true;
  return false;
}

/** Breakpoints used for the desktop / tablet / mobile effect ladder. */
export const CANVAS_FX_TABLET_MIN = 768;
export const CANVAS_FX_DESKTOP_MIN = 1280;

export interface CanvasFxInputs {
  /** Resolved reduced-motion preference (OS setting + in-app toggle). */
  reducedMotion: boolean;
  /** Viewport width in CSS pixels. */
  width: number;
}

/**
 * Resolve the effect budget for the current environment.
 *
 * The ladder mirrors the product requirement: desktop gets the full
 * experience, tablet a reduced one, mobile and reduced-motion users get the
 * plain DOM — which is always the real, readable, interactive content.
 */
export function resolveCanvasFxTier({
  reducedMotion,
  width,
}: CanvasFxInputs): CanvasFxTier {
  if (reducedMotion) return "off";
  if (!supportsHtmlInCanvas()) return "off";
  if (!supportsCanvasFxGpu()) return "off";
  if (prefersLessData()) return "off";
  if (isLowPowerDevice()) return "off";
  if (width < CANVAS_FX_TABLET_MIN) return "off";
  if (width < CANVAS_FX_DESKTOP_MIN) return "lite";
  return "full";
}

/** Whether a slot demanding `demand` may run at the resolved `tier`. */
export function tierSatisfies(tier: CanvasFxTier, demand: CanvasFxDemand): boolean {
  if (tier === "off") return false;
  if (demand === "lite") return true;
  return tier === "full";
}

/** Test seam — resets memoised probes. */
export function __resetCanvasFxProbes(): void {
  htmlInCanvasCache = null;
  webglCache = null;
}
