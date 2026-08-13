import path from "node:path";
import { defineConfig } from "vitest/config";

const here = path.dirname(new URL(import.meta.url).pathname);

export default defineConfig({
  resolve: {
    alias: {
      "entities/lib/decode.js": path.resolve(here, "node_modules/entities/lib/decode.js"),
      "entities/lib/encode.js": path.resolve(here, "node_modules/entities/lib/encode.js"),
      entities: path.resolve(here, "node_modules/entities"),
      "@": path.resolve(here, "src"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    globals: true,
  },
});
