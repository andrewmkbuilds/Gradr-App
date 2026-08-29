/**
 * Dev-only console hygiene for the Lovable component tagger.
 *
 * `lovable-tagger` replaces `jsxDEV` and attaches a callback `ref` to *every*
 * JSX element it sees so it can map DOM nodes back to source positions. React
 * 18 rejects a ref on a plain function component and logs:
 *
 *   Warning: Function components cannot be given refs.
 *
 * The tagger runs only in `mode === "development"` (see vite.config.ts) and the
 * warning fires for every provider, page and layout in the tree, which buries
 * real console output during preview debugging. It is vendor behaviour inside
 * the tagger's own runtime, so it cannot be fixed from application code.
 *
 * This filter drops that one warning string, and only while the tagger runtime
 * is actually installed (it registers `window.sourceElementMap`). Production
 * builds never load this module, and if the tagger is absent the warning is
 * genuine and passes straight through.
 */

const NEEDLE = "Function components cannot be given refs";

export function silenceTaggerRefWarning() {
  if (!import.meta.env.DEV || typeof window === "undefined") return;

  const taggerActive = () =>
    Object.prototype.hasOwnProperty.call(window, "sourceElementMap");

  for (const level of ["error", "warn"] as const) {
    const original = console[level].bind(console);
    console[level] = (...args: unknown[]) => {
      if (typeof args[0] === "string" && args[0].includes(NEEDLE) && taggerActive()) return;
      original(...args);
    };
  }
}
