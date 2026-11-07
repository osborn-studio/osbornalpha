import { defineConfig } from "@playwright/test";
import { resolve } from "node:path";
export default defineConfig({
  testDir: ".",
  testMatch: "workbench-layout.pw.ts",
  outputDir: "/tmp/osstack/macro-widget-correction/playwright",
  workers: 1,
  timeout: 45000,
  use: { baseURL: "http://127.0.0.1:3121", headless: true },
  webServer: {
    cwd: resolve(__dirname, "../.."),
    command: "npx tsx scripts/preview/workbench-server.ts",
    url: "http://127.0.0.1:3121/macro",
    reuseExistingServer: true,
    timeout: 120000,
  },
});
