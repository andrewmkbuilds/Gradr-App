import { createRoot } from "react-dom/client";
import { HelmetProvider } from "react-helmet-async";
import App from "./App.tsx";
import "./index.css";
import { initTelemetry } from "./lib/telemetry/journey";
import RootErrorBoundary from "./components/RootErrorBoundary";

initTelemetry();

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
