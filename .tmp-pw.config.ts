import { defineConfig } from "@playwright/test";
export default defineConfig({ testDir: "./.tmp-pw", use: { baseURL: "http://localhost:8080" }, reporter: "line" });
