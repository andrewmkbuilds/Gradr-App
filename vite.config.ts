import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { mcpPlugin } from "@lovable.dev/mcp-js/stacks/supabase/vite";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
    mcpPlugin(),
  ].filter(Boolean),
  build: {
    // Split heavy, rarely-changing vendor code out of the entry chunk so the
    // first paint on mobile downloads far less JavaScript.
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (!id.includes("node_modules")) return undefined;
          if (id.includes("pdfjs-dist")) return "vendor-pdf";
          if (id.includes("jspdf")) return "vendor-pdf";
          if (id.includes("mammoth")) return "vendor-docx";
          if (id.includes("recharts") || id.includes("d3-")) return "vendor-charts";
          if (id.includes("@mediapipe")) return "vendor-vision";
          if (id.includes("framer-motion")) return "vendor-motion";
          if (id.includes("@sentry") || id.includes("posthog-js")) return "vendor-telemetry";
          if (id.includes("@supabase")) return "vendor-supabase";
          if (id.includes("react-router")) return "vendor-router";
          if (id.includes("/react/") || id.includes("/react-dom/") || id.includes("scheduler"))
            return "vendor-react";
          return "vendor";
        },
      },
    },
    chunkSizeWarningLimit: 900,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime"],
  },
}));
