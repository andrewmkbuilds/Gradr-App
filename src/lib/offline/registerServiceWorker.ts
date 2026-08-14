/**
 * Registers Gradr's offline service worker.
 *
 * Registration is deferred to `load` so it never competes with first paint, and
 * is skipped in dev (Vite serves modules the SW must not cache).
 */
export function registerServiceWorker() {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
  if (import.meta.env.DEV) return;

  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then((reg) => {
        // Activate a new build as soon as it is installed.
        reg.addEventListener("updatefound", () => {
          const next = reg.installing;
          if (!next) return;
          next.addEventListener("statechange", () => {
            if (next.state === "installed" && navigator.serviceWorker.controller) {
              next.postMessage("SKIP_WAITING");
            }
          });
        });
      })
      .catch((error) => {
        console.warn("[offline] service worker registration failed", error);
      });

    let reloading = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (reloading) return;
      reloading = true;
      window.location.reload();
    });
  });
}
