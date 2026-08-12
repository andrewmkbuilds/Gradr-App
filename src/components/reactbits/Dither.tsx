/**
 * Dither — React Bits inspired, Gradr tuned.
 *
 * A retro-ordered (Bayer 8x8) dithered gradient wash. Renders to a small
 * offscreen canvas and scales up with `image-rendering: pixelated`, so the
 * effect is essentially free even on low-power devices. Colour is driven by
 * the theme primary so it reads as part of the aurora/grid system.
 *
 * Respects `prefers-reduced-motion`: paints a single static frame.
 */
import { useEffect, useRef } from "react";
import { useReducedMotion } from "framer-motion";

const BAYER = [
  [0, 32, 8, 40, 2, 34, 10, 42],
  [48, 16, 56, 24, 50, 18, 58, 26],
  [12, 44, 4, 36, 14, 46, 6, 38],
  [60, 28, 52, 20, 62, 30, 54, 22],
  [3, 35, 11, 43, 1, 33, 9, 41],
  [51, 19, 59, 27, 49, 17, 57, 25],
  [15, 47, 7, 39, 13, 45, 5, 37],
  [63, 31, 55, 23, 61, 29, 53, 21],
];

type Props = {
  className?: string;
  /** 0-1 overall strength of the wash. */
  intensity?: number;
  /** Pixel size of one dither cell in CSS pixels. */
  pixelSize?: number;
};

/** Purple/violet ramp matched to the Gradr aurora. */
const RAMP: Array<[number, number, number]> = [
  [124, 58, 237], // violet-600
  [139, 92, 246], // violet-500
  [99, 102, 241], // indigo-500
  [56, 189, 248], // sky-400 (cool tail)
];

export function Dither({ className = "", intensity = 0.9, pixelSize = 4 }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const reduce = useReducedMotion();

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    let raf = 0;
    let last = 0;
    let w = 0;
    let h = 0;

    const resize = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      w = Math.max(1, Math.ceil(parent.clientWidth / pixelSize));
      h = Math.max(1, Math.ceil(parent.clientHeight / pixelSize));
      canvas.width = w;
      canvas.height = h;
    };

    const paint = (t: number) => {
      if (!w || !h) return;
      const img = ctx.createImageData(w, h);
      const data = img.data;
      const time = t / 9000;

      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const u = x / w;
          const v = y / h;
          // Two soft plasma lobes drifting slowly across the field.
          const field =
            0.5 +
            0.28 * Math.sin((u * 3.1 + time) * Math.PI) +
            0.24 * Math.sin((v * 2.3 - time * 0.8) * Math.PI) +
            0.18 * Math.sin(((u + v) * 2.0 + time * 1.3) * Math.PI);

          // Fade the wash out toward the bottom so content stays readable.
          const falloff = Math.max(0, 1 - v * 1.15);
          const value = Math.min(1, Math.max(0, field)) * falloff * intensity;

          const threshold = (BAYER[y & 7][x & 7] + 0.5) / 64;
          const lit = value > threshold;
          const idx = (y * w + x) * 4;

          if (!lit) {
            data[idx + 3] = 0;
            continue;
          }

          const stop = Math.min(RAMP.length - 1, Math.floor(value * RAMP.length));
          const [r, g, b] = RAMP[stop];
          data[idx] = r;
          data[idx + 1] = g;
          data[idx + 2] = b;
          data[idx + 3] = Math.round(150 * value + 40);
        }
      }
      ctx.putImageData(img, 0, 0);
    };

    const loop = (t: number) => {
      // ~15fps is plenty for a dithered field and keeps the main thread free.
      if (t - last > 66) {
        paint(t);
        last = t;
      }
      raf = requestAnimationFrame(loop);
    };

    resize();
    paint(0);

    if (!reduce) raf = requestAnimationFrame(loop);

    const ro = new ResizeObserver(() => {
      resize();
      paint(performance.now());
    });
    if (canvas.parentElement) ro.observe(canvas.parentElement);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [intensity, pixelSize, reduce]);

  return (
    <canvas
      ref={ref}
      aria-hidden
      className={`pointer-events-none absolute inset-0 -z-10 h-full w-full opacity-70 mix-blend-screen [image-rendering:pixelated] ${className}`}
    />
  );
}

export default Dither;
