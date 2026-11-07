import { defineConfig } from "@playwright/test";
import {resolve} from "node:path";
export default defineConfig({
  testDir: ".",
  testMatch: "macro-clock.pw.ts",
  outputDir: "/tmp/osstack/macro-widget/playwright",
  workers: 1,
  use: { baseURL: "http://127.0.0.1:3119", headless: true },
  webServer: {
    cwd:resolve(__dirname,"../.."),
    command: "npx tsx scripts/preview/macro-clock.ts",
    url: "http://127.0.0.1:3119",
    reuseExistingServer: true,
  },
});
