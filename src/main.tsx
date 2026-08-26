// Must stay first: guarantees Web Storage exists before any module (including
// the Supabase client) touches localStorage.
import "./lib/storagePolyfill";
import * as JsxDev from "react/jsx-dev-runtime";
if (import.meta.env.DEV) {
  const orig = (JsxDev as any).jsxDEV;
  (JsxDev as any).jsxDEV = function (type: any, props: any, ...rest: any[]) {
    if (props && props.ref != null && typeof type === "function" && !(type as any).$$typeof && !(type as any).render) {
      // eslint-disable-next-line no-console
      console.warn("[REFPROBE]", type.name || type.displayName || String(type).slice(0, 80));
    }
    return orig.apply(this, [type, props, ...rest]);
  };
}
import { createRoot } from "react-dom/client";
import { HelmetProvider } from "react-helmet-async";
import App from "./App.tsx";
import "./index.css";
// Design system theme layer — must load after the app's own CSS.
import "./styles/gradr-design-system.css";
import { initTelemetry } from "./lib/telemetry/journey";
import RootErrorBoundary from "./components/RootErrorBoundary";
import { registerServiceWorker } from "./lib/offline/registerServiceWorker";
import { initCspReporting } from "./lib/security/cspReport";
import { initSentry } from "./lib/telemetry/sentry";
import { installQaSandbox } from "./lib/qa/sandbox/install";

installQaSandbox();
initSentry();
initTelemetry();
initCspReporting();
registerServiceWorker();

createRoot(document.getElementById("root")!).render(
  <RootErrorBoundary>
    <HelmetProvider>
      <App />
    </HelmetProvider>
  </RootErrorBoundary>,
);

/**
 * Fade out the pre-hydration splash once React has painted its first frame,
 * so users go straight from the splash into the real UI (never the SEO shell).
 */
function removeSplash() {
  const splash = document.getElementById("app-splash");
  if (!splash) return;
  splash.setAttribute("data-hiding", "true");
  const drop = () => splash.remove();
  splash.addEventListener("transitionend", drop, { once: true });
  window.setTimeout(drop, 500);
}

requestAnimationFrame(() => requestAnimationFrame(removeSplash));
