import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  workers: 1,
  timeout: 60000,
  use: { baseURL: "http://localhost:3001", channel: "msedge", headless: true },
  webServer: {
    command: "node node_modules/next/dist/bin/next dev --port 3001",
    url: "http://localhost:3001",
    reuseExistingServer: true,
    env: {
      NEXT_PUBLIC_SUPABASE_URL: "http://localhost:54321",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_local_test_only",
    },
  },
  reporter: "list",
});
