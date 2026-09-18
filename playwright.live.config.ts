import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  testMatch: "live.spec.ts",
  workers: 1,
  timeout: 60000,
  use: { baseURL: "http://localhost:3002", channel: "msedge", headless: true },
  reporter: "list",
});
