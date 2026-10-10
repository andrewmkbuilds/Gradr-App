// Keep storage compatibility first because application modules may read localStorage
// during evaluation. Everything else that is optional must stay out of the critical
// React mount path so monitoring, QA helpers, service workers, or third-party SDKs
// can never strand users on the static splash screen.
import "./lib/storagePolyfill";
import { createRoot } from "react-dom/client";
import { HelmetProvider } from "react-helmet-async";
import App from "./App.tsx";
import "./index.css";
// Design system theme layer — must load after the app's own CSS.
import "./styles/gradr-design-system.css";
import "./styles/gradr-visual-enhancements.css";
import RootErrorBoundary from "./components/RootErrorBoundary";

createRoot(document.getElementById("root")!).render(
  <RootErrorBoundary>
    <HelmetProvider>
      <App />
    </HelmetProvider>
  </RootErrorBoundary>,
);

/**
 * Fade out the pre-hydration splash once React has had a chance to paint.
 * The removal is deliberately independent from every optional integration.
 */
function removeSplash() {
  const splash = document.getElementById("app-splash");
  if (!splash) return;

  splash.setAttribute("data-hiding", "true");
  const drop = () => splash.remove();
  splash.addEventListener("transitionend", drop, { once: true });
  window.setTimeout(drop, 500);
}

/**
 * Optional startup integrations are loaded dynamically and independently.
 * A failure in one integration must never prevent the others from starting,
 * and more importantly must never prevent React from mounting first.
 */
async function startNonCriticalIntegrations() {
  const integrations = [
    {
      name: "tagger warning suppression",
      load: async () => {
        const { silenceTaggerRefWarning } = await import(
          "./lib/dev/silenceTaggerRefWarning"
        );
        silenceTaggerRefWarning();
      },
    },
    {
      name: "QA sandbox",
      load: async () => {
        const { installQaSandbox } = await import("./lib/qa/sandbox/install");
        installQaSandbox();
      },
    },
    {
      name: "Sentry",
      load: async () => {
        const { initSentry } = await import("./lib/telemetry/sentry");
        initSentry();
      },
    },
    {
      name: "telemetry",
      load: async () => {
        const { initTelemetry } = await import("./lib/telemetry/journey");
        initTelemetry();
      },
    },
    {
      name: "CSP reporting",
      load: async () => {
        const { initCspReporting } = await import("./lib/security/cspReport");
        initCspReporting();
      },
    },
    {
      name: "service worker",
      load: async () => {
        const { registerServiceWorker } = await import(
          "./lib/offline/registerServiceWorker"
        );
        registerServiceWorker();
      },
    },
  ];

  for (const integration of integrations) {
    try {
      await integration.load();
    } catch (error) {
      console.warn(`[boot] ${integration.name} initialization failed`, error);
    }
  }
}

// Dismiss the splash independently of optional startup work.
requestAnimationFrame(() => requestAnimationFrame(removeSplash));
window.setTimeout(removeSplash, 1500);

// Give the browser a turn to paint the actual application before loading any
// monitoring, QA, telemetry, or offline integrations.
window.setTimeout(() => {
  void startNonCriticalIntegrations();
}, 0);
