import { defineConfig } from "@playwright/test";
import { resolve } from "node:path";
const port = Number(process.env.MACRO_CLOCK_PREVIEW_PORT ?? 3119);
export default defineConfig({
  testDir: ".",
  testMatch: "macro-clock.pw.ts",
  outputDir: "/tmp/osstack/macro-widget/playwright",
  workers: 1,
  use: { baseURL: `http://127.0.0.1:${port}`, headless: true },
  webServer: {
    cwd: resolve(__dirname, "../.."),
    env: {
      PORT: String(port),
      MACRO_PREVIEW_FIXTURE_ROOT: "/tmp/osstack/widget-full-fixtures",
    },
    command: "npx tsx scripts/preview/macro-clock.ts",
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: true,
  },
});
