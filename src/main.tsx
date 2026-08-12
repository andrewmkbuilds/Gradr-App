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

// Fade out and remove the static splash once React has painted.
const removeSplash = () => {
  const splash = document.getElementById("app-splash");
  if (!splash) return;
  splash.style.transition = "opacity 220ms ease";
  splash.style.opacity = "0";
  window.setTimeout(() => splash.remove(), 240);
};

requestAnimationFrame(() => requestAnimationFrame(removeSplash));
window.setTimeout(removeSplash, 4000);

