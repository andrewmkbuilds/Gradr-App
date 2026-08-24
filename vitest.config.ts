import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // The transitive `canvas` install has no compiled binding; jsdom picks it
      // up and dies on require. Nothing under test needs real canvas.
      canvas: path.resolve(__dirname, "./src/test/stubs/canvas.ts"),
    },
  },
});
