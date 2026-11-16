import {defineConfig} from '@playwright/test';
export default defineConfig({
  testDir: '.', testMatch: '*.pw.ts', workers: 1, retries: 0, timeout: 20000,
  outputDir: '/tmp/osstack/macro-integration-audit/playwright',
  reporter: [['list'], ['json', {outputFile: '/tmp/osstack/macro-integration-audit/results.json'}]],
  use: {baseURL: process.env.MACRO_INTEGRATION_URL ?? 'http://127.0.0.1:3121', headless: true, trace: 'retain-on-failure'},
});
