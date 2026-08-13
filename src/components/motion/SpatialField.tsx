/**
 * Global spatial engine.
 *
 * One document-level pointer listener drives every 3D surface in the product.
 * Instead of each card mounting its own React state + listener (hundreds of
 * subscriptions on a dashboard), this writes CSS custom properties on the
 * hovered element and lets the compositor do the rest:
 *
 *   --tx / --ty   pointer position inside the element, normalised to -1…1
 *                 (consumed by `.tilt-3d` for the rotation)
 *   --px / --py   pointer position in %, used for the specular highlight
 *
 * Everything is transform/opacity only, coalesced into a single rAF, and
 * completely inert when depth is off (reduced motion, in-app toggle,
 * coarse pointer, low-power device).
 */
import { useEffect } from "react";
import { useDepthEnabled } from "./depth";

const TILT_SELECTOR = "[data-tilt]";

export function SpatialField() {
  const enabled = useDepthEnabled();

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;

    let frame = 0;
    let pending: { el: HTMLElement; x: number; y: number } | null = null;
    let active: HTMLElement | null = null;

    const clear = (el: HTMLElement | null) => {
      if (!el) return;
      el.style.removeProperty("--tx");
      el.style.removeProperty("--ty");
      el.style.removeProperty("--px");
      el.style.removeProperty("--py");
      el.removeAttribute("data-tilt-active");
    };

    const flush = () => {
      frame = 0;
      if (!pending) return;
      const { el, x, y } = pending;
      pending = null;
      el.style.setProperty("--tx", x.toFixed(3));
      el.style.setProperty("--ty", y.toFixed(3));
      el.style.setProperty("--px", `${((x + 1) / 2) * 100}%`);
      el.style.setProperty("--py", `${((y + 1) / 2) * 100}%`);
      el.setAttribute("data-tilt-active", "true");
    };

    const onMove = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") return;
      const target = (event.target as Element | null)?.closest?.(TILT_SELECTOR) as
        | HTMLElement
        | null;

      if (target !== active) {
        clear(active);
        active = target;
      }
      if (!target) return;

      const rect = target.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;

      pending = {
        el: target,
        x: Math.max(-1, Math.min(1, ((event.clientX - rect.left) / rect.width) * 2 - 1)),
        y: Math.max(-1, Math.min(1, ((event.clientY - rect.top) / rect.height) * 2 - 1)),
      };
      if (!frame) frame = requestAnimationFrame(flush);
    };

    const onLeave = () => {
      clear(active);
      active = null;
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerdown", onMove, { passive: true });
    document.addEventListener("pointerleave", onLeave);
    window.addEventListener("blur", onLeave);
    // A scroll moves surfaces out from under the cursor; drop the stale tilt.
    window.addEventListener("scroll", onLeave, { passive: true });

    return () => {
      if (frame) cancelAnimationFrame(frame);
      clear(active);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onMove);
      document.removeEventListener("pointerleave", onLeave);
      window.removeEventListener("blur", onLeave);
      window.removeEventListener("scroll", onLeave);
    };
  }, [enabled]);

  return null;
}

export default SpatialField;
