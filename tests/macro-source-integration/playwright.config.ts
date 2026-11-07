import { defineConfig } from '@playwright/test';
import path from 'node:path';
const port = Number(process.env.MACRO_FIXTURE_PORT ?? 3147);
const baseURL = `http://127.0.0.1:${port}`;
const scratch = process.env.OSSTACK_SCRATCH_ROOT ?? '/tmp/osstack';
export default defineConfig({
  testDir: '.',
  testMatch: /.*\.pw\.ts/,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 30_000,
  outputDir: path.join(scratch, 'macro-source-integration/playwright-results'),
  reporter: [['list'], ['json', { outputFile: path.join(scratch, 'macro-source-integration/playwright-results.json') }]],
  use: { baseURL, browserName: 'chromium', headless: true, serviceWorkers: 'block', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  webServer: {
    command: 'PATH=/opt/homebrew/opt/node@22/bin:$PATH node --import tsx tests/macro-source-integration/server.ts',
    cwd: path.resolve(__dirname, '../..'),
    url: `${baseURL}/__fixture/health`,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
