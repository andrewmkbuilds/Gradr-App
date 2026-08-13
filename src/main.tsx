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
