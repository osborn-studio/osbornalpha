import { defineConfig } from '@playwright/test';

const configuredPort = Number(process.env.E2E_PORT ?? 3100);
const port = Number.isInteger(configuredPort) && configuredPort >= 1024 && configuredPort <= 65_535
  ? configuredPort
  : 3100;
const localBaseURL = `http://127.0.0.1:${port}`;
const baseURL = process.env.E2E_BASE_URL ?? localBaseURL;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  use: {
    baseURL,
  },
  // Only spin up a local dev server when targeting localhost (no E2E_BASE_URL).
  // A remote target (E2E_BASE_URL set) must never spawn a local server.
  ...(process.env.E2E_BASE_URL
    ? {}
    : {
        webServer: {
          command: `npm run dev -- --hostname 127.0.0.1 --port ${port}`,
          url: `${localBaseURL}/`,
          reuseExistingServer: false,
          timeout: 120_000,
        },
      }),
});
