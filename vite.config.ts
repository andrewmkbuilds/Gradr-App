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
    // NOTE: do NOT hand-roll manualChunks here. Manually splitting interdependent
    // vendor packages (react / router / motion / charts) produced cross-chunk
    // circular imports and a "Cannot access 'X' before initialization" TDZ crash
    // in production. Rollup's default chunking + route-level React.lazy already
    // keep the entry payload small.
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        // Opaque, content-hashed filenames. Default Rollup naming leaks the
        // dependency graph to anyone reading the HTML (`react-dom-*.js`,
        // `motion-*.js`, route/component names), which is the only stack
        // fingerprint we actually control. Names are cosmetic — this changes
        // no chunk boundaries, so it cannot reintroduce the TDZ crash above.
        entryFileNames: 'assets/[hash].js',
        chunkFileNames: 'assets/[hash].js',
        assetFileNames: 'assets/[hash][extname]',
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime"],
  },
}));
