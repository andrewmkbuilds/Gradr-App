import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    globalSetup: ["./src/test/globalSetup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    /**
     * Several React Testing Library suites (sidebar, interview flow, voice
     * recovery) legitimately take 2-3s to render and drive their trees. On a
     * loaded CI runner that overshoots Vitest's 5s default and the suite flakes
     * with "Test timed out" even though every assertion still holds. Raising
     * the budget removes the flake without relaxing a single expectation.
     */
    testTimeout: 20_000,
    hookTimeout: 20_000,

  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
