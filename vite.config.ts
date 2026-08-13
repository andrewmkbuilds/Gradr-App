// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import path from "node:path";
import { loadEnv } from "vite";
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { mcpPlugin } from "@lovable.dev/mcp-js/stacks/supabase/vite";

// Server routes (email queue, transactional send) need non-VITE_ secrets such as
// SUPABASE_SERVICE_ROLE_KEY in process.env. These are NEVER added to envDefine, so
// they stay out of the client bundle.
const serverEnv = loadEnv(process.env['NODE_ENV'] ?? "development", process.cwd(), "");
Object.assign(process.env, serverEnv);

const here = path.dirname(new URL(import.meta.url).pathname);

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  vite: {
    // Re-added from the pre-migration vite.config.ts (project-specific plugin).
    plugins: [mcpPlugin()],
    resolve: {
      alias: {
        // Force the hoisted entities@4.5.0 copy; nested v7 removed ./lib/decode.js
        // which breaks @react-email/render during SSR.
        "entities/lib/decode.js": path.resolve(here, "node_modules/entities/lib/decode.js"),
        "entities/lib/encode.js": path.resolve(here, "node_modules/entities/lib/encode.js"),
        entities: path.resolve(here, "node_modules/entities"),
      },
    },
  },
});
